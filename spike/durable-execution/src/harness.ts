/**
 * Scenario harness: drives the SAME crash/recovery + retry-exhaustion scenario
 * through any SpikeBackend and asserts on shared app state, so the two substrates
 * can be compared on identical work with identical assertions.
 *
 * Scenario (per candidate):
 *   1. clean shared store + marker file
 *   2. enqueue story → worker-a completes it
 *   3. enqueue pages 1..8 (page 5 has crashPoint "after-provider-accept"; page 7
 *      always fails QA). Concurrency 1.
 *   4. pages 1..4 commit normally.
 *   5. page 5 reaches the provider boundary, then HOLDS on a gate → harness
 *      SIGKILLs worker-a (a real process kill; no local commit ever happens).
 *   6. worker-b starts; the substrate alone must reclaim the abandoned page-5
 *      lease and re-run it. Provider idempotency returns cached:true with the SAME
 *      providerRequestId (no duplicate spend). Harness releases the gate, the
 *      re-run commits, pages 6 and 8 finish.
 *   7. page 7 exhausts its retries → terminal (pg-boss dead-letter / BullMQ
 *      failed set); captured for the research log.
 *   8. Measure: reclaim latency (kill → page-5 re-claimed), page-7 attempt count,
 *      terminal inspection, provider spend count, terminal-snapshot.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SpikeAppState } from "./app-state";
import type { SpikeBackend } from "./backend";
import type { BookFixture } from "./fixture";
import { makeBook } from "./fixture";
import { releaseGate } from "./handler";
import { readMarkers, waitForMarker, type Marker } from "./marker";

export interface HarnessEnv {
  backend: SpikeBackend;
  appState: SpikeAppState;
  markerFile: string;
  /** Wall-clock deadline for the whole scenario. */
  timeoutMs?: number;
}

export interface ScenarioMeasurement {
  candidate: string;
  displayName: string;
  services: string[];
  configNote: string;
  providerSpendCount: number;
  claimedUniqueUnitCount: number;
  reclaimLatencyMs: number;
  recoveryToCommitMs: number;
  page7Attempts: number;
  page5ProviderRequests: string[];
  page5CachedReplay: boolean;
  terminal: Array<{ pageNumber: number; status: string; substrateState: string; attempts: number }>;
  terminalSnapshot: { label: string; jobs: unknown[] };
  deadLetterDoc: string;
  markers: Marker[];
}

export function resetMarkerFile(markerFile: string): void {
  mkdirSync(dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registry of every worker subprocess spawned by the scenarios. Tests MUST call
 * killTrackedWorkers() in afterEach/afterAll: a scenario may fail (or a vitest
 * timeout may abandon it) with a worker left holding a gate, and a zombie worker
 * will then starve the next scenario's queue.
 */
const trackedWorkers = new Set<{ kill(signal?: NodeJS.Signals): void }>();

function trackWorker(w: { kill(signal?: NodeJS.Signals): void }): void {
  trackedWorkers.add(w);
}

export function killTrackedWorkers(): void {
  for (const w of trackedWorkers) {
    try {
      w.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }
  trackedWorkers.clear();
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(250);
  }
  throw new Error(`waitUntil timed out: ${label}`);
}

function providerRequestIdOf(marker: Marker | undefined): { id: string; cached: boolean } | null {
  if (!marker?.extra) return null;
  const match = /^([^|]+)\|cached=(true|false)$/.exec(marker.extra);
  if (!match) return null;
  const id = match[1];
  const cached = match[2];
  if (id === undefined || cached === undefined) return null;
  return { id, cached: cached === "true" };
}

export async function runCrashRecoveryScenario(env: HarnessEnv): Promise<ScenarioMeasurement> {
  const { backend, appState, markerFile, timeoutMs = 120_000 } = env;
  try {
    resetMarkerFile(markerFile);
    await appState.reset();
    await backend.setup();

    const book = makeBook(`book-crash-${randomUUID().slice(0, 8)}`, { failPage7: true });

    await backend.enqueueStory(book);
    const workerA = await backend.spawnWorker("worker-a");
    trackWorker(workerA);
    await waitForMarker(markerFile, (m) => m.phase === "story-completed", 40_000);

    await backend.enqueuePages(book, { failPage: 7, crashPage: 5 });

    // Pages 1-4 run; page 5 reaches the provider, is accepted, then holds.
    await waitForMarker(
      markerFile,
      (m) => m.phase === "gate-hold" && m.pageNumber === 5,
      timeoutMs
    );

    const tKill = Date.now();
    workerA.kill("SIGKILL");
    await workerA.exited();

    // The substrate alone must reclaim the abandoned active unit.
    const workerB = await backend.spawnWorker("worker-b");
    trackWorker(workerB);
    await waitForMarker(
      markerFile,
      (m) => m.phase === "provider-accepted" && m.pageNumber === 5 && m.workerId === "worker-b",
      timeoutMs
    );

    // Re-run reached the boundary again and re-accepted (cached); now let it finish.
    releaseGate(markerFile, book.bookId, 5);

    const applied5 = await waitForMarker(
      markerFile,
      (m) => m.phase === "applied" && m.pageNumber === 5 && m.workerId === "worker-b",
      timeoutMs
    );

    // Wait for page 6 and 8 to finish and page 7 to go terminal.
    await waitUntil(
      async () => {
        const inspection = await backend.inspectBook(book);
        const byPage = new Map(inspection.units.map((u) => [u.pageNumber, u]));
        const p5 = byPage.get(5);
        const p6 = byPage.get(6);
        const p7 = byPage.get(7);
        const p8 = byPage.get(8);
        return p5?.status === "READY" && p6?.status === "READY" && p8?.status === "READY" && p7?.status === "DEAD";
      },
      timeoutMs,
      "terminal state reached (5,6,8 READY, 7 DEAD)"
    );

    // worker-a was already killed mid-scenario; only worker-b is still alive.
    workerB.kill("SIGKILL");

    const markers = readMarkers(markerFile);
  const inspection = await backend.inspectBook(book);
  const page7Markers = markers.filter((m) => m.pageNumber === 7 && m.phase === "started");
  const page5Accepted = markers.filter((m) => m.pageNumber === 5 && m.phase === "provider-accepted");
  const reclaimStarted = markers.find(
    (m) => m.pageNumber === 5 && m.phase === "started" && m.workerId === "worker-b"
  );
  const first = providerRequestIdOf(page5Accepted[0]);
  const second = providerRequestIdOf(page5Accepted[page5Accepted.length - 1]);

  const providerSpendCount = await appState.providerCount();
  const executions = await appState.getPageExecutions(book.bookId);

  const uniqueUnitKeys = new Set(executions.map((e) => `${e.bookId}:${e.pageNumber}`));

  const terminal = inspection.units.map((u) => ({
    pageNumber: u.pageNumber,
    status: u.status,
    substrateState: u.substrateState,
    attempts: u.attempts
  }));

  const measurement: ScenarioMeasurement = {
    candidate: backend.kind,
    displayName: backend.displayName,
    services: backend.services,
    configNote: backend.configNote,
    providerSpendCount,
    claimedUniqueUnitCount: uniqueUnitKeys.size,
    reclaimLatencyMs: reclaimStarted ? reclaimStarted.time - tKill : -1,
    recoveryToCommitMs: applied5.time - tKill,
    page7Attempts: page7Markers.length,
    page5ProviderRequests: [first?.id ?? "?", second?.id ?? "?"],
    page5CachedReplay: Boolean(first && second && first.id === second.id && second.cached),
    terminal,
    terminalSnapshot: await backend.queueSnapshot(book.bookId),
    deadLetterDoc: backend.deadLetterDoc,
    markers
  };

  await backend.teardown();
    return measurement;
  } finally {
    killTrackedWorkers();
  }
}

export async function runCancellationScenario(env: HarnessEnv): Promise<ScenarioMeasurement["terminal"]> {
  const { backend, appState, markerFile } = env;
  try {
    resetMarkerFile(markerFile);
    await appState.reset();
    await backend.setup();

    const book = makeBook(`book-cancel-${randomUUID().slice(0, 8)}`);
    await backend.enqueueStory(book);
    await backend.enqueuePages(book);
    const result = await backend.cancelBook(book);
    const inspection = await backend.inspectBook(book);
    const terminal = inspection.units.map((u) => ({
      pageNumber: u.pageNumber,
      status: u.status,
      substrateState: u.substrateState,
      attempts: u.attempts
    }));

    if (result.unitsCancelled !== book.pages.length) {
      throw new Error(
        `cancelBook cancelled ${result.unitsCancelled}/${book.pages.length} — ${JSON.stringify(result.substrateDetail)}`
      );
    }

    await backend.teardown();
    return terminal;
  } finally {
    killTrackedWorkers();
  }
}
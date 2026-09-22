/**
 * Shared test scaffolding + assertions for the pg-boss and BullMQ scenarios.
 * Both candidates must pass the SAME assertions on the SAME harness scenario.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect } from "vitest";
import { SpikeAppState } from "../src/app-state";
import type { ScenarioMeasurement } from "../src/harness";
import { PgBossBackend } from "../src/backends/pgboss";
import { BullMqBackend } from "../src/backends/bullmq";
import type { SpikeBackend } from "../src/backend";

export const PG_URL =
  process.env.SPIKE_PG_URL ?? "postgres://spike:spike@localhost:5432/durable_spike";
export const REDIS_URL = process.env.SPIKE_REDIS_URL ?? "redis://localhost:6379";
export const WORKER_ENTRY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "run-worker.ts"
);

export interface CandidateTestEnv {
  backend: SpikeBackend;
  appState: SpikeAppState;
  markerFile: string;
  measurement: ScenarioMeasurement;
}

export async function checkConnectivity(): Promise<void> {
  let postgres = false;
  let redis = false;
  try {
    const state = await SpikeAppState.connect(PG_URL);
    await state.reset();
    await state.close();
    postgres = true;
  } catch {
    postgres = false;
  }
  try {
    const ioredis = await import("ioredis");
    const client = new ioredis.default(REDIS_URL, { lazyConnect: true });
    await client.connect();
    await client.quit();
    redis = true;
  } catch {
    redis = false;
  }
  if (!postgres || !redis) {
    throw new Error(
      `infra not reachable (postgres=${postgres}, redis=${redis}). Start it with either:\n` +
        `  npm run infra:local      (no Docker required; embedded PostgreSQL + Redis binaries)\n` +
        `  npm run infra:up         (docker compose -f infra/compose.yaml up -d)`
    );
  }
}

export function isBullmq(backend: SpikeBackend): boolean {
  return backend.kind === "bullmq";
}

export async function makePgbossEnv(): Promise<CandidateTestEnv> {
  const appState = await SpikeAppState.connect(PG_URL);
  const backend = new PgBossBackend({ pgUrl: PG_URL, workerEntry: WORKER_ENTRY, markerFile: markerPath("pgboss") });
  return { backend, appState, markerFile: markerPath("pgboss"), measurement: undefined as unknown as ScenarioMeasurement };
}

export async function makeBullmqEnv(): Promise<CandidateTestEnv> {
  const appState = await SpikeAppState.connect(PG_URL);
  const backend = new BullMqBackend({
    redisUrl: REDIS_URL,
    pgUrl: PG_URL,
    workerEntry: WORKER_ENTRY,
    markerFile: markerPath("bullmq")
  });
  return { backend, appState, markerFile: markerPath("bullmq"), measurement: undefined as unknown as ScenarioMeasurement };
}

export function markerPath(candidate: string): string {
  return path.join(process.cwd(), "tmp", `markers-${candidate}.log`);
}

export function measure(env: CandidateTestEnv, m: ScenarioMeasurement): void {
  env.measurement = m;
}

export function assertCrashRecoveryEvidence(m: ScenarioMeasurement): void {
  expect(m.page5CachedReplay, "page 5 re-run replayed cached provider request").toBe(true);
  expect(
    m.page5ProviderRequests[0],
    "page 5 provider request id is stable across the crash"
  ).toBe(m.page5ProviderRequests[1]);

  // Successful pages 1,2,3,4,5,6,8 = 7 unique units committed; page 7 never reaches the provider.
  expect(m.claimedUniqueUnitCount).toBe(7);
  expect(m.providerSpendCount).toBe(7);

  expect(m.reclaimLatencyMs).toBeGreaterThan(0);
  expect(m.recoveryToCommitMs).toBeGreaterThanOrEqual(m.reclaimLatencyMs);

  expect(m.page7Attempts).toBe(3);

  const byPage = new Map(m.terminal.map((t) => [t.pageNumber, t]));
  for (const p of [1, 2, 3, 4, 5, 6, 8]) {
    expect(byPage.get(p)?.status, `page ${p} READY`).toBe("READY");
  }
  expect(byPage.get(7)?.status, "page 7 DEAD after retry exhaustion").toBe("DEAD");

  const snapshotJobCount = m.terminalSnapshot.jobs.length;
  expect(snapshotJobCount, "exactly one terminal record surfaces in the snapshot").toBe(1);
  const dead = m.terminalSnapshot.jobs[0] as { pageNumber?: number };
  expect(dead.pageNumber, "snapshot is page 7").toBe(7);
}

export function assertCancellationEvidence(terminal: ScenarioMeasurement["terminal"]): void {
  const byPage = new Map(terminal.map((t) => [t.pageNumber, t]));
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const state = byPage.get(p)?.substrateState;
    const status = byPage.get(p)?.status;
    expect(
      status === "REMOVED" || state === "cancelled" || state === "removed" || state === "discarded",
      `page ${p} cancelled (status=${status}, substrate=${state})`
    ).toBe(true);
  }
}
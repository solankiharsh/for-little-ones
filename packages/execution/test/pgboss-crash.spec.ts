import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestAppState, TestProvider } from "./helpers/app-state";
import { readMarkers, waitForMarker } from "./helpers/markers";
import type { PageJobPayload } from "./helpers/page-handler";
import { releaseGate } from "./helpers/page-handler";
import { deadLetterCount, makeTestRuntime, resetExecutionTables, testDatabaseUrl, until } from "./helpers/pg-test";

const DB = testDatabaseUrl();
const PAGE_COUNT = 8;
const WORKER_ENTRY = fileURLToPath(new URL("./helpers/worker-entry.ts", import.meta.url));

function spawnWorker(workerId: string, markerFile: string): { pid: number; kill(signal?: NodeJS.Signals): void; exited(): Promise<number | null> } {
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", WORKER_ENTRY], {
    env: { ...process.env, TEST_DATABASE_URL: DB, WORKER_ID: workerId, MARKER_FILE: markerFile },
    stdio: "ignore"
  });
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exitCode = code;
  });
  return {
    pid: child.pid as number,
    kill(signal) {
      child.kill(signal ?? "SIGKILL");
    },
    exited() {
      return new Promise((resolve) => {
        if (exitCode !== null) {
          resolve(exitCode);
          return;
        }
        child.once("exit", (code) => resolve(code));
      });
    }
  };
}

const pagePayload = (bookId: string, pageNumber: number): PageJobPayload => ({
  bookId,
  pageNumber,
  behavior: pageNumber === 7 ? "always-fail" : "ok",
  operationKey: `page:${bookId}:${pageNumber}`,
  providerIdempotencyKey: `vendor-illustration:${bookId}:page-${pageNumber}`
});

describe("execution: pg-boss crash recovery (spawned workers)", () => {
  let markerDir: string;
  const markerFile = () => path.join(markerDir, "crash.log");

  beforeEach(async () => {
    await resetExecutionTables(DB);
    markerDir = mkdtempSync(path.join(tmpdir(), "flo-execution-"));
  });

  afterEach(async () => {
    rmSync(markerDir, { recursive: true, force: true });
  });

  it("recovers a worker killed after the provider accepted, without duplicate spend, and dead-letters exhausted retries", async () => {
    const appState = await TestAppState.connect(DB);
    const runtime = await makeTestRuntime({ connectionString: DB }).init();
    const bookId = "crash-book-1";
    const opKey = `book:${bookId}|pages`;
    const file = markerFile();
    let workerA: ReturnType<typeof spawnWorker> | undefined;
    let workerB: ReturnType<typeof spawnWorker> | undefined;

    try {
      await runtime.enqueue({
        operationKey: opKey,
        units: Array.from({ length: PAGE_COUNT }, (_, i) => {
          const pageNumber = i + 1;
          const payload = pagePayload(bookId, pageNumber);
          if (pageNumber === 5) payload.crashPoint = "after-provider-accept";
          return { unitKey: `page:${pageNumber}`, payload, maxAttempts: 3 };
        })
      });

      workerA = spawnWorker("worker-a", file);
      // Worker A reaches the post-provider-accept gate on page 5 and holds.
      await waitForMarker(file, (m) => m.phase === "gate-hold" && m.pageNumber === 5, 30_000);

      const acceptedByKilledWorker = readMarkers(file).filter((m) => m.phase === "provider-accepted" && m.pageNumber === 5);
      expect(acceptedByKilledWorker).toHaveLength(1);
      const firstAcceptance = acceptedByKilledWorker[0]!.extra!.split("|")[0];

      // Kill worker A mid-call: provider accepted page 5, but no local commit.
      workerA.kill("SIGKILL");
      await workerA.exited();

      workerB = spawnWorker("worker-b", file);

      // The reclaiming worker re-runs the gate for page 5 (its payload carries
      // crashPoint). The provider will replay the cached acceptance; release the
      // gate so worker-b can commit. A release marker unblocks a held attempt
      // whether it has reached the gate yet or not.
      releaseGate(file, bookId, 5);

      await until(
        async () => {
          const job = await runtime.job(opKey);
          if (!job) return undefined;
          const byKey = new Map(job.units.map((u) => [u.unitKey, u]));
          const page7 = byKey.get("page:7");
          if (page7?.status !== "DEAD" || page7.attempts !== 3) return undefined;
          if (byKey.get("page:5")?.status !== "READY") return undefined;
          return job.units.filter((u) => u.status === "READY").length === 7 ? true : undefined;
        },
        60_000,
        "all pages to settle (page 5 recovered, page 7 dead-lettered)"
      );

      const job = (await runtime.job(opKey))!;
      const byKey = new Map(job.units.map((u) => [u.unitKey, u]));
      for (const n of [1, 2, 3, 4, 5, 6, 8]) {
        expect(byKey.get(`page:${n}`)?.status, `page ${n} READY`).toBe("READY");
      }
      expect(byKey.get("page:7")?.status).toBe("DEAD");
      expect(byKey.get("page:7")?.attempts).toBe(3);
      expect(job.status).toBe("FAILED");

      // Provider replayed the SAME acceptance for page 5: exactly one spend.
      expect(await appState.providerCount()).toBe(7);
      const page5Ledger = await appState.getPageExecutions(bookId, 5);
      expect(page5Ledger).toHaveLength(1);
      const page5State = (await appState.getPageState(bookId, 5))!;
      expect(page5Ledger[0]?.providerRequestId).toBe(page5State.providerRequestId);
      expect(page5State.providerRequestId).toBe(firstAcceptance);

      // Recovery is observable in the markers: worker-b replayed the cached
      // acceptance and committed it exactly once.
      const applied5 = readMarkers(file).filter((m) => m.phase === "applied" && m.pageNumber === 5);
      expect(applied5).toHaveLength(1);
      expect(applied5[0]?.extra).toBe(page5State.providerRequestId);

      // Exhausted retries surfaced in the dead-letter queue, exactly one job.
      expect(await deadLetterCount(DB)).toBe(1);

      workerB.kill("SIGTERM");
      await workerB.exited();
    } finally {
      workerA?.kill("SIGKILL");
      workerB?.kill("SIGKILL");
      await runtime.close();
      await appState.close();
    }
  });
});
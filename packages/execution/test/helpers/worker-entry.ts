/**
 * Worker subprocess entry point for the crash-recovery spec. Spawned as
 * `node --import tsx worker-entry.ts`. Claims units through the real
 * PgBossDurableRuntime, runs the page handler, and settles via complete/fail —
 * exactly what a production generation worker would do against this substrate.
 */
import { TestAppState, TestProvider } from "./app-state";
import { handlePage, type PageJobPayload } from "./page-handler";
import { makeTestRuntime } from "./pg-test";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("TEST_DATABASE_URL not set");
const workerId = process.env.WORKER_ID ?? "worker";
const markerFile = process.env.MARKER_FILE;
if (!markerFile) throw new Error("MARKER_FILE not set");

const appState = await TestAppState.connect(connectionString);
const provider = new TestProvider(appState);
const runtime = await makeTestRuntime({ connectionString }).init();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (;;) {
  const units = await runtime.claim({ workerId, limit: 1, leaseForMs: 60_000 });
  if (units.length === 0) {
    await sleep(300);
    continue;
  }
  const unit = units[0]!;
  const payload = unit.payload as PageJobPayload;
  try {
    const output = await handlePage({ workerId, markerFile, appState, provider }, payload);
    await runtime.complete(workerId, unit.unitId, output);
  } catch (err) {
    await runtime.fail(workerId, unit.unitId, {
      code: "PAGE_HANDLER",
      message: err instanceof Error ? err.message : String(err),
      retryable: true
    });
  }
}
/**
 * Worker entrypoint used by BOTH candidates. Spawned as a real Node subprocess
 * (`node --import tsx src/run-worker.ts`), so a "crash" is an actual process
 * SIGKILL at a chosen point (page-5 gate-hold) and the substrate alone must
 * reclaim and resume the abandoned unit.
 *
 * Reads its environment from SPIKE_* variables (see SpikeBackend.spawnWorker).
 */
import { SpikeAppState } from "./app-state";
import { runBullMqWorker, runPgBossWorker } from "./backends";
import { SpikeProvider } from "./provider";
import type { WorkerContext } from "./handler";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env ${name}`);
  return value;
}

async function main(): Promise<void> {
  const backend = required("SPIKE_BACKEND");
  const workerId = required("SPIKE_WORKER_ID");
  const markerFile = required("SPIKE_MARKER_FILE");
  const pgUrl = required("SPIKE_PG_URL");

  const appState = await SpikeAppState.connect(pgUrl);
  const provider = new SpikeProvider(appState);

  const ctx: WorkerContext = {
    kind: backend === "bullmq" ? "bullmq" : "pgboss",
    workerId,
    markerFile,
    appState,
    provider
  };

  if (backend === "pgboss") {
    await runPgBossWorker(ctx, pgUrl);
  } else if (backend === "bullmq") {
    const redisUrl = required("SPIKE_REDIS_URL");
    await runBullMqWorker(ctx, redisUrl);
  } else {
    throw new Error(`unknown SPIKE_BACKEND: ${backend}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
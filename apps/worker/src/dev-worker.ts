import { assertDevOnly, devProviders } from "@for-little-ones/api/dev";
import { startConceptWorker } from "./concept-worker";

/**
 * Dev concept worker. Run with `npm run dev:worker` against the same `DATABASE_URL` as
 * `npm run dev:api` — the worker claims units the API enqueues.
 */
async function main(): Promise<void> {
  assertDevOnly("dev:worker");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const providers = devProviders();
  const handle = await startConceptWorker({
    connectionString,
    workerId: `concept-worker-${process.pid}`,
    storyProvider: providers.story,
    moderation: providers.moderation
  });

  process.stdout.write("flo concept worker (dev) started\n");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      handle.stop();
    });
  }
  // Drain the loop before exiting so an in-flight unit is completed or failed rather
  // than left leased until expiry.
  await handle.done;
}

void main().catch((err: unknown) => {
  process.stderr.write(`dev:worker failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

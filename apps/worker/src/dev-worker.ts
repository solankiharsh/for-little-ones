import { assertDevOnly, devProviders } from "@for-little-ones/api/dev";
import { startConceptWorker } from "./concept-worker";
import { startStoryWorker } from "./story-worker";

/**
 * Dev workers. Run with `npm run dev:worker` against the same `DATABASE_URL` as
 * `npm run dev:api` — the loops claim the units the API enqueues. Concept and
 * story loops share one process locally; production may split them (separate
 * lease/throughput tuning) without changing either runner.
 */
async function main(): Promise<void> {
  assertDevOnly("dev:worker");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const providers = devProviders();
  const workerId = `worker-${process.pid}`;
  const concepts = await startConceptWorker({
    connectionString,
    workerId: `${workerId}-concepts`,
    storyProvider: providers.story,
    moderation: providers.moderation
  });
  const stories = await startStoryWorker({
    connectionString,
    workerId: `${workerId}-stories`,
    storyProvider: providers.story,
    moderation: providers.moderation
  });

  process.stdout.write("flo workers (dev) started: concepts + stories\n");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      concepts.stop();
      stories.stop();
    });
  }
  // Drain both loops before exiting so in-flight units complete or fail rather
  // than being left leased until expiry.
  await Promise.all([concepts.done, stories.done]);
}

void main().catch((err: unknown) => {
  process.stderr.write(`dev:worker failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

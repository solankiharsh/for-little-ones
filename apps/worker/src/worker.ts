import { productionProviders } from "@for-little-ones/api/production";
import { startConceptWorker } from "./concept-worker";
import { startStoryWorker } from "./story-worker";

/**
 * Production worker (D032): concept + story claim loops against the same
 * DATABASE_URL as the API. One process locally and at sandbox scale;
 * production may split the loops (separate lease/throughput tuning) without
 * changing either runner — each loop only ever sees its own queue (D030).
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const providers = productionProviders();
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

  process.stdout.write("flo workers started: concepts + stories\n");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      concepts.stop();
      stories.stop();
    });
  }
  await Promise.all([concepts.done, stories.done]);
}

void main().catch((err: unknown) => {
  process.stderr.write(`worker failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

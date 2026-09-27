import { serve } from "@hono/node-server";
import { assertDevOnly, devProviders } from "./dev-providers";
import { composeApi } from "./compose";

/**
 * Dev API server. Run with `npm run dev:api` against the same `DATABASE_URL` as
 * `npm run dev:worker` — they are two processes sharing one Postgres, not two databases.
 */
async function main(): Promise<void> {
  assertDevOnly("dev:api");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const composed = await composeApi({ connectionString, providers: devProviders() });
  const port = Number(process.env.PORT ?? 8787);

  serve({ fetch: composed.app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    process.stdout.write(`flo api (dev) listening on http://127.0.0.1:${info.port}\n`);
  });

  // Close the pool and the durable runtime on the way out, or Postgres logs a pile of
  // dropped connections and the next run fights the previous one's leases.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void composed.close().then(() => process.exit(0));
    });
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`dev:api failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

import { serve } from "@hono/node-server";
import { composeApi } from "./compose";
import { productionProviders } from "./production";

/**
 * Production API server (D032). Same composed app as dev, with production
 * providers (no ALLOW stubs, no example stories) and the Cloud Run PORT
 * convention. Boot runs migrations (stores.init) before serving, so a fresh
 * database converges on first boot; API + worker may start together — the
 * durable runtime retries the bootstrap race (D028).
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const composed = await composeApi({ connectionString, providers: productionProviders() });
  const port = Number(process.env.PORT ?? 8080);

  serve({ fetch: composed.app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    process.stdout.write(`flo api listening on port ${info.port}\n`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void composed.close().then(() => process.exit(0));
    });
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`api failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

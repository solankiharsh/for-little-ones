/**
 * Local spike infrastructure (no Docker required).
 *
 * Spins up a REAL PostgreSQL (embedded-postgres, PostgreSQL 18.4 beta binaries
 * bundled via @embedded-postgres/darwin-arm64) and a REAL Redis
 * (redis-memory-server, stable binary downloaded to the npm cache) on the
 * standard spike ports, then waits until interrupted and tears both down.
 *
 * This is the fallback local-dev path for the spike when Docker/colima is
 * unavailable. corp compose.yaml (infra/compose.yaml) remains the documented
 * path for environments with Docker: same ports, same credentials.
 *
 *   npm run infra:local
 */
import EmbeddedPostgres from "embedded-postgres";
import { RedisMemoryServer } from "redis-memory-server";

const PG_PORT = Number(process.env.SPIKE_PG_PORT ?? 5432);
const REDIS_PORT = Number(process.env.SPIKE_REDIS_PORT ?? 6379);
const PG_DB = process.env.SPIKE_PG_DB ?? "durable_spike";
const PG_URL = `postgres://spike:spike@127.0.0.1:${PG_PORT}/${PG_DB}`;

async function main() {
  const pgserver = new EmbeddedPostgres({
    databaseDir: "tmp/pgdata",
    port: PG_PORT,
    user: "spike",
    password: "spike",
    authMethod: "password",
    persistent: false
  });
  await pgserver.initialise();
  await pgserver.start();

  const { Client } = await import("pg");
  const check = new Client({ host: "127.0.0.1", port: PG_PORT, user: "spike", password: "spike", database: "postgres" });
  await check.connect();
  const exists = await check.query("SELECT 1 FROM pg_database WHERE datname = $1", [PG_DB]);
  if (exists.rowCount === 0) {
    await check.query(`CREATE DATABASE ${PG_DB}`);
  }
  await check.end();

  const redisServer = new RedisMemoryServer({
    instance: { port: REDIS_PORT },
    binary: { version: "stable" }
  });
  await redisServer.getPort();

  console.log(`[infra:local] PostgreSQL ready  -> ${PG_URL}`);
  console.log(`[infra:local] Redis ready       -> redis://127.0.0.1:${REDIS_PORT}`);
  console.log("[infra:local] Ctrl-C to stop");

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });

  await pgserver.stop();
  await redisServer.stop();
  console.log("[infra:local] stopped");
}

main().catch((err) => {
  console.error("[infra:local] failed", err);
  process.exit(1);
});
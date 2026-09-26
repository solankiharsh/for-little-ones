/**
 * Detached helper that owns the test PostgreSQL instance for the
 * DurableExecutionRuntime specs.
 *
 * Run as a child of vitest's global setup with `detached: true, stdio: "ignore"`
 * so the embedded-postgres child-process handles (process + stderr pipes) belong
 * to THIS process and never keep vitest's main server from exiting. The helper
 * writes the ready connection string to PG_READY_FILE, then the global setup uses
 * it. It shuts the cluster down on SIGTERM/SIGINT, and as a safety net exits
 * itself if the parent (vitest) dies first.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const PORT = 55432;
const DB = "flo_execution_test";
const USER = "flo";
const PASSWORD = "flo";

const READY_FILE = process.env.PG_READY_FILE;
const DATA_DIR = fileURLToPath(new URL("../../../../tmp/execution-pg", import.meta.url));

let server: EmbeddedPostgres | undefined;
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (server) await server.stop();
  } catch {
    // grumpy postgres; the pidfile kill below is still attempted
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("SIGHUP", () => void shutdown());

process.on("unhandledRejection", (err) => {
  console.error(err);
  process.exit(1);
});

async function main(): Promise<void> {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(dirname(DATA_DIR), { recursive: true });

  server = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    authMethod: "password",
    persistent: false,
    onLog: () => {}
  });
  await server.initialise();
  await server.start();

  const { Client } = await import("pg");
  const client = new Client({
    host: "127.0.0.1",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres"
  });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
  if ((exists.rowCount ?? 0) === 0) {
    await client.query(`CREATE DATABASE ${DB}`);
  }
  await client.end();

  const url = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}`;
  if (READY_FILE) writeFileSync(READY_FILE, url);
}

main().catch((err) => {
  console.error("[pg-server] startup failed:", err);
  process.exit(1);
});

// Safety net: if the parent (vitest) goes away without running teardown (force
// exit, crash), take the cluster down with it instead of leaking a postmaster.
setInterval(() => {
  try {
    process.kill(process.ppid, 0);
  } catch {
    void shutdown();
  }
}, 2000).unref();
/**
 * Vitest global setup: makes one real PostgreSQL instance available for the
 * DurableExecutionRuntime specs.
 *
 * Local runs: boot the test cluster in a detached helper process (pg-server.ts)
 * so the embedded-postgres child handles never keep the vitest server from
 * exiting. The helper writes the connection string to a ready-file, which this
 * setup waits on before wiring TEST_DATABASE_URL.
 *
 * CI: when TEST_DATABASE_URL is already provided (e.g. a Postgres service), the
 * embedded cluster is skipped entirely.
 */
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { spawn, spawnSync, execSync } from "node:child_process";
import type { SpawnOptions } from "node:child_process";

const TEST_PORT = 55432;
const TEST_DB = "flo_execution_test";
const TEST_USER = "flo";
const TEST_PASSWORD = "flo";
const READY_TIMEOUT_MS = 30_000;

let child: ReturnType<typeof spawn> | undefined;

function killPidsOnTestPort(): void {
  let out: string;
  try {
    out = execSync(`lsof -tiTCP:${TEST_PORT} -sTCP:LISTEN`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return;
  }
  for (const pid of out.split(/\s+/)) {
    if (pid) spawnSync("kill", ["-9", pid]);
  }
}

export default async function setup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL) return;

  const readyFile = fileURLToPath(new URL("../../../../tmp/execution-pg.ready", import.meta.url));
  rmSync(readyFile, { force: true });
  killPidsOnTestPort();

  const helperPath = fileURLToPath(new URL("pg-server.ts", import.meta.url));
  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PG_READY_FILE: readyFile }
  };
  child = spawn(process.execPath, ["--import", "tsx", helperPath], spawnOptions);
  child.unref();

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const { readFile } = await import("node:fs/promises");
    try {
      const url = (await readFile(readyFile, { encoding: "utf8" })).trim();
      if (url) {
        process.env.TEST_DATABASE_URL = url;
        return;
      }
    } catch {
      // file not written yet
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting ${READY_TIMEOUT_MS}ms for the embedded Postgres on port ${TEST_PORT}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function teardown(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
    child = undefined;
  }
  killPidsOnTestPort();
  await rm(fileURLToPath(new URL("../../../../tmp/execution-pg.ready", import.meta.url)), { force: true }).catch(() => {});
}
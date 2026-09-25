/**
 * Shared test helpers for the pg-boss DurableExecutionRuntime specs.
 *
 * All pg-boss tests run against ONE real PostgreSQL instance (embedded-postgres
 * via the root vitest global setup, or an externally provided TEST_DATABASE_URL,
 * e.g. a CI Postgres service). The application/business tables live in the same
 * database so the crash-recovery scenarios exercise real cross-process behaviour.
 */
import pg from "pg";
import { PgBossDurableRuntime, type PgBossRuntimeOptions } from "../../src/index";

export const EXECUTION_DEAD_LETTER_QUEUE = "flo-execution-bad";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (did the vitest global setup run, or is CI providing a Postgres service?)");
  return url;
}

/**
 * Test runtime builder: fast supervision/lease settings so crash-recovery and
 * reclaim scenarios complete quickly, while staying a real pg-boss runtime.
 */
export function makeTestRuntime(options: Partial<PgBossRuntimeOptions> & { connectionString: string }): PgBossDurableRuntime {
  return new PgBossDurableRuntime({
    expireInSeconds: 4,
    superviseIntervalSeconds: 1,
    monitorIntervalSeconds: 1,
    maintenanceIntervalSeconds: 30,
    retryDelaySeconds: 1,
    ...options
  });
}

/** Wipe execution + app-state tables so each test starts clean. */
export async function resetExecutionTables(connectionString: string, dbUrl = connectionString): Promise<void> {
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    await pool.query(`TRUNCATE pgboss.job CASCADE`).catch(() => {});
    await pool.query(`TRUNCATE pgboss.archive CASCADE`).catch(() => {});
    await pool.query(`DELETE FROM flo_execution_jobs`).catch(() => {});
    await pool.query(`DELETE FROM flo_provider_request`).catch(() => {});
    await pool.query(`DELETE FROM flo_page_execution`).catch(() => {});
    await pool.query(`DELETE FROM flo_page_state`).catch(() => {});
  } finally {
    await pool.end();
  }
}

export async function deadLetterCount(connectionString: string, queue = EXECUTION_DEAD_LETTER_QUEUE): Promise<number> {
  const pool = new pg.Pool({ connectionString });
  try {
    const res = await pool.query(`SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1`, [queue]);
    return res.rows[0]?.n ?? 0;
  } finally {
    await pool.end();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Force-poll until `fn` returns a truthy value; returns it. Throws on timeout. */
export async function until<T>(fn: () => Promise<T | undefined>, timeoutMs: number, label: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}
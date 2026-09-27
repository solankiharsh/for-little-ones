import pg, { type Pool } from "pg";
import { applySchema } from "./postgres-stores";

/**
 * Test-database access for the Postgres-backed specs. The embedded cluster is booted
 * once by the root vitest global setup, which sets `TEST_DATABASE_URL`; CI provides it
 * from a Postgres service. `fileParallelism: false` in the root vitest config is what
 * makes sharing one cluster safe.
 */

export const FLO_TABLES = [
  "flo_concepts",
  "flo_books",
  "flo_facts",
  "flo_child_profiles",
  "flo_projects",
  "flo_sessions"
] as const;

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set (did the vitest global setup run, or is CI providing a Postgres service?)");
  }
  return url;
}

/**
 * Truncates every `flo_*` table so each spec starts from a known-empty database.
 * Applies the (idempotent) schema first, so a spec never has to order itself
 * around whether the tables exist yet.
 *
 * The pg-boss ledger is cleared too. A durable job is keyed by its operation key
 * (`concept-bundle:book-1:v1`), and pg-boss will not create a second job under a name
 * it already holds — so a spec that reused a book id would find its enqueue silently
 * deduped and see an empty queue. `CASCADE`/missing-table failures are tolerated
 * because the ledger only exists once a pg-boss runtime has booted.
 */
export async function resetFloTables(): Promise<Pool> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  await applySchema(pool);
  await pool.query(`TRUNCATE ${FLO_TABLES.join(", ")} CASCADE`);
  return pool;
}

/**
 * Clears BOTH durable-execution ledgers: the app ledger (`flo_execution_jobs` /
 * `flo_execution_unit`) and the pg-boss job table.
 *
 * MUST be called after a `PgBossDurableRuntime` has booted, because both are created
 * by its `init()` — before that the relations do not exist and every statement here is
 * a no-op.
 *
 * Clearing the app ledger is not optional housekeeping. `enqueue` is keyed on
 * `operation_key` and short-circuits when a row already exists, so a spec that reuses a
 * book id (and therefore the same `concept-bundle:book-1:v1` key) would silently skip
 * `boss.send` on its second case and observe an empty queue with no error anywhere.
 */
export async function clearExecutionLedger(db: Pick<pg.Pool, "query">): Promise<void> {
  await db.query("DELETE FROM flo_execution_unit");
  await db.query("DELETE FROM flo_execution_jobs");
  await db.query("TRUNCATE pgboss.job CASCADE");
  // `archive` is created lazily by pg-boss on first archive, so its absence is fine.
  await db.query("TRUNCATE pgboss.archive CASCADE").catch(() => {});
}

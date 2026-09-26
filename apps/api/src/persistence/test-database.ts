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
 */
export async function resetFloTables(): Promise<Pool> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  await applySchema(pool);
  await pool.query(`TRUNCATE ${FLO_TABLES.join(", ")} CASCADE`);
  return pool;
}

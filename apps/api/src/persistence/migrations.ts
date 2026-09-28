import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/**
 * Minimal versioned migration framework for the Slice-2 `flo_*` tables (D027).
 *
 * Before this, `init()` replayed one idempotent `schema.sql` on every boot. That
 * covers `CREATE TABLE IF NOT EXISTS` but cannot express the operations a live
 * schema actually needs: `ALTER TABLE … ADD COLUMN`, backfills over existing rows,
 * and constraints that must land after the backfill (the D026 claim/moderation/
 * entitlement columns landed through unversioned seed DDL — the gap that forced
 * this framework). Each change is now an ordered, ledger-recorded migration.
 *
 * Deliberately small and dependency-free (`pg` only):
 * - `flo_schema_migrations(version PK, name, applied_at)` is the ledger.
 * - `MIGRATIONS` is the ordered list; version 1 is the Slice-2 baseline
 *   (`schema.sql`, idempotent replay — safe on databases that predate the ledger).
 * - `migrate()` applies pending migrations under a transaction-scoped advisory
 *   lock, so the API and the worker can boot against the same database
 *   concurrently without racing.
 * - No down migrations: forward-only, matching the rollback story (restore from
 *   backup; the ledger tells you what the backup must contain).
 */

export interface Migration {
  version: number;
  name: string;
  /** Raw SQL run inside the migration transaction. May contain many statements. */
  sql: string;
}

const SCHEMA_URL = new URL("./schema.sql", import.meta.url);

/** Replays the idempotent `flo_*` DDL. Safe on every boot and against an existing schema. */
export async function applySchema(db: Pick<pg.Pool | pg.PoolClient, "query">): Promise<void> {
  const ddl = await readFile(fileURLToPath(SCHEMA_URL), "utf8");
  await db.query(ddl);
}

async function applyBaseline(db: Pick<pg.Pool | pg.PoolClient, "query">): Promise<void> {
  await applySchema(db);
}

export const BASELINE_MIGRATION: Migration = {
  version: 1,
  name: "slice-2-baseline",
  sql: "-- applied by applyBaseline (schema.sql replay); no inline SQL"
};

/** Ordered migration registry. Append-only: never edit an applied migration. */
export const MIGRATIONS: Migration[] = [BASELINE_MIGRATION];

export interface MigrateOptions {
  migrations?: Migration[];
  now?: () => string;
}

export interface MigrateResult {
  applied: number[];
}

/**
 * Applies every pending migration in version order and records each in
 * `flo_schema_migrations`. Idempotent: a second call (or a concurrent boot)
 * applies nothing.
 */
export async function migrate(pool: pg.Pool, options: MigrateOptions = {}): Promise<MigrateResult> {
  const migrations = [...(options.migrations ?? MIGRATIONS)].sort((a, b) => a.version - b.version);
  const now = options.now ?? (() => new Date().toISOString());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('flo_schema_migrations'))");
    await client.query(
      `CREATE TABLE IF NOT EXISTS flo_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    );
    const existing = await client.query<{ version: number | string }>("SELECT version FROM flo_schema_migrations");
    const applied = new Set(existing.rows.map((r) => Number(r.version)));
    const result: MigrateResult = { applied: [] };
    const timestamp = now();
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      if (migration.version === BASELINE_MIGRATION.version) {
        await applyBaseline(client);
      } else {
        await client.query(migration.sql);
      }
      await client.query("INSERT INTO flo_schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)", [
        migration.version,
        migration.name,
        timestamp
      ]);
      result.applied.push(migration.version);
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

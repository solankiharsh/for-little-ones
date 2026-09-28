import pg from "pg";
import { applySchema, migrate } from "./migrations";
import { PostgresCreationStore } from "./postgres-creation-store";
import { PostgresSessionStore } from "./postgres-session-store";

export { applySchema } from "./migrations";
export { MIGRATIONS, migrate } from "./migrations";
export type { Migration, MigrateOptions, MigrateResult } from "./migrations";

/**
 * Slice-2 persistence seam wiring (D024 §8, D027): ONE `pg.Pool` shared by the
 * session and creation adapters, created once per process. `init()` runs the
 * versioned migrations (baseline = the idempotent `flo_*` DDL, then any pending
 * ALTER/backfill change in order under an advisory lock), so booting the API and
 * the worker against the same database is safe and needs no manual step.
 */

export interface PostgresStores {
  pool: pg.Pool;
  sessions: PostgresSessionStore;
  creation: PostgresCreationStore;
  /** Runs pending migrations (baseline first). Safe to call on every boot and concurrently. */
  init(): Promise<void>;
  close(): Promise<void>;
}

export function createPostgresStores(pool: pg.Pool): PostgresStores {
  const sessions = new PostgresSessionStore(pool);
  const creation = new PostgresCreationStore(pool);
  return {
    pool,
    sessions,
    creation,
    async init() {
      await migrate(pool);
    },
    async close() {
      await pool.end();
    }
  };
}

/** The pool a production process should use: `DATABASE_URL`, sane pool bounds. */
export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new pg.Pool({ connectionString, max: 10 });
}

let processStores: PostgresStores | undefined;

/**
 * Process-wide stores for the API/worker entry points; created on first use.
 *
 * Memoized so the API and the durable runtime share ONE `pg.Pool` (D024 §2). Pass the
 * connection string on the first call — later calls reuse the existing pool, because a
 * second pool for the same database is exactly the split this function exists to prevent.
 */
export function postgresStores(connectionString?: string): PostgresStores {
  processStores ??= createPostgresStores(createPool(connectionString));
  return processStores;
}

export async function closePostgresStores(): Promise<void> {
  await processStores?.close();
  processStores = undefined;
}

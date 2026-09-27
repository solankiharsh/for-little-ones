import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgresCreationStore } from "./postgres-creation-store";
import { PostgresSessionStore } from "./postgres-session-store";

/**
 * Slice-2 persistence seam wiring (D024 §8): ONE `pg.Pool` shared by the session and
 * creation adapters, created once per process. The raw `flo_*` DDL is replayed by
 * `init()` and is idempotent, so booting the API and the worker against the same
 * database needs no migration step (the migration-framework item stays open).
 */

export interface PostgresStores {
  pool: pg.Pool;
  sessions: PostgresSessionStore;
  creation: PostgresCreationStore;
  /** Replays `schema.sql`. Safe to call on every boot and concurrently. */
  init(): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA_URL = new URL("./schema.sql", import.meta.url);

/** Replays the idempotent `flo_*` DDL. Safe on every boot and against an existing schema. */
export async function applySchema(db: Pick<pg.Pool, "query">): Promise<void> {
  const ddl = await readFile(fileURLToPath(SCHEMA_URL), "utf8");
  await db.query(ddl);
}

export function createPostgresStores(pool: pg.Pool): PostgresStores {
  const sessions = new PostgresSessionStore(pool);
  const creation = new PostgresCreationStore(pool);
  return {
    pool,
    sessions,
    creation,
    async init() {
      await applySchema(pool);
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

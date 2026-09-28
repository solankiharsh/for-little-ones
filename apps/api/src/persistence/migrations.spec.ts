import pg from "pg";
import { describe, expect, it } from "vitest";
import { FLO_TABLES, testDatabaseUrl } from "./test-database";
import { MIGRATIONS, migrate } from "./migrations";

/**
 * D027: the migration framework must do what the bare `schema.sql` replay could
 * not — versioned ALTER + backfill over existing rows, a ledger, and safe
 * concurrent boot (API + worker against the same database).
 *
 * The shared test Postgres is reused across specs (`fileParallelism: false`), but
 * no other spec reads `flo_schema_migrations`, so owning the ledger rows here is
 * interference-free. Scratch tables use a `mig_` prefix unique to this spec.
 */

async function ledgerVersions(pool: pg.Pool): Promise<number[]> {
  const { rows } = await pool.query("SELECT version FROM flo_schema_migrations ORDER BY version");
  return rows.map((r) => Number(r.version));
}

describe("persistence migrations (D027)", () => {
  it("baselines a database that predates the ledger, then replays idempotently", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
    await pool.query("DROP TABLE IF EXISTS flo_schema_migrations");
    try {
      const first = await migrate(pool);
      expect(first.applied).toEqual([1]);
      expect(await ledgerVersions(pool)).toEqual([1]);
      for (const table of FLO_TABLES) {
        const { rows } = await pool.query("SELECT to_regclass($1) AS oid", [`public.${table}`]);
        expect(rows[0].oid, table).toBeTruthy();
      }
      const second = await migrate(pool);
      expect(second.applied).toEqual([]);
      expect(await ledgerVersions(pool)).toEqual([1]);
    } finally {
      await pool.end();
    }
  });

  it("applies a column-add + backfill + constraint migration over existing rows", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
    await pool.query("DROP TABLE IF EXISTS flo_schema_migrations");
    await pool.query("DROP TABLE IF EXISTS mig_scratch");
    try {
      await pool.query("CREATE TABLE mig_scratch (id TEXT PRIMARY KEY, nickname TEXT)");
      await pool.query("INSERT INTO mig_scratch (id) VALUES ('row-1')");
      const result = await migrate(pool, {
        migrations: [
          ...MIGRATIONS,
          {
            version: 2,
            name: "mig-spec-probe",
            sql: `ALTER TABLE mig_scratch ADD COLUMN IF NOT EXISTS display_label TEXT;
                  UPDATE mig_scratch SET display_label = nickname WHERE display_label IS NULL;
                  UPDATE mig_scratch SET display_label = id WHERE display_label IS NULL;
                  ALTER TABLE mig_scratch ALTER COLUMN display_label SET NOT NULL;`
          }
        ]
      });
      expect(result.applied).toEqual([1, 2]);
      const { rows } = await pool.query("SELECT display_label FROM mig_scratch WHERE id = 'row-1'");
      expect(rows[0].display_label).toBe("row-1");
      expect(await ledgerVersions(pool)).toEqual([1, 2]);
      // A second boot skips both — the backfill never re-runs.
      expect((await migrate(pool, { migrations: [...MIGRATIONS] })).applied).toEqual([]);
    } finally {
      await pool.query("DROP TABLE IF EXISTS mig_scratch");
      await pool.end();
    }
  });

  it("serializes concurrent boots so the baseline lands exactly once", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
    await pool.query("DROP TABLE IF EXISTS flo_schema_migrations");
    try {
      const results = await Promise.all([migrate(pool), migrate(pool), migrate(pool)]);
      expect(results.flatMap((r) => r.applied).sort()).toEqual([1]);
      expect(await ledgerVersions(pool)).toEqual([1]);
    } finally {
      await pool.end();
    }
  });
});

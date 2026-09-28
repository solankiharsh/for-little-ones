import pg from "pg";
import { describe, expect, it } from "vitest";
import { makeTestRuntime, testDatabaseUrl } from "./helpers/pg-test";

/**
 * Concurrent-boot guard (observed 2026-09-28: `dev:api` + `dev:worker` started
 * together against a fresh database, one died with
 * `duplicate key … pg_type_typname_nsp_index` inside pg-boss's bootstrap DDL;
 * fixed by retrying the bootstrap race in `PgBossDurableRuntime.init`).
 *
 * The race itself is timing-dependent and does not reproduce on demand against
 * local Postgres, so this spec guards the property instead: a scratch database
 * forces a real first bootstrap, and both runtimes must come up usable.
 */
describe("pg-boss runtime: concurrent first boot", () => {
  it("two runtimes initializing together both come up usable", async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl() });
    const scratch = "flo_init_race";
    await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${scratch}`);
    await admin.end();
    const connectionString = testDatabaseUrl().replace(/\/[^/?]+(\?.*)?$/, `/${scratch}$1`);

    const first = makeTestRuntime({ connectionString });
    const second = makeTestRuntime({ connectionString });
    await Promise.all([first.init(), second.init()]);
    try {
      const key = `race-${Date.now()}`;
      await first.enqueue({
        operationKey: key,
        units: [{ unitKey: "u1", maxAttempts: 1, payload: { hello: "race" } }]
      });
      const claimed = await second.claim({ workerId: "race-worker", limit: 1, leaseForMs: 30_000 });
      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.unitKey).toBe("u1");
    } finally {
      await first.close().catch(() => {});
      await second.close().catch(() => {});
      const cleanup = new pg.Pool({ connectionString: testDatabaseUrl() });
      await cleanup.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`).catch(() => {});
      await cleanup.end();
    }
  }, 120_000);
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgBossDurableRuntime } from "../src/index";
import { makeTestRuntime, resetExecutionTables, testDatabaseUrl, until } from "./helpers/pg-test";

const DB = testDatabaseUrl();

const NOW = 1_000_000;
const clock = (stepMs: number) => {
  let t = NOW;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    }
  };
};

const pageUnits = (operationKey: string, count = 8) =>
  Array.from({ length: count }, (_, i) => ({
    unitKey: `page:${i + 1}`,
    payload: { pageNumber: i + 1 },
    maxAttempts: 3
  }));

const opKeyOf = (side: string) => `contract:${side}`;

let runtime: PgBossDurableRuntime;

beforeEach(async () => {
  await resetExecutionTables(DB);
  runtime = await makeTestRuntime({ connectionString: DB }).init();
  vi.useRealTimers();
});

afterEach(async () => {
  await runtime.close();
});

describe("execution: pg-boss runtime contract parity (seam 1)", () => {
  it("enqueue is idempotent by business-operation key", async () => {
    const opKey = opKeyOf("idempotent");
    const first = await runtime.enqueue({ operationKey: opKey, units: pageUnits(opKey) });
    expect(first.units).toHaveLength(8);
    const again = await runtime.enqueue({ operationKey: opKey, units: [{ unitKey: "page:1", payload: {} }] });
    expect(again.operationKey).toBe(first.operationKey);
    expect(again.units).toHaveLength(8);
  });

  it("a claimed unit whose lease expires is reclaimed by another worker", async () => {
    const opKey = opKeyOf("reclaim");
    await runtime.enqueue({ operationKey: opKey, units: pageUnits(opKey) });

    const w1 = await runtime.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
    expect(w1).toHaveLength(1);
    expect(w1[0]?.reclaimed).toBe(0);

    await until(
      async () => {
        const job = await runtime.job(opKey);
        // pg-boss treats lease expiry as a supervisor timeout: the expired job is
        // re-inserted as a retry (view shows FAILED) rather than as a fresh
        // 'created' job (PENDING). Either signals it is claimable again.
        return job?.units[0]?.status === "PENDING" || job?.units[0]?.status === "FAILED"
          ? true
          : undefined;
      },
      20_000,
      "first unit lease to expire and be requeued"
    );

    const reclaimed = await until(
      async () => {
        // pg-boss re-inserts the expired job as a retry with a start_after of
        // retryDelaySeconds, so a single claim may race it; poll until worker-2
        // actually reclaims page:1.
        const claimed = await runtime.claim({ workerId: "worker-2", limit: 8, leaseForMs: 30_000 });
        return claimed.find((u) => u.unitId === w1[0]!.unitId);
      },
      20_000,
      "expired unit to be reclaimed by worker-2"
    );
    expect(reclaimed?.reclaimed).toBe(1);
    expect(reclaimed?.attempts).toBe(0);

    await runtime.complete("worker-2", reclaimed!.unitId, { pageNumber: 1, textBlocks: [] });
    const job = (await runtime.job(opKey))!;
    const unit = job.units.find((u) => u.unitId === reclaimed!.unitId)!;
    expect(unit.status).toBe("READY");
    expect(unit.output).toEqual({ pageNumber: 1, textBlocks: [] });
  });

  it("a live (unexpired) lease is not handed to another worker", async () => {
    const opKey = opKeyOf("live-lease");
    await runtime.enqueue({ operationKey: opKey, units: pageUnits(opKey) });
    await runtime.claim({ workerId: "worker-1", limit: 8, leaseForMs: 30_000 });
    const w2 = await runtime.claim({ workerId: "worker-2", limit: 8, leaseForMs: 30_000 });
    expect(w2).toHaveLength(0);
  });

  it("a stale worker cannot complete a unit after its lease expired", async () => {
    const opKey = opKeyOf("stale");
    const c = clock(10);
    const clocked = await makeTestRuntime({ connectionString: DB, now: c.now }).init();
    try {
      await clocked.enqueue({ operationKey: opKey, units: pageUnits(opKey) });
      const [u] = await clocked.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
      c.advance(60_000);
      await runtime.claim({ workerId: "worker-2", leaseForMs: 30_000 });
      const res = await clocked.complete("worker-1", u!.unitId, { ok: true });
      expect(res.ok).toBe("not-leased");
    } finally {
      await clocked.close();
    }
  });

  it("a retryable failure is re-claimable and eventually goes DEAD at max attempts", async () => {
    const opKey = opKeyOf("retryable");
    await runtime.enqueue({
      operationKey: opKey,
      units: [{ unitKey: "illustration:3", payload: {}, maxAttempts: 2 }]
    });

    const failNext = async () => {
      const unit = await until(
        async () => {
          const claimed = await runtime.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
          return claimed[0];
        },
        20_000,
        "a claimable retry attempt"
      );
      const res = await runtime.fail("worker-1", unit.unitId, {
        code: "PROVIDER_5XX",
        message: "boom",
        retryable: true
      });
      expect(res.ok).toBe("leased");
    };

    await failNext();
    let job = (await runtime.job(opKey))!;
    expect(job.units[0]?.attempts).toBe(1);
    expect(job.units[0]?.status).toBe("FAILED");

    await failNext();
    job = (await runtime.job(opKey))!;
    expect(job.units[0]?.attempts).toBe(2);
    expect(job.units[0]?.status).toBe("DEAD");
    expect(job.status).toBe("FAILED");

    const more = await runtime.claim({ workerId: "worker-1", leaseForMs: 30_000 });
    expect(more).toHaveLength(0);
  });

  it("a non-retryable failure is DEAD immediately and not re-claimable", async () => {
    const opKey = opKeyOf("non-retryable");
    await runtime.enqueue({ operationKey: opKey, units: [{ unitKey: "u", payload: {} }] });
    const [u] = await runtime.claim({ workerId: "w", leaseForMs: 30_000 });
    expect(u).toBeDefined();
    const res = await runtime.fail("w", u!.unitId, {
      code: "SCHEMA_INVALID",
      message: "reject",
      retryable: false
    });
    expect(res.ok).toBe("leased");
    expect((await runtime.job(opKey))!.units[0]?.status).toBe("DEAD");
    const more = await runtime.claim({ workerId: "w", leaseForMs: 30_000 });
    expect(more).toHaveLength(0);
    const late = await runtime.complete("w", u!.unitId, { nope: true });
    expect(late.ok).toBe("not-leased");
  });

  it("cancellation refuses later completion; progress observation reflects state", async () => {
    const opKey = opKeyOf("cancel");
    const op = await runtime.enqueue({
      operationKey: opKey,
      units: [
        { unitKey: "illustration:1", payload: {} },
        { unitKey: "illustration:2", payload: {} }
      ]
    });
    const [u1] = await runtime.claim({ workerId: "w", limit: 1, leaseForMs: 30_000 });
    expect((await runtime.job(op.operationKey))!.units[0]?.status).toBe("RUNNING");
    expect((await runtime.job(op.operationKey))!.units[1]?.status).toBe("PENDING");

    const cancel = await runtime.cancel(op.operationKey);
    expect(cancel.ok).toBe(true);
    expect((await runtime.job(op.operationKey))!.status).toBe("CANCELLED");

    const late = await runtime.complete("w", u1!.unitId, { nope: true });
    expect(late.ok).toBe("not-leased");
  });

  it("a job transitions to SUCCEEDED once every unit is READY", async () => {
    const opKey = opKeyOf("succeeded");
    const op = await runtime.enqueue({
      operationKey: opKey,
      units: [
        { unitKey: "a", payload: {} },
        { unitKey: "b", payload: {} }
      ]
    });
    const claimed = await runtime.claim({ workerId: "w", limit: 2, leaseForMs: 30_000 });
    expect(claimed).toHaveLength(2);
    for (const u of claimed) {
      const res = await runtime.complete("w", u.unitId, { result: u.unitKey });
      expect(res.ok).toBe("leased");
    }
    const job = (await runtime.job(op.operationKey))!;
    expect(job.status).toBe("SUCCEEDED");
    expect(job.units.map((u) => u.status)).toEqual(["READY", "READY"]);
  });

  it("a fresh runtime instance reconstructs the same job view (restart survival)", async () => {
    const opKey = opKeyOf("restart");
    const first = await makeTestRuntime({ connectionString: DB }).init();
    await first.enqueue({
      operationKey: opKey,
      units: [
        { unitKey: "a", payload: { n: 1 } },
        { unitKey: "b", payload: { n: 2 } }
      ]
    });
    const claimed = await first.claim({ workerId: "w1", limit: 2, leaseForMs: 30_000 });
    expect(claimed).toHaveLength(2);
    await first.close();

    const second = await makeTestRuntime({ connectionString: DB }).init();
    const mid = (await second.job(opKey))!;
    expect(mid.status).toBe("QUEUED");
    expect(mid.units.map((u) => u.status)).toEqual(["RUNNING", "RUNNING"]);
    expect(mid.units[0]?.lease?.holderId).toBe("w1");
    expect(mid.units[0]?.payload).toEqual({ n: 1 });

    const held = await second.claim({ workerId: "w2", limit: 2, leaseForMs: 30_000 });
    expect(held).toHaveLength(0);

    for (const u of mid.units) {
      const res = await second.complete("w1", u.unitId, { result: u.unitKey });
      expect(res.ok).toBe("leased");
    }
    const fin = (await second.job(opKey))!;
    expect(fin.status).toBe("SUCCEEDED");
    await second.close();
  });
});
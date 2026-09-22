import { describe, expect, it } from "vitest";
import { InMemoryDurableRuntime } from "../src/index";

const NOW = 1_000_000;
const clock = (stepMs: number) => {
  let t = NOW;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    step: () => {
      t += stepMs;
    }
  };
};

const enqueuePages = async (runtime: InMemoryDurableRuntime, count = 8) => {
  const op = await runtime.enqueue({
    operationKey: "book:1|story",
    units: Array.from({ length: count }, (_, i) => ({
      unitKey: `pageText:${i + 1}`,
      payload: { pageNumber: i + 1 },
      maxAttempts: 3
    }))
  });
  return op;
};

describe("execution: durable-contract semantics (seam 2)", () => {
  it("enqueue is idempotent by business-operation key", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const first = await enqueuePages(rt);
    expect(first.units).toHaveLength(8);
    const again = await rt.enqueue({ operationKey: "book:1|story", units: [{ unitKey: "pageText:1", payload: {} }] });
    expect(again.operationKey).toBe(first.operationKey);
    expect(again.units).toHaveLength(8);
  });

  it("a claimed unit with an expired lease is reclaimed by another worker after a crash", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = await enqueuePages(rt, 8);
    void op;

    const w1 = await rt.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
    expect(w1).toHaveLength(1);
    const unitId = w1[0]?.unitId;
    expect(unitId).toBeDefined();

    // Worker 1 dies mid-call: no completion, no heartbeat.
    c.advance(60_000);

    const beforeReclaim = await rt.claim({ workerId: "worker-2", limit: 5, leaseForMs: 30_000 });
    expect(beforeReclaim.map((u) => u.unitId)).toContain(unitId);

    const reclaimed = beforeReclaim.find((u) => u.unitId === unitId);
    expect(reclaimed?.reclaimed).toBe(1);
    expect(reclaimed?.attempts).toBe(0);

    await rt.complete("worker-2", unitId!, { pageNumber: 1, textBlocks: [] });
    const job = (await rt.job("book:1|story"))!;
    const unit = job.units.find((u) => u.unitId === unitId)!;
    expect(unit.status).toBe("READY");
    expect(unit.output).toEqual({ pageNumber: 1, textBlocks: [] });
  });

  it("a live (unexpired) lease is not handed to another worker", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    await enqueuePages(rt, 8);
    await rt.claim({ workerId: "worker-1", limit: 8, leaseForMs: 30_000 });
    const w2 = await rt.claim({ workerId: "worker-2", limit: 8, leaseForMs: 30_000 });
    expect(w2).toHaveLength(0);
  });

  it("a stale worker cannot complete a unit after its lease expired", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    await enqueuePages(rt, 8);
    const [u] = await rt.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
    c.advance(60_000);
    await rt.claim({ workerId: "worker-2", leaseForMs: 30_000 });
    const res = await rt.complete("worker-1", u!.unitId, { ok: true });
    expect(res.ok).toBe("not-leased");
  });

  it("a retryable failure is re-claimable and eventually goes DEAD at max attempts", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = await rt.enqueue({
      operationKey: "book:1|page:3",
      units: [{ unitKey: "illustration:3", payload: {}, maxAttempts: 2 }]
    });
    void op;

    const attempt = async (workerId: string) => {
      const [u] = await rt.claim({ workerId, limit: 1, leaseForMs: 30_000 });
      if (!u) return;
      const res = await rt.fail(workerId, u.unitId, { code: "PROVIDER_5XX", message: "boom", retryable: true });
      expect(res.ok).toBe("leased");
    };

    await attempt("worker-1");
    expect((await rt.job("book:1|page:3"))!.units[0]?.attempts).toBe(1);
    expect((await rt.job("book:1|page:3"))!.units[0]?.status).toBe("FAILED");
    await attempt("worker-1");
    expect((await rt.job("book:1|page:3"))!.units[0]?.attempts).toBe(2);
    expect((await rt.job("book:1|page:3"))!.units[0]?.status).toBe("DEAD");
    expect((await rt.job("book:1|page:3"))!.status).toBe("FAILED");
    const more = await rt.claim({ workerId: "worker-1", leaseForMs: 30_000 });
    expect(more).toHaveLength(0);
  });

  it("a non-retryable failure is DEAD immediately", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    await rt.enqueue({ operationKey: "k", units: [{ unitKey: "u", payload: {} }] });
    const [u] = await rt.claim({ workerId: "w", leaseForMs: 30_000 });
    await rt.fail("w", u!.unitId, { code: "SCHEMA_INVALID", message: "reject", retryable: false });
    expect((await rt.job("k"))!.units[0]?.status).toBe("DEAD");
  });

  it("cancellation refuses later completion; progress observation reflects state", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = await rt.enqueue({
      operationKey: "book:1|superseded",
      units: [
        { unitKey: "illustration:1", payload: {} },
        { unitKey: "illustration:2", payload: {} }
      ]
    });
    const [u1] = await rt.claim({ workerId: "w", limit: 1, leaseForMs: 30_000 });
    expect((await rt.job(op.operationKey))!.units[0]?.status).toBe("RUNNING");
    expect((await rt.job(op.operationKey))!.units[1]?.status).toBe("PENDING");

    const cancel = await rt.cancel(op.operationKey);
    expect(cancel.ok).toBe(true);
    expect((await rt.job(op.operationKey))!.status).toBe("CANCELLED");

    const late = await rt.complete("w", u1!.unitId, { nope: true });
    expect(late.ok).toBe("not-leased");
  });

  it("a job transitions to SUCCEEDED once every unit is READY", async () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = await rt.enqueue({ operationKey: "k", units: [{ unitKey: "a", payload: {} }, { unitKey: "b", payload: {} }] });
    const claimed = await rt.claim({ workerId: "w", limit: 2, leaseForMs: 30_000 });
    for (const u of claimed) {
      await rt.complete("w", u.unitId, `done-${u.unitKey}`);
    }
    expect((await rt.job(op.operationKey))!.status).toBe("SUCCEEDED");
    expect((await rt.job(op.operationKey))!.units.map((u) => u.status)).toEqual(["READY", "READY"]);
  });
});

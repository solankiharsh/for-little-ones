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

const enqueuePages = (runtime: InMemoryDurableRuntime, count = 8) => {
  const op = runtime.enqueue({
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
  it("enqueue is idempotent by business-operation key", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const first = enqueuePages(rt);
    expect(first.units).toHaveLength(8);
    const again = rt.enqueue({ operationKey: "book:1|story", units: [{ unitKey: "pageText:1", payload: {} }] });
    expect(again.operationKey).toBe(first.operationKey);
    expect(again.units).toHaveLength(8);
  });

  it("a claimed unit with an expired lease is reclaimed by another worker after a crash", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = enqueuePages(rt, 8);
    void op;

    const w1 = rt.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
    expect(w1).toHaveLength(1);
    const unitId = w1[0]?.unitId;
    expect(unitId).toBeDefined();

    // Worker 1 dies mid-call: no completion, no heartbeat.
    c.advance(60_000);

    const beforeReclaim = rt.claim({ workerId: "worker-2", limit: 5, leaseForMs: 30_000 });
    expect(beforeReclaim.map((u) => u.unitId)).toContain(unitId);

    const reclaimed = beforeReclaim.find((u) => u.unitId === unitId);
    expect(reclaimed?.reclaimed).toBe(1);
    expect(reclaimed?.attempts).toBe(0);

    rt.complete("worker-2", unitId!, { pageNumber: 1, textBlocks: [] });
    const job = rt.job("book:1|story")!;
    const unit = job.units.find((u) => u.unitId === unitId)!;
    expect(unit.status).toBe("READY");
    expect(unit.output).toEqual({ pageNumber: 1, textBlocks: [] });
  });

  it("a live (unexpired) lease is not handed to another worker", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    enqueuePages(rt, 8);
    rt.claim({ workerId: "worker-1", limit: 8, leaseForMs: 30_000 });
    const w2 = rt.claim({ workerId: "worker-2", limit: 8, leaseForMs: 30_000 });
    expect(w2).toHaveLength(0);
  });

  it("a stale worker cannot complete a unit after its lease expired", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    enqueuePages(rt, 8);
    const [u] = rt.claim({ workerId: "worker-1", limit: 1, leaseForMs: 30_000 });
    c.advance(60_000);
    rt.claim({ workerId: "worker-2", leaseForMs: 30_000 });
    const res = rt.complete("worker-1", u!.unitId, { ok: true });
    expect(res.ok).toBe("not-leased");
  });

  it("a retryable failure is re-claimable and eventually goes DEAD at max attempts", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = rt.enqueue({
      operationKey: "book:1|page:3",
      units: [{ unitKey: "illustration:3", payload: {}, maxAttempts: 2 }]
    });
    void op;

    const attempt = (workerId: string) => {
      const [u] = rt.claim({ workerId, limit: 1, leaseForMs: 30_000 });
      if (!u) return;
      const res = rt.fail(workerId, u.unitId, { code: "PROVIDER_5XX", message: "boom", retryable: true });
      expect(res.ok).toBe("leased");
    };

    attempt("worker-1");
    expect(rt.job("book:1|page:3")!.units[0]?.attempts).toBe(1);
    expect(rt.job("book:1|page:3")!.units[0]?.status).toBe("FAILED");
    attempt("worker-1");
    expect(rt.job("book:1|page:3")!.units[0]?.attempts).toBe(2);
    expect(rt.job("book:1|page:3")!.units[0]?.status).toBe("DEAD");
    expect(rt.job("book:1|page:3")!.status).toBe("FAILED");
    const more = rt.claim({ workerId: "worker-1", leaseForMs: 30_000 });
    expect(more).toHaveLength(0);
  });

  it("a non-retryable failure is DEAD immediately", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    rt.enqueue({ operationKey: "k", units: [{ unitKey: "u", payload: {} }] });
    const [u] = rt.claim({ workerId: "w", leaseForMs: 30_000 });
    rt.fail("w", u!.unitId, { code: "SCHEMA_INVALID", message: "reject", retryable: false });
    expect(rt.job("k")!.units[0]?.status).toBe("DEAD");
  });

  it("cancellation refuses later completion; progress observation reflects state", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = rt.enqueue({
      operationKey: "book:1|superseded",
      units: [
        { unitKey: "illustration:1", payload: {} },
        { unitKey: "illustration:2", payload: {} }
      ]
    });
    const [u1] = rt.claim({ workerId: "w", limit: 1, leaseForMs: 30_000 });
    expect(rt.job(op.operationKey)!.units[0]?.status).toBe("RUNNING");
    expect(rt.job(op.operationKey)!.units[1]?.status).toBe("PENDING");

    const cancel = rt.cancel(op.operationKey);
    expect(cancel.ok).toBe(true);
    expect(rt.job(op.operationKey)!.status).toBe("CANCELLED");

    const late = rt.complete("w", u1!.unitId, { nope: true });
    expect(late.ok).toBe("not-leased");
  });

  it("a job transitions to SUCCEEDED once every unit is READY", () => {
    const c = clock(10);
    const rt = new InMemoryDurableRuntime({ now: c.now });
    const op = rt.enqueue({ operationKey: "k", units: [{ unitKey: "a", payload: {} }, { unitKey: "b", payload: {} }] });
    const claimed = rt.claim({ workerId: "w", limit: 2, leaseForMs: 30_000 });
    for (const u of claimed) {
      rt.complete("w", u.unitId, `done-${u.unitKey}`);
    }
    expect(rt.job(op.operationKey)!.status).toBe("SUCCEEDED");
    expect(rt.job(op.operationKey)!.units.map((u) => u.status)).toEqual(["READY", "READY"]);
  });
});
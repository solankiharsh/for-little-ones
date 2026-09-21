import type {
  BusinessOperationKey,
  ClaimRequest,
  ClaimedUnit,
  DurableExecutionRuntime,
  EnqueueRequest,
  EnqueueUnit,
  JobView,
  LeaseHeldResult,
  LeaseRefusedResult,
  UnitFailure,
  UnitId,
  UnitLease,
  UnitStatus,
  UnitView,
  WorkerId
} from "./contract";

interface InternalUnit {
  unitId: UnitId;
  unitKey: string;
  payload: unknown;
  status: UnitStatus;
  attempts: number;
  maxAttempts: number;
  output?: unknown;
  lastFailure?: UnitFailure;
  lease?: UnitLease;
}

interface InternalJob {
  operationKey: BusinessOperationKey;
  status: "QUEUED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "DEAD";
  units: InternalUnit[];
}

const DEFAULT_MAX_ATTEMPTS = 3;

const unitIdFor = (operationKey: BusinessOperationKey, unitKey: string): UnitId =>
  `${operationKey}|${unitKey}`;

/**
 * An in-memory implementation of the DurableExecutionContract. It encodes the
 * contract semantics (idempotent enqueue by business-operation key, expired-lease
 * reclaim, retry budgets, cancellation, progress observation) for tests and
 * staging providers — it is deliberately NOT a durable substrate and must never be
 * used as one in production (D019 keeps the substrate neutral until the spike).
 */
export class InMemoryDurableRuntime implements DurableExecutionRuntime {
  private jobs = new Map<BusinessOperationKey, InternalJob>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  enqueue(request: EnqueueRequest): JobView {
    const existing = this.jobs.get(request.operationKey);
    if (existing) {
      return this.toView(existing);
    }
    const units: InternalUnit[] = request.units.map((u: EnqueueUnit) => ({
      unitId: unitIdFor(request.operationKey, u.unitKey),
      unitKey: u.unitKey,
      payload: u.payload,
      status: "PENDING",
      attempts: 0,
      maxAttempts: u.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    }));
    this.jobs.set(request.operationKey, { operationKey: request.operationKey, status: "QUEUED", units });
    return this.toView(this.jobs.get(request.operationKey)!);
  }

  claim(request: ClaimRequest): ClaimedUnit[] {
    const job = (job: InternalJob) =>
      job.status === "CANCELLED" || job.status === "DEAD" ? [] : job.units;
    const candidates: InternalUnit[] = [];
    for (const entry of this.jobs.values()) {
      for (const unit of job(entry)) {
        const claimable =
          unit.status === "PENDING" ||
          unit.status === "FAILED" ||
          (unit.status === "RUNNING" && this.leaseExpired(unit));
        if (claimable) {
          candidates.push(unit);
        }
      }
    }
    const limit = Math.min(request.limit ?? 1, candidates.length);
    const claimed: ClaimedUnit[] = [];
    const leasedUntil = this.now() + (request.leaseForMs ?? 30_000);
    for (const unit of candidates.slice(0, limit)) {
      const reclaimed =
        unit.status === "RUNNING" && unit.lease
          ? unit.lease.reclaimed + 1
          : unit.lease?.reclaimed ?? 0;
      unit.lease = { holderId: request.workerId, leasedUntil, reclaimed };
      unit.status = "RUNNING";
      claimed.push({
        unitId: unit.unitId,
        unitKey: unit.unitKey,
        payload: unit.payload,
        attempts: unit.attempts,
        reclaimed
      });
    }
    return claimed;
  }

  complete(workerId: WorkerId, unitId: UnitId, output: unknown): LeaseHeldResult | LeaseRefusedResult {
    const unit = this.find(unitId);
    if (!unit) return { ok: "not-leased", reason: "no-unit" };
    if (unit.status === "DEAD") return { ok: "not-leased", reason: "dead" };
    const held = this.asHeld(unit, workerId);
    if (held.ok !== "leased") return held;
    unit.status = "READY";
    unit.output = output;
    delete unit.lease;
    this.refreshJobStatus(unitId);
    return { ok: "leased", workerId, leasedUntil: held.leasedUntil, reclaimed: held.reclaimed };
  }

  fail(workerId: WorkerId, unitId: UnitId, failure: UnitFailure): LeaseHeldResult | LeaseRefusedResult {
    const unit = this.find(unitId);
    if (!unit) return { ok: "not-leased", reason: "no-unit" };
    if (unit.status === "DEAD") return { ok: "not-leased", reason: "dead" };
    const held = this.asHeld(unit, workerId);
    if (held.ok !== "leased") return held;
    unit.attempts += 1;
    unit.lastFailure = failure;
    const exhausted = unit.attempts >= unit.maxAttempts || !failure.retryable;
    unit.status = exhausted ? "DEAD" : "FAILED";
    delete unit.lease;
    this.refreshJobStatus(unitId);
    return { ok: "leased", workerId, leasedUntil: held.leasedUntil, reclaimed: held.reclaimed };
  }

  cancel(operationKey: BusinessOperationKey): { ok: boolean } {
    const job = this.jobs.get(operationKey);
    if (!job) return { ok: false };
    job.status = "CANCELLED";
    for (const unit of job.units) {
      if (unit.status === "PENDING" || unit.status === "FAILED" || unit.status === "RUNNING") {
        unit.status = "PENDING";
        delete unit.lease;
      }
    }
    return { ok: true };
  }

  job(operationKey: BusinessOperationKey): JobView | undefined {
    const job = this.jobs.get(operationKey);
    return job ? this.toView(job) : undefined;
  }

  private find(unitId: UnitId): InternalUnit | undefined {
    for (const job of this.jobs.values()) {
      for (const unit of job.units) {
        if (unit.unitId === unitId) return unit;
      }
    }
    return undefined;
  }

  private leaseExpired(unit: InternalUnit): boolean {
    if (!unit.lease) return false;
    return this.now() >= unit.lease.leasedUntil;
  }

  private asHeld(unit: InternalUnit, workerId: WorkerId): LeaseHeldResult | LeaseRefusedResult {
    if (!unit.lease) return { ok: "not-leased", reason: "no-unit" };
    if (unit.lease.holderId !== workerId) return { ok: "not-leased", reason: "other-holder" };
    if (this.leaseExpired(unit)) return { ok: "not-leased", reason: "other-holder" };
    return { ok: "leased", workerId, leasedUntil: unit.lease.leasedUntil, reclaimed: unit.lease.reclaimed };
  }

  private refreshJobStatus(unitId: UnitId): void {
    for (const job of this.jobs.values()) {
      if (!job.units.some((u) => u.unitId === unitId)) continue;
      if (job.status === "CANCELLED") return;
      const units = job.units;
      if (units.some((u) => u.status === "DEAD")) {
        job.status = "FAILED";
        return;
      }
      if (units.every((u) => u.status === "READY")) {
        job.status = "SUCCEEDED";
      }
      return;
    }
  }

  private toView(job: InternalJob): JobView {
    const units: UnitView[] = job.units.map((u) => {
      const view: UnitView = {
        unitId: u.unitId,
        unitKey: u.unitKey,
        status: u.status,
        payload: u.payload,
        attempts: u.attempts,
        maxAttempts: u.maxAttempts
      };
      if (u.output !== undefined) view.output = u.output;
      if (u.lastFailure) view.lastFailure = u.lastFailure;
      if (u.lease) view.lease = u.lease;
      return view;
    });
    return { operationKey: job.operationKey, status: job.status, units };
  }
}
/**
 * DurableExecutionContract — D019. Foundational, feature-free vocabulary that the
 * reliability backbone (F-028) and every generation feature depend on. It covers
 * ONLY: enqueue work · durable state · per-unit (per-page/per-step) state ·
 * lease/reclaim semantics · retry · cancellation · idempotency / business-operation
 * key · progress observation.
 *
 * The surface is asynchronous so database- and queue-backed implementations do
 * not leak a synchronous test-runtime assumption. This file imports nothing; it
 * is the contract, not an implementation.
 */

export const JOB_STATUS_VALUES = ["QUEUED", "SUCCEEDED", "FAILED", "CANCELLED", "DEAD"] as const;
export type JobStatus = (typeof JOB_STATUS_VALUES)[number];

export const UNIT_STATUS_VALUES = ["PENDING", "RUNNING", "READY", "FAILED", "DEAD"] as const;
export type UnitStatus = (typeof UNIT_STATUS_VALUES)[number];

export type BusinessOperationKey = string;
export type UnitKey = string;
export type UnitId = string;
export type WorkerId = string;

export interface UnitFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface UnitLease {
  holderId: WorkerId;
  leasedUntil: number;
  /** Number of times an expired lease on this unit has been reclaimed by another worker. */
  reclaimed: number;
}

export interface EnqueueUnit {
  unitKey: UnitKey;
  payload: unknown;
  /** Retry budget per unit; defaults to a shared budget when omitted. */
  maxAttempts?: number;
}

export interface EnqueueRequest {
  /** The business-operation key: idempotency across duplicate enqueue calls. */
  operationKey: BusinessOperationKey;
  units: EnqueueUnit[];
}

export interface UnitView {
  unitId: UnitId;
  unitKey: UnitKey;
  status: UnitStatus;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  output?: unknown;
  lastFailure?: UnitFailure;
  lease?: UnitLease;
}

export interface JobView {
  operationKey: BusinessOperationKey;
  status: JobStatus;
  units: UnitView[];
}

export interface ClaimedUnit {
  unitId: UnitId;
  unitKey: UnitKey;
  payload: unknown;
  /** The attempt number this claim will be (1-based; 0 means the first attempt). */
  attempts: number;
  reclaimed: number;
}

export interface ClaimRequest {
  workerId: WorkerId;
  limit?: number;
  leaseForMs?: number;
}

export interface LeaseHeldResult {
  ok: "leased";
  workerId: WorkerId;
  leasedUntil: number;
  reclaimed: number;
}

export interface LeaseRefusedResult {
  ok: "not-leased";
  reason: "no-unit" | "other-holder" | "cancelled" | "dead";
}

/**
 * The neutral runtime surface every generation step consumes and every durable
 * substrate implements. No claim of exactly-once: re-enqueue under the same
 * business-operation key is idempotent at the key level; crashes re-claim via
 * expired-lease reclaim (F-028 lease semantics).
 */
export interface DurableExecutionRuntime {
  enqueue(request: EnqueueRequest): Promise<JobView>;
  claim(request: ClaimRequest): Promise<ClaimedUnit[]>;
  complete(workerId: WorkerId, unitId: UnitId, output: unknown): Promise<LeaseHeldResult | LeaseRefusedResult>;
  fail(workerId: WorkerId, unitId: UnitId, failure: UnitFailure): Promise<LeaseHeldResult | LeaseRefusedResult>;
  cancel(operationKey: BusinessOperationKey): Promise<{ ok: boolean }>;
  job(operationKey: BusinessOperationKey): Promise<JobView | undefined>;
}

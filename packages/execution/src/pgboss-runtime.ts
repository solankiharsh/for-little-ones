/**
 * PgBossDurableRuntime — a PostgreSQL-backed implementation of the
 * DurableExecutionContract (D019) over pg-boss (D022). This is the production
 * substrate the reliability backbone (F-028) and every generation feature run on;
 * unlike InMemoryDurableRuntime it survives process restarts and coordinates
 * multiple workers.
 *
 * Division of responsibility between pg-boss and the app ledger tables:
 *  - pg-boss owns the QUEUE mechanics: one job per unit on the working queue,
 *    claimable via fetch, retried on fail, routed to the dead-letter queue when
 *    the retry budget is exhausted, requeued by the supervisor on lease expiry.
 *  - the app ledger (flo_execution_jobs + flo_execution_unit) owns the D019
 *    business view: idempotent enqueue by business-operation key, per-unit
 *    attempts/lastFailure, the lease holder/reclaim counter, non-retryable-dead
 *    marking, cancellation, and progress observation. It lives in the same
 *    Postgres as pg-boss, so it is durable and restartable.
 *
 * Mapping:
 *  - enqueue is idempotent by operation key (index row). Unit jobs are sent with
 *    singletonKey = operationKey|unitKey, so duplicate sends and interrupted
 *    enqueues are recovered by looking the existing job up by that key.
 *  - claim = fetch (pg-boss marks active + rejects duplicate holders) then record
 *    the lease holder in flo_execution_unit. The supervisor requeues an abandoned
 *    active job after expireInSeconds; the next claim bumps `reclaimed`.
 *  - retryable failures call boss.fail (pg-boss retries up to
 *    retryLimit = maxAttempts - 1, then dead-letters); non-retryable failures are
 *    marked dead in the ledger and the job is cancelled so it is never reprocessed.
 *  - complete/fail are gated on the ledger lease: holder must match and the lease
 *    must not have expired (stale-worker rejection), or the job must not have been
 *    cancelled/dead-lettered.
 *
 *  - lease expiry (D019 semantics: NOT a failed attempt; the ledger keeps
 *    attempts at explicit failures only) surfaces from pg-boss as a supervisor
 *    timeout: the expired job is re-inserted as a retry with `output =
 *    { value: { message: "job timed out" } }` and counts against pg-boss's own
 *    retry budget. The app view therefore reads `attempts`/`lastFailure` from
 *    the ledger so contract consumers see explicit failures only; repeated
 *    lease-expiry can still dead-letter a job at the substrate level (documented
 *    divergence from InMemoryDurableRuntime).
 *
 * This file depends on `pg-boss` and `pg`; the contract in ./contract.ts stays
 * substrate-free.
 */
import pg from "pg";
import { PgBoss, type JobWithMetadata, type SendOptions } from "pg-boss";
import type {
  BusinessOperationKey,
  ClaimRequest,
  ClaimedUnit,
  DurableExecutionRuntime,
  EnqueueRequest,
  JobStatus,
  JobView,
  LeaseHeldResult,
  LeaseRefusedResult,
  UnitFailure,
  UnitId,
  UnitKey,
  UnitView,
  WorkerId
} from "./contract";

export const EXECUTION_QUEUE = "flo-execution";
export const EXECUTION_DEAD_LETTER_QUEUE = "flo-execution-bad";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_EXPIRE_SECONDS = 900;
const DEFAULT_SUPERVISE_SECONDS = 60;
const DEFAULT_MONITOR_SECONDS = 60;
const DEFAULT_MAINTENANCE_SECONDS = 120;
const DEFAULT_RETRY_DELAY_SECONDS = 1;
const SINGLETON_SECONDS = 3600;
const JOBS_TABLE = "flo_execution_jobs";
const UNIT_TABLE = "flo_execution_unit";

export interface PgBossRuntimeOptions {
  connectionString: string;
  /** Working queue name. Defaults to `flo-execution`. */
  queue?: string;
  /** Dead-letter queue name. Defaults to `flo-execution-bad`. */
  deadLetterQueue?: string;
  /** Injectable clock for deterministic lease-expiry tests. Defaults to Date.now. */
  now?: () => number;
  /** Lease length before the supervisor reclaims a held unit, seconds. Default 900. */
  expireInSeconds?: number;
  superviseIntervalSeconds?: number;
  monitorIntervalSeconds?: number;
  maintenanceIntervalSeconds?: number;
  /** Retry delay for retryable failures, seconds. Default 1. */
  retryDelaySeconds?: number;
}

interface UnitJobData {
  __flo: {
    operationKey: BusinessOperationKey;
    unitKey: UnitKey;
    unitId: UnitId;
    maxAttempts: number;
  };
  payload: unknown;
}

interface UnitRow {
  operationKey: BusinessOperationKey;
  unitKey: UnitKey;
  unitId: UnitId;
  jobId: string;
  maxAttempts: number;
  attempts: number;
  dead: boolean;
  lastFailure?: UnitFailure;
  holderId?: string;
  leasedUntil?: number;
  reclaimed: number;
}

const unitIdFor = (operationKey: BusinessOperationKey, unitKey: string): UnitId =>
  `${operationKey}|${unitKey}`;

/**
 * A durable implementation of DurableExecutionRuntime backed by PostgreSQL +
 * pg-boss. Create, call `init()`, then use the contract surface. `close()`
 * releases the pg-boss instance and the app-side pool.
 */
export class PgBossDurableRuntime implements DurableExecutionRuntime {
  private readonly options: Required<
    Pick<PgBossRuntimeOptions, "queue" | "deadLetterQueue" | "expireInSeconds" | "superviseIntervalSeconds" | "monitorIntervalSeconds" | "maintenanceIntervalSeconds" | "retryDelaySeconds">
  > & { connectionString: string; now: () => number };

  private boss: PgBoss | undefined;
  private pool: pg.Pool | undefined;

  constructor(options: PgBossRuntimeOptions) {
    this.options = {
      connectionString: options.connectionString,
      queue: options.queue ?? EXECUTION_QUEUE,
      deadLetterQueue: options.deadLetterQueue ?? EXECUTION_DEAD_LETTER_QUEUE,
      now: options.now ?? (() => Date.now()),
      expireInSeconds: options.expireInSeconds ?? DEFAULT_EXPIRE_SECONDS,
      superviseIntervalSeconds: options.superviseIntervalSeconds ?? DEFAULT_SUPERVISE_SECONDS,
      monitorIntervalSeconds: options.monitorIntervalSeconds ?? DEFAULT_MONITOR_SECONDS,
      maintenanceIntervalSeconds: options.maintenanceIntervalSeconds ?? DEFAULT_MAINTENANCE_SECONDS,
      retryDelaySeconds: options.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS
    };
  }

  get workerQueue(): string {
    return this.options.queue;
  }

  async init(): Promise<this> {
    if (this.boss) return this;
    const boss = new PgBoss({
      connectionString: this.options.connectionString,
      superviseIntervalSeconds: this.options.superviseIntervalSeconds,
      monitorIntervalSeconds: this.options.monitorIntervalSeconds,
      maintenanceIntervalSeconds: this.options.maintenanceIntervalSeconds
    });
    boss.on("error", () => {});
    this.pool = new pg.Pool({ connectionString: this.options.connectionString });
    this.boss = boss;
    await boss.start();
    await boss.createQueue(this.options.deadLetterQueue, { retentionSeconds: 3600 });
    await boss.createQueue(this.options.queue, {
      expireInSeconds: this.options.expireInSeconds,
      retentionSeconds: 3600,
      deadLetter: this.options.deadLetterQueue
    });
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${JOBS_TABLE} (
         operation_key text PRIMARY KEY,
         cancelled boolean NOT NULL DEFAULT false
       )`
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${UNIT_TABLE} (
         unit_id text PRIMARY KEY,
         operation_key text NOT NULL,
         unit_key text NOT NULL,
         job_id text NOT NULL,
         max_attempts int NOT NULL,
         unit_order int NOT NULL DEFAULT 0,
         attempts int NOT NULL DEFAULT 0,
         dead boolean NOT NULL DEFAULT false,
         last_failure jsonb,
         holder_id text,
         leased_until bigint,
         reclaimed int NOT NULL DEFAULT 0
       )`
    );
    return this;
  }

  async close(): Promise<void> {
    const boss = this.boss;
    this.boss = undefined;
    if (boss) await boss.stop({ close: true }).catch(() => {});
    const pool = this.pool;
    this.pool = undefined;
    if (pool) await pool.end().catch(() => {});
  }

  async enqueue(request: EnqueueRequest): Promise<JobView> {
    const existing = await this.indexRow(request.operationKey);
    if (existing) return this.toJobView(existing);

    let i = 0;
    for (const unit of request.units) {
      await this.ensureUnitJob(request.operationKey, unit, i);
      i += 1;
    }

    await this.poolInstance.query(
      `INSERT INTO ${JOBS_TABLE} (operation_key, cancelled) VALUES ($1, false) ON CONFLICT (operation_key) DO NOTHING`,
      [request.operationKey]
    );
    i = 0;
    for (const unit of request.units) {
      await this.insertUnitRow(request.operationKey, unit, undefined, i);
      i += 1;
    }

    const row = await this.indexRow(request.operationKey);
    if (!row) {
      // A concurrent enqueue won the row and is still mid-insert; the jobs we
      // sent (or recovered) are real, so surface the operation from them.
      return { operationKey: request.operationKey, status: "QUEUED", units: [] };
    }
    return this.toJobView(row);
  }

  async claim(request: ClaimRequest): Promise<ClaimedUnit[]> {
    const now = this.now();
    const leaseForMs = request.leaseForMs ?? DEFAULT_LEASE_MS;
    const batch = await this.bossInstance.fetch<UnitJobData>(this.options.queue, {
      batchSize: Math.max(1, request.limit ?? 1),
      includeMetadata: true
    });
    const claimed: ClaimedUnit[] = [];
    for (const job of batch) {
      const flo = job.data.__flo;
      const unitRow = flo?.unitId ? await this.unitById(flo.unitId) : undefined;
      if (!flo || !unitRow || unitRow.dead) {
        await this.bossInstance.cancel(this.options.queue, job.id).catch(() => {});
        continue;
      }
      const reclaimed = unitRow.holderId ? unitRow.reclaimed + 1 : unitRow.reclaimed;
      await this.poolInstance.query(
        `UPDATE ${UNIT_TABLE} SET holder_id = $1, leased_until = $2, reclaimed = $3 WHERE unit_id = $4`,
        [request.workerId, now + leaseForMs, reclaimed, flo.unitId]
      );
      claimed.push({
        unitId: flo.unitId,
        unitKey: flo.unitKey,
        payload: job.data.payload,
        attempts: unitRow.attempts,
        reclaimed
      });
    }
    return claimed;
  }

  async complete(workerId: WorkerId, unitId: UnitId, output: unknown): Promise<LeaseHeldResult | LeaseRefusedResult> {
    const held = await this.gatedHeld(workerId, unitId);
    if (held.ok !== "leased") return held;
    try {
      await this.bossInstance.complete(this.options.queue, held.jobId, this.toPgBossOutput(output));
    } catch {
      return { ok: "not-leased", reason: "other-holder" };
    }
    await this.clearHeld(unitId);
    return { ok: "leased", workerId, leasedUntil: held.leasedUntil, reclaimed: held.reclaimed };
  }

  async fail(workerId: WorkerId, unitId: UnitId, failure: UnitFailure): Promise<LeaseHeldResult | LeaseRefusedResult> {
    const held = await this.gatedHeld(workerId, unitId);
    if (held.ok !== "leased") return held;
    const nextAttempts = held.attempts + 1;
    if (failure.retryable) {
      await this.poolInstance.query(
        `UPDATE ${UNIT_TABLE} SET attempts = $1, last_failure = $2::jsonb WHERE unit_id = $3`,
        [nextAttempts, JSON.stringify(failure), unitId]
      );
      try {
        await this.bossInstance.fail(this.options.queue, held.jobId, held.job.data);
      } catch {
        return { ok: "not-leased", reason: "other-holder" };
      }
      return { ok: "leased", workerId, leasedUntil: held.leasedUntil, reclaimed: held.reclaimed };
    }
    await this.poolInstance.query(
      `UPDATE ${UNIT_TABLE} SET attempts = $1, last_failure = $2::jsonb, dead = true WHERE unit_id = $3`,
      [nextAttempts, JSON.stringify(failure), unitId]
    );
    await this.bossInstance.cancel(this.options.queue, held.jobId).catch(() => {});
    return { ok: "leased", workerId, leasedUntil: held.leasedUntil, reclaimed: held.reclaimed };
  }

  async cancel(operationKey: BusinessOperationKey): Promise<{ ok: boolean }> {
    const row = await this.indexRow(operationKey);
    if (!row) return { ok: false };
    await this.poolInstance.query(`UPDATE ${JOBS_TABLE} SET cancelled = true WHERE operation_key = $1`, [
      operationKey
    ]);
    const units = await this.unitRows(operationKey);
    for (const meta of units) {
      await this.bossInstance.cancel(this.options.queue, meta.jobId).catch(() => {});
      await this.poolInstance.query(
        `UPDATE ${UNIT_TABLE} SET holder_id = NULL, leased_until = NULL WHERE unit_id = $1`,
        [meta.unitId]
      );
    }
    return { ok: true };
  }

  async job(operationKey: BusinessOperationKey): Promise<JobView | undefined> {
    const row = await this.indexRow(operationKey);
    return row ? this.toJobView(row) : undefined;
  }

  private async toJobView(row: { operationKey: BusinessOperationKey; cancelled: boolean }): Promise<JobView> {
    const unitRows = await this.unitRows(row.operationKey);
    const units: UnitView[] = [];
    for (const meta of unitRows) {
      units.push(await this.toUnitView(meta));
    }
    let status: JobStatus;
    if (row.cancelled) {
      status = "CANCELLED";
    } else if (units.some((u) => u.status === "DEAD")) {
      status = "FAILED";
    } else if (units.length > 0 && units.every((u) => u.status === "READY")) {
      status = "SUCCEEDED";
    } else {
      status = "QUEUED";
    }
    return { operationKey: row.operationKey, status, units };
  }

  private async toUnitView(row: UnitRow): Promise<UnitView> {
    const view: UnitView = {
      unitId: row.unitId,
      unitKey: row.unitKey,
      status: "PENDING",
      payload: undefined,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts
    };
    if (row.lastFailure) view.lastFailure = this.toFailure(row.lastFailure);

    const job = await this.bossInstance.findJobs<UnitJobData>(this.options.queue, { id: row.jobId });
    const current = job[0];
    if (current) {
      view.payload = current.data.payload;
      if (row.dead) {
        view.status = "DEAD";
        return view;
      }
      switch (current.state) {
        case "created":
          view.status = "PENDING";
          break;
        case "retry":
          view.status = "FAILED";
          break;
        case "active":
          view.status = "RUNNING";
          if (row.holderId && row.leasedUntil !== undefined) {
            view.lease = { holderId: row.holderId, leasedUntil: row.leasedUntil, reclaimed: row.reclaimed };
          }
          break;
        case "completed":
          view.status = "READY";
          view.output = this.fromPgBossOutput(current.output);
          break;
        case "cancelled":
          view.status = row.dead ? "DEAD" : "PENDING";
          break;
        case "failed":
          view.status = "DEAD";
          break;
        default:
          view.status = "PENDING";
      }
      return view;
    }

    // The working-queue job is gone: exhausted retries route to the dead-letter
    // queue under the original job's id.
    const deadLettered = await this.bossInstance.findJobs<UnitJobData>(this.options.deadLetterQueue, { queued: true });
    const dlq = deadLettered.find((j) => j.sourceId === row.jobId);
    if (dlq) {
      view.status = "DEAD";
      view.payload = dlq.data.payload;
      view.attempts = row.attempts > 0 ? row.attempts : Number(dlq.sourceRetryCount ?? 0) + 1;
      return view;
    }
    view.status = row.dead ? "DEAD" : "PENDING";
    return view;
  }

  private async gatedHeld(
    workerId: WorkerId,
    unitId: UnitId
  ): Promise<(LeaseHeldResult & { jobId: string; job: JobWithMetadata<UnitJobData>; attempts: number }) | LeaseRefusedResult> {
    const unit = await this.unitById(unitId);
    if (!unit) return { ok: "not-leased", reason: "no-unit" };
    if (unit.dead) return { ok: "not-leased", reason: "dead" };
    const op = await this.indexRow(unit.operationKey);
    if (op?.cancelled) return { ok: "not-leased", reason: "cancelled" };
    const job = await this.bossInstance.findJobs<UnitJobData>(this.options.queue, { id: unit.jobId });
    const current = job[0];
    if (!current) return { ok: "not-leased", reason: "no-unit" };
    if (!unit.holderId || unit.leasedUntil === undefined) return { ok: "not-leased", reason: "no-unit" };
    if (unit.holderId !== workerId) return { ok: "not-leased", reason: "other-holder" };
    if (this.now() >= unit.leasedUntil) return { ok: "not-leased", reason: "other-holder" };
    return {
      ok: "leased",
      workerId,
      leasedUntil: unit.leasedUntil,
      reclaimed: unit.reclaimed,
      attempts: unit.attempts,
      jobId: unit.jobId,
      job: current
    };
  }

  private async clearHeld(unitId: UnitId): Promise<void> {
    await this.poolInstance.query(`UPDATE ${UNIT_TABLE} SET holder_id = NULL, leased_until = NULL WHERE unit_id = $1`, [
      unitId
    ]);
  }

  private async ensureUnitJob(operationKey: BusinessOperationKey, unit: { unitKey: string; payload: unknown; maxAttempts?: number }, orderIndex: number): Promise<void> {
    const maxAttempts = unit.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const unitId = unitIdFor(operationKey, unit.unitKey);
    const singletonKey = `${operationKey}|${unit.unitKey}`;
    const data: UnitJobData = {
      __flo: { operationKey, unitKey: unit.unitKey, unitId, maxAttempts },
      payload: unit.payload
    };
    const sendOptions: SendOptions = {
      singletonKey,
      singletonSeconds: SINGLETON_SECONDS,
      retryLimit: Math.max(0, maxAttempts - 1),
      retryDelay: this.options.retryDelaySeconds,
      retryBackoff: true,
      deadLetter: this.options.deadLetterQueue
    };
    const sent = await this.bossInstance.send(this.options.queue, data, sendOptions);
    if (!sent) {
      // A unit job for this singletonKey already exists (duplicate send, or a
      // previous enqueue interrupted before writing the ledger rows): recover it.
      const existing = await this.bossInstance.findJobs<UnitJobData>(this.options.queue, { key: singletonKey });
      const recovered = existing[0];
      if (recovered) {
        await this.insertUnitRow(operationKey, unit, recovered.id, orderIndex);
        return;
      }
    }
    if (sent) {
      await this.insertUnitRow(operationKey, unit, sent, orderIndex);
    }
  }

  private async insertUnitRow(
    operationKey: BusinessOperationKey,
    unit: { unitKey: string; payload: unknown; maxAttempts?: number },
    jobId?: string,
    orderIndex = 0
  ): Promise<void> {
    const maxAttempts = unit.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const unitId = unitIdFor(operationKey, unit.unitKey);
    await this.poolInstance.query(
      `INSERT INTO ${UNIT_TABLE} (unit_id, operation_key, unit_key, job_id, max_attempts, unit_order, attempts, dead, reclaimed)
       VALUES ($1, $2, $3, $4, $5, $6, 0, false, 0)
       ON CONFLICT (unit_id) DO NOTHING`,
      [unitId, operationKey, unit.unitKey, jobId ?? "", maxAttempts, orderIndex]
    );
  }

  private async unitById(unitId: UnitId): Promise<UnitRow | undefined> {
    const res = await this.poolInstance.query(
      `SELECT unit_id, operation_key, unit_key, job_id, max_attempts, attempts, dead, last_failure, holder_id, leased_until, reclaimed
       FROM ${UNIT_TABLE} WHERE unit_id = $1`,
      [unitId]
    );
    return res.rows[0] ? this.parseUnitRow(res.rows[0]) : undefined;
  }

  private async unitRows(operationKey: BusinessOperationKey): Promise<UnitRow[]> {
    const res = await this.poolInstance.query(
      `SELECT unit_id, operation_key, unit_key, job_id, max_attempts, attempts, dead, last_failure, holder_id, leased_until, reclaimed
       FROM ${UNIT_TABLE} WHERE operation_key = $1 ORDER BY unit_order, unit_id`,
      [operationKey]
    );
    return res.rows.map((row) => this.parseUnitRow(row));
  }

  private parseUnitRow(row: pg.QueryResultRow): UnitRow {
    const parsed: UnitRow = {
      operationKey: String(row.operation_key),
      unitKey: String(row.unit_key),
      unitId: String(row.unit_id),
      jobId: String(row.job_id),
      maxAttempts: Number(row.max_attempts),
      attempts: Number(row.attempts),
      dead: Boolean(row.dead),
      reclaimed: Number(row.reclaimed)
    };
    if (row.last_failure) parsed.lastFailure = this.toFailure(row.last_failure);
    if (row.holder_id) parsed.holderId = String(row.holder_id);
    if (row.leased_until !== null && row.leased_until !== undefined) parsed.leasedUntil = Number(row.leased_until);
    return parsed;
  }

  private toFailure(raw: unknown): UnitFailure {
    if (raw && typeof raw === "object") {
      const f = raw as Record<string, unknown>;
      return {
        code: String(f.code),
        message: String(f.message),
        retryable: Boolean(f.retryable)
      };
    }
    return { code: "UNKNOWN", message: String(raw), retryable: false };
  }

  private async indexRow(operationKey: BusinessOperationKey): Promise<{ operationKey: BusinessOperationKey; cancelled: boolean } | undefined> {
    const res = await this.poolInstance.query(
      `SELECT operation_key, cancelled FROM ${JOBS_TABLE} WHERE operation_key = $1`,
      [operationKey]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return { operationKey: String(row.operation_key), cancelled: Boolean(row.cancelled) };
  }

  private toPgBossOutput(raw: unknown): object {
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as object;
    }
    return { __flo_value: raw };
  }

  private fromPgBossOutput(output: object): unknown {
    const keys = Object.keys(output);
    if (keys.length === 1 && keys[0] === "__flo_value") {
      return (output as Record<string, unknown>)["__flo_value"];
    }
    return output;
  }

  private get bossInstance(): PgBoss {
    if (!this.boss) throw new Error("PgBossDurableRuntime not initialised: call init() first");
    return this.boss;
  }

  private get poolInstance(): pg.Pool {
    if (!this.pool) throw new Error("PgBossDurableRuntime not initialised: call init() first");
    return this.pool;
  }

  private now(): number {
    return this.options.now();
  }
}
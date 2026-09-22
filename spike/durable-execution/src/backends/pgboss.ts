/**
 * PostgreSQL-backed candidate: pg-boss 12.33.3 (MIT, actively maintained).
 *
 * Verified maintenance/status 2026-09-21: latest 12.33.3 published that day;
 * repo pushed same day; ~4000 stars; MIT. (Verified runner-up: graphile-worker
 * 0.18.0, MIT, actively maintained.)
 *
 * Service model: Postgres ONLY. The durable queue lives inside the same Postgres
 * as the app state (no outbox required — enqueue can join the app transaction via
 * the send({ db }) / pg-boss ORM adapters). Lease/reclaim, retry/backoff,
 * dead-lettering, monitoring and inspection are SQL + LISTEN/NOTIFY.
 */
import { PgBoss, type JobWithMetadata, type SendOptions } from "pg-boss";
import { spawnNodeWorker, type BookInspection, type CancelResult, type QueueSnapshot, type SpikeBackend, type UnitInspection, type WorkerHandle } from "../backend";
import { pageIdempotencyKey, pageOperationKey, type BookFixture, type PageJobPayload } from "../fixture";
import { handlePage, handleStory, type WorkerContext } from "../handler";

const QUEUE = "generation";
const DLQ = "generation-bad";

/** Single orchestration queue; `type` discriminates the unit kind. */
type GenerationJob = { type: "story"; bookId: string } | (PageJobPayload & { type: "page" });

export const PGBOSS_QUEUE_OPTIONS = {
  expireInSeconds: 6,
  retryLimit: 2,
  retryDelay: 1,
  retryBackoff: true,
  retentionSeconds: 3600,
  deleteAfterSeconds: 3600
} as const;

export const PGBOSS_SUPERVISE_OPTIONS = {
  superviseIntervalSeconds: 2,
  monitorIntervalSeconds: 2,
  maintenanceIntervalSeconds: 120
} as const;

export interface PgBossEnv {
  pgUrl: string;
  workerEntry: string;
  markerFile: string;
}

export class PgBossBackend implements SpikeBackend {
  readonly kind = "pgboss" as const;
  readonly displayName = "pg-boss 12.33.3 (PostgreSQL-backed)";
  readonly services = ["PostgreSQL"];
  readonly configNote =
    `queue '${QUEUE}' + dead-letter '${DLQ}'; createQueue(${JSON.stringify(PGBOSS_QUEUE_OPTIONS)}); ` +
    `PgBoss constructor ${JSON.stringify(PGBOSS_SUPERVISE_OPTIONS)} ` +
    `(production defaults differ: superviseIntervalSeconds=60, monitorIntervalSeconds=60, ` +
    `expireInSeconds=900 (15 min))`;
  readonly deadLetterDoc =
    `pg-boss dead-letter QUEUE: exhausted retries route the job to the '${DLQ}' queue ` +
    `(sourceId/sourceName/sourceRetryCount preserved); inspect via findJobs('${DLQ}'); job states ` +
    `created/retry/active/completed/cancelled/failed; queue stats via getQueue/QueueResult; web dashboard ` +
    `ships in @pg-boss/dashboard; a job row is Postgres, so 'review-required' is just a query over the job table.`;

  private boss: PgBoss | undefined;
  private jobIdsByOperationKey = new Map<string, string>();

  constructor(private readonly env: PgBossEnv) {}

  async setup(): Promise<void> {
    const boss = new PgBoss({ connectionString: this.env.pgUrl, ...PGBOSS_SUPERVISE_OPTIONS });
    boss.on("error", () => {});
    await boss.start();
    await boss.createQueue(DLQ, { retentionSeconds: 3600 });
    await boss.createQueue(QUEUE, { ...PGBOSS_QUEUE_OPTIONS, deadLetter: DLQ });
    this.boss = boss;
  }

  async teardown(): Promise<void> {
    if (this.boss) {
      await this.boss.stop({ close: true });
      this.boss = undefined;
    }
  }

  private get bossInstance(): PgBoss {
    if (!this.boss) throw new Error("PgBossBackend not set up");
    return this.boss;
  }

  async enqueueStory(book: BookFixture): Promise<void> {
    const id = await this.bossInstance.send(QUEUE, { type: "story", bookId: book.bookId }, this.sendOptions(book.storyOperationKey));
    if (id) this.jobIdsByOperationKey.set(book.storyOperationKey, id);
  }

  async enqueuePages(book: BookFixture, opts: { failPage?: number; crashPage?: number } = {}): Promise<void> {
    for (const page of book.pages) {
      await this.enqueueUnit(this.payloadFor(book, page.pageNumber, page.behavior, opts));
    }
  }

  async enqueueUnit(payload: PageJobPayload): Promise<void> {
    const id = await this.bossInstance.send(QUEUE, { type: "page", ...payload }, this.sendOptions(payload.operationKey));
    if (id) this.jobIdsByOperationKey.set(payload.operationKey, id);
  }

  private sendOptions(operationKey: string): SendOptions {
    return { singletonKey: operationKey, singletonSeconds: 3600, deadLetter: DLQ };
  }

  private payloadFor(book: BookFixture, pageNumber: number, behavior: "ok" | "always-fail", opts: { failPage?: number; crashPage?: number }): PageJobPayload {
    const payload: PageJobPayload = {
      bookId: book.bookId,
      pageNumber,
      behavior: opts.failPage === pageNumber ? "always-fail" : behavior,
      operationKey: pageOperationKey(book.bookId, pageNumber),
      providerIdempotencyKey: pageIdempotencyKey(book.bookId, pageNumber)
    };
    if (opts.crashPage === pageNumber) payload.crashPoint = "after-provider-accept";
    return payload;
  }

  spawnWorker(workerId: string): Promise<WorkerHandle> {
    return Promise.resolve(
      spawnNodeWorker(this.env.workerEntry, {
        SPIKE_BACKEND: "pgboss",
        SPIKE_WORKER_ID: workerId,
        SPIKE_PG_URL: this.env.pgUrl,
        SPIKE_MARKER_FILE: this.env.markerFile
      })
    );
  }

  async inspectBook(book: BookFixture): Promise<BookInspection> {
    const boss = this.bossInstance;
    const units: UnitInspection[] = [];
    for (const page of book.pages) {
      const jobId = this.jobIdsByOperationKey.get(pageOperationKey(book.bookId, page.pageNumber));
      let inspection: UnitInspection = {
        pageNumber: page.pageNumber,
        status: "PENDING",
        substrateState: "no-job-record",
        attempts: 0
      };
      if (jobId) {
        const jobs = await boss.findJobs(QUEUE, { id: jobId });
        const job = jobs[0] as JobWithMetadata<PageJobPayload> | undefined;
        if (job) {
          inspection = this.toInspection(job);
        } else {
          // Dead-lettered jobs leave the working queue; surface them as DEAD.
          const dlqJobs = await boss.findJobs(DLQ, { queued: true });
          const dlq = dlqJobs.find((j) => j.sourceId === jobId);
          if (dlq) inspection = this.toInspection(dlq as JobWithMetadata<PageJobPayload>);
        }
      }
      units.push(inspection);
    }
    return { bookId: book.bookId, units };
  }

  private toInspection(job: JobWithMetadata<PageJobPayload>): UnitInspection {
    const deadLettered = job.sourceId !== null;
    const statusMap: Record<string, UnitInspection["status"]> = {
      created: deadLettered ? "DEAD" : "PENDING",
      retry: "PENDING",
      active: "RUNNING",
      completed: "READY",
      cancelled: "REMOVED",
      failed: "DEAD"
    };
    const attempts = deadLettered
      ? Number(job.sourceRetryCount ?? 0) + 1
      : job.retryCount + (job.state === "active" || job.state === "completed" || job.state === "failed" ? 1 : 0);
    const inspection: UnitInspection = {
      pageNumber: Number(job.data.pageNumber),
      status: statusMap[job.state] ?? "PENDING",
      substrateState: deadLettered ? `dead-lettered (${job.state})` : job.state,
      attempts
    };
    if (job.output && "artifactUrl" in job.output) inspection.output = job.output;
    return inspection;
  }

  async cancelBook(book: BookFixture): Promise<CancelResult> {
    const boss = this.bossInstance;
    const ids: string[] = [];
    for (const p of book.pages) {
      const id = this.jobIdsByOperationKey.get(pageOperationKey(book.bookId, p.pageNumber));
      if (id) ids.push(id);
    }
    const detail: Record<string, string> = {};
    for (const id of ids) {
      await boss.cancel(QUEUE, id);
      const [job] = await boss.findJobs(QUEUE, { id });
      detail[id] = job ? String(job.state) : "cancelled";
    }
    return { unitsCancelled: ids.length, substrateDetail: detail };
  }

  /** DLQ inspection for the research log. */
  async queueSnapshot(bookId?: string): Promise<QueueSnapshot> {
    const all = await this.bossInstance.findJobs(DLQ, { queued: true });
    const jobs =
      bookId === undefined
        ? all
        : all.filter((j) => (j.data as { bookId?: string } | undefined)?.bookId === bookId);
    return {
      label: `dead-letter queue '${DLQ}' (pg-boss routes exhausted retries here via send({ deadLetter }))`,
      jobs: jobs.map((j) => {
        const pn = (j.data as PageJobPayload | undefined)?.pageNumber;
        const entry: { pageNumber?: number; state: string; attempts: number; sourceId: string | null } = {
          state: j.state,
          attempts: Number(j.sourceRetryCount ?? j.retryCount),
          sourceId: j.sourceId
        };
        if (typeof pn === "number") entry.pageNumber = pn;
        return entry;
      })
    };
  }
}

/**
 * The pg-boss worker loop (runs inside the spawned subprocess). Pull model:
 * fetch (= claim/lease) → handle → complete/fail. Maps to D019 claim/complete/fail.
 * An abandoned active job is reclaimed by the supervisor after its expireInSeconds.
 */
export async function runPgBossWorker(ctx: WorkerContext, pgUrl: string): Promise<void> {
  const boss = new PgBoss({ connectionString: pgUrl, ...PGBOSS_SUPERVISE_OPTIONS });
  boss.on("error", () => {});
  await boss.start();
  await boss.createQueue(DLQ, { retentionSeconds: 3600 });
  await boss.createQueue(QUEUE, { ...PGBOSS_QUEUE_OPTIONS, deadLetter: DLQ });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (;;) {
    const jobs = await boss.fetch<PageJobPayload>(QUEUE, { batchSize: 1, includeMetadata: true });
    if (jobs.length === 0) {
      await sleep(300);
      continue;
    }
    const job = jobs[0] as JobWithMetadata<GenerationJob>;
    try {
      const data = job.data;
      const output = (
        data.type === "story" ? await handleStory(ctx, data) : await handlePage(ctx, data)
      ) as object;
      await boss.complete(QUEUE, job.id, output);
    } catch (err) {
      await boss.fail(QUEUE, job.id, { message: err instanceof Error ? err.message : String(err) });
    }
  }
}
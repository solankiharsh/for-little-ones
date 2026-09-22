/**
 * Redis-backed candidate: BullMQ 6.3.8 (taskforcesh, MIT, actively maintained)
 * on top of ioredis 6.0.0 (required peer for BullMQ v6). Verified latest
 * 2026-09-21; bullmq on npm updated 2026-09-18.
 *
 * Service model: separate Redis for the durable queue (in addition to the app
 * Postgres). Enqueuing is not transactional with the app DB — an app that needs
 * "every DB change recorded as a job" must maintain an outbox (or accept gaps)
 * to bridge the two stores. BullMQ v6 also ships an experimental Postgres backend
 * (IQueueBackend) but this candidate is measured on the Redis protocol it is
 * known for.
 *
 * Everything else (leases/locks, delayed retries, stalled recovery, inspection)
 * is implemented over Redis Lua scripts + sorted sets.
 */
import { Queue, Worker, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { spawnNodeWorker, type BookInspection, type CancelResult, type QueueSnapshot, type SpikeBackend, type UnitInspection, type WorkerHandle } from "../backend";
import { pageIdempotencyKey, pageOperationKey, type BookFixture, type PageJobPayload } from "../fixture";
import { handlePage, handleStory, type WorkerContext } from "../handler";

const QUEUE = "generation";

/** BullMQ job IDs may not contain ':' — keep a stable slug of the operation key. */
function bullJobId(operationKey: string): string {
  return operationKey.replace(/[^A-Za-z0-9_-]/g, "-");
}

export const BULLMQ_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 3600 } as const,
  removeOnFail: { age: 3600 } as const
};

export const BULLMQ_WORKER_OPTIONS = {
  concurrency: 1,
  lockDuration: 10_000,
  stalledInterval: 5_000,
  maxStalledCount: 3
} as const;

export interface BullMqEnv {
  redisUrl: string;
  pgUrl: string;
  workerEntry: string;
  markerFile: string;
}

export class BullMqBackend implements SpikeBackend {
  readonly kind = "bullmq" as const;
  readonly displayName = "BullMQ 6.3.8 + ioredis (Redis-backed)";
  readonly services = ["PostgreSQL", "Redis"];
  readonly configNote =
    `Job options: add(name, data, { jobId: operationKey, ${JSON.stringify(BULLMQ_JOB_OPTIONS).slice(0, 120)}… }); ` +
    `Worker: ${JSON.stringify(BULLMQ_WORKER_OPTIONS)} ` +
    `(production defaults differ: lockDuration=30000, stalledInterval=30000, maxStalledCount=1)`;
  readonly deadLetterDoc =
    `BullMQ has NO built-in dead-letter queue: exhausted jobs (or discarded active jobs) are left in the ` +
    `'failed' set (job state inspectable) and a drainer/recover job or manual ops step is required; ` +
    `'review-required' needs a job over the failed set + the app ledger. Queue/consumer inspection is Redis-native ` +
    `(queue.getJob / getJobs, stalled recovery via lock expiry + stalled checker). No Postgres job row for free.`;

  private queue: Queue<PageJobPayload | { bookId: string }> | undefined;
  private worker: Worker<PageJobPayload | { bookId: string }> | undefined;

  constructor(private readonly env: BullMqEnv) {}

  private connection(): ConnectionOptions {
    const url = new URL(this.env.redisUrl);
    return { host: url.hostname, port: Number(url.port || 6379) };
  }

  async setup(): Promise<void> {
    const queue = new Queue<PageJobPayload | { bookId: string }>(QUEUE, { connection: this.connection() });
    await queue.waitUntilReady();
    this.queue = queue;
  }

  async teardown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = undefined;
    }
  }

  private get queueInstance(): Queue<PageJobPayload | { bookId: string }> {
    if (!this.queue) throw new Error("BullMqBackend not set up");
    return this.queue;
  }

  async enqueueStory(book: BookFixture): Promise<void> {
    await this.queueInstance.add(
      "story",
      { bookId: book.bookId },
      { ...BULLMQ_JOB_OPTIONS, jobId: bullJobId(book.storyOperationKey) }
    );
  }

  async enqueuePages(book: BookFixture, opts: { failPage?: number; crashPage?: number } = {}): Promise<void> {
    for (const page of book.pages) {
      await this.enqueueUnit(this.payloadFor(book, page.pageNumber, page.behavior, opts));
    }
  }

  async enqueueUnit(payload: PageJobPayload): Promise<void> {
    await this.queueInstance.add("page", payload, { ...BULLMQ_JOB_OPTIONS, jobId: bullJobId(payload.operationKey) });
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
    const redis = new URL(this.env.redisUrl);
    return Promise.resolve(
      spawnNodeWorker(this.env.workerEntry, {
        SPIKE_BACKEND: "bullmq",
        SPIKE_WORKER_ID: workerId,
        SPIKE_REDIS_URL: this.env.redisUrl,
        SPIKE_REDIS_HOST: redis.hostname,
        SPIKE_REDIS_PORT: String(redis.port || 6379),
        SPIKE_PG_URL: this.env.pgUrl,
        SPIKE_MARKER_FILE: this.env.markerFile
      })
    );
  }

  async inspectBook(book: BookFixture): Promise<BookInspection> {
    const units: UnitInspection[] = [];
    for (const page of book.pages) {
      const key = pageOperationKey(book.bookId, page.pageNumber);
      const job = await this.queueInstance.getJob(bullJobId(key));
      // BullMQ's cancel (job.remove()) deletes the job key entirely, so a unit
      // that was enqueued and later cancelled has no job record to inspect.
      let inspection: UnitInspection = {
        pageNumber: page.pageNumber,
        status: "REMOVED",
        substrateState: "no-job-record (never enqueued, or removed by cancel)",
        attempts: 0
      };
      if (job) inspection = await this.toInspection(job as Job<PageJobPayload>);
      units.push(inspection);
    }
    return { bookId: book.bookId, units };
  }

  private async toInspection(job: Job<PageJobPayload>): Promise<UnitInspection> {
    const state = await job.getState();
    const statusMap: Record<string, UnitInspection["status"]> = {
      waiting: "PENDING",
      delayed: "PENDING",
      waitingChildren: "PENDING",
      active: "RUNNING",
      completed: "READY",
      failed: "DEAD",
      removed: "REMOVED",
      unknown: "REMOVED"
    };
    const inspection: UnitInspection = {
      pageNumber: Number(job.data.pageNumber),
      status: statusMap[state] ?? "PENDING",
      substrateState: state,
      attempts: job.attemptsMade
    };
    if (job.returnvalue && "artifactUrl" in (job.returnvalue as object)) inspection.output = job.returnvalue;
    return inspection;
  }

  async cancelBook(book: BookFixture): Promise<CancelResult> {
    let cancelled = 0;
    const detail: Record<string, string> = {};
    for (const p of book.pages) {
      const key = pageOperationKey(book.bookId, p.pageNumber);
      const job = await this.queueInstance.getJob(bullJobId(key));
      if (!job) {
        detail[key] = "no-job-record";
        continue;
      }
      const state = await job.getState();
      try {
        await job.remove();
        cancelled += 1;
        detail[key] = `removed (previous state: ${state})`;
      } catch (err) {
        detail[key] = `remove-failed (previous state: ${state}): ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return { unitsCancelled: cancelled, substrateDetail: detail };
  }

  /** Failed-set inspection for the research log (BullMQ's answer to the DLQ). */
  async queueSnapshot(bookId?: string): Promise<QueueSnapshot> {
    const all = await this.queueInstance.getJobs(["failed"]);
    const jobs =
      bookId === undefined
        ? all
        : all.filter((j) => (j.data as { bookId?: string } | undefined)?.bookId === bookId);
    return {
      label: "failed set (BullMQ has no built-in dead-letter queue; exhausted jobs live here instead)",
      jobs: jobs.map((j) => {
        const pn = (j.data as PageJobPayload | undefined)?.pageNumber;
        const entry: { pageNumber?: number; state: string; attempts: number } = {
          state: "failed",
          attempts: j.attemptsMade
        };
        if (typeof pn === "number") entry.pageNumber = pn;
        return entry;
      })
    };
  }
}

/**
 * The BullMQ worker loop (runs inside the spawned subprocess). BullMQ owns the
 * claim/lease (lock), stalled recovery and retry/backoff automatically; the
 * processor throws to fail an attempt. Maps to D019 claim/complete/fail.
 */
export async function runBullMqWorker(ctx: WorkerContext, redisUrl: string): Promise<void> {
  const url = new URL(redisUrl);
  const connection = { host: url.hostname, port: Number(url.port || 6379) };
  const worker: Worker<PageJobPayload | { bookId: string }> = new Worker(
    QUEUE,
    async (job) => {
      if (job.name === "story") {
        const out = await handleStory(ctx, job.data as { bookId: string });
        return out;
      }
      const out = await handlePage(ctx, job.data as PageJobPayload);
      return out;
    },
    {
      connection,
      ...BULLMQ_WORKER_OPTIONS
    }
  );
  worker.on("error", () => {});
  await worker.waitUntilReady();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (;;) await sleep(60_000);
}
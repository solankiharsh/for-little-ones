/**
 * Substrate-neutral surface the scenario harness drives. Each candidate backend
 * (pg-boss, BullMQ) implements this over its own substrate while sharing the exact
 * same fixture, handler, markers and assertions.
 *
 * D019 mapping (documented in README + RESEARCH_LOG): enqueue → enqueueStory/
 * enqueuePages; durable state → job records; per-unit state → inspectBook units;
 * lease/reclaim → worker fetch/lock + lease expiry; retry → retryLimit/attempts +
 * backoff; cancellation → cancelBook; idempotency key → operationKey/idempotency
 * handling; progress observation → inspectBook + markers.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { BookFixture, PageJobPayload } from "./fixture";

export type BackendKind = "pgboss" | "bullmq";

export interface WorkerHandle {
  pid: number;
  kill(signal?: NodeJS.Signals): void;
  /** Resolves when the subprocess has exited. */
  exited(): Promise<number | null>;
}

export interface UnitInspection {
  pageNumber: number;
  /** Normalized D019 unit status. */
  status: "PENDING" | "RUNNING" | "READY" | "DEAD" | "REMOVED";
  /** The substrate's raw state name (pg-boss state / BullMQ job state). */
  substrateState: string;
  attempts: number;
  output?: unknown;
}

export interface BookInspection {
  bookId: string;
  units: UnitInspection[];
}

export interface CancelResult {
  unitsCancelled: number;
  substrateDetail: Record<string, string>;
}

/** Terminal/error evidence the substrate exposes (dead-letter vs failed set). */
export interface QueueSnapshot {
  label: string;
  jobs: Array<{
    pageNumber?: number;
    state: string;
    attempts: number;
    sourceId?: string | null;
  }>;
}

export interface SpikeBackend {
  readonly kind: BackendKind;
  readonly displayName: string;
  /** Additional services this candidate needs beyond the app DB. */
  readonly services: string[];
  readonly configNote: string;

  setup(): Promise<void>;
  teardown(): Promise<void>;

  /** Story unit for the book (idempotent by storyOperationKey). */
  enqueueStory(book: BookFixture): Promise<void>;
  /** The 8 page units (idempotent by per-page operationKey). */
  enqueuePages(book: BookFixture, opts?: { failPage?: number; crashPage?: number }): Promise<void>;
  enqueueUnit(payload: PageJobPayload): Promise<void>;

  spawnWorker(workerId: string): Promise<WorkerHandle>;

  inspectBook(book: BookFixture): Promise<BookInspection>;
  /** Cancels every unit of the book; returns per-jobId substrate detail. */
  cancelBook(book: BookFixture): Promise<CancelResult>;

  /** Terminal/error snapshot: dead-letter vs failed set, scoped to one book (or all if omitted). */
  queueSnapshot(bookId?: string): Promise<QueueSnapshot>;

  /** Statement of how terminal/dead-lettered work surfaces (for the log). */
  readonly deadLetterDoc: string;
}

export function spawnNodeWorker(workerEntry: string, env: Record<string, string>): WorkerHandle {
  // The spike uses tsx to run the TS worker entrypoint in a real subprocess so a
  // "crash" is an actual process SIGKILL, not a simulated callback.
  const child: ChildProcess = spawn(
    process.execPath,
    ["--import", "tsx", workerEntry],
    { env: { ...process.env, ...env }, stdio: "ignore" }
  );
  let exitCode: number | null = null;
  child.on("exit", (code) => {
    exitCode = code;
  });
  return {
    pid: child.pid as number,
    kill(signal) {
      child.kill(signal ?? "SIGKILL");
    },
    exited() {
      return new Promise((resolve) => {
        if (exitCode !== null) {
          resolve(exitCode);
          return;
        }
        child.once("exit", (code) => resolve(code));
      });
    }
  };
}
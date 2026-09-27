import {
  AnonymousSessionService,
  ConceptBundleRunner,
  createPool,
  createPostgresStores,
  NoopEventSink,
  OwnershipError,
  ResourceNotFoundError,
  UnauthenticatedError,
  ValidationError,
  type PostgresStores
} from "@for-little-ones/api";
import { randomUUID } from "node:crypto";
import { FactService } from "@for-little-ones/api";
import { PgBossDurableRuntime } from "@for-little-ones/execution";
import type { ClaimedUnit, LeaseHeldResult, LeaseRefusedResult } from "@for-little-ones/execution";
import type { ModerationProvider, StoryProvider } from "@for-little-ones/providers";

export interface ConceptWorkerOptions {
  connectionString: string;
  workerId: string;
  storyProvider: Pick<StoryProvider, "generateConcepts" | "card">;
  moderation: ModerationProvider;
  now?: () => string;
  /** Fast-lease settings belong to specs; production keeps the runtime defaults. */
  leaseForMs?: number;
  pollIntervalMs?: number;
  /** Bound the loop so a spec can drive it deterministically. */
  maxIterations?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The production claim loop (D024 §6).
 *
 * Same shape as the crash-recovery helper that proved the substrate, promoted to the
 * real runner: claim one unit, hand it to `ConceptBundleRunner`, settle it with
 * complete/fail. The runner owns retry classification — including the non-retryable
 * exhaustive failure that lands the unit in the dead-letter state — so this loop
 * never has to decide what is worth retrying.
 *
 * `runOnce` is exported separately so a spec (or a future scheduler tick) can drive one
 * iteration without owning a timer.
 */
export async function runOnce(
  deps: { runtime: PgBossDurableRuntime; runner: ConceptBundleRunner; workerId: string; leaseForMs: number },
  stop: { signal?: AbortSignal } = {}
): Promise<Array<LeaseHeldResult | LeaseRefusedResult>> {
  if (stop.signal?.aborted) return [];
  const claimed: ClaimedUnit[] = await deps.runtime.claim({
    workerId: deps.workerId,
    limit: 1,
    leaseForMs: deps.leaseForMs
  });
  const outcomes: Array<LeaseHeldResult | LeaseRefusedResult> = [];
  for (const unit of claimed) {
    try {
      outcomes.push(await deps.runner.runClaimed(deps.workerId, unit));
    } catch (err) {
      // Same guard as the proven worker-entry helper, and it is load-bearing: without
      // it any throw that escapes `runClaimed` (a failed ownership re-check, a store
      // outage) would kill the loop AND leave the unit leased until expiry, stalling
      // the queue. Failing the unit keeps the loop alive and lets maxAttempts decide.
      const definitive = isDefinitive(err);
      outcomes.push(
        await deps.runtime.fail(deps.workerId, unit.unitId, {
          code: definitive ? "WORKER_REJECTED" : "WORKER_UNEXPECTED",
          message: err instanceof Error ? err.message : String(err),
          retryable: !definitive
        })
      );
    }
  }
  return outcomes;
}

export interface ConceptWorkerHandle {
  /** Resolves when the loop stops (abort, or `maxIterations` reached). */
  done: Promise<void>;
  stop(): void;
}

/** Wires the Postgres stores, the durable runtime and the runner, then loops. */
export async function startConceptWorker(options: ConceptWorkerOptions): Promise<ConceptWorkerHandle> {
  const now = options.now ?? (() => new Date().toISOString());
  const workerId = options.workerId;
  const leaseForMs = options.leaseForMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 300;

  const stores: PostgresStores = createPostgresStores(createPool(options.connectionString));
  await stores.init();
  const sessions = new AnonymousSessionService({
    store: stores.sessions,
    now,
    newId: (prefix) => `${prefix}-${crypto.randomUUID()}`
  });
  const runtime = await new PgBossDurableRuntime({ connectionString: options.connectionString }).init();
  const runner = new ConceptBundleRunner({
    runtime,
    store: stores.creation,
    storyProvider: options.storyProvider,
    moderation: options.moderation,
    // The worker observes the durable ledger, not the analytics rail: a generation
    // failure is already durable, and a second copy in analytics is not worth the cost.
    events: new NoopEventSink(),
    // The parent's confirmed facts are the whole point of a personalised concept, so the
    // worker reads the same scoped fact set the API does. Returning `[]` here would make
    // the worker silently produce generic concepts that ignore the child.
    getFactsForStory: (input) => facts.getFactsForStory(input),
    // The durable step re-checks ownership itself (F-001 §8): a unit whose project is
    // gone must fail, not generate against a book the session no longer owns.
    assertProjectAccess: (anonymousProjectId, projectId) => sessions.assertCanAccessProject(anonymousProjectId, projectId),
    now
  });

  const facts = new FactService({ store: stores.creation, sessions: stores.sessions, events: new NoopEventSink(), now, newId: (p) => `${p}-${randomUUID()}` });

  const controller = new AbortController();
  const handle: ConceptWorkerHandle = {
    done: (async () => {
      try {
        for (let iteration = 0; options.maxIterations === undefined || iteration < options.maxIterations; iteration += 1) {
          const outcomes = await runOnce({ runtime, runner, workerId, leaseForMs }, { signal: controller.signal });
          if (outcomes.length === 0) {
            if (options.maxIterations !== undefined) return;
            await sleep(pollIntervalMs);
          }
        }
      } finally {
        await runtime.close();
        await stores.close();
      }
    })(),
    stop: () => controller.abort()
  };
  return handle;
}

/**
 * Whether a throw that escaped `runClaimed` is a definitive verdict rather than a
 * fault. The runner already converts known business states into non-retryable
 * `UnitFailure`s, so what reaches here escaped its own handling: a typed domain error
 * means the preconditions can never hold (the session is gone, the project is not this
 * anonymous project's, the request is invalid), and retrying only burns the attempt
 * budget before dead-lettering. Everything else is treated as a transient fault, which
 * is the safe default: an unknown bug then degrades into retries and a dead letter
 * rather than a silent drop.
 */
function isDefinitive(err: unknown): boolean {
  return (
    err instanceof UnauthenticatedError ||
    err instanceof OwnershipError ||
    err instanceof ValidationError ||
    err instanceof ResourceNotFoundError
  );
}

import {
  AnonymousSessionService,
  StoryRunner,
  createPool,
  createPostgresStores,
  NoopEventSink,
  type PostgresStores
} from "@for-little-ones/api";
import { randomUUID } from "node:crypto";
import { FactService } from "@for-little-ones/api";
import { PgBossDurableRuntime } from "@for-little-ones/execution";
import type { ModerationProvider, StoryProvider } from "@for-little-ones/providers";
import { runOnce } from "./claim-loop";

export interface StoryWorkerOptions {
  connectionString: string;
  workerId: string;
  storyProvider: Pick<StoryProvider, "generateOutline" | "generatePageText" | "card">;
  moderation: ModerationProvider;
  now?: () => string;
  /** Fast-lease settings belong to specs; production keeps the runtime defaults. */
  leaseForMs?: number;
  pollIntervalMs?: number;
  /** Bound the loop so a spec can drive it deterministically. */
  maxIterations?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface StoryWorkerHandle {
  /** Resolves when the loop stops (abort, or `maxIterations` reached). */
  done: Promise<void>;
  stop(): void;
}

/**
 * The production story claim loop (F-008 §9, D029). Same shared loop as concepts:
 * claim one unit (OUTLINE or PAGE_TEXT), hand it to `StoryRunner`, settle it.
 * The runner owns fan-out (outline success enqueues the page units) and retry
 * classification, so this loop is intentionally thin.
 */
export async function startStoryWorker(options: StoryWorkerOptions): Promise<StoryWorkerHandle> {
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
  const runtime = await new PgBossDurableRuntime({
    connectionString: options.connectionString,
    queue: "flo-story",
    deadLetterQueue: "flo-story-bad"
  }).init();
  const facts = new FactService({ store: stores.creation, sessions: stores.sessions, events: new NoopEventSink(), now, newId: (p) => `${p}-${randomUUID()}` });
  const runner = new StoryRunner({
    runtime,
    store: stores.creation,
    storyProvider: options.storyProvider,
    moderation: options.moderation,
    events: new NoopEventSink(),
    getFactsForStory: (input) => facts.getFactsForStory(input),
    assertProjectAccess: (anonymousProjectId, projectId) => sessions.assertCanAccessProject(anonymousProjectId, projectId),
    now
  });

  const controller = new AbortController();
  const handle: StoryWorkerHandle = {
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

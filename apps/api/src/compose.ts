import { randomUUID } from "node:crypto";
import { PgBossDurableRuntime, type PgBossRuntimeOptions } from "@for-little-ones/execution";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { FactService } from "./fact/fact-service";
import { BookService } from "./creation/book-service";
import { ConceptBundleRunner } from "./creation/concept-bundle-runner";
import { ChildProfileService } from "./profile/child-profile-service";
import { AnonymousSessionService } from "./session/session-service";
import { NoopEventSink, type EventSink } from "./analytics/event-sink";
import { createInternalEventFlusher } from "./http/event-flusher";
import { closePostgresStores, postgresStores } from "./persistence/postgres-stores";
import { createApiApp, type ApiDeps } from "./http/app";

/**
 * The composition root: the one place that turns a connection string into a wired
 * `ApiDeps`. Everything below is a seam with a fake (in-memory store, in-memory runtime,
 * scripted provider) and every spec builds its own graph; production would otherwise have
 * no single definition of how those seams fit together, and drift between the two would
 * only surface at runtime.
 *
 * `apps/worker` deliberately does NOT use this: the worker claims the same durable units
 * but must not bind an HTTP port, so it composes `PgBossDurableRuntime` itself.
 */

/** D024 §2: child data must not reach a provider whose policy cannot account for it. */
export interface ComposeProviders {
  story: Pick<StoryProvider, "generateConcepts" | "card">;
  moderation: ModerationProvider;
}

export interface ComposeOptions {
  connectionString?: string;
  providers: ComposeProviders;
  /**
   * Buffer analytics and POST them to `/_internal/events` on a timer. Off by default:
   * the batcher authenticates with the caller's own session cookie, so it is only
   * meaningful inside a request's lifetime, not for process-wide background events.
   */
  analytics?: { baseUrl: string; cookie: string; flushMs?: number };
  now?: () => string;
  runtime?: PgBossRuntimeOptions;
}

export interface ComposedApi {
  deps: ApiDeps;
  app: ReturnType<typeof createApiApp>;
  runtime: PgBossDurableRuntime;
  /** Order matters: stop accepting work, then release the pool. */
  close(): Promise<void>;
}

export function productionProviderCard(): ProviderCard {
  throw new Error(
    "No provider card configured. Pass `providers` explicitly: a ProviderCard is a verified " +
      "data-policy claim and must not be defaulted in code (D024 §2, packages/providers)."
  );
}

export async function composeApi(options: ComposeOptions): Promise<ComposedApi> {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

  // One memoized pool for the whole process, so the stores and the durable runtime
  // cannot drift into separate connection pools.
  const stores = postgresStores(options.connectionString);
  await stores.init();

  const sessions = new AnonymousSessionService({ store: stores.sessions, now, newId });
  const assertProjectAccess = (anonymousProjectId: string, projectId: string) =>
    sessions.assertCanAccessProject(anonymousProjectId, projectId);

  const events: EventSink = options.analytics
    ? createInternalEventFlusher({ fetch: globalThis.fetch, ...options.analytics })
    : new NoopEventSink();

  const runtime = await new PgBossDurableRuntime({
    connectionString: options.connectionString ?? process.env.DATABASE_URL ?? "",
    ...options.runtime
  }).init();

  // The services take the session *store*, not the session service: they re-check scope
  // themselves. One `facts` instance is shared, including with the runner below, so a
  // story never reads a different fact set than the screen that displayed it.
  const facts = new FactService({ store: stores.creation, sessions: stores.sessions, events, now, newId });

  const deps: ApiDeps = {
    sessions,
    sessionStore: stores.sessions,
    creationStore: stores.creation,
    profiles: new ChildProfileService({ store: stores.creation, sessions: stores.sessions, now, newId }),
    facts,
    books: new BookService({
      store: stores.creation,
      assertProjectAccess,
      now,
      newId,
      events,
      moderation: options.providers.moderation,
      storyProvider: options.providers.story
    }),
    runner: new ConceptBundleRunner({
      runtime,
      store: stores.creation,
      storyProvider: options.providers.story,
      moderation: options.providers.moderation,
      events,
      getFactsForStory: (input) => facts.getFactsForStory(input),
      assertProjectAccess,
      now
    }),
    events,
    now,
    // `Secure` off only for the plain-http Vite dev proxy; production is https.
    secureCookies: process.env.NODE_ENV === "production"
  };

  return {
    deps,
    app: createApiApp(deps),
    runtime,
    close: async () => {
      await runtime.close();
      await closePostgresStores();
    }
  };
}

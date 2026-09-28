export const appId = "@for-little-ones/api";
export const appName = "For Little One — API (command/query boundary)";
/** Placeholder until the app shell is built; the skeleton commits the direction only. */
export const version = "0.0.0";
export { createStoryPreviewHandler, withGenerationMetadata } from "./story-preview";
export type { StoryPreviewAuthorization, StoryPreviewGenerator } from "./story-preview";

export { generateBrowserToken, hashBrowserToken } from "./session/token";
export { AnonymousSessionService } from "./session/session-service";
export type { SessionStore, SessionServiceDeps } from "./session/session-service";
export { NoopEventSink, MemoryEventSink, TimedEventSink } from "./analytics/event-sink";
export type { EventSink, AnalyticsEvent } from "./analytics/event-sink";
export { createApiApp } from "./http/app";
export type { ApiDeps } from "./http/app";
export { createInternalEventFlusher } from "./http/event-flusher";
export { classifyError, errorBody } from "./http/errors";
export type { ErrorBody } from "./http/errors";
export { SESSION_COOKIE, sessionCookieOptions, shouldRenew } from "./http/session-cookie";
export {
  ConflictError,
  ModerationBlockedError,
  OwnershipError,
  ResourceNotFoundError,
  UnauthenticatedError,
  ValidationError
} from "./errors";
export { EVENT_ALLOW_LIST, F027_FUNNEL_EVENT_NAMES, SLICE_2_EVENT_NAMES, isAllowListedEvent } from "./analytics/event-names";
export { ChildProfileService } from "./profile/child-profile-service";
export type { ChildProfileServiceDeps, CreateProfileInput } from "./profile/child-profile-service";
export { FactService } from "./fact/fact-service";
export type { FactServiceDeps } from "./fact/fact-service";
export { InMemorySessionStore } from "./session/in-memory-session-store";
export { createPostgresStores, closePostgresStores, createPool, applySchema, postgresStores, MIGRATIONS, migrate } from "./persistence/postgres-stores";
export type { PostgresStores, Migration, MigrateOptions, MigrateResult } from "./persistence/postgres-stores";
export { InMemoryCreationStore } from "./creation/creation-store";
export type { CreationStore, SaveConceptInput } from "./creation/creation-store";
export { buildConceptRequest, normaliseLocale } from "./creation/concept-request";
export type { ConceptRequestInput } from "./creation/concept-request";
export { BookService, REGENERATE_BUDGET_DEFAULT } from "./creation/book-service";
export type { BookServiceDeps } from "./creation/book-service";
export {
  ConceptBundleRunner,
  CONCEPT_BUNDLE_OP,
  CONCEPT_BUNDLE_UNIT
} from "./creation/concept-bundle-runner";
export type {
  ConceptBundleUnitPayload,
  ConceptBundleResult,
  ConceptBundleDeps
} from "./creation/concept-bundle-runner";

export { composeApi, productionProviderCard } from "./compose";
export type { ComposedApi, ComposeOptions, ComposeProviders } from "./compose";

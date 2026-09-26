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
export { InMemoryCreationStore } from "./creation/creation-store";
export type { CreationStore, SaveConceptInput } from "./creation/creation-store";
export { buildConceptRequest, normaliseLocale } from "./creation/concept-request";
export type { ConceptRequestInput } from "./creation/concept-request";
export { BookService } from "./creation/book-service";
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

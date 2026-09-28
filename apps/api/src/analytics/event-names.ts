/**
 * The analytics allow-list (F-027 §8, adopted by D024 §9).
 *
 * `/api/_internal/events` rejects anything not in this set, so the list is the
 * contract: an event name that is not here cannot reach the collector even if a caller
 * posts it. Two groups, deliberately separate:
 *
 *  - `SLICE_2_EVENT_NAMES` — the canonical F-007 §13 / D024 §9 product events this
 *    codebase actually emits. `app.spec.ts` asserts every name any service pushes is a
 *    member, so the emitters and this list cannot drift apart.
 *  - `F027_FUNNEL_EVENT_NAMES` — the client-visible funnel names F-027 §8 reserves for
 *    later features (page regeneration, approval, checkout). They are allowed now so
 *    the collector's shape is stable, and are emitted by nothing in this slice.
 */
export const SLICE_2_EVENT_NAMES = [
  // D024 §9 also adopts the F-001/F-002/F-006 event names alongside the F-007 §13 set.
  "session_started",
  "book_created",
  "theme_selected",
  "fact_added",
  "fact_confirmed",
  "fact_rejected",
  "fact_removed",
  "story_concepts_generated",
  "story_concept_selected",
  "story_concepts_regenerated",
  "concept_edit_applied",
  "concepts_served_from_fallback",
  "concept_generation_failed",
  "concept_generation_contract_violation",
  "concept_generation_cost"
] as const;

export const F027_FUNNEL_EVENT_NAMES = [
  "story_concept_selected",
  "generation_failed",
  "page_regenerated",
  "character_fix_applied",
  "book_approved",
  "checkout_started",
  "checkout_completed",
  "fulfilment_failed"
] as const;

export const EVENT_ALLOW_LIST: ReadonlySet<string> = new Set<string>([
  ...SLICE_2_EVENT_NAMES,
  ...F027_FUNNEL_EVENT_NAMES
]);

export function isAllowListedEvent(name: string): boolean {
  return EVENT_ALLOW_LIST.has(name);
}

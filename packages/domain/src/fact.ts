/**
 * Fact — F-006 personalisation, canonical vocabulary (guide §3). A typed,
 * locale-bound fact about a child. Meaning lives in the type + value, never in a
 * loose prose string the model could re-read (spec §11 "football" lesson).
 *
 * Hard rules baked into this module:
 *  - `parentConfirmed` facts are the ONLY generation-eligible inputs.
 *  - `suggested` facts are proposals; they never reach StoryProvider.
 *  - `rejected` facts are an explicit no and are not re-asked (provenance hygiene).
 */
export const FACT_TYPES = [
  "interest",
  "favouriteAnimal",
  "favouriteColour",
  "favouriteToy",
  "favouriteFood",
  "pet",
  "hobby",
  "person",
  "sport",
  "customFact"
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_LOCALES = ["en-GB", "en-US"] as const;
export type FactLocale = (typeof FACT_LOCALES)[number];

/** How the fact entered the profile. Only `parentTyped`/`parentPicked` may be confirmed. */
export const FACT_SOURCES = ["parentTyped", "parentPicked", "aiSuggested"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const FACT_STATES = ["parentConfirmed", "suggested", "rejected"] as const;
export type FactState = (typeof FACT_STATES)[number];

export type FactValue =
  | { kind: "enum"; optionId: string }
  | { kind: "sport"; gameId: string; team?: string }
  | { kind: "person"; relationshipId: string }
  | { kind: "pet"; relationshipId: string }
  | { kind: "custom"; subject: string; claim: string };

export interface FactConfirmation {
  sessionOwnerId: string;
  recordedAt: string;
}

/** A typed fact attached to a ChildProfile (F-006 §7 domain sketch). */
export interface Fact {
  id: string;
  childProfileId: string;
  type: FactType;
  value: FactValue;
  locale: FactLocale;
  source: FactSource;
  state: FactState;
  createdAt: string;
  /** Present once the parent has confirmed the fact. */
  confirmedBy?: FactConfirmation;
  /** Audit trail: which story consumed this fact and how. */
  storyUsage: Array<{ storyId: string; usedAs: string }>;
}

export function isGenerationEligibleFact(fact: Fact): boolean {
  return fact.state === "parentConfirmed";
}

/** The only fact query path a generation feature may use (F-006 §8 `GetFactsForStory`). */
export function generationEligibleFacts(facts: readonly Fact[]): Fact[] {
  return facts.filter(isGenerationEligibleFact);
}

/**
 * Resolves a fact's value to a short label for UI and for the provider context.
 * Enum optionIds resolve through the locale-aware catalogue; custom facts render
 * their claim ("called Mr Bear"); person/pet facts render the relationship name.
 */
export function factDisplayValue(
  fact: Fact,
  resolve: {
    optionLabel?: (optionId: string, locale: FactLocale) => string | undefined;
    relationshipName?: (relationshipId: string) => string | undefined;
  }
): string {
  switch (fact.value.kind) {
    case "enum":
      return resolve.optionLabel?.(fact.value.optionId, fact.locale) ?? fact.value.optionId;
    case "sport":
      return fact.value.team ? `${fact.value.gameId} · ${fact.value.team}` : fact.value.gameId;
    case "person":
    case "pet":
      return resolve.relationshipName?.(fact.value.relationshipId) ?? fact.value.relationshipId;
    case "custom":
      return fact.value.claim;
  }
}
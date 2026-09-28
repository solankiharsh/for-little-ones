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
import { factOptionLabel, isCataloguedFactType, isSportGameId } from "./fact-options";


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
  /** F-006: `AddFact` idempotency key — a retried add returns this fact. */
  factToken?: string;
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
export const CUSTOM_FACT_MAX_CHARS = 200;
export const CUSTOM_FACTS_PER_PROFILE = 3;
export const FACT_TEAM_MAX_CHARS = 120;

/**
 * F-006 §8 `AddFact` validation: the value shape must be allowed for its type,
 * and enums/sports/relationships must resolve against the real catalogue. Returns
 * every issue (never throws) so the transport can answer 400 with the full list.
 *
 * `resolve.relationshipIds` is the caller's known relationship vocabulary; when
 * omitted, person/pet references are unchecked (nothing to check against).
 */
export function validateFactValue(
  input: { type: FactType; value: FactValue },
  resolve: { relationshipIds?: readonly string[] } = {}
): string[] {
  const issues: string[] = [];
  const expected = VALUE_KIND_BY_TYPE[input.type];
  if (!expected) {
    issues.push(`unknown fact type: ${input.type}`);
    return issues;
  }
  if (input.value.kind !== expected) {
    issues.push(`type ${input.type} does not accept a value of kind ${input.value.kind}`);
    return issues;
  }

  if (input.value.kind === "enum") {
    if (isCataloguedFactType(input.type) && !factOptionLabel(input.value.optionId, "en-GB") && !factOptionLabel(input.value.optionId, "en-US")) {
      issues.push(`value.optionId is not a catalogue option for ${input.type}`);
    }
    return issues;
  }
  if (input.value.kind === "sport") {
    if (!isSportGameId(input.value.gameId)) issues.push("value.gameId is not a known sport");
    if (input.value.team !== undefined && input.value.team.length > FACT_TEAM_MAX_CHARS) {
      issues.push(`value.team exceeds ${FACT_TEAM_MAX_CHARS} characters`);
    }
    return issues;
  }
  if (input.value.kind === "person" || input.value.kind === "pet") {
    const known = resolve.relationshipIds;
    if (known && !known.includes(input.value.relationshipId)) {
      issues.push("value.relationshipId does not reference a known relationship");
    }
    return issues;
  }
  if (input.value.claim.length > CUSTOM_FACT_MAX_CHARS) {
    issues.push(`value.claim exceeds ${CUSTOM_FACT_MAX_CHARS} characters`);
  }
  if (input.value.subject.trim().length === 0) issues.push("value.subject is required");
  return issues;
}

/** F-006 §8: at most three custom facts per profile. `existing` counts them already stored. */
export function checkCustomFactQuota(existing: number): string[] {
  return existing >= CUSTOM_FACTS_PER_PROFILE
    ? [`profile already has ${existing} custom facts (limit ${CUSTOM_FACTS_PER_PROFILE})`]
    : [];
}

/** The one value shape each fact type accepts — the spec's type-allowed shapes rule. */
const VALUE_KIND_BY_TYPE: Record<FactType, FactValue["kind"]> = {
  interest: "enum",
  favouriteAnimal: "enum",
  favouriteColour: "enum",
  favouriteToy: "enum",
  favouriteFood: "enum",
  hobby: "enum",
  sport: "sport",
  person: "person",
  pet: "pet",
  customFact: "custom"
};

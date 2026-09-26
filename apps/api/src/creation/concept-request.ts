import {
  isGenerationEligibleFact,
  isLocale,
  isReadingLevel,
  isStoryMood,
  type Fact,
  type FactLocale
} from "@for-little-ones/domain";
import type { ConceptRequest, ThemeSeedSchema } from "@for-little-ones/contracts";
import { z } from "zod";

export interface ConceptRequestInput {
  displayName: string;
  locale: string;
  facts: Fact[];
  themeId: string;
  themeSeedVersion: string;
  themeSeed: z.infer<typeof ThemeSeedSchema>;
  pronouns?: string;
  readingLevel?: string;
  mood?: string;
}

/**
 * F-007 §7 ConceptRequest builder. The generation-eligible guard lives HERE, not
 * just in the query: any non-parent-confirmed fact is a hard error, so a suggested
 * or rejected fact can never reach a provider even if a caller slips it in.
 * Legacy locales (`"en"` from the demo fixtures) normalise to the fact-catalogue
 * idiom; structured facts travel as type + value + locale (F-006 §7 rule 1).
 */
export function buildConceptRequest(input: ConceptRequestInput): ConceptRequest {
  const locale = isLocale(input.locale) ? input.locale : "en-GB";
  const request: ConceptRequest = {
    schemaVersion: "1",
    themeId: input.themeId,
    themeSeedVersion: input.themeSeedVersion,
    themeSeed: input.themeSeed,
    locale,
    displayName: input.displayName,
    facts: input.facts.map((fact) => describeFact(fact))
  };
  if (input.pronouns !== undefined) request.pronouns = input.pronouns;
  if (input.readingLevel !== undefined) {
    if (!isReadingLevel(input.readingLevel)) {
      throw new Error(`unknown readingLevel "${input.readingLevel}" — must be 0-3|4-6|7-9`);
    }
    request.readingLevel = input.readingLevel;
  }
  if (input.mood !== undefined) {
    if (!isStoryMood(input.mood)) {
      throw new Error(`unknown mood "${input.mood}"`);
    }
    request.mood = input.mood;
  }
  return request;
}

/**
 * F-006 §10: each structured fact carries the locale it was captured under, NOT
 * the current book/request locale — an association-football captured as en-GB is
 * never relabelled "soccer" for an en-US request but sent with "football", and
 * the provider/adapter decides presentation per its own locale rules.
 */
function describeFact(fact: Fact): ConceptRequest["facts"][number] {
  if (!isGenerationEligibleFact(fact)) {
    throw new Error(`fact ${fact.id} is ${fact.state}, not parentConfirmed — only confirmed facts reach generation`);
  }
  return { type: fact.type, value: factValue(fact), locale: fact.locale };
}

/** Canonical typed value — the optionId/gameId/relationshipId/claim, never display prose. */
function factValue(fact: Fact): string {
  switch (fact.value.kind) {
    case "enum":
      return fact.value.optionId;
    case "sport":
      return fact.value.team ? `${fact.value.gameId}·${fact.value.team}` : fact.value.gameId;
    case "person":
    case "pet":
      return fact.value.relationshipId;
    case "custom":
      return fact.value.claim;
  }
}

export function normaliseLocale(locale: string): FactLocale {
  return isLocale(locale) ? locale : "en-GB";
}
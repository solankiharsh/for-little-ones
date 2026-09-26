/**
 * Story Concept — F-007 canonical vocabulary (guide §3). A pre-generation pitch the
 * parent picks from (never a blank prompt). The Book keeps exactly one selected
 * concept; F-008 consumes `selectedConceptId` as its narrative contract.
 */

import type { Locale } from "./fact-options";

export const EMOTIONAL_GOALS = [
  "confidence",
  "bravery",
  "kindness",
  "friendship",
  "belonging",
  "bedtime_calm",
  "fun",
  "curiosity"
] as const;
export type EmotionalGoal = (typeof EMOTIONAL_GOALS)[number];

export function isEmotionalGoal(value: string): value is EmotionalGoal {
  return (EMOTIONAL_GOALS as readonly string[]).includes(value);
}

export const READING_LEVELS = ["0-3", "4-6", "7-9"] as const;
export type ReadingLevelBand = (typeof READING_LEVELS)[number];

export function isReadingLevel(value: string): value is ReadingLevelBand {
  return (READING_LEVELS as readonly string[]).includes(value);
}

export const STORY_MOODS = [
  "adventure",
  "bedtime",
  "funny",
  "confidence",
  "starting-school",
  "new-sibling",
  "kindness",
  "birthday"
] as const;
export type StoryMood = (typeof STORY_MOODS)[number];

export function isStoryMood(value: string): value is StoryMood {
  return (STORY_MOODS as readonly string[]).includes(value);
}

export const CONCEPT_SOURCES = ["model", "fallback", "edited"] as const;
export type ConceptSource = (typeof CONCEPT_SOURCES)[number];

export const CONCEPT_STATUSES = ["PROPOSED", "SELECTED", "DISCARDED"] as const;
export type ConceptStatus = (typeof CONCEPT_STATUSES)[number];

export const CONCEPT_TITLE_MAX = 60;
export const CONCEPT_PITCH_MAX = 240;
export const CONCEPT_LENGTH_MIN_PAGES = 4;
export const CONCEPT_LENGTH_MAX_PAGES = 12;
export const CONCEPTS_PER_BUNDLE = 3;

export interface StoryConcept {
  id: string;
  bookId: string;
  /** Bundle version; idempotency key for the generation unit is `bookId:conceptVersion`. */
  conceptVersion: number;
  /** `Theme.conceptSeed` version captured at generation time (themeSeedVersion). */
  themeSeedVersion: string;
  title: string;
  pitch: string;
  emotionalGoal: EmotionalGoal;
  themeId: string;
  readingLevel: ReadingLevelBand;
  approximateLengthPages: number;
  /** Subset of the Book's relationship names (e.g. "ava", "bruno"). */
  charactersUsed: string[];
  locale: Locale;
  source: ConceptSource;
  status: ConceptStatus;
  createdAt: string;
}

/**
 * Wrong-child-count guard at the concept level (F-007 §11): characters must exist
 * in the Book. Case-insensitive by contract — vendor output is free to normalise
 * casing (spec §7 examples show lowercase "ava"), Book bibles store the display
 * name ("Ava").
 */
export function invalidCharacterNames(
  concept: Pick<StoryConcept, "charactersUsed">,
  allowedNames: ReadonlySet<string>
): string[] {
  const allowed = new Set([...allowedNames].map((name) => name.toLowerCase()));
  return concept.charactersUsed.filter((name) => !allowed.has(name.toLowerCase()));
}

/** Duplicate-concept guard: titles in a bundle must be distinct (F-007 §4). */
export function duplicateTitles(concepts: readonly Pick<StoryConcept, "title">[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { title } of concepts) {
    if (seen.has(title)) duplicates.add(title);
    seen.add(title);
  }
  return [...duplicates];
}

export function isValidConceptLength(pages: number): boolean {
  return Number.isInteger(pages) && pages >= CONCEPT_LENGTH_MIN_PAGES && pages <= CONCEPT_LENGTH_MAX_PAGES;
}

/** Derived age band used for story complexity (F-003: age derived at read time, never frozen). */
export function readingLevelForAgeYears(ageYears: number): ReadingLevelBand {
  if (ageYears < 4) return "0-3";
  if (ageYears <= 6) return "4-6";
  return "7-9";
}
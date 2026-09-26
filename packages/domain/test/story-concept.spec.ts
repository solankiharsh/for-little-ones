import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONCEPTS_PER_BUNDLE,
  CONCEPT_LENGTH_MAX_PAGES,
  CONCEPT_LENGTH_MIN_PAGES,
  CONCEPT_PITCH_MAX,
  CONCEPT_SOURCES,
  CONCEPT_STATUSES,
  CONCEPT_TITLE_MAX,
  EMOTIONAL_GOALS,
  READING_LEVELS,
  STORY_MOODS,
  duplicateTitles,
  invalidCharacterNames,
  isEmotionalGoal,
  isReadingLevel,
  isStoryMood,
  isValidConceptLength,
  readingLevelForAgeYears,
  type ConceptSource,
  type ConceptStatus,
  type EmotionalGoal,
  type ReadingLevelBand,
  type StoryMood
} from "../src/index";

describe("domain: story concept (F-007)", () => {
  it("matches the F-007 bundle shape: three concepts, constrained fields", () => {
    expect(CONCEPTS_PER_BUNDLE).toBe(3);
    expectTypeOf<EmotionalGoal>().toEqualTypeOf<
      | "confidence"
      | "bravery"
      | "kindness"
      | "friendship"
      | "belonging"
      | "bedtime_calm"
      | "fun"
      | "curiosity"
    >();
    expectTypeOf<ReadingLevelBand>().toEqualTypeOf<"0-3" | "4-6" | "7-9">();
    expectTypeOf<ConceptSource>().toEqualTypeOf<"model" | "fallback" | "edited">();
    expectTypeOf<ConceptStatus>().toEqualTypeOf<"PROPOSED" | "SELECTED" | "DISCARDED">();
    expect(STORY_MOODS).toHaveLength(8);
    expect(EMOTIONAL_GOALS).toHaveLength(8);
    expect(READING_LEVELS).toEqual(["0-3", "4-6", "7-9"]);
    expect(CONCEPT_SOURCES).toEqual(["model", "fallback", "edited"]);
    expect(CONCEPT_STATUSES).toEqual(["PROPOSED", "SELECTED", "DISCARDED"]);
    expect(STORY_MOODS).toContain("bedtime");
  });

  it("bounds the concept copy and page count contract", () => {
    expect(CONCEPT_TITLE_MAX).toBe(60);
    expect(CONCEPT_PITCH_MAX).toBe(240);
    expect(isValidConceptLength(4)).toBe(true);
    expect(isValidConceptLength(12)).toBe(true);
    expect(isValidConceptLength(3)).toBe(false);
    expect(isValidConceptLength(13)).toBe(false);
    expect(isValidConceptLength(8.5)).toBe(false);
    expect(CONCEPT_LENGTH_MIN_PAGES).toBeLessThan(CONCEPT_LENGTH_MAX_PAGES);
  });

  it("derives the reading level from age at read time (F-003; never frozen at capture)", () => {
    expect(readingLevelForAgeYears(0)).toBe("0-3");
    expect(readingLevelForAgeYears(3)).toBe("0-3");
    expect(readingLevelForAgeYears(4)).toBe("4-6");
    expect(readingLevelForAgeYears(6)).toBe("4-6");
    expect(readingLevelForAgeYears(7)).toBe("7-9");
    expect(readingLevelForAgeYears(12)).toBe("7-9");
  });

  it("flags characters not present in the book (F-007 §11)", () => {
    const allowed = new Set(["ava", "milo"]);
    expect(invalidCharacterNames({ charactersUsed: ["ava", "bruno"] }, allowed)).toEqual(["bruno"]);
    expect(invalidCharacterNames({ charactersUsed: ["ava"] }, allowed)).toEqual([]);
  });

  it("matches character names case-insensitively (vendor lowercase vs Bible display name)", () => {
    // Book bibles store "Ava"; vendor output may normalise to "ava" (spec §7).
    const allowed = new Set(["Ava", "Milo"]);
    expect(invalidCharacterNames({ charactersUsed: ["ava"] }, allowed)).toEqual([]);
    expect(invalidCharacterNames({ charactersUsed: ["BRUNO"] }, allowed)).toEqual(["BRUNO"]);
  });

  it("flags duplicate titles inside a bundle (F-007 §4)", () => {
    expect(duplicateTitles([{ title: "A" }, { title: "B" }, { title: "A" }])).toEqual(["A"]);
    expect(duplicateTitles([{ title: "A" }, { title: "B" }, { title: "C" }])).toEqual([]);
  });

  it("guards distinguish vocabularies from open strings", () => {
    expect(isEmotionalGoal("bravery")).toBe(true);
    expect(isEmotionalGoal("scary")).toBe(false);
    expect(isReadingLevel("7-9")).toBe(true);
    expect(isReadingLevel("6-7")).toBe(false);
    expect(isStoryMood("funny")).toBe(true);
    expect(isStoryMood("nope")).toBe(false);
  });
});
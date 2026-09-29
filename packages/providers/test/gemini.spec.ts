import { describe, expect, it } from "vitest";
import {
  GeminiStoryProvider,
  buildConceptPrompt,
  buildOutlinePrompt,
  buildPagePrompt,
  conceptSystem,
  outlineSystem,
  pageSystem,
  parseJson
} from "../src/gemini";

const CONCEPT_REQUEST = {
  schemaVersion: "1" as const,
  themeId: "space",
  themeSeedVersion: "2026-09-01",
  themeSeed: { tone: "wonder", settingHints: ["stars"], characterSlots: ["hero"], forbidBlocks: ["peril"] },
  locale: "en-GB",
  displayName: "Milo",
  facts: [{ type: "pet" as const, value: "Bruno the dog", locale: "en-GB" }],
  readingLevel: "4-6" as const
};

const OUTLINE_REQUEST = {
  schemaVersion: "1" as const,
  concept: { title: "Milo and the Rumble", pitch: "Milo calms a grumbling volcano." },
  locale: "en-GB",
  facts: ["Milo", "pet: Bruno the dog"],
  policySetVersion: "for-little-ones/text/v1"
};

const PAGE_REQUEST = {
  schemaVersion: "1" as const,
  pageKey: "k1",
  pageNumber: 2,
  bibleVersion: "bible:m1-none",
  factsVersion: "f1",
  locale: "en-GB",
  policySetVersion: "for-little-ones/text/v1",
  heroName: "Milo",
  storyTitle: "Milo and the Rumble",
  priorLines: ["Milo heard a rumble."],
  maxWords: 40
};

describe("gemini story provider", () => {
  it("builds a concept prompt naming the child, theme and facts", () => {
    const prompt = buildConceptPrompt(CONCEPT_REQUEST);
    expect(prompt).toContain("Milo");
    expect(prompt).toContain("space");
    expect(prompt).toContain("Bruno the dog");
    expect(prompt).toContain('"approximateLengthPages":8');
    expect(conceptSystem("en-GB")).toContain("exactly three concepts");
    expect(conceptSystem("en-GB")).toContain("British");
  });

  it("builds a personalised outline prompt carrying concept, hero and facts", () => {
    const prompt = buildOutlinePrompt(OUTLINE_REQUEST);
    expect(prompt).toContain("Milo and the Rumble");
    expect(prompt).toContain("Milo calms a grumbling volcano");
    expect(prompt).toContain("Milo");
    expect(prompt).toContain("Bruno the dog");
    expect(prompt).toContain('"pageCount":6');
  });

  it("builds a page prompt with continuity, cap and echoed key", () => {
    const prompt = buildPagePrompt(PAGE_REQUEST);
    expect(prompt).toContain("page 2");
    expect(prompt).toContain("Milo and the Rumble");
    expect(prompt).toContain("Milo heard a rumble.");
    expect(prompt).toContain("40 words");
    expect(prompt).toContain('"pageKey":"k1"');
  });

  it("localises spelling instruction by locale", () => {
    expect(outlineSystem("en-GB")).toContain("British");
    expect(outlineSystem("en-US")).toContain("American");
    expect(pageSystem("en-GB")).toContain("British");
  });

  it("strips code fences before strict parsing", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseJson("not json")).toThrow();
  });

  it("refuses to construct without a key, and declares an honest card", () => {
    expect(() => new GeminiStoryProvider({ apiKey: "" })).toThrow(/apiKey/);
    const provider = new GeminiStoryProvider({ apiKey: "test-key" });
    expect(provider.card.dataPolicy.childDataSent).toBe(true);
    expect(provider.card.dataPolicy.trainingUse).toBe("UNKNOWN");
  });
});

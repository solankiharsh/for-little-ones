import { describe, expect, it } from "vitest";
import { buildConceptRequest } from "../../src/creation/concept-request";
import { confirmedFact, suggestedFact } from "../testing/fixtures";

const themeSeed = {
  tone: "gentle wonder",
  settingHints: ["night sky", "cardboard rocket"],
  characterSlots: ["protagonist"],
  forbidBlocks: ["bedtime reversal", "scary dark"]
};

describe("api: ConceptRequest builder (F-007 §7)", () => {
  it("sends themeSeed, pronouns and typed facts as type + value + locale (F-006 §7 rule 1)", () => {
    const request = buildConceptRequest({
      displayName: "Ava",
      locale: "en-GB",
      facts: [confirmedFact()],
      themeId: "space",
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      themeSeed,
      pronouns: "she"
    });
    expect(request.locale).toBe("en-GB");
    expect(request.displayName).toBe("Ava");
    expect(request.themeSeed).toEqual(themeSeed);
    expect(request.pronouns).toBe("she");
    expect(request.facts).toEqual([{ type: "interest", value: "space", locale: "en-GB" }]);
    expect(request.themeId).toBe("space");
  });

  it("normalises the legacy demo locale 'en' to the fact-catalogue idiom 'en-GB'", () => {
    const request = buildConceptRequest({
      displayName: "Ava",
      locale: "en",
      facts: [confirmedFact()],
      themeId: "space",
      themeSeedVersion: "v",
      themeSeed
    });
    expect(request.locale).toBe("en-GB");
  });

  it("carries reading level and mood only when the caller supplies them", () => {
    const base = {
      displayName: "Ava",
      locale: "en-GB",
      facts: [confirmedFact()],
      themeId: "space",
      themeSeedVersion: "v",
      themeSeed
    };
    expect(buildConceptRequest(base).readingLevel).toBeUndefined();
    const withParams = buildConceptRequest({ ...base, readingLevel: "4-6", mood: "adventure" });
    expect(withParams.readingLevel).toBe("4-6");
    expect(withParams.mood).toBe("adventure");
  });

  it("rejects an unknown reading level rather than sending it to a provider", () => {
    expect(() =>
      buildConceptRequest({
        displayName: "Ava",
        locale: "en-GB",
        facts: [confirmedFact()],
        themeId: "space",
        themeSeedVersion: "v",
        themeSeed,
        readingLevel: "6-7"
      })
    ).toThrow(/readingLevel/u);
  });

  it("refuses a suggested fact at the boundary — it can never reach a provider", () => {
    expect(() =>
      buildConceptRequest({
        displayName: "Ava",
        locale: "en-GB",
        facts: [confirmedFact(), suggestedFact()],
        themeId: "space",
        themeSeedVersion: "v",
        themeSeed
      })
    ).toThrow(/not parentConfirmed/u);
  });
});
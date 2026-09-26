import { describe, expect, expectTypeOf, it } from "vitest";
import {
  THEME_CATALOGUE,
  THEME_CATEGORIES,
  getTheme,
  listCategories,
  listThemes,
  sortThemes,
  themeInstancesOfConceptProvidedBy,
  universalSeedThemes,
  type Theme,
  type ThemeLength
} from "../src/index";

describe("domain: theme catalogue (F-002)", () => {
  it("ships a seed catalogue with at least ten published themes", () => {
    expect(THEME_CATALOGUE.length).toBeGreaterThanOrEqual(10);
    for (const theme of THEME_CATALOGUE) {
      expect(theme.publishedAt).toBeTruthy();
      expect(theme.displayName.length).toBeGreaterThan(0);
      expect(theme.conceptSeed.forbidBlocks.length).toBeGreaterThan(0);
      expect(theme.fallbackConcepts).toHaveLength(3);
    }
  });

  it("marks the P0 occasion themes universal", () => {
    const universal = universalSeedThemes();
    const ids = new Set(universal.map((t) => t.id));
    expect(ids.has("adventure")).toBe(true);
    expect(ids.has("bedtime")).toBe(true);
    expect(ids.has("birthday")).toBe(true);
    expect(universal.length).toBeGreaterThanOrEqual(3);
  });

  it("every fallback concept is modellessly safe: title/pitch/readingLevel/length valid", () => {
    for (const theme of THEME_CATALOGUE) {
      const titles = theme.fallbackConcepts.map((c) => c.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const concept of theme.fallbackConcepts) {
        expect(concept.readingLevel).toBe("4-6");
        expect(concept.approximateLengthPages).toBeGreaterThanOrEqual(4);
        expect(concept.approximateLengthPages).toBeLessThanOrEqual(12);
        expect(concept.pitch.length).toBeGreaterThan(20);
      }
    }
  });

  it("theme instances expose their fallback concept titles for the concept bundle", () => {
    const adventure = getTheme("adventure");
    expect(adventure).toBeDefined();
    expect(themeInstancesOfConceptProvidedBy(adventure!)).toHaveLength(3);
    expect(themeInstancesOfConceptProvidedBy(adventure!)).toEqual(adventure!.fallbackConcepts.map((c) => c.title));
  });

  it("lookups work for seeded ids and return undefined otherwise", () => {
    expect(getTheme("space")?.categoryId).toBe("adventures");
    expect(getTheme("nope")).toBeUndefined();
    expect(listThemes()).toHaveLength(THEME_CATALOGUE.length);
  });

  it("category list keeps canonical sort order and core flags", () => {
    const categories = listCategories();
    expect(categories.map((c) => c.id)).toEqual(categories.map((c) => c.id).sort());
    expect(categories[0]).toMatchObject({ id: "adventures", sortOrder: 1, isCore: true });
    expectTypeOf<Theme["lengthHint"]>().toEqualTypeOf<ThemeLength>();
    expect(THEME_CATEGORIES.every((c) => c.isCore)).toBe(true);
  });

  it("age-scoped themes out-rank unrelated ones only for matching age windows", () => {
    const startingSchool = getTheme("starting-school")!;
    const newSibling = getTheme("new-sibling")!;
    expect(startingSchool.ageLowMonths!).toBeLessThanOrEqual(startingSchool.ageHighMonths!);

    const atSix = sortThemes(listThemes(), { ageMonths: 72 });
    const atTwo = sortThemes(listThemes(), { ageMonths: 24 });

    expect(atSix.indexOf(startingSchool)).toBeLessThan(atSix.indexOf(newSibling));
    expect(atTwo.indexOf(newSibling)).toBeLessThan(atTwo.indexOf(startingSchool));
  });
});
import { describe, expect, it } from "vitest";
import { InMemoryCreationStore } from "../../src/creation/creation-store";
import { draftBook, sampleProfile } from "../testing/fixtures";

describe("api: creation store (persistence seam)", () => {
  it("stores profiles, facts and books for the slice flows", async () => {
    const store = new InMemoryCreationStore();
    const profile = sampleProfile();
    await store.seedProfile(profile);
    await store.saveBook(draftBook());
    expect(await store.getProfile("child-ava")).toEqual(profile);
    expect((await store.getBook("book-1"))?.status).toBe("DRAFT");
  });

  it("persists a concept bundle and lists it back as PROPOSED rows", async () => {
    const store = new InMemoryCreationStore();
    await store.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [
        { title: "A", pitch: "Pitch A that is long enough to pass.", emotionalGoal: "bravery", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" },
        { title: "B", pitch: "Pitch B that is long enough to pass.", emotionalGoal: "fun", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" },
        { title: "C", pitch: "Pitch C that is long enough to pass.", emotionalGoal: "kindness", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" }
      ]
    });
    const concepts = await store.listConceptsByBook("book-1");
    expect(concepts).toHaveLength(3);
    expect(concepts.every((c) => c.status === "PROPOSED")).toBe(true);
    expect(concepts.every((c) => c.bookId === "book-1")).toBe(true);
    expect(new Set(concepts.map((c) => c.id)).size).toBe(3);
  });
});
import { describe, expect, it } from "vitest";
import { BookService } from "../../src/creation/book-service";
import { draftBook, NOW, seededStore, type Seeded } from "../testing/fixtures";

function service(
  store: Seeded["store"],
  assertProjectAccess: (anonymousProjectId: string, projectId: string) => Promise<unknown> = async () => undefined
) {
  let counter = 0;
  return new BookService({
    store,
    assertProjectAccess,
    now: () => NOW,
    newId: (prefix) => `${prefix}-${++counter}`
  });
}

const PROJECT = "project-1";

describe("api: book service (command/query boundary, D023)", () => {
  it("creates a DRAFT book from a child profile with the display-name protagonist, bound to the caller's project (F-001 §8)", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    const book = await svc.createBookForChild({
      childProfileId: "child-ava",
      anonymousProjectId: "anon-1",
      projectId: PROJECT
    });
    expect(book.status).toBe("DRAFT");
    expect(book.childProfileIds).toEqual(["child-ava"]);
    expect(book.characters[0]?.name).toBe("Ava");
    expect(book.metadata.locale).toBe("en-GB");
    expect(book.projectId).toBe(PROJECT);
  });

  it("refuses project-scoped commands when the caller does not own the project (F-001 §8)", async () => {
    const seed = await seededStore();
    const svc = service(seed.store, async () => {
      throw new Error("session does not own project: project-1");
    });
    await expect(
      svc.selectTheme({ bookId: "book-1", themeId: "space", anonymousProjectId: "anon-other" })
    ).rejects.toThrow(/does not own project/u);
    await expect(
      svc.selectConcept({ bookId: "book-1", conceptId: "concept:book-1:v1:0", anonymousProjectId: "anon-other" })
    ).rejects.toThrow(/does not own project/u);
  });

  it("pins the theme seed version on selection (F-002)", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    const book = await svc.selectTheme({ bookId: "book-1", themeId: "space", anonymousProjectId: "" });
    expect(book.themeId).toBe("space");
    expect(book.themeSeedVersion).toBeTruthy();
    await expect(
      svc.selectTheme({ bookId: "book-1", themeId: "nope", anonymousProjectId: "" })
    ).rejects.toThrow(/unknown theme/u);
  });

  it("returns ONLY parent-confirmed facts for generation (F-006 §8)", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    const facts = await svc.getFactsForStory({ childProfileId: "child-ava" });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.state).toBe("parentConfirmed");
  });

  it("assembles story-time inputs: display name, confirmed facts, theme seed + pronouns, reading level", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    await svc.selectTheme({ bookId: "book-1", themeId: "space", anonymousProjectId: "" });
    const inputs = await svc.storyInputsFor({ childProfileId: "child-ava", bookId: "book-1", anonymousProjectId: "" });
    expect(inputs.displayName).toBe("Ava");
    expect(inputs.themeId).toBe("space");
    expect(inputs.themeSeed.tone).toBeTruthy();
    expect(inputs.pronouns).toBe("she");
    expect(inputs.facts.map((f) => f.id)).toEqual(["fact-1"]);
    expect(inputs.readingLevel).toBe("4-6"); // 5 years old on 2026-09-25
  });

  it("records the selected concept on the book and transitions statuses (F-007 §8)", async () => {
    const seed = await seededStore();
    await seed.store.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [
        { title: "A", pitch: "Pitch A long enough to pass structural checks.", emotionalGoal: "bravery", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" },
        { title: "B", pitch: "Pitch B long enough to pass structural checks.", emotionalGoal: "kindness", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" }
      ]
    });
    const svc = service(seed.store);
    const book = await svc.selectConcept({ bookId: "book-1", conceptId: "concept:book-1:v1:1", anonymousProjectId: "" });
    expect(book.selectedConceptId).toBe("concept:book-1:v1:1");
    const after = await seed.store.listConceptsByBook("book-1");
    expect(after.find((c) => c.id === "concept:book-1:v1:1")?.status).toBe("SELECTED");
    expect(after.find((c) => c.id === "concept:book-1:v1:0")?.status).toBe("DISCARDED");
  });

  it("serves the catalogue fallback bundle from the API path after exhaustion (F-007 §9)", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    const concepts = await svc.serveFallbackConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      anonymousProjectId: ""
    });
    expect(concepts).toHaveLength(3);
    expect(concepts.every((c) => c.source === "fallback" && c.status === "PROPOSED" && c.themeId === "space")).toBe(true);
    expect(concepts.map((c) => c.title).includes("The Rocket Made of Cardboard")).toBe(true);
    const saved = await seed.store.listConceptsByBook("book-1");
    expect(saved).toHaveLength(3);
    expect(saved.every((c) => c.source === "fallback")).toBe(true);
  });

  it("never hard-codes a child's name into fallback charactersUsed — empty when the book has none", async () => {
    const seed = await seededStore();
    await seed.store.saveBook({ ...draftBook({ id: "book-no-char" }), characters: [] });
    const svc = service(seed.store);
    const concepts = await svc.serveFallbackConcepts({ bookId: "book-no-char", conceptVersion: 1, anonymousProjectId: "" });
    expect(concepts[0]?.charactersUsed).toEqual([]);
    expect(concepts.some((c) => c.title.includes("Ava"))).toBe(false);
  });

  it("rejects serving fallback concepts for a book without a theme", async () => {
    const seed = await seededStore();
    const { themeId: _t, themeSeedVersion: _s, ...rest } = draftBook({ id: "book-no-theme" });
    await seed.store.saveBook({ ...rest, id: "book-no-theme" });
    const svc = service(seed.store);
    await expect(
      svc.serveFallbackConcepts({ bookId: "book-no-theme", conceptVersion: 1, anonymousProjectId: "" })
    ).rejects.toThrow(/no theme/u);
  });

  it("re-selecting the already-selected concept is idempotent (F-007 §8)", async () => {
    const seed = await seededStore();
    await seed.store.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [
        { title: "A", pitch: "Pitch A long enough to pass structural checks.", emotionalGoal: "bravery", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" },
        { title: "B", pitch: "Pitch B long enough to pass structural checks.", emotionalGoal: "kindness", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" }
      ]
    });
    const svc = service(seed.store);
    const first = await svc.selectConcept({ bookId: "book-1", conceptId: "concept:book-1:v1:0", anonymousProjectId: "" });
    const again = await svc.selectConcept({ bookId: "book-1", conceptId: "concept:book-1:v1:0", anonymousProjectId: "" });
    expect(again.selectedConceptId).toBe(first.selectedConceptId);
    // A different, now-DISCARDED concept is still rejected.
    await expect(
      svc.selectConcept({ bookId: "book-1", conceptId: "concept:book-1:v1:1", anonymousProjectId: "" })
    ).rejects.toThrow(/DISCARDED, not PROPOSED/u);
  });

  it("rejects selecting a concept that does not exist on the book", async () => {
    const seed = await seededStore();
    const svc = service(seed.store);
    await expect(
      svc.selectConcept({ bookId: "book-1", conceptId: "nope", anonymousProjectId: "" })
    ).rejects.toThrow(/concept not found/u);
  });

  it("keeps the legacy demo fixture shape valid (M1 fields are additive, none new required)", async () => {
    const { store } = await seededStore();
    const book = draftBook();
    await store.saveBook(book);
    expect((await store.getBook("book-1"))?.metadata.locale).toBe("en-GB");
  });
});
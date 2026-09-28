import { describe, expect, it } from "vitest";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { BookService, ConceptEditBlockedError, RegenerateBudgetError } from "./book-service";
import { InMemoryCreationStore } from "./creation-store";
import { MemoryEventSink } from "../analytics/event-sink";
import { otherSessionOn, ownedProject } from "../testing/session-harness";

const TEST_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "test-v1",
    childDataSent: true,
    childDataScope: ["name-derived display name", "confirmed fact ids"],
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "not-applicable",
    evidenceRef: "internal://test"
  },
  idempotency: "none",
  timeoutMs: 10,
  retryPolicy: "none",
  costMetadata: "none"
};

function moderation(verdict: "ALLOW" | "BLOCK"): ModerationProvider {
  return {
    card: { ...TEST_CARD, dataPolicy: { ...TEST_CARD.dataPolicy, childDataSent: false } },
    async screen() {
      return { verdict, findings: [] };
    }
  };
}

const STORY_PROVIDER: Pick<StoryProvider, "generateConcepts" | "card"> = {
  card: TEST_CARD,
  async generateConcepts() {
    return { schemaVersion: "1", concepts: [] };
  }
};

async function fixture() {
  const { store, sessions, anonymousProjectId, project } = await ownedProject();
  await store.saveProfile({
    id: "child-ava",
    name: "Ava Solanki",
    displayName: "Ava",
    dateOfBirth: "2021-06-01",
    pronouns: "she",
    locale: "en-GB",
    interests: ["space"],
    facts: [],
    consent: { grantedAt: "2026-09-01T00:00:00.000Z", retentionClass: "default" },
    retentionClass: "default",
    relationshipIds: ["rel:self:child-ava"]
  });
  await sessions.addToProject(project.projectId, { childProfileIds: ["child-ava"] });
  const events = new MemoryEventSink();
  const assertProjectAccess = async (anonId: string, projectId: string) => {
    const owned = await sessions.getProject(projectId);
    if (!owned || owned.owner.kind !== "anonymous" || owned.owner.anonymousProjectId !== anonId) {
      throw new Error(`session ${anonId} does not own project ${projectId}`);
    }
    return owned;
  };
  const bookService = new BookService({
    store,
    assertProjectAccess,
    now: () => "2026-09-25T10:00:00.000Z",
    newId: (prefix) => `${prefix}-${nextId()}`,
    events,
    moderation: moderation("ALLOW"),
    storyProvider: STORY_PROVIDER
  });
  return { store, sessions, anonymousProjectId, project, bookService, events };
}

let idCounter = 0;
const nextId = () => (idCounter += 1);

/** A DRAFT book with a theme and a three-concept PROPOSED bundle at v1. */
async function bookWithBundle(f: Awaited<ReturnType<typeof fixture>>): Promise<string> {
  const book = await f.bookService.createBookForChild({
    childProfileId: "child-ava",
    anonymousProjectId: f.anonymousProjectId,
    projectId: f.project.projectId,
    locale: "en-GB"
  });
  await f.bookService.selectTheme({ bookId: book.id, themeId: "space", anonymousProjectId: f.anonymousProjectId });
  await f.sessions.addToProject(f.project.projectId, { bookIds: [book.id] });
  await f.store.saveConcepts({
    bookId: book.id,
    conceptVersion: 1,
    themeSeedVersion: "2026-09-25T00:00:00.000Z",
    concepts: [0, 1, 2].map((i) => ({
      title: `Concept ${i}`,
      pitch: `Pitch ${i} that is long enough to pass the length check.`,
      emotionalGoal: "bravery" as const,
      themeId: "space",
      readingLevel: "4-6" as const,
      approximateLengthPages: 8,
      charactersUsed: ["Ava"],
      locale: "en-GB" as const,
      source: "model" as const
    }))
  });
  return book.id;
}

describe("api: book commands — creation state (D024 §4)", () => {
  it("advances creationState as the parent moves through the journey", async () => {
    const f = await fixture();
    const book = await f.bookService.createBookForChild({
      childProfileId: "child-ava",
      anonymousProjectId: f.anonymousProjectId,
      projectId: f.project.projectId
    });
    expect(book.creationState).toBe("CREATED");

    const themed = await f.bookService.selectTheme({ bookId: book.id, themeId: "space", anonymousProjectId: f.anonymousProjectId });
    expect(themed.creationState).toBe("THEME_SELECTED");

    const bookId = await bookWithBundle(f);
    const concepts = await f.store.listConceptsByBook(bookId);
    const selected = await f.bookService.selectConcept({
      bookId,
      conceptId: concepts[1]!.id,
      anonymousProjectId: f.anonymousProjectId
    });
    expect(selected.creationState).toBe("CONCEPT_SELECTED");
    expect(selected.selectedConceptId).toBe(concepts[1]!.id);
  });

  it("keeps theme selection idempotent and never regresses creationState", async () => {
    const f = await fixture();
    const book = await f.bookService.createBookForChild({
      childProfileId: "child-ava",
      anonymousProjectId: f.anonymousProjectId,
      projectId: f.project.projectId
    });
    const first = await f.bookService.selectTheme({ bookId: book.id, themeId: "space", anonymousProjectId: f.anonymousProjectId });
    const second = await f.bookService.selectTheme({ bookId: book.id, themeId: "space", anonymousProjectId: f.anonymousProjectId });
    expect(second.themeSeedVersion).toBe(first.themeSeedVersion);
    expect(second.creationState).toBe("THEME_SELECTED");
  });

  it("rejects an unknown theme as not-found rather than persisting a broken pin", async () => {
    const f = await fixture();
    const book = await f.bookService.createBookForChild({
      childProfileId: "child-ava",
      anonymousProjectId: f.anonymousProjectId,
      projectId: f.project.projectId
    });
    await expect(
      f.bookService.selectTheme({ bookId: book.id, themeId: "no-such-theme", anonymousProjectId: f.anonymousProjectId })
    ).rejects.toThrow(/unknown theme/);
    expect((await f.store.getBook(book.id))?.themeId).toBeUndefined();
  });

  it("emits the canonical F-007 §13 selection event", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const concepts = await f.store.listConceptsByBook(bookId);
    await f.bookService.selectConcept({ bookId, conceptId: concepts[0]!.id, anonymousProjectId: f.anonymousProjectId });
    expect(f.events.events.map((e) => e.name)).toContain("story_concept_selected");
  });

  it("emits concepts_served_from_fallback when the API serves the fallback bundle", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    await f.bookService.serveFallbackConcepts({ bookId, conceptVersion: 5, anonymousProjectId: f.anonymousProjectId });
    expect(f.events.events.map((e) => e.name)).toContain("concepts_served_from_fallback");
  });
});

describe("api: book commands — parent edit of concept copy (F-007 §7, D024 §9)", () => {
  it("edits a concept, marks it edited, and bumps the concept version", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const target = (await f.store.listConceptsByBook(bookId))[0]!;

    const edited = await f.bookService.editConcept({
      anonymousProjectId: f.anonymousProjectId,
      bookId,
      conceptId: target.id,
      patch: { title: "Ava and the Pinch of Starlight", pitch: "Ava befriends a tiny star that has lost its glow." }
    });
    expect(edited.title).toBe("Ava and the Pinch of Starlight");
    expect(edited.source).toBe("edited");
    expect(edited.conceptVersion).toBe(2);
    expect(edited.id).not.toBe(target.id);

    // The whole bundle moves to v2 (siblings keep their slots) so the parent still has
    // three options, and v1 survives verbatim as history.
    const v2 = await f.store.listConceptsByBook(bookId);
    expect(v2).toHaveLength(3);
    expect(v2.filter((c) => c.source === "edited").map((c) => c.title)).toEqual(["Ava and the Pinch of Starlight"]);
    expect(v2.every((c) => c.conceptVersion === 2)).toBe(true);
    expect((await f.store.getConcept(target.id))?.title).toBe(target.title);
  });

  it("re-moderates the ACTUAL edited copy, and persists nothing when it is blocked", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const before = await f.store.listConceptsByBook(bookId);

    await expect(
      f.bookService.editConcept({
        anonymousProjectId: f.anonymousProjectId,
        bookId,
        conceptId: before[0]!.id,
        patch: { title: "Something else entirely" },
        moderation: moderation("BLOCK")
      })
    ).rejects.toBeInstanceOf(ConceptEditBlockedError);

    const after = await f.store.listConceptsByBook(bookId);
    expect(after.map((c) => c.title)).toEqual(before.map((c) => c.title));
    expect(after.every((c) => c.source === "model" && c.status === "PROPOSED" && c.conceptVersion === 1)).toBe(true);
    // F-007 §13: a blocked edit fires no concept_edit_applied.
    expect(f.events.events.some((e) => e.name === "concept_edit_applied")).toBe(false);
  });

  it("fires concept_edit_applied exactly once for an applied edit", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const target = (await f.store.listConceptsByBook(bookId))[0]!;
    await f.bookService.editConcept({ anonymousProjectId: f.anonymousProjectId, bookId, conceptId: target.id, patch: { title: "A Better Title" } });
    expect(f.events.events.filter((e) => e.name === "concept_edit_applied")).toHaveLength(1);
  });

  it("rejects an out-of-range title or pitch before it ever reaches moderation", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const target = (await f.store.listConceptsByBook(bookId))[0]!;
    await expect(
      f.bookService.editConcept({ anonymousProjectId: f.anonymousProjectId, bookId, conceptId: target.id, patch: { title: "x".repeat(61) } })
    ).rejects.toThrow(/60/);
    await expect(
      f.bookService.editConcept({ anonymousProjectId: f.anonymousProjectId, bookId, conceptId: target.id, patch: { pitch: "x".repeat(241) } })
    ).rejects.toThrow(/240/);
  });

  it("does not spend the regenerate budget on an edit (D024 §7)", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const target = (await f.store.listConceptsByBook(bookId))[0]!;
    await f.bookService.editConcept({ anonymousProjectId: f.anonymousProjectId, bookId, conceptId: target.id, patch: { title: "A Better Title" } });
    expect(await f.store.regenerateCount(bookId)).toBe(0);
  });

  it("refuses to edit a concept on a book owned by another session", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const target = (await f.store.listConceptsByBook(bookId))[0]!;
    const intruder = await otherSessionOn(f.sessions);
    await expect(
      f.bookService.editConcept({ anonymousProjectId: intruder, bookId, conceptId: target.id, patch: { title: "Not Yours" } })
    ).rejects.toThrow(/does not own/);
  });
});

describe("api: book commands — regenerate (F-007 §8, D024 §7)", () => {
  it("regenerates into a new version and retires the old bundle as retained history", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);

    const { conceptVersion, spent } = await f.bookService.regenerateConcepts({
      anonymousProjectId: f.anonymousProjectId,
      bookId
    });
    expect(conceptVersion).toBe(2);
    expect(spent).toBe(1);
    // v1 is retired, not deleted: the parent cannot flip back to the rejected set.
    expect((await f.store.getConcept(`concept:${bookId}:v1:0`))?.status).toBe("DISCARDED");
    expect(await f.store.listConceptVersions(bookId)).toEqual([1]);
    expect(f.events.events.map((e) => e.name)).toContain("story_concepts_regenerated");
  });

  it("caps regeneration at the default budget of three per book", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    for (let i = 0; i < 3; i += 1) {
      await f.bookService.regenerateConcepts({ anonymousProjectId: f.anonymousProjectId, bookId });
    }
    expect(await f.store.regenerateCount(bookId)).toBe(3);
    await expect(f.bookService.regenerateConcepts({ anonymousProjectId: f.anonymousProjectId, bookId })).rejects.toBeInstanceOf(
      RegenerateBudgetError
    );
  });

  it("refuses a command on a book owned by another session", async () => {
    const f = await fixture();
    const bookId = await bookWithBundle(f);
    const intruder = await otherSessionOn(f.sessions);
    await expect(f.bookService.regenerateConcepts({ anonymousProjectId: intruder, bookId })).rejects.toThrow(/does not own/);
  });
});

describe("api: in-memory creation store parity (Slice-2 seam)", () => {
  it("keeps removed facts out of reads while retaining their usage audit", async () => {
    const store = new InMemoryCreationStore();
    await store.saveFact({
      id: "fact-1",
      childProfileId: "child-ava",
      type: "interest",
      value: { kind: "enum", optionId: "space" },
      locale: "en-GB",
      source: "parentTyped",
      state: "parentConfirmed",
      createdAt: "2026-09-20T00:00:00.000Z",
      storyUsage: [{ storyId: "book-1", usedAs: "the friend" }]
    });
    await store.removeFact("fact-1");
    expect(await store.getFact("fact-1")).toBeUndefined();
    expect(await store.removedFactUsage("fact-1")).toEqual([{ storyId: "book-1", usedAs: "the friend" }]);
  });
});

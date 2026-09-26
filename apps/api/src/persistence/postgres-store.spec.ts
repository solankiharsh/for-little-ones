import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Book, ChildProfile, Fact, StoryConcept } from "@for-little-ones/domain";
import { PostgresCreationStore } from "./postgres-creation-store";
import { PostgresSessionStore } from "./postgres-session-store";
import { closePostgresStores, createPostgresStores } from "./postgres-stores";
import type { PostgresStores } from "./postgres-stores";
import { resetFloTables, testDatabaseUrl } from "./test-database";
import { conceptStub, confirmedFact, draftBook, sampleProfile } from "../testing/fixtures";

/**
 * Slice-2 persistence rail: the Postgres adapters must be indistinguishable from
 * the in-memory adapter at the `CreationStore`/`SessionStore` seams, because the
 * durable worker and the HTTP transport both sit on those seams.
 */
describe("api: postgres stores (Slice-2 persistence rail)", () => {
  let stores: PostgresStores;
  let pool: Pool;

  beforeEach(async () => {
    pool = await resetFloTables();
    stores = createPostgresStores(pool);
    await stores.init();
    // Every book in these specs is owned by project-1; the FK is real, so it must exist.
    await stores.sessions.createSession({
      anonymousProjectId: "anon-1",
      browserTokenHash: "hash-1",
      createdAt: "2026-09-25T10:00:00.000Z",
      lastSeenAt: "2026-09-25T10:00:00.000Z"
    });
    await stores.sessions.saveProject({
      projectId: "project-1",
      owner: { kind: "anonymous", anonymousProjectId: "anon-1" },
      childProfileIds: [],
      bookIds: [],
      latestActivityAt: "2026-09-25T10:00:00.000Z"
    });
    // The flo_* foreign keys are real: a book needs its project, a fact needs its
    // profile, a concept needs its book. Seed the spine so each spec can assert on
    // its own subject instead of on insert ordering.
    await stores.creation.saveProfile(sampleProfile());
    await stores.creation.saveBook(draftBook());
  });

  afterAll(async () => {
    await closePostgresStores();
  });

  it("replaying the DDL over a populated database changes nothing (no migration step needed)", async () => {
    await stores.creation.saveBook(draftBook({ themeId: "space" }));
    await stores.init();
    await stores.init();
    expect((await stores.creation.getBook("book-1"))?.themeId).toBe("space");
  });

  it("round-trips a child profile with every canonical field intact", async () => {
    const profile = sampleProfile();
    await stores.creation.saveProfile(profile);
    expect(await stores.creation.getProfile(profile.id)).toEqual(profile);
  });

  it("updates a profile in place and bumps its revision for the optimistic lock", async () => {
    const profile: ChildProfile = { ...sampleProfile(), revision: 3 };
    await stores.creation.saveProfile(profile);
    await stores.creation.saveProfile({ ...profile, displayName: "Ava R.", revision: 4 });
    const read = await stores.creation.getProfile(profile.id);
    expect(read?.displayName).toBe("Ava R.");
    expect(read?.revision).toBe(4);
  });

  it("finds a profile by its creationToken so a retried create dedupes", async () => {
    await stores.creation.saveProfile({ ...sampleProfile(), creationToken: "token-1" });
    expect(await stores.creation.findProfileByCreationToken("token-1")).toBe("child-ava");
    expect(await stores.creation.findProfileByCreationToken("token-2")).toBeUndefined();
  });

  it("round-trips a book including creationState and relationships", async () => {
    const book: Book = {
      ...draftBook(),
      creationState: "THEME_SELECTED",
      relationships: [
        { id: "rel:self:child-ava", fromChildId: "child-ava", toChildId: "child-ava", kind: "self", name: "Ava", label: "Ava" }
      ]
    };
    await stores.creation.saveBook(book);
    expect(await stores.creation.getBook("book-1")).toEqual(book);
  });

  it("round-trips a fact, including the discriminated value union", async () => {
    const fact = confirmedFact();
    await stores.creation.saveFact(fact);
    expect(await stores.creation.getFact(fact.id)).toEqual(fact);
  });

  it("lists facts for a profile and never returns a removed one", async () => {
    const confirmed = confirmedFact();
    const custom: Fact = {
      id: "fact-2",
      childProfileId: "child-ava",
      type: "customFact",
      value: { kind: "custom", subject: "teddy", claim: "called Mr Bear" },
      locale: "en-GB",
      source: "parentTyped",
      state: "parentConfirmed",
      createdAt: "2026-09-21T00:00:00.000Z",
      storyUsage: [{ storyId: "book-1", usedAs: "comic relief" }]
    };
    await stores.creation.saveFact(confirmed);
    await stores.creation.saveFact(custom);
    expect((await stores.creation.listFactsByProfile("child-ava")).map((f) => f.id).sort()).toEqual(["fact-1", "fact-2"]);

    await stores.creation.removeFact("fact-2");
    expect(await stores.creation.getFact("fact-2")).toBeUndefined();
    expect((await stores.creation.listFactsByProfile("child-ava")).map((f) => f.id)).toEqual(["fact-1"]);
  });

  it("keeps the story-id usage map after a fact is removed but scrubs the value", async () => {
    const fact: Fact = {
      ...confirmedFact(),
      storyUsage: [{ storyId: "book-1", usedAs: "the friend" }]
    };
    await stores.creation.saveFact(fact);
    await stores.creation.removeFact("fact-1");
    const audit = await stores.creation.removedFactUsage("fact-1");
    expect(audit).toEqual([{ storyId: "book-1", usedAs: "the friend" }]);
  });

  it("dedupes an added fact on its factToken", async () => {
    await stores.creation.saveFact({ ...confirmedFact(), factToken: "ft-1" });
    expect(await stores.creation.findFactByToken("ft-1")).toBe("fact-1");
    expect(await stores.creation.findFactByToken("ft-2")).toBeUndefined();
  });

  it("reproduces the deterministic concept ids the in-memory adapter mints", async () => {
    const input = {
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [
        { title: "A", pitch: "Pitch A", emotionalGoal: "bravery" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB" as const, source: "model" as const },
        { title: "B", pitch: "Pitch B", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB" as const, source: "model" as const }
      ]
    };
    await stores.creation.saveConcepts(input);
    const listed = await stores.creation.listConceptsByBook("book-1");
    expect(listed.map((c) => c.id)).toEqual(["concept:book-1:v1:0", "concept:book-1:v1:1"]);
  });

  it("replaces the bundle for a version on re-save instead of appending (F-007 §9)", async () => {
    const base = {
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z"
    };
    await stores.creation.saveConcepts({
      ...base,
      concepts: [{ title: "First", pitch: "P1", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const }]
    });
    await stores.creation.saveConcepts({
      ...base,
      concepts: [
        { title: "Second", pitch: "P2", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const },
        { title: "Third", pitch: "P3", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const }
      ]
    });
    const listed = await stores.creation.listConceptsByBook("book-1");
    expect(listed.map((c) => c.title)).toEqual(["Second", "Third"]);
  });

  it("marks the selection atomically: winner SELECTED, siblings DISCARDED", async () => {
    await stores.creation.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [
        { title: "A", pitch: "P1", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const },
        { title: "B", pitch: "P2", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const }
      ]
    });
    await stores.creation.markConceptSelection("book-1", "concept:book-1:v1:1");
    const listed = await stores.creation.listConceptsByBook("book-1");
    expect(listed.map((c) => [c.id, c.status])).toEqual([
      ["concept:book-1:v1:0", "DISCARDED"],
      ["concept:book-1:v1:1", "SELECTED"]
    ]);
  });

  it("retires an older bundle on regenerate while retaining it for revision history", async () => {
    for (const version of [1, 2]) {
      await stores.creation.saveConcepts({
        bookId: "book-1",
        conceptVersion: version,
        themeSeedVersion: "2026-09-25T00:00:00.000Z",
        concepts: [{ title: `V${version}`, pitch: "P", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const }]
      });
    }
    await stores.creation.discardConceptBundle("book-1", 2);
    expect((await stores.creation.listConceptsByBook("book-1")).map((c) => c.conceptVersion)).toEqual([2]);
    // History is retained, not deleted (F-007 §12 / F-025).
    expect(await stores.creation.listConceptVersions("book-1")).toEqual([1, 2]);
    expect(await stores.creation.getConcept("concept:book-1:v1:0")).toMatchObject({ status: "DISCARDED" });
  });

  it("saves an edited concept in place: new id, source edited, version bumped", async () => {
    await stores.creation.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [{ title: "A", pitch: "P1", emotionalGoal: "fun" as const, themeId: "space", readingLevel: "4-6" as const, approximateLengthPages: 8, charactersUsed: [], locale: "en-GB" as const, source: "model" as const }]
    });
    const edited: StoryConcept = {
      ...conceptStub(),
      id: "concept:book-1:v2:0",
      conceptVersion: 2,
      title: "Ava and the Pinch of Starlight",
      pitch: "Ava befriends a tiny star that has lost its glow.",
      source: "edited"
    };
    await stores.creation.saveConcept(edited);
    expect(await stores.creation.getConcept("concept:book-1:v2:0")).toEqual(edited);
    expect(await stores.creation.getConcept("concept:book-1:v1:0")).toMatchObject({ title: "A", source: "model" });
  });

  it("counts regenerations against the book budget", async () => {
    await stores.creation.saveBook(draftBook());
    expect(await stores.creation.regenerateCount("book-1")).toBe(0);
    await stores.creation.saveBook({ ...draftBook(), regenerateCount: 2 });
    expect(await stores.creation.regenerateCount("book-1")).toBe(2);
  });

  it("round-trips sessions and projects, resolving a project from its owner", async () => {
    const session = {
      anonymousProjectId: "anon-1",
      browserTokenHash: "hash-1",
      createdAt: "2026-09-25T10:00:00.000Z",
      lastSeenAt: "2026-09-25T10:00:00.000Z"
    };
    const project = {
      projectId: "project-1",
      owner: { kind: "anonymous" as const, anonymousProjectId: "anon-1" },
      childProfileIds: ["child-ava"],
      bookIds: ["book-1"],
      latestActivityAt: "2026-09-25T10:00:00.000Z"
    };
    await stores.sessions.saveProject(project);
    expect(await stores.sessions.getSession("anon-1")).toEqual(session);
    expect(await stores.sessions.getSessionByTokenHash("hash-1")).toEqual(session);
    expect(await stores.sessions.getProject("project-1")).toEqual(project);
    expect(await stores.sessions.getProjectByOwner("anon-1")).toEqual(project);
    expect(await stores.sessions.getProjectByOwner("anon-2")).toBeUndefined();
  });

  it("keeps the browser token hash unique so two sessions can never share a carrier", async () => {
    await expect(
      stores.sessions.createSession({ anonymousProjectId: "anon-2", browserTokenHash: "hash-1", createdAt: "t", lastSeenAt: "t" })
    ).rejects.toThrow();
  });

  it("refuses a book whose owning project does not exist (FK is real, not advisory)", async () => {
    await expect(stores.creation.saveBook(draftBook({ projectId: "project-ghost" }))).rejects.toThrow();
    await expect(stores.creation.saveBook(draftBook())).resolves.toBeUndefined();
  });
});

describe("api: postgres stores (connection-string helper)", () => {
  it("exposes the harness-provided test database url", () => {
    expect(testDatabaseUrl()).toMatch(/^postgres:\/\//);
  });
});

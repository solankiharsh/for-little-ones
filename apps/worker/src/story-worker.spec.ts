import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { AnonymousSessionService, createPool, createPostgresStores, NoopEventSink, StoryRunner } from "@for-little-ones/api";
import { PgBossDurableRuntime, type PgBossRuntimeOptions } from "@for-little-ones/execution";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { runOnce } from "./claim-loop";
import { clearExecutionLedger, resetFloTables } from "@for-little-ones/api/test-support";

const NOW = "2026-09-25T10:00:00.000Z";

const TEST_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "test-v1",
    childDataSent: true,
    childDataScope: ["name-derived display name"],
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

function fastOptions(): Partial<PgBossRuntimeOptions> {
  return {
    expireInSeconds: 4,
    superviseIntervalSeconds: 1,
    monitorIntervalSeconds: 1,
    maintenanceIntervalSeconds: 2,
    retryDelaySeconds: 1
  };
}

function allowAll(): ModerationProvider {
  return {
    card: { ...TEST_CARD, dataPolicy: { ...TEST_CARD.dataPolicy, childDataSent: false } },
    async screen() {
      return { verdict: "ALLOW", findings: [] };
    }
  };
}

interface Fixture {
  storyRuntime: PgBossDurableRuntime;
  defaultRuntime: PgBossDurableRuntime;
  runner: StoryRunner;
  bookId: string;
  anonymousProjectId: string;
}

async function fixture(): Promise<Fixture> {
  const connectionString = process.env.TEST_DATABASE_URL!;
  const pool = await resetFloTables();
  const stores = createPostgresStores(pool);
  await stores.init();

  const sessions = new AnonymousSessionService({
    store: stores.sessions,
    now: () => NOW,
    newId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  });
  const { session, project } = await sessions.startSession();
  await stores.creation.saveProfile({
    id: "child-ava",
    name: "Ava Solanki",
    displayName: "Ava",
    dateOfBirth: "2021-06-01",
    pronouns: "she",
    locale: "en-GB",
    interests: ["space"],
    facts: [],
    consent: { grantedAt: NOW, retentionClass: "default" },
    retentionClass: "default",
    relationshipIds: ["rel:self:child-ava"]
  });
  await stores.sessions.addToProject(project.projectId, { childProfileIds: ["child-ava"] });
  await stores.creation.saveBook({
    id: "book-1",
    status: "DRAFT",
    creationState: "THEME_SELECTED",
    metadata: { locale: "en-GB" },
    projectId: project.projectId,
    themeId: "space",
    themeSeedVersion: "2026-09-01T00:00:00.000Z",
    childProfileIds: ["child-ava"],
    characters: [],
    relationships: [{ id: "rel:self:child-ava", fromChildId: "child-ava", toChildId: "child-ava", kind: "self", name: "Ava", label: "Ava" }],
    pages: [],
    revisions: []
  });
  await stores.sessions.addToProject(project.projectId, { bookIds: ["book-1"] });
  await stores.creation.saveConcepts({
    bookId: "book-1",
    conceptVersion: 1,
    themeSeedVersion: "2026-09-01T00:00:00.000Z",
    concepts: [
      { title: "Ava and the Star", pitch: "Ava befriends a tiny star.", emotionalGoal: "bravery", themeId: "space", readingLevel: "4-6", approximateLengthPages: 8, charactersUsed: ["Ava"], locale: "en-GB", source: "model" }
    ]
  });
  await stores.creation.markConceptSelection("book-1", "concept:book-1:v1:0");
  const book = (await stores.creation.getBook("book-1"))!;
  await stores.creation.saveBook({ ...book, selectedConceptId: "concept:book-1:v1:0" });

  const storyRuntime = await new PgBossDurableRuntime({ connectionString, queue: "flo-story", deadLetterQueue: "flo-story-bad", ...fastOptions() }).init();
  const defaultRuntime = await new PgBossDurableRuntime({ connectionString, ...fastOptions() }).init();
  await clearExecutionLedger(pool);
  const storyProvider: Pick<StoryProvider, "generateOutline" | "generatePageText" | "card"> = {
    card: TEST_CARD,
    async generateOutline() {
      return {
        schemaVersion: "1" as const,
        title: "Ava and the Star",
        synopsis: "Ava befriends a tiny star.",
        emotionalGoal: "bravery",
        characters: [{ name: "Ava", role: "hero", facts: [] }],
        acts: [
          { title: "The beginning", summary: "Ava finds the dim star." },
          { title: "The end", summary: "The star glows; Ava heads home." }
        ],
        pageCount: 2
      };
    },
    async generatePageText(request) {
      return {
        schemaVersion: "1" as const,
        pageKey: request.pageKey,
        pageNumber: request.pageNumber,
        textBlocks: [{ id: `b${request.pageNumber}`, kind: "paragraph" as const, text: `Ava turned to adventure ${request.pageNumber} bravely.` }],
        illustrationCue: `Ava on page ${request.pageNumber}`,
        locale: request.locale
      };
    }
  };
  const runner = new StoryRunner({
    runtime: storyRuntime,
    store: stores.creation,
    storyProvider,
    moderation: allowAll(),
    events: new NoopEventSink(),
    getFactsForStory: async () => [],
    assertProjectAccess: (anon, projectId) => sessions.assertCanAccessProject(anon, projectId),
    now: () => NOW
  });

  return { storyRuntime, defaultRuntime, runner, bookId: "book-1", anonymousProjectId: session.anonymousProjectId };
}

async function drain(runner: StoryRunner, runtime: PgBossDurableRuntime, rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    const outcomes = await runOnce({ runtime, runner, workerId: "story-worker-1", leaseForMs: 30_000 });
    if (outcomes.length === 0) return;
  }
}

describe("worker: story claim loop (F-008 §9, D029)", () => {
  afterAll(async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await clearExecutionLedger(pool).catch(() => {});
    await pool.end();
  });

  it("runs outline then pages to READY through the shared claim loop", async () => {
    const f = await fixture();
    try {
      await f.runner.requestStory({ bookId: f.bookId, anonymousProjectId: f.anonymousProjectId });
      await drain(f.runner, f.storyRuntime);
      const status = await f.runner.storyStatus(f.bookId);
      expect(status.story?.status).toBe("READY");
      expect(status.pages).toHaveLength(2);
      expect(status.pages.every((page) => page.status === "READY")).toBe(true);
      expect(status.pages[0]?.textBlocks[0]?.text).toContain("Ava");
    } finally {
      await f.storyRuntime.close();
      await f.defaultRuntime.close();
    }
  }, 90_000);

  it("never touches units on another queue (concept-loop misclaim regression)", async () => {
    const f = await fixture();
    try {
      // A foreign unit on the DEFAULT queue shaped like the live incident: the
      // concept loop once claimed story pages as THEME_MISSING. Queue separation
      // means the story loop cannot even see it.
      await f.defaultRuntime.enqueue({
        operationKey: "foreign:concept-bundle",
        units: [{ unitKey: "concept-bundle", maxAttempts: 1, payload: { bookId: "book-1", conceptVersion: 1 } }]
      });
      await f.runner.requestStory({ bookId: f.bookId, anonymousProjectId: f.anonymousProjectId });
      await drain(f.runner, f.storyRuntime);
      expect((await f.runner.storyStatus(f.bookId)).story?.status).toBe("READY");
      const foreign = await f.defaultRuntime.job("foreign:concept-bundle");
      expect(foreign?.status).toBe("QUEUED");
      expect(foreign?.units[0]?.attempts).toBe(0);
    } finally {
      await f.storyRuntime.close();
      await f.defaultRuntime.close();
    }
  }, 90_000);
});

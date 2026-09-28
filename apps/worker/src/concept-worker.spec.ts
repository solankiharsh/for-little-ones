import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { AnonymousSessionService, ConceptBundleRunner, createPool, createPostgresStores, NoopEventSink } from "@for-little-ones/api";
import { PgBossDurableRuntime, type PgBossRuntimeOptions } from "@for-little-ones/execution";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { runOnce } from "./concept-worker";
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

const GOOD = {
  schemaVersion: "1" as const,
  concepts: [0, 1, 2].map((i) => ({
    title: `Ava and the Star ${i}`,
    pitch: `Ava befriends a tiny star with number ${i} that has lost its glow and helps it shine again.`,
    emotionalGoal: "bravery" as const,
    themeId: "space",
    readingLevel: "4-6" as const,
    approximateLengthPages: 8,
    charactersUsed: ["Ava"]
  }))
};

function allowAll(): ModerationProvider {
  return {
    card: { ...TEST_CARD, dataPolicy: { ...TEST_CARD.dataPolicy, childDataSent: false } },
    async screen() {
      return { verdict: "ALLOW", findings: [] };
    }
  };
}

function fastRuntime(connectionString: string): PgBossDurableRuntime {
  // Fast lease/retry so the loop is exercised in seconds, still on a real pg-boss.
  const options: Partial<PgBossRuntimeOptions> = {
    expireInSeconds: 4,
    superviseIntervalSeconds: 1,
    monitorIntervalSeconds: 1,
    // pg-boss promotes a `retry`-state job back to fetchable from its monitor /
    // maintenance pass, so both intervals are short here or the retry would not be
    // claimable inside the test.
    maintenanceIntervalSeconds: 2,
    retryDelaySeconds: 1
  };
  return new PgBossDurableRuntime({ connectionString, ...options });
}

interface Fixture {
  runtime: PgBossDurableRuntime;
  runner: ConceptBundleRunner;
  store: ReturnType<typeof createPostgresStores>["creation"];
  bookId: string;
  anonymousProjectId: string;
  generate: { calls: number };
}

async function fixture(options: { fail?: boolean } = {}): Promise<Fixture> {
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
    characters: [{ id: "cb-1", characterId: "child-ava", version: "v1", name: "Ava", styleTokensRef: "tokens://ava" }],
    relationships: [{ id: "rel:self:child-ava", fromChildId: "child-ava", toChildId: "child-ava", kind: "self", name: "Ava", label: "Ava" }],
    pages: [],
    revisions: []
  });
  await stores.sessions.addToProject(project.projectId, { bookIds: ["book-1"] });

  const runtime = await fastRuntime(connectionString).init();
  // After init(): pg-boss only creates its schema then, and a stale ledger row would
  // dedupe this test's enqueue because the operation key is the same book + version.
  await clearExecutionLedger(pool);
  const generate = { calls: 0 };
  const storyProvider: Pick<StoryProvider, "generateConcepts" | "card"> = {
    card: TEST_CARD,
    async generateConcepts() {
      generate.calls += 1;
      if (options.fail) throw new Error("vendor unreachable");
      return GOOD;
    }
  };
  const runner = new ConceptBundleRunner({
    runtime,
    store: stores.creation,
    storyProvider,
    moderation: allowAll(),
    events: new NoopEventSink(),
    getFactsForStory: async () => [],
    assertProjectAccess: (anon, projectId) => sessions.assertCanAccessProject(anon, projectId),
    now: () => NOW
  });

  return { runtime, runner, store: stores.creation, bookId: "book-1", anonymousProjectId: session.anonymousProjectId, generate };
}

describe("worker: concept claim loop (D024 §6)", () => {
  afterAll(async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await clearExecutionLedger(pool).catch(() => {});
    await pool.end();
  });

  it("claims a queued unit and lands the bundle in Postgres", async () => {
    const f = await fixture();
    const job = await f.runner.requestBundle({
      bookId: f.bookId,
      conceptVersion: 1,
      anonymousProjectId: f.anonymousProjectId
    });
    expect(job.status).toBe("QUEUED");

    const outcomes = await runOnce({ runtime: f.runtime, runner: f.runner, workerId: "worker-1", leaseForMs: 30_000 });
    expect(outcomes).toHaveLength(1);
    expect((outcomes[0] as { ok: string }).ok).toBe("leased");

    const settled = await f.runtime.job(f.runner.operationKey(f.bookId, 1));
    expect(settled?.status).toBe("SUCCEEDED");
    const saved = await f.store.listConceptsByBook(f.bookId);
    expect(saved).toHaveLength(3);
    expect(saved.every((c) => c.source === "model" && c.status === "PROPOSED")).toBe(true);
    await f.runtime.close();
  }, 60_000);

  it("retries the model path, then dead-letters the exhausted unit without persisting a bundle", async () => {
    const f = await fixture({ fail: true });
    await f.runner.requestBundle({ bookId: f.bookId, conceptVersion: 1, anonymousProjectId: f.anonymousProjectId });

    // maxAttempts = 3 (D024 §7): two retries, then a non-retryable exhaustive failure.
    // pg-boss parks a retryable failure in READY for `retryDelaySeconds` before it is
    // claimable again, so poll each attempt until the lease lands rather than assuming
    // a fixed monitor cadence.
    const outcomes: unknown[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const deadline = Date.now() + 20_000;
      for (;;) {
        outcomes.push(...(await runOnce({ runtime: f.runtime, runner: f.runner, workerId: "worker-1", leaseForMs: 30_000 })));
        if (outcomes.filter((o) => (o as { ok: string }).ok === "leased").length === attempt + 1) break;
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      expect(outcomes.filter((o) => (o as { ok: string }).ok === "leased")).toHaveLength(attempt + 1);
    }
    const settled = await f.runtime.job(f.runner.operationKey(f.bookId, 1));
    expect(settled?.units[0]?.status).toBe("DEAD");
    expect(settled?.units[0]?.lastFailure?.code).toBe("CONCEPT_GENERATION_EXHAUSTED");
    expect(settled?.units[0]?.lastFailure?.retryable).toBe(false);
    expect(f.generate.calls).toBe(3);
    // F-007 §9: the API serves the fallback; the worker persists nothing.
    expect(await f.store.listConceptsByBook(f.bookId)).toHaveLength(0);
    await f.runtime.close();
  }, 90_000);

  it("returns empty and claims nothing when the queue is idle", async () => {
    const f = await fixture();
    const outcomes = await runOnce({ runtime: f.runtime, runner: f.runner, workerId: "worker-1", leaseForMs: 30_000 });
    expect(outcomes).toEqual([]);
    await f.runtime.close();
  }, 60_000);

  it("stops on abort without claiming further work", async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort();
    expect(await runOnce({ runtime: f.runtime, runner: f.runner, workerId: "worker-1", leaseForMs: 30_000 }, { signal: controller.signal })).toEqual([]);
    await f.runtime.close();
  }, 60_000);

  it("fails a unit non-retryably when the project is gone, rather than generating", async () => {
    const f = await fixture();
    await f.runner.requestBundle({ bookId: f.bookId, conceptVersion: 1, anonymousProjectId: f.anonymousProjectId });
    // The `flo_books.project_id` foreign key is real, so "the session no longer owns
    // this project" is produced by dropping the session row: the runner's own guard
    // must then stop the unit before any provider spend.
    const pool = createPool(process.env.TEST_DATABASE_URL);
    await pool.query("DELETE FROM flo_sessions WHERE anonymous_project_id = $1", [f.anonymousProjectId]);
    await pool.end();

    // The loop must survive it: a leaked lease here would stall the whole queue.
    const outcomes = await runOnce({ runtime: f.runtime, runner: f.runner, workerId: "worker-1", leaseForMs: 30_000 });
    expect(outcomes).toHaveLength(1);
    // A non-retryable failure dead-letters the unit rather than parking it for retry:
    // the request can never become authorised again.
    const settled = await f.runtime.job(f.runner.operationKey(f.bookId, 1));
    expect(settled?.units[0]?.status).toBe("DEAD");
    expect(settled?.units[0]?.lastFailure?.code).toBe("PROJECT_ACCESS_DENIED");
    expect(settled?.units[0]?.lastFailure?.retryable).toBe(false);
    expect(f.generate.calls).toBe(0);
    const stored = await f.store.listConceptsByBook(f.bookId);
    expect(stored).toHaveLength(0);
    await f.runtime.close();
  }, 60_000);
});

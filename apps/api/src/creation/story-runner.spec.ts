import { describe, expect, it } from "vitest";
import type { PageTextResult, StoryOutlineResult } from "@for-little-ones/contracts";
import { InMemoryDurableRuntime } from "@for-little-ones/execution";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { StoryRunner, factsVersionFor, pageKeyFor } from "../../src/creation/story-runner";
import { MemoryEventSink } from "../../src/analytics/event-sink";
import { conceptStub, confirmedFact, NOW, seededStore, type Seeded } from "../testing/fixtures";

const TEST_PROVIDER_CARD: ProviderCard = {
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

function outlineResult(): StoryOutlineResult {
  return {
    schemaVersion: "1",
    title: "Ava and the Pinch of Starlight",
    synopsis: "Ava befriends a tiny star that has lost its glow.",
    emotionalGoal: "kindness",
    characters: [{ name: "Ava", role: "hero", facts: [] }],
    acts: [
      { title: "The beginning", summary: "Ava finds the dim star." },
      { title: "The middle", summary: "Ava carries the star uphill." },
      { title: "The end", summary: "The star glows; Ava heads home." }
    ],
    pageCount: 6
  };
}

function pageResult(pageNumber: number, pageKey: string): PageTextResult {
  return {
    schemaVersion: "1",
    pageKey,
    pageNumber,
    textBlocks: [{ id: `block-${pageNumber}`, kind: "paragraph", text: `Ava turned to adventure ${pageNumber} with a brave small smile.` }],
    illustrationCue: `Ava on page ${pageNumber}, warm soft light`,
    locale: "en-GB"
  };
}

function screenAll(verdict: "ALLOW" | "BLOCK" | "FLAG"): ModerationProvider {
  return {
    card: TEST_PROVIDER_CARD,
    async screen() {
      return { verdict, findings: verdict === "ALLOW" ? [] : ["test finding"] };
    }
  };
}

function providerStub(options: { failOutline?: boolean; failPages?: boolean } = {}): Pick<StoryProvider, "generateOutline" | "generatePageText"> {
  return {
    async generateOutline() {
      if (options.failOutline) throw new Error("vendor unreachable");
      return outlineResult();
    },
    async generatePageText(request) {
      if (options.failPages) throw new Error("vendor unreachable");
      return pageResult(request.pageNumber, request.pageKey);
    }
  };
}

function runner(
  seed: Seeded,
  storyProvider: Pick<StoryProvider, "generateOutline" | "generatePageText">,
  moderation: ModerationProvider,
  assertProjectAccess: (id: string, projectId: string) => Promise<unknown> = async () => undefined
) {
  const runtime = new InMemoryDurableRuntime();
  const events = new MemoryEventSink();
  const service = new StoryRunner({
    runtime,
    store: seed.store,
    storyProvider: { ...storyProvider, card: TEST_PROVIDER_CARD },
    moderation,
    events,
    getFactsForStory: async () => [confirmedFact()],
    assertProjectAccess,
    now: () => NOW
  });
  return { service, runtime, events };
}

const PROJECT = "project-1";

async function storyWithConcept(seed: Seeded) {
  await seed.store.saveConcepts({
    bookId: "book-1",
    conceptVersion: 1,
    themeSeedVersion: "2026-09-25T00:00:00.000Z",
    concepts: [conceptStub(), conceptStub({ title: "Second idea" }), conceptStub({ title: "Third idea" })]
  });
  await seed.store.markConceptSelection("book-1", "concept:book-1:v1:0");
  seed.book.selectedConceptId = "concept:book-1:v1:0";
  await seed.store.saveBook(seed.book);
}

const requestStory = (service: StoryRunner) =>
  service.requestStory({ bookId: "book-1", anonymousProjectId: PROJECT });

async function drainPages(service: StoryRunner, rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    const outcomes = await service.runNext("worker-1", 8);
    if (outcomes.length === 0) return;
  }
}

describe("api: story runner (F-008 durable pipeline on D019)", () => {
  it("runs outline then all six pages to READY with one story_generated event", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    const { service, events } = runner(seed, providerStub(), screenAll("ALLOW"));

    const job = await requestStory(service);
    expect(job.status).toBe("QUEUED");

    await service.runNext("worker-1");
    const afterOutline = await service.storyStatus("book-1");
    expect(afterOutline.story?.status).toBe("OUTLINE_READY");
    expect(afterOutline.story?.outline?.title).toBe("Ava and the Pinch of Starlight");
    expect(afterOutline.pages).toHaveLength(6);
    expect(afterOutline.pages.every((page) => page.status === "PENDING")).toBe(true);

    await drainPages(service);
    const done = await service.storyStatus("book-1");
    expect(done.story?.status).toBe("READY");
    expect(done.pages).toHaveLength(6);
    expect(done.pages.every((page) => page.status === "READY")).toBe(true);
    expect(done.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(done.pages[0]?.textBlocks[0]?.text).toContain("Ava");
    expect(events.events.map((event) => event.name)).toContain("story_generated");
  });

  it("re-requesting a READY story at the same factsVersion is a no-op", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    const { service, runtime } = runner(seed, providerStub(), screenAll("ALLOW"));
    await requestStory(service);
    await service.runNext("worker-1");
    await drainPages(service);
    expect((await service.storyStatus("book-1")).story?.status).toBe("READY");

    const again = await requestStory(service);
    expect(again.status).toBe("SUCCEEDED");
    expect((await service.storyStatus("book-1")).pages).toHaveLength(6);
    void runtime;
  });

  it("refuses without a selected concept", async () => {
    const seed = await seededStore();
    const { service } = runner(seed, providerStub(), screenAll("ALLOW"));
    await expect(requestStory(service)).rejects.toThrow(/no selected concept/);
  });

  it("exhausts the outline path non-retryably and marks the story FAILED", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    const { service, runtime, events } = runner(seed, providerStub({ failOutline: true }), screenAll("ALLOW"));
    await requestStory(service);
    await service.runNext("worker-1");
    await service.runNext("worker-1");
    const exhausted = await service.runNext("worker-1");
    expect(exhausted[0]?.ok).toBe("leased");
    const final = await runtime.job(service.outlineKey("book-1", 1));
    expect(final?.units[0]?.status).toBe("DEAD");
    expect(final?.units[0]?.lastFailure?.code).toBe("STORY_OUTLINE_EXHAUSTED");
    expect(final?.units[0]?.lastFailure?.retryable).toBe(false);
    expect((await service.storyStatus("book-1")).story?.status).toBe("FAILED");
    expect(events.events.map((event) => event.name)).toContain("outline_failed");
  });

  it("isolates a blocked page: siblings land READY, the story never flips", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    let calls = 0;
    const { service } = runner(
      seed,
      {
        async generateOutline() {
          return outlineResult();
        },
        async generatePageText(request) {
          calls += 1;
          if (request.pageNumber === 6) throw new Error("vendor unreachable");
          return pageResult(request.pageNumber, request.pageKey);
        }
      },
      screenAll("ALLOW")
    );
    await requestStory(service);
    await service.runNext("worker-1");
    for (let i = 0; i < 6; i += 1) await service.runNext("worker-1", 8);
    const status = await service.storyStatus("book-1");
    expect(status.pages.filter((page) => page.status === "READY")).toHaveLength(5);
    expect(status.pages.find((page) => page.pageNumber === 6)?.status).toBe("FAILED");
    expect(status.story?.status).toBe("OUTLINE_READY");
    expect(calls).toBeGreaterThanOrEqual(8);
  });

  it("rewrites one page under a new attempt key, overwriting the same pageKey", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    let text = "first telling";
    const { service } = runner(
      seed,
      {
        async generateOutline() {
          return outlineResult();
        },
        async generatePageText(request) {
          return { ...pageResult(request.pageNumber, request.pageKey), textBlocks: [{ id: "b", kind: "paragraph", text }] };
        }
      },
      screenAll("ALLOW")
    );
    await requestStory(service);
    await service.runNext("worker-1");
    await drainPages(service);
    const before = await seed.store.getPage((await service.storyStatus("book-1")).pages[1]!.pageKey);
    expect(before?.attemptCount).toBe(1);

    text = "second telling, kinder";
    const regen = await service.requestPageRegen({ bookId: "book-1", pageNumber: 2, anonymousProjectId: PROJECT });
    expect(regen.operationKey).toContain(":r2");
    await drainPages(service);
    const after = await seed.store.getPage(before!.pageKey);
    expect(after?.status).toBe("READY");
    expect(after?.attemptCount).toBe(2);
    expect(after?.textBlocks[0]?.text).toBe("second telling, kinder");
    expect((await service.storyStatus("book-1")).pages).toHaveLength(6);
  });

  it("records FLAG verdicts as events instead of dropping them", async () => {
    const seed = await seededStore();
    await storyWithConcept(seed);
    const { service, events } = runner(seed, providerStub(), screenAll("FLAG"));
    await requestStory(service);
    await service.runNext("worker-1");
    await drainPages(service);
    expect((await service.storyStatus("book-1")).story?.status).toBe("READY");
    expect(events.events.filter((event) => event.name === "page_text_flagged")).toHaveLength(6);
  });

  it("derives stable facts versions and page keys", () => {
    const facts = [confirmedFact()];
    expect(factsVersionFor(facts)).toBe(factsVersionFor([confirmedFact()]));
    expect(factsVersionFor([confirmedFact({ id: "fact-2" })])).not.toBe(factsVersionFor(facts));
    const key = { bookId: "book-1", conceptVersion: 1, pageNumber: 2, factsVersion: "abc", locale: "en-GB" };
    expect(pageKeyFor(key)).toBe(pageKeyFor({ ...key }));
    expect(pageKeyFor({ ...key, pageNumber: 3 })).not.toBe(pageKeyFor(key));
  });
});

import { describe, expect, it } from "vitest";
import type { ConceptRequest, ConceptResult } from "@for-little-ones/contracts";
import { InMemoryDurableRuntime, type LeaseHeldResult, type LeaseRefusedResult } from "@for-little-ones/execution";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { ConceptBundleRunner, CONCEPT_BUNDLE_OP, CONCEPT_BUNDLE_UNIT } from "../../src/creation/concept-bundle-runner";
import { MemoryEventSink } from "../../src/analytics/event-sink";
import { conceptStub, confirmedFact, draftBook, NOW, seededStore, type Seeded } from "../testing/fixtures";

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

function conceptResult(overrides: Partial<ConceptResult["concepts"][number]> = {}): ConceptResult {
  const base: ConceptResult["concepts"][number] = {
    title: "Ava and the Pinch of Starlight",
    pitch: "Ava befriends a tiny star that has lost its glow and helps it shine again.",
    emotionalGoal: "curiosity",
    themeId: "space",
    readingLevel: "4-6",
    approximateLengthPages: 8,
    charactersUsed: ["Ava"]
  };
  return {
    schemaVersion: "1",
    concepts: [
      { ...base, ...overrides, title: overrides.title ?? "Ava and the Pinch of Starlight" },
      { ...base, ...overrides, title: overrides.title ?? "Ava's Brave Little Voyage", emotionalGoal: "bravery" },
      { ...base, ...overrides, title: overrides.title ?? "The Kindest Thing Ava Did", emotionalGoal: "kindness" }
    ]
  };
}

function allowAll(verdict: "ALLOW" | "BLOCK" | "FLAG"): ModerationProvider {
  return {
    card: {
      dataPolicy: {
        verifiedAt: "2026-09-22",
        policyVersion: "v1",
        childDataSent: false,
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
    },
    async screen() {
      return { verdict, findings: [] };
    }
  };
}

function failingProvider(): Pick<StoryProvider, "generateConcepts"> {
  return {
    async generateConcepts(_request: ConceptRequest): Promise<ConceptResult> {
      throw new Error("vendor unreachable");
    }
  };
}

function runner(
  seed: Seeded,
  storyProvider: Pick<StoryProvider, "generateConcepts">,
  moderation: ModerationProvider,
  assertProjectAccess: (id: string, projectId: string) => Promise<unknown> = async () => undefined
) {
  const runtime = new InMemoryDurableRuntime();
  const events = new MemoryEventSink();
  const service = new ConceptBundleRunner({
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
const requestBundle = (service: ConceptBundleRunner, bookId = "book-1") =>
  service.requestBundle({ bookId, conceptVersion: 1, anonymousProjectId: PROJECT });

describe("api: concept bundle runner (F-007 §9 durable step on D019)", () => {
  it("enqueues one idempotent unit keyed by (book, version)", async () => {
    const seed = await seededStore();
    const { service, runtime } = runner(seed, { async generateConcepts() { return conceptResult(); } }, allowAll("ALLOW"));
    const job = await requestBundle(service);
    expect(job.status).toBe("QUEUED");
    expect(job.units).toHaveLength(1);
    expect(job.units[0]?.unitKey).toBe(CONCEPT_BUNDLE_UNIT);

    const again = await requestBundle(service);
    expect(again.operationKey).toBe(job.operationKey);
    expect((await runtime.job(service.operationKey("book-1", 1)))?.units[0]?.unitId).toBe(job.units[0]?.unitId);
  });

  it("guards the durable step to the owning session (F-001 §8)", async () => {
    const seed = await seededStore();
    const { service } = runner(
      seed,
      { async generateConcepts() { throw new Error("never called"); } },
      allowAll("ALLOW"),
      async () => {
        throw new Error("session does not own project: project-1");
      }
    );
    await expect(requestBundle(service)).rejects.toThrow(/does not own project/u);
    expect(await seed.store.listConceptsByBook("book-1")).toHaveLength(0);
  });

  it("runs the model path and completes the unit with source 'model' concepts", async () => {
    const seed = await seededStore();
    const provider = { async generateConcepts() { return conceptResult(); } };
    const { service, runtime, events } = runner(seed, provider, allowAll("ALLOW"));
    await requestBundle(service);
    const outcomes = await service.runNext("worker-1");
    expect((outcomes[0] as LeaseHeldResult).ok).toBe("leased");

    const job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.status).toBe("SUCCEEDED");
    const output = job?.units[0]?.output as { kind: string; source: string; concepts: unknown[] };
    expect(output.kind).toBe(CONCEPT_BUNDLE_OP);
    expect(output.source).toBe("model");
    expect(output.concepts).toHaveLength(3);

    const saved = await seed.store.listConceptsByBook("book-1");
    expect(saved).toHaveLength(3);
    expect(saved.every((c) => c.source === "model" && c.status === "PROPOSED")).toBe(true);
    expect(events.events.some((e) => e.name === "concepts.generated" && e.attributes.source === "model")).toBe(true);
  });

  it("exhausts with a non-retryable CONCEPT_GENERATION_EXHAUSTED after the model path fails twice (F-007 §9 fallback is API-served)", async () => {
    const seed = await seededStore();
    const { service, runtime, events } = runner(seed, failingProvider(), allowAll("ALLOW"));
    await requestBundle(service);

    const first = await service.runNext("worker-1");
    expect(first[0]?.ok).toBe("leased");
    let job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.units[0]?.status).toBe("FAILED");
    expect(job?.units[0]?.lastFailure?.retryable).toBe(true);

    const second = await service.runNext("worker-1");
    expect(second[0]?.ok).toBe("leased");
    job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.units[0]?.status).toBe("FAILED");
    expect(job?.units[0]?.lastFailure?.code).toBe("CONCEPT_GENERATION_FAILED");

    const third = await service.runNext("worker-1");
    expect(third[0]?.ok).toBe("leased");
    job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.units[0]?.status).toBe("DEAD");
    expect(job?.units[0]?.lastFailure?.code).toBe("CONCEPT_GENERATION_EXHAUSTED");
    expect(job?.units[0]?.lastFailure?.retryable).toBe(false);

    // No catalogue bundle was persisted by the worker — the API serves it (F-007 §9).
    expect(await seed.store.listConceptsByBook("book-1")).toHaveLength(0);
    expect(events.events.some((e) => e.name === "concepts.generated")).toBe(false);
  });

  it("treats a moderation BLOCK as a failed model path and exhausts (no second worker pass)", async () => {
    const seed = await seededStore();
    const { service, runtime } = runner(seed, { async generateConcepts() { return conceptResult(); } }, allowAll("BLOCK"));
    await requestBundle(service);
    await service.runNext("worker-1");
    await service.runNext("worker-1");
    const exhausted = await service.runNext("worker-1");
    expect(exhausted[0]?.ok).toBe("leased");
    const final = await runtime.job(service.operationKey("book-1", 1));
    expect(final?.units[0]?.status).toBe("DEAD");
    expect(final?.units[0]?.lastFailure?.code).toBe("CONCEPT_GENERATION_EXHAUSTED");
    expect(final?.units[0]?.lastFailure?.retryable).toBe(false);
  });

  it("fails a unit outright (non-retryable) when the book has disappeared", async () => {
    const seed = await seededStore();
    const { service, runtime } = runner(seed, { async generateConcepts() { return conceptResult(); } }, allowAll("ALLOW"));
    await runtime.enqueue({
      operationKey: service.operationKey("book-missing", 1),
      units: [
        {
          unitKey: CONCEPT_BUNDLE_UNIT,
          maxAttempts: 2,
          payload: { bookId: "book-missing", conceptVersion: 1, themeId: "space", themeSeedVersion: "v", childProfileId: "child-ava" }
        }
      ]
    });
    await service.runNext("worker-1");
    const final = await runtime.job(service.operationKey("book-missing", 1));
    expect(final?.units[0]?.status).toBe("DEAD");
    expect(final?.units[0]?.lastFailure?.code).toBe("BOOK_NOT_FOUND");
    expect(final?.units[0]?.lastFailure?.retryable).toBe(false);
  });

  it("requires a theme before a bundle can be requested", async () => {
    const seed = await seededStore();
    const { service } = runner(seed, { async generateConcepts() { return conceptResult(); } }, allowAll("ALLOW"));
    const { themeId: _t, themeSeedVersion: _s, ...rest } = draftBook({ id: "book-no-theme" });
    await seed.store.saveBook({ ...rest, id: "book-no-theme" });
    await expect(requestBundle(service, "book-no-theme")).rejects.toThrow(/no theme/u);
    await expect(requestBundle(service)).resolves.toMatchObject({ status: "QUEUED" });
  });

  it("exhausts (non-retryable) when the vendor output fails structural validation (F-007 §11 guard)", async () => {
    const seed = await seededStore();
    const { service, runtime } = runner(
      seed,
      { async generateConcepts() { return conceptResult({ charactersUsed: ["Ghost"], title: "Same" }); } },
      allowAll("ALLOW")
    );
    await requestBundle(service);
    await service.runNext("worker-1");
    await service.runNext("worker-1");
    await service.runNext("worker-1");
    const final = await runtime.job(service.operationKey("book-1", 1));
    expect(final?.units[0]?.status).toBe("DEAD");
    expect(final?.units[0]?.lastFailure?.code).toBe("CONCEPT_GENERATION_EXHAUSTED");
    expect(await seed.store.listConceptsByBook("book-1")).toHaveLength(0);
  });

  it("resumes an existing PROPOSED bundle for (book, version) instead of regenerating (F-007 §9 resumability)", async () => {
    const seed = await seededStore();
    let providerCalls = 0;
    const { service, runtime } = runner(
      seed,
      {
        async generateConcepts() {
          providerCalls += 1;
          return conceptResult();
        }
      },
      allowAll("ALLOW")
    );
    await seed.store.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [conceptStub({ title: "The Rocket Made of Cardboard" })]
    });
    await requestBundle(service);
    await service.runNext("worker-1");

    const job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.status).toBe("SUCCEEDED");
    const output = job?.units[0]?.output as { source: string; concepts: Array<{ title: string; source: string }> };
    expect(output.source).toBe("model");
    expect(output.concepts).toEqual([expect.objectContaining({ title: "The Rocket Made of Cardboard" })]);
    expect(providerCalls).toBe(0);
    // No second bundle was appended.
    expect(await seed.store.listConceptsByBook("book-1")).toHaveLength(1);
  });

  it("never resumes an API-served fallback bundle as a model bundle — the job replaces it (F-007 §9/§7 source honesty)", async () => {
    const seed = await seededStore();
    let providerCalls = 0;
    const { service, runtime } = runner(
      seed,
      {
        async generateConcepts() {
          providerCalls += 1;
          return conceptResult();
        }
      },
      allowAll("ALLOW")
    );
    await seed.store.saveConcepts({
      bookId: "book-1",
      conceptVersion: 1,
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      concepts: [conceptStub({ source: "fallback", title: "The Rocket Made of Cardboard" })]
    });
    await requestBundle(service);
    await service.runNext("worker-1");

    const job = await runtime.job(service.operationKey("book-1", 1));
    expect(job?.status).toBe("SUCCEEDED");
    const output = job?.units[0]?.output as { source: string; concepts: Array<{ title: string; source: string }> };
    expect(output.source).toBe("model");
    expect((output.concepts as { source: string }[]).every((c) => c.source === "model")).toBe(true);
    expect(providerCalls).toBe(1);
    const saved = await seed.store.listConceptsByBook("book-1");
    expect(saved).toHaveLength(3);
    expect(saved.every((c) => c.source === "model")).toBe(true);
  });
});
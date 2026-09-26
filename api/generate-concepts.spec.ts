import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackConcepts, normaliseConcepts, default as generateConcepts } from "./generate-concepts";

describe("story concept policy", () => {
  it("accepts exactly three distinct age-banded concepts", () => {
    const concepts = normaliseConcepts([
      { title: "Milo and the Quiet Comet", pitch: "Milo helps a shy comet find its way home.", emotionalGoal: "kindness", tone: "gentle" },
      { title: "The Pocket-Sized Planet", pitch: "Milo discovers a tiny world that needs a careful explorer.", emotionalGoal: "curiosity", tone: "wonder" },
      { title: "The Starry Scarf", pitch: "Milo's red scarf catches a starlight message from far away.", emotionalGoal: "confidence", tone: "adventure" }
    ], 6);

    expect(concepts).toHaveLength(3);
    expect(new Set(concepts?.map((concept) => concept.title.toLowerCase())).size).toBe(3);
    expect(concepts?.every((concept) => concept.readingLevel === "4-6")).toBe(true);
  });

  it("rejects duplicate or unsafe concepts", () => {
    const duplicate = { title: "Same idea", pitch: "A safe little story.", emotionalGoal: "kindness", tone: "gentle" };
    expect(normaliseConcepts([duplicate, duplicate, duplicate], 5)).toBeNull();
    expect(normaliseConcepts([
      { ...duplicate, title: "One", pitch: "A child finds a gun." },
      { ...duplicate, title: "Two" },
      { ...duplicate, title: "Three" }
    ], 5)).toBeNull();
  });

  it("always offers three authored fallback ideas", () => {
    const concepts = fallbackConcepts({ childName: "Milo", age: 6, world: "Big imagination", favourites: ["Space"] });
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.source === "fallback")).toBe(true);
  });
});

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText, Output: { object: () => ({}) } }));

const request = {
  childName: "Milo",
  age: 6,
  world: "Bedtime wonder",
  favourites: ["Space"],
  detail: "Carries a red scarf",
  projectId: "project_1234",
  revisionId: "revision_1234",
  ownerToken: "ab".repeat(32)
};

async function withCreationService(project: Record<string, unknown>, run: () => Promise<Response>) {
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string }) => {
    const path = String(url).replace("https://creation.test", "");
    paths.push(`${init.method} ${path}`);
    if (init.method === "GET") return Response.json(project);
    return Response.json({ jobId: "job_1234" }, { status: 201 });
  }));
  try {
    return { response: await run(), paths };
  } finally {
    vi.unstubAllGlobals();
  }
}

function post() {
  return new Request("https://example.test/api/generate-concepts", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request)
  });
}

beforeEach(() => {
  process.env.CREATION_API_URL = "https://creation.test";
  process.env.VITE_MEDUSA_PUBLISHABLE_KEY = "pk_test";
});
afterEach(() => { vi.unstubAllGlobals(); generateText.mockReset(); });

describe("concept generation authorisation", () => {
  it("refuses a revoked purchase before enqueueing or generating", async () => {
    const { response, paths } = await withCreationService(
      { paymentState: "refunded", generation: { assetsGenerated: 0, conceptAttempts: 0 } },
      () => generateConcepts.fetch(post())
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Payment entitlement is not active." });
    expect(paths.some((path) => path.includes("concept-jobs"))).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses once the idea allowance is spent, whatever the browser claims", async () => {
    const { response } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, conceptAttempts: 3 } },
      () => generateConcepts.fetch(post())
    );

    expect(response.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("enqueues within the allowance", async () => {
    generateText.mockResolvedValue({ output: { concepts: [] }, usage: {} });
    const { response, paths } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, conceptAttempts: 2 } },
      () => generateConcepts.fetch(post())
    );

    expect(response.status).toBe(200);
    expect(paths).toContain("POST /store/flo/projects/project_1234/concept-jobs");
  });
});

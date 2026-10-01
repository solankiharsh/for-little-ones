import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackConcepts, normaliseConcepts, POST as generateConcepts } from "./generate-concepts";

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

  it("rejects a bundle that is not three distinct concepts", () => {
    const duplicate = { title: "Same idea", pitch: "A safe little story.", emotionalGoal: "kindness", tone: "gentle" };
    expect(normaliseConcepts([duplicate, duplicate, duplicate], 5)).toBeNull();
    expect(normaliseConcepts([
      { ...duplicate, title: "One" },
      { ...duplicate, title: "Two" },
      { ...duplicate, title: "Three" }
    ], 5)).toHaveLength(3);
  });

  /**
   * Safety is no longer a regex inside normalisation — `PolicyTextModerationProvider`
   * is the single source of truth, and the handler refuses to persist a bundle it
   * has not screened. Duplicating a term list here would be a second source of truth.
   */
  it("does not screen for safety itself", () => {
    const concepts = normaliseConcepts([
      { title: "One", pitch: "A child finds a gun in the garden shed.", emotionalGoal: "kindness", tone: "gentle" },
      { title: "Two", pitch: "A child finds a hat on the garden shed.", emotionalGoal: "kindness", tone: "gentle" },
      { title: "Three", pitch: "A child finds a key on the garden shed.", emotionalGoal: "kindness", tone: "gentle" }
    ], 5);
    expect(concepts).toHaveLength(3);
  });

  it("always offers three authored fallback ideas", () => {
    const concepts = fallbackConcepts({ childName: "Milo", age: 6, world: "Big imagination", favourites: ["Space"] });
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.source === "fallback")).toBe(true);
  });

  it("offers fallback ideas for any valid input rather than asserting they exist", () => {
    // A name that trips the safety rules must still produce a bundle: the authored
    // copy is pre-approved and bypasses moderation, so a total function is required.
    for (const childName of ["Milo", "Gunny", "Killer", ""]) {
      const concepts = fallbackConcepts({ childName: childName || "Sam", age: 1, world: "Small worlds", favourites: [] });
      expect(concepts).toHaveLength(3);
      expect(concepts.every((concept) => concept.readingLevel === "1-3")).toBe(true);
    }
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
  let patchBody: Record<string, unknown> | null = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = String(url).replace("https://creation.test", "");
    paths.push(`${init.method} ${path}`);
    if (init.method === "GET") return Response.json(project);
    if (init.method === "PATCH") patchBody = JSON.parse(init.body ?? "{}");
    return Response.json({ jobId: "job_1234" }, { status: 201 });
  }));
  try {
    return { response: await run(), paths, patchBody: () => patchBody };
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
      () => generateConcepts(post())
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Payment entitlement is not active." });
    expect(paths.some((path) => path.includes("concept-jobs"))).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses once the idea allowance is spent, whatever the browser claims", async () => {
    const { response } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, conceptAttempts: 3 } },
      () => generateConcepts(post())
    );

    expect(response.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("enqueues within the allowance", async () => {
    generateText.mockResolvedValue({ output: { concepts: [] }, usage: {} });
    const { response, paths } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, conceptAttempts: 2 } },
      () => generateConcepts(post())
    );

    expect(response.status).toBe(200);
    expect(paths).toContain("POST /store/flo/projects/project_1234/concept-jobs");
  });
});

const safeConcepts = {
  concepts: [
    { title: "Milo and the Quiet Comet", pitch: "Milo helps a shy comet find its way home before the sky goes dark.", emotionalGoal: "kindness", tone: "gentle" },
    { title: "The Pocket-Sized Planet", pitch: "Milo discovers a tiny world that needs a careful explorer.", emotionalGoal: "curiosity", tone: "wonder" },
    { title: "The Starry Scarf", pitch: "Milo's red scarf catches a starlight message from far away.", emotionalGoal: "confidence", tone: "adventure" }
  ]
};
const paidProject = { paymentState: "pending", generation: { assetsGenerated: 0, conceptAttempts: 0 } };

interface ConceptResponse {
  servedFromFallback: boolean;
  concepts: { source: string }[];
}
interface JobPatchBody {
  concepts?: { source: string }[];
  moderation?: { verdict: string; findings: string[] };
}

async function json(response: Response): Promise<ConceptResponse> {
  return response.json() as Promise<ConceptResponse>;
}

/**
 * F-007 §10: a screened bundle is the only kind that may be persisted. A BLOCK is a
 * model failure, so the parent still gets authored ideas rather than an error.
 */
describe("concept generation moderation", () => {
  it("persists a bundle the provider allows", async () => {
    generateText.mockResolvedValue({ output: safeConcepts, usage: {} });
    const { response, patchBody } = await withCreationService(paidProject, () => generateConcepts(post()));

    expect(response.status).toBe(200);
    expect((await json(response)).servedFromFallback).toBe(false);
    const saved = patchBody() as JobPatchBody;
    expect(saved.concepts).toHaveLength(3);
    expect(saved.moderation).toEqual({ verdict: "ALLOW", findings: [] });
  });

  it("falls back to authored ideas when the provider blocks a bundle", async () => {
    generateText.mockResolvedValue({
      output: { concepts: safeConcepts.concepts.map((c, i) => ({ ...c, title: `${c.title} ${i}`, pitch: i === 0 ? "Milo finds a gun in the shed." : c.pitch })) },
      usage: {}
    });
    const { response, patchBody } = await withCreationService(paidProject, () => generateConcepts(post()));

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.servedFromFallback).toBe(true);
    expect(body.concepts.every((concept) => concept.source === "fallback")).toBe(true);
    const saved = patchBody() as JobPatchBody;
    expect(saved.concepts?.every((concept) => concept.source === "fallback")).toBe(true);
    expect(saved.moderation?.verdict).toBe("BLOCK");
  });

  it("serves a flagged bundle and records why rather than discarding it", async () => {
    generateText.mockResolvedValue({
      output: { concepts: safeConcepts.concepts.map((c, i) => ({ ...c, title: `${c.title} ${i}`, pitch: i === 0 ? "Milo meets Elsa in the snow." : c.pitch })) },
      usage: {}
    });
    const { response, patchBody } = await withCreationService(paidProject, () => generateConcepts(post()));

    expect(response.status).toBe(200);
    expect((await json(response)).servedFromFallback).toBe(false);
    const saved = patchBody() as JobPatchBody;
    expect(saved.moderation?.verdict).toBe("FLAG");
    expect(saved.moderation?.findings.join(" ")).toMatch(/brand/);
  });

  it("records that an unscreened fallback was never screened", async () => {
    generateText.mockRejectedValue(new Error("provider down"));
    const { response, patchBody } = await withCreationService(paidProject, () => generateConcepts(post()));

    expect(response.status).toBe(200);
    expect((await json(response)).servedFromFallback).toBe(true);
    const saved = patchBody() as JobPatchBody;
    expect(saved.moderation?.verdict).toBe("ALLOW");
    expect(saved.moderation?.findings.join(" ")).toMatch(/without screening/);
  });

  it("fails the job instead of stranding it when the bundle cannot be saved", async () => {
    generateText.mockResolvedValue({ output: safeConcepts, usage: {} });
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string; body?: string }) => {
      const path = String(url).replace("https://creation.test", "");
      if (init.method === "GET") return Response.json(paidProject);
      if (init.method === "PATCH") {
        const body = JSON.parse(init.body ?? "{}");
        patches.push(body);
        if (patches.length === 1) throw new Error("save failed");
        return Response.json({ jobId: "job_1234", status: "FAILED" });
      }
      return Response.json({ jobId: "job_1234" }, { status: 201 });
    }));
    try {
      const response = await generateConcepts(post());
      expect(response.status).toBe(503);
      expect(patches).toHaveLength(2);
      expect(patches[1]).toMatchObject({ status: "FAILED" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refuses to fall back silently when the entitlement check cannot run", async () => {
    generateText.mockResolvedValue({ output: safeConcepts, usage: {} });
    const { response } = await withCreationService(paidProject, async () => {
      process.env.CREATION_API_URL = "";
      try {
        return await generateConcepts(post());
      } finally {
        process.env.CREATION_API_URL = "https://creation.test";
      }
    });
    // The creation service is the enforcement point; losing it is a 503, not a bypass.
    expect(response.status).toBe(503);
  });
});

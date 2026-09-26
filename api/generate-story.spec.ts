import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storyPolicyForAge, default as generateStory } from "./generate-story";
import { LOCKED_ILLUSTRATION_CUE, LOCKED_PAGE_TEXT } from "@for-little-ones/domain";

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText, Output: { object: () => ({}) } }));

const request = {
  schemaVersion: "1",
  childName: "Milo",
  age: 6,
  world: "Bedtime wonder",
  favourites: ["Space"],
  detail: "Carries a red scarf",
  dedication: "Dream big.",
  locale: "en-GB",
  projectId: "project_1234",
  revisionId: "revision_1234",
  ownerToken: "ab".repeat(32),
  selectedConcept: {
    id: "concept_1", title: "The Quiet Star", pitch: "Milo helps a shy star.", emotionalGoal: "confidence", tone: "gentle"
  }
};

const generated = {
  schemaVersion: "1" as const,
  title: "Milo and the Quiet Star",
  synopsis: "Milo helps a shy star find its glow.",
  emotionalGoal: "Courage can be quiet and kind.",
  pages: Array.from({ length: 6 }, (_, index) => ({
    pageNumber: index + 1,
    text: `Secret page ${index + 1}: ${"milo walked quietly ".repeat(20)}`,
    illustrationCue: `Secret illustration ${index + 1}`
  }))
};

interface ProjectCall { path: string; body?: unknown }

async function withCreationService(project: Record<string, unknown>, run: () => Promise<Response>) {
  const calls: ProjectCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = String(url).replace("https://creation.test", "");
    calls.push({ path, ...(init.body === undefined ? {} : { body: JSON.parse(init.body) as unknown }) });
    if (init.method === "GET") return Response.json(project);
    if (path.endsWith("/story-jobs") && init.method === "POST") return Response.json({ jobId: "job_1234" }, { status: 201 });
    return Response.json({ jobId: "job_1234", status: "READY" });
  }));
  try {
    return { response: await run(), calls };
  } finally {
    vi.unstubAllGlobals();
  }
}

function post() {
  return new Request("https://example.test/api/generate-story", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request)
  });
}

beforeEach(() => {
  process.env.CREATION_API_URL = "https://creation.test";
  process.env.VITE_MEDUSA_PUBLISHABLE_KEY = "pk_test";
  generateText.mockResolvedValue({ output: generated, usage: { inputTokens: 10, outputTokens: 20 } });
});
afterEach(() => { vi.unstubAllGlobals(); generateText.mockReset(); });

describe("pre-payment story response", () => {
  it("sends one full page, one excerpt and no later story text to the browser", async () => {
    const { response, calls } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, storyAttempts: 0, conceptAttempts: 0 } },
      () => generateStory.fetch(post())
    );

    expect(response.status).toBe(200);
    const body = await response.json() as typeof generated & { generationMetadata: { model: string } };
    expect(body.pages[0]).toEqual(generated.pages[0]);
    expect(body.pages[1]?.text.length).toBeLessThanOrEqual(141);
    expect(body.pages[1]?.illustrationCue).toBe(LOCKED_ILLUSTRATION_CUE);
    expect(body.pages.slice(2).every((page) => page.text === LOCKED_PAGE_TEXT)).toBe(true);

    // The reviewer-facing claim: nothing in the HTTP body or the stored draft can
    // be read ahead of payment.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("Secret illustration 6");
    expect(serialised).not.toContain(generated.pages[5]?.text.slice(0, 60));

    // The complete story is kept server-side for the post-payment reader.
    const completion = calls.find((call) => call.path.endsWith("/story-jobs/job_1234"));
    expect(JSON.stringify(completion?.body)).toContain("Secret illustration 6");
  });

  it("returns the complete story once payment is captured", async () => {
    const { response } = await withCreationService(
      { paymentState: "captured", generation: { assetsGenerated: 0, storyAttempts: 0, conceptAttempts: 0 } },
      () => generateStory.fetch(post())
    );

    expect(response.status).toBe(200);
    expect((await response.json() as typeof generated).pages).toEqual(generated.pages);
  });
});

describe("server-side authorisation before provider work", () => {
  it("refuses a refunded purchase before enqueueing or generating", async () => {
    const { response, calls } = await withCreationService(
      { paymentState: "refunded", generation: { assetsGenerated: 0, storyAttempts: 0, conceptAttempts: 0 } },
      () => generateStory.fetch(post())
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Payment entitlement is not active." });
    expect(calls.some((call) => call.path.endsWith("/story-jobs"))).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses once the teaser story allowance is spent, whatever the browser claims", async () => {
    const { response } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, storyAttempts: 1, conceptAttempts: 0 } },
      () => generateStory.fetch(post())
    );

    expect(response.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not spend provider work when the creation service cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = await generateStory.fetch(post());

    expect(response.status).toBe(503);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("age-specific story policy", () => {
  it("uses shorter, more repetitive text for younger readers", () => {
    expect(storyPolicyForAge(3)).toEqual({ band: "1-3", wordsPerPage: "18-35", direction: "Use very short sentences, concrete words and gentle repetition." });
    expect(storyPolicyForAge(6).band).toBe("4-6");
    expect(storyPolicyForAge(9).wordsPerPage).toBe("45-70");
    expect(storyPolicyForAge(12).band).toBe("10-12");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storyPolicyForAge, storyPrompt, POST as generateStory } from "./generate-story";
import { LOCKED_ILLUSTRATION_CUE, LOCKED_PAGE_TEXT } from "@for-little-ones/domain";

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", () => ({ generateText, Output: { object: () => ({}) } }));

const request = {
  schemaVersion: "1" as const,
  childName: "Milo",
  age: 6,
  world: "Bedtime wonder",
  companions: ["Juniper"],
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
    text: `Secret page ${index + 1}: ${"milo walked quietly ".repeat(15)}`,
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
      () => generateStory(post())
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
      () => generateStory(post())
    );

    expect(response.status).toBe(200);
    expect((await response.json() as typeof generated).pages).toEqual(generated.pages);
  });
});

describe("server-side authorisation before provider work", () => {
  it("refuses a refunded purchase before enqueueing or generating", async () => {
    const { response, calls } = await withCreationService(
      { paymentState: "refunded", generation: { assetsGenerated: 0, storyAttempts: 0, conceptAttempts: 0 } },
      () => generateStory(post())
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Payment entitlement is not active." });
    expect(calls.some((call) => call.path.endsWith("/story-jobs"))).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses once the teaser story allowance is spent, whatever the browser claims", async () => {
    const { response } = await withCreationService(
      { paymentState: "pending", generation: { assetsGenerated: 0, storyAttempts: 1, conceptAttempts: 0 } },
      () => generateStory(post())
    );

    expect(response.status).toBe(402);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not spend provider work when the creation service cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const response = await generateStory(post());

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

describe("personalised story brief", () => {
  it("carries the selected idea and personal details through one coherent six-page arc", () => {
    const prompt = storyPrompt(request);

    expect(prompt).toContain("Milo");
    expect(prompt).toContain("Bedtime wonder");
    expect(prompt).toContain("Space");
    expect(prompt).toContain("Juniper");
    expect(prompt).toContain("Carries a red scarf");
    expect(prompt).toContain("The Quiet Star");
    expect(prompt).toContain("Use British English spelling");
    expect(prompt).toMatch(/page-by-page|page 1/i);
    expect(prompt).toMatch(/same cast|continuity/i);
    expect(prompt).toMatch(/safe, familiar resting place/i);
    expect(storyPrompt({ ...request, locale: "en-US" })).toContain("Use American English spelling");
  });
});

describe("story quality gate", () => {
  it("repairs out-of-band page length once before the story is persisted", async () => {
    const tooShort = {
      ...generated,
      pages: generated.pages.map((page) => ({ ...page, text: "Milo found a star." }))
    };
    generateText
      .mockResolvedValueOnce({ output: tooShort, usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });

    const { response, calls } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(String(generateText.mock.calls[1]?.[0]?.prompt)).toMatch(/words per page/i);
    const completion = calls.find((call) => call.path.endsWith("/story-jobs/job_1234"));
    expect(JSON.stringify(completion?.body)).toContain(generated.pages[5]?.text);
  });

  it("repairs skipped page numbers before building the book preview", async () => {
    const outOfOrder = {
      ...generated,
      pages: generated.pages.map((page, index) => index === 5 ? { ...page, pageNumber: 4 } : page)
    };
    generateText
      .mockResolvedValueOnce({ output: outOfOrder, usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });

    const { response } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(String(generateText.mock.calls[1]?.[0]?.prompt)).toMatch(/numbered 1 through 6/i);
  });

  it("repairs common US spellings in the British English edition", async () => {
    const americanSpelling = {
      ...generated,
      pages: generated.pages.map((page, index) => index === 0
        ? { ...page, text: "Milo took a cozy walk beneath moonlit trees while Juniper followed happily. ".repeat(4).trim() }
        : page)
    };
    generateText
      .mockResolvedValueOnce({ output: americanSpelling, usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });

    const { response } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(String(generateText.mock.calls[1]?.[0]?.prompt)).toMatch(/American spelling "cozy"; use British "cosy"/i);
  });

  it("repairs quality and moderation findings together in its single retry", async () => {
    const combinedDefects = {
      ...storyWithUnsafePage(),
      pages: storyWithUnsafePage().pages.map((page, index) => index === 0 ? { ...page, text: "Milo found a star." } : page)
    };
    generateText
      .mockResolvedValueOnce({ output: combinedDefects, usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });

    const { response } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(2);
    const repairPrompt = String(generateText.mock.calls[1]?.[0]?.prompt);
    expect(repairPrompt).toMatch(/words per page/i);
    expect(repairPrompt).toMatch(/matched "gun"/i);
  });
});

/** A copy that trips the hard-block tier, with the rest of the story left intact. */
function storyWithUnsafePage() {
  return {
    ...generated,
    pages: generated.pages.map((page, index) =>
      index === 2 ? { ...page, text: `Milo found a gun in the shed and felt trapped and terrified. ${"He held his red scarf and walked gently beneath the stars. ".repeat(3)}` } : page)
  };
}
const paidProject = { paymentState: "pending", generation: { assetsGenerated: 0, storyAttempts: 0, conceptAttempts: 0 } };

/**
 * F-007 §10 applies to the story as much as the concept. There is no authored
 * fallback for a story, so a blocked copy is retried once with the finding named
 * and then surfaced as retryable — never shipped, never invented around.
 */
describe("story generation moderation", () => {
  it("screens the whole story, including illustration cues", async () => {
    generateText.mockResolvedValue({
      output: { ...generated, pages: generated.pages.map((page, index) => index === 0 ? { ...page, illustrationCue: "A painted scene of Elsa" } : page) },
      usage: {}
    });
    const { response, calls } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    const completion = calls.find((call) => call.path.endsWith("/story-jobs/job_1234"));
    const body = completion?.body as { moderation?: { verdict: string } } | undefined;
    expect(body?.moderation?.verdict).toBe("FLAG");
  });

  it("retries once with the finding named, then accepts the corrected story", async () => {
    generateText
      .mockResolvedValueOnce({ output: storyWithUnsafePage(), usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });
    const { response, calls } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(String(generateText.mock.calls[1]?.[0]?.prompt)).toMatch(/rewrite|safety/i);
    const completion = calls.find((call) => call.path.endsWith("/story-jobs/job_1234"));
    const body = completion?.body as { moderation?: { verdict: string } } | undefined;
    expect(body?.moderation?.verdict).toBe("ALLOW");
  });

  it("spends one story attempt for a blocked-then-retried command", async () => {
    generateText
      .mockResolvedValueOnce({ output: storyWithUnsafePage(), usage: {} })
      .mockResolvedValueOnce({ output: generated, usage: {} });
    const { calls } = await withCreationService(paidProject, () => generateStory(post()));

    // One user command must start exactly one job, or a TEASER parent's single
    // preview would be burned by a moderation retry.
    expect(calls.filter((call) => call.path.endsWith("/story-jobs") && call.body !== undefined)).toHaveLength(1);
  });

  it("fails the job and returns a retryable error when the retry is blocked too", async () => {
    generateText.mockResolvedValue({ output: storyWithUnsafePage(), usage: {} });
    const { response, calls } = await withCreationService(paidProject, () => generateStory(post()));

    expect(response.status).toBe(503);
    expect(generateText).toHaveBeenCalledTimes(2);
    const failure = calls.find((call) => call.path.endsWith("/story-jobs/job_1234"));
    expect((failure?.body as { status?: string } | undefined)?.status).toBe("FAILED");
  });

  it("never ships blocked story text to the browser", async () => {
    generateText.mockResolvedValue({ output: storyWithUnsafePage(), usage: {} });
    const { response } = await withCreationService(paidProject, () => generateStory(post()));

    expect(await response.json()).not.toHaveProperty("pages");
  });
});

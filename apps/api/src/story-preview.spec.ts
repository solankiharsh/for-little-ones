import { describe, expect, it, vi } from "vitest";
import { createStoryPreviewHandler } from "./story-preview";
import { LOCKED_ILLUSTRATION_CUE, LOCKED_PAGE_TEXT } from "@for-little-ones/domain";

const input = {
  schemaVersion: "1",
  childName: "Milo",
  age: 6,
  world: "Bedtime wonder",
  favourites: ["Space"],
  detail: "Carries a red scarf",
  dedication: "Dream big.",
  locale: "en-GB"
};

const output = {
  schemaVersion: "1",
  title: "Milo and the Quiet Star",
  synopsis: "Milo helps a shy star find its glow.",
  emotionalGoal: "Courage can be quiet and kind.",
  pages: Array.from({ length: 6 }, (_, index) => ({
    pageNumber: index + 1,
    text: `Page ${index + 1} of Milo's gentle adventure.`,
    illustrationCue: `A warm placeholder scene for page ${index + 1}.`
  }))
};

function request() {
  return new Request("https://example.test/api/generate-story", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

describe("story preview API boundary", () => {
  it("validates input and returns only the teaser the entitlement allows", async () => {
    const handler = createStoryPreviewHandler(async () => output);
    const response = await handler(request());

    expect(response.status).toBe(200);
    const body = await response.json() as typeof output;
    expect(body.title).toBe(output.title);
    expect(body.pages[0]).toEqual(output.pages[0]);
    expect(body.pages[1]?.illustrationCue).toBe(LOCKED_ILLUSTRATION_CUE);
    expect(body.pages.slice(2).every((page) => page.text === LOCKED_PAGE_TEXT)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("A warm placeholder scene for page 6");
  });

  it("rejects malformed model output", async () => {
    const handler = createStoryPreviewHandler(async () => ({ ...output, pages: [] }));
    const response = await handler(request());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "The story response was incomplete. Please try again." });
  });
});

describe("story preview authorisation", () => {
  it("refuses before the generator runs when payment is revoked", async () => {
    const generate = vi.fn(async () => output);
    const handler = createStoryPreviewHandler(generate, { paymentState: "cancelled" });
    const response = await handler(request());

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Payment entitlement is not active." });
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses production work that a teaser purchase has not paid for", async () => {
    const generate = vi.fn(async () => output);
    const handler = createStoryPreviewHandler(generate, { paymentState: "authorized", storyAttempts: 1 });
    const response = await handler(request());

    expect(response.status).toBe(402);
    expect(generate).not.toHaveBeenCalled();
  });

  it("serves the complete story to a captured purchase", async () => {
    const handler = createStoryPreviewHandler(async () => output, { paymentState: "captured" });
    const response = await handler(request());

    expect(response.status).toBe(200);
    expect((await response.json() as typeof output).pages).toEqual(output.pages);
  });
});

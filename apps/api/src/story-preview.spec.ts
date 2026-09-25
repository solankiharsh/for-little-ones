import { describe, expect, it } from "vitest";
import { createStoryPreviewHandler } from "./story-preview";

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

describe("story preview API boundary", () => {
  it("validates input and returns canonical model output", async () => {
    const handler = createStoryPreviewHandler(async () => output);
    const response = await handler(new Request("https://example.test/api/generate-story", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(output);
  });

  it("rejects malformed model output", async () => {
    const handler = createStoryPreviewHandler(async () => ({ ...output, pages: [] }));
    const response = await handler(new Request("https://example.test/api/generate-story", {
      method: "POST",
      body: JSON.stringify(input)
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "The story response was incomplete. Please try again." });
  });
});

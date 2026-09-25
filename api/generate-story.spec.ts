import { describe, expect, it } from "vitest";
import { redactStoryPreview } from "./generate-story";

describe("pre-payment story response", () => {
  it("sends one full page, one excerpt and no later story text to the browser", () => {
    const pages = Array.from({ length: 6 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Secret page ${index + 1}: ${"story ".repeat(40)}`,
      illustrationCue: `Secret illustration ${index + 1}`
    }));

    const teaser = redactStoryPreview(pages);

    expect(teaser[0]).toEqual(pages[0]);
    expect(teaser[1]?.text.length).toBeLessThanOrEqual(141);
    expect(teaser[1]?.illustrationCue).toBe("Locked until payment is confirmed.");
    expect(teaser.slice(2).every((page) => page.text === "Story page ready after payment.")).toBe(true);
    expect(JSON.stringify(teaser)).not.toContain("Secret page 6");
    expect(JSON.stringify(teaser)).not.toContain("Secret illustration 6");
  });
});

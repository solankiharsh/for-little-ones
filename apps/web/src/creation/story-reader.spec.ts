import { excerptOf, initialPageIndex, readerPages } from "./story-reader";
import { describe, expect, it } from "vitest";
import type { StoryPreviewResult } from "@for-little-ones/contracts";

function story(texts: string[]): StoryPreviewResult {
  return {
    schemaVersion: "1",
    title: "The Lantern Trail",
    synopsis: "A small traveller follows gentle lights home.",
    emotionalGoal: "kindness",
    pages: texts.map((text, index) => ({ pageNumber: index + 1, text, illustrationCue: `cue ${index + 1}` }))
  };
}

const SIX = ["page one text", "page two text is longer than the rest", "three", "four", "five", "six"];

describe("story reader model", () => {
  it("opens every page in full after payment", () => {
    const pages = readerPages(story(SIX), "ALL");
    expect(pages).toHaveLength(6);
    expect(pages.every((page) => page.mode === "full")).toBe(true);
    expect(pages[0]?.text).toBe("page one text");
  });

  it("teases one full page plus an excerpt, locking the rest", () => {
    const pages = readerPages(story(SIX), 1);
    expect(pages.map((page) => page.mode)).toEqual(["full", "excerpt", "locked", "locked", "locked", "locked"]);
    expect(pages[1]?.text).toBe("page two text is longer than the rest");
  });

  it("clips long pages to the 140-character glimpse", () => {
    const long = `word ${"very ".repeat(60)}long`;
    expect(excerptOf(long).length).toBeLessThanOrEqual(141);
    expect(excerptOf(long).endsWith("…")).toBe(true);
    expect(excerptOf("short")).toBe("short");
  });

  it("opens on the first readable page", () => {
    expect(initialPageIndex(readerPages(story(SIX), 1))).toBe(0);
    expect(initialPageIndex(readerPages(story(SIX), 0))).toBe(0);
    expect(initialPageIndex(readerPages(story(SIX), "ALL"))).toBe(0);
  });
});

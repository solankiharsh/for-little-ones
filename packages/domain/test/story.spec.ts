import { describe, expect, it } from "vitest";
import {
  STORY_PAGE_COUNT,
  isStoryPageStatus,
  isStoryStatus,
  pageKeySeed,
  storyIdFor
} from "@for-little-ones/domain";

describe("domain: story model (F-008)", () => {
  it("names stories deterministically per book and version", () => {
    expect(storyIdFor("book-1", 1)).toBe("story:book-1:v1");
    expect(storyIdFor("book-1", 2)).toBe("story:book-1:v2");
  });

  it("seeds page keys from the full §9 input set", () => {
    const seed = { bookId: "book-1", conceptVersion: 1, pageNumber: 2, factsVersion: "abc", locale: "en-GB" };
    expect(pageKeySeed(seed)).toBe("book-1|1|2|abc|en-GB");
    expect(pageKeySeed({ ...seed, pageNumber: 3 })).not.toBe(pageKeySeed(seed));
    expect(pageKeySeed({ ...seed, factsVersion: "abd" })).not.toBe(pageKeySeed(seed));
  });

  it("validates statuses and fixes the v1 page count", () => {
    expect(isStoryStatus("READY")).toBe(true);
    expect(isStoryStatus("APPROVED")).toBe(false);
    expect(isStoryPageStatus("PENDING")).toBe(true);
    expect(isStoryPageStatus("QUEUED")).toBe(false);
    expect(STORY_PAGE_COUNT).toBe(6);
  });
});

import type { StoryPreviewResult } from "@for-little-ones/contracts";
import type { Book, Page } from "@for-little-ones/domain";

/**
 * Pure reader model for the book preview (F-011 v0 slice). The component owns
 * tab/page state; everything about *what* a page shows lives here so it is
 * unit-testable without a DOM.
 *
 * Lock semantics mirror the teaser contract (D025): `visiblePages` is either
 * `"ALL"` (paid) or the count of fully readable pages. The next page after the
 * readable run shows a short excerpt; everything beyond is locked.
 */

export type ReaderPageMode = "full" | "excerpt" | "locked";

/** D025 teaser budget: a 140-character glimpse of the next page. */
export const TEASER_EXCERPT_LENGTH = 140;

export interface ReaderPage {
  pageNumber: number;
  mode: ReaderPageMode;
  /** Full text for `full`, the clipped glimpse for `excerpt`, empty for `locked`. */
  text: string;
  illustrationCue: string;
}

export function excerptOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TEASER_EXCERPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, TEASER_EXCERPT_LENGTH).trimEnd()}…`;
}

export function readerPages(
  story: StoryPreviewResult,
  visiblePages: "ALL" | number
): ReaderPage[] {
  return story.pages.map((page, index) => {
    if (visiblePages === "ALL" || index < visiblePages) {
      return { pageNumber: page.pageNumber, mode: "full", text: page.text, illustrationCue: page.illustrationCue };
    }
    if (index === visiblePages) {
      return { pageNumber: page.pageNumber, mode: "excerpt", text: excerptOf(page.text), illustrationCue: page.illustrationCue };
    }
    return { pageNumber: page.pageNumber, mode: "locked", text: "", illustrationCue: page.illustrationCue };
  });
}

/** First readable page when the reader opens (cover-led: page 1, or the excerpt when nothing is open). */
export function initialPageIndex(pages: ReaderPage[]): number {
  const first = pages.findIndex((page) => page.mode !== "locked");
  return first === -1 ? 0 : first;
}

/**
 * Build the small, read-only Book projection used by the creation teaser.
 * The server has already removed locked text; this adapter preserves that
 * boundary by making locked physical pages PENDING with no text blocks.
 */
export function previewBook(
  story: StoryPreviewResult,
  childName: string,
  dedication: string,
  pages: ReaderPage[],
): Book {
  const physicalPages: Page[] = [
    {
      pageNumber: 1,
      status: "READY",
      textBlocks: [
        { id: "preview-cover-title", kind: "cover-title", text: story.title },
        { id: "preview-cover-caption", kind: "caption", text: `A story made for ${childName}` },
      ],
    },
    {
      pageNumber: 2,
      status: "READY",
      textBlocks: [{ id: "preview-dedication", kind: "body", text: dedication || `Made especially for ${childName}.` }],
    },
    ...pages.map((page): Page => ({
      pageNumber: page.pageNumber + 2,
      status: page.mode === "locked" ? "PENDING" : "READY",
      textBlocks: page.mode === "locked" ? [] : [{
        id: `preview-story-${page.pageNumber}`,
        kind: "body",
        text: page.text,
      }],
      ...(page.mode === "locked" ? {} : {
        illustration: {
          assetRef: `sample-world-art/${page.pageNumber}`,
          planKey: page.illustrationCue,
        },
      }),
    })),
  ];

  return {
    id: "creation-story-teaser",
    status: "DRAFT",
    metadata: { title: story.title, locale: "en" },
    childProfileIds: ["preview-child"],
    characters: [],
    relationships: [],
    pages: physicalPages,
    revisions: [],
  };
}

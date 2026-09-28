/**
 * Story + StoryPage — F-008 canonical vocabulary (guide §3, D029). The durable
 * story pipeline persists an outline gate object plus one row per page; the
 * reader (F-011), illustration plans (F-009) and corrections (F-012) all read
 * these rows, never provider output.
 *
 * Browser-safe: pure types, validators and string builders only. The §9
 * `pageKey` sha256 lives in `apps/api` (node crypto); what lives here is the
 * canonical seed string it hashes, so the key construction is testable without
 * node built-ins.
 */

import type { PageTextResult, StoryOutlineResult } from "@for-little-ones/contracts";
import type { ReadingLevelBand } from "./story-concept";

export const STORY_STATUSES = ["DRAFT", "OUTLINE_READY", "READY", "FAILED"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export function isStoryStatus(value: string): value is StoryStatus {
  return (STORY_STATUSES as readonly string[]).includes(value);
}

export const STORY_PAGE_STATUSES = ["PENDING", "GENERATING", "READY", "FAILED"] as const;
export type StoryPageStatus = (typeof STORY_PAGE_STATUSES)[number];

export function isStoryPageStatus(value: string): value is StoryPageStatus {
  return (STORY_PAGE_STATUSES as readonly string[]).includes(value);
}

/**
 * v1 page count. Matches the `StoryPreviewResult` 6-page contract and the Path B
 * preview, so the F-011 reader renders durable stories without changes. A
 * variable page count reopens with print pagination (F-017), not here.
 */
export const STORY_PAGE_COUNT = 6;

export interface Story {
  id: string;
  bookId: string;
  storyVersion: number;
  /** The SELECTED concept this story was written from (F-007 → F-008 handoff). */
  conceptId: string;
  locale: string;
  readingLevel: ReadingLevelBand;
  /** Canonical facts snapshot hash the pages were written against (immutability audit). */
  factsVersion: string;
  outline?: StoryOutlineResult;
  status: StoryStatus;
  createdAt: string;
}

export interface StoryPage {
  pageKey: string;
  storyId: string;
  bookId: string;
  pageNumber: number;
  textBlocks: PageTextResult["textBlocks"];
  illustrationCue?: string;
  status: StoryPageStatus;
  attemptCount: number;
  createdAt: string;
}

export function storyIdFor(bookId: string, storyVersion: number): string {
  return `story:${bookId}:v${storyVersion}`;
}

/**
 * Canonical pageKey seed (F-008 §9): the same inputs always name the same page
 * intent, so a crashed worker or duplicate request cannot double-generate or
 * diverge. Hashed with sha256 by the runner; `revisionNonce` starts a genuinely
 * different intent (a rewrite), never a retry.
 */
export function pageKeySeed(input: {
  bookId: string;
  conceptVersion: number;
  pageNumber: number;
  factsVersion: string;
  locale: string;
}): string {
  return [input.bookId, input.conceptVersion, input.pageNumber, input.factsVersion, input.locale].join("|");
}

/**
 * Spike-local fixture types for the Durable Execution spike (Spike A).
 * The harness drives an identical scenario through each substrate.
 */

export type PageBehavior = "ok" | "always-fail";

export interface PageFixture {
  pageNumber: number;
  behavior: PageBehavior;
}

export interface BookFixture {
  bookId: string;
  /** Business-operation key for the story unit. */
  storyOperationKey: string;
  pages: PageFixture[];
}

export type CrashPoint = "after-provider-accept";

export interface PageJobPayload {
  bookId: string;
  pageNumber: number;
  behavior: PageBehavior;
  /** Per-unit business-operation/idempotency key (D019). */
  operationKey: string;
  /** Key handed to the (simulated) provider for idempotent replays. */
  providerIdempotencyKey: string;
  /**
   * When set, the handler holds on a gate right after the provider accepts so the
   * harness can SIGKILL the worker at the exact "uncertain external outcome" point
   * (local commit never happens).
   */
  crashPoint?: CrashPoint;
}

export const PAGE_COUNT = 8;

export function makeBook(bookId: string, opts: { failPage7?: boolean } = {}): BookFixture {
  const pages: PageFixture[] = [];
  for (let n = 1; n <= PAGE_COUNT; n += 1) {
    const behavior: PageBehavior = opts.failPage7 && n === 7 ? "always-fail" : "ok";
    pages.push({ pageNumber: n, behavior });
  }
  return {
    bookId,
    storyOperationKey: `story:${bookId}`,
    pages
  };
}

export function pageOperationKey(bookId: string, pageNumber: number): string {
  return `page:${bookId}:${pageNumber}`;
}

export function pageIdempotencyKey(bookId: string, pageNumber: number): string {
  return `vendor-illustration:${bookId}:page-${pageNumber}`;
}
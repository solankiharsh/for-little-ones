import { describe, expect, expectTypeOf, it } from "vitest";
import { createApprovedBookRevision, type ApprovedBookRevision, type Book, type BookRevision, type BookStatus, type RevisionStatus } from "../src/index";

describe("domain: book lifecycle boundaries", () => {
  it("keeps the stable book lifecycle separate from a revision's editorial lifecycle", () => {
    expectTypeOf<BookStatus>().toEqualTypeOf<"DRAFT" | "ARCHIVED">();
    expectTypeOf<RevisionStatus>().toEqualTypeOf<
      | "PREPARING"
      | "GENERATING"
      | "READY_FOR_REVIEW"
      | "EDITING"
      | "READY_FOR_APPROVAL"
      | "APPROVED"
      | "GENERATION_FAILED"
      | "RENDER_FAILED"
      | "CANCELLED"
    >();
    expectTypeOf<BookRevision["status"]>().toEqualTypeOf<RevisionStatus>();
    expectTypeOf<Book["currentRevisionId"]>().toEqualTypeOf<string | undefined>();
  });

  it("represents an approved revision as an immutable orderable snapshot", () => {
    expectTypeOf<ApprovedBookRevision["contentHash"]>().toEqualTypeOf<string>();
    expectTypeOf<ApprovedBookRevision["printSpec"]>().toMatchTypeOf<object>();
  });

  it("clones, hashes, and freezes content so working-copy edits cannot alter the approved revision", async () => {
    const pages = [{ pageNumber: 1, status: "READY" as const, textBlocks: [{ id: "text-1", kind: "story", text: "Original" }] }];
    const snapshot = await createApprovedBookRevision({
      id: "approved-1",
      revisionId: "revision-1",
      approvedAt: "2026-09-22T00:00:00.000Z",
      pages,
      printSpec: {
        id: "hardcover-square",
        binding: "hardcover-case",
        sheet: { trimWidthMm: 210, trimHeightMm: 210, bleedMm: 3, safeMarginMm: 12 },
        resolution: { dpiMinimum: 300 },
        pageRange: { minPages: 24, maxPages: 40 }
      }
    });

    pages[0]!.textBlocks[0]!.text = "Changed";
    expect(snapshot.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.pages[0]!.textBlocks[0]!.text).toBe("Original");
    expect(Object.isFrozen(snapshot.pages[0]!.textBlocks)).toBe(true);
  });
});

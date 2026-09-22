import { createApprovedBookRevision, type Book, type PrintSpec } from "@for-little-ones/domain";

export const MIXAM_ART_SQUARE_210: PrintSpec = {
  id: "print-mixam-art-sq",
  binding: "hardcover-case",
  sheet: { trimWidthMm: 210, trimHeightMm: 210, bleedMm: 3, safeMarginMm: 8 },
  resolution: { dpiMinimum: 300 },
  pageRange: { minPages: 24, maxPages: 48 }
};

export async function fixtureBook(pageCount = 24, printSpec: PrintSpec = MIXAM_ART_SQUARE_210): Promise<Book> {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    pageNumber: i + 1,
    status: "READY" as const,
    textBlocks: [
      { id: `t${i + 1}`, kind: "story" as const, text: `Page ${i + 1}. Ava lives on Sprout Street and chases the moon each night. The houses here are drawn in crayon.` }
    ],
    illustration: { assetRef: `mock://assets/page-${i + 1}.png`, planKey: `plan-${i + 1}` }
  }));
  return {
    id: "book-print-fixture",
    status: "DRAFT",
    metadata: { locale: "en" },
    childProfileIds: ["child-ava"],
    characters: [{ id: "char-ava", characterId: "char-ava", version: "v1", name: "Ava", styleTokensRef: "mock://style/ava" }],
    relationships: [],
    pages,
    revisions: [{ id: "rev-9", revisionSeq: 9, createdAt: "2026-09-22T00:00:00.000Z", status: "APPROVED", pageNumbers: pages.map((p) => p.pageNumber) }],
    printSpecId: printSpec.id,
    approval: await createApprovedBookRevision({
      id: "approved-rev-9",
      revisionId: "rev-9",
      approvedAt: "2026-09-22T00:00:00.000Z",
      pages,
      printSpec
    })
  };
}

export const SYSTEM_FONT_TTF = "/System/Library/Fonts/Supplemental/Arial.ttf";

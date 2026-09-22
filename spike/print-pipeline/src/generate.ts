import fs from "fs";
import type { Book } from "@for-little-ones/domain";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { mmToPt, pageSizePt, safeRectPt, type BookPrintReport } from "./geometry";

/**
 * Spike D — deterministic interior renderer against the GENERIC PrintSpec (D016)
 * only. No editor import anywhere (editor-independence asserted in the boundary
 * spec); production F-017 will use the same contract. Determinism is a first-class
 * property, not an accident: identical inputs → byte-identical PDF.
 */

export interface RenderInput {
  book: Book;
  /** Path to a TrueType font to embed. Byte-stability is per exact font bytes. */
  ttfPath: string;
}

export interface RenderResult {
  bytes: Uint8Array;
  report: BookPrintReport;
}

function wrap(text: string, maxWidthPt: number, fontSize: number, widthOf: (t: string) => number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (widthOf(candidate) > maxWidthPt && cur) {
      out.push(cur);
      cur = word;
    } else {
      cur = candidate;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderBook(input: RenderInput): Promise<RenderResult> {
  const { book, ttfPath } = input;
  const approval = book.approval;
  if (!approval) throw new Error("print rendering requires an approved revision snapshot");
  const spec = approval.printSpec;
  const pages = approval.pages;
  const { trimWidthMm, trimHeightMm, bleedMm, safeMarginMm } = spec.sheet;
  const { w, h } = pageSizePt(trimWidthMm, bleedMm, trimHeightMm);
  const safe = safeRectPt(trimWidthMm, bleedMm, safeMarginMm, trimHeightMm);

  const fontBytes = fs.readFileSync(ttfPath);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });

  const report: BookPrintReport = {
    pageCount: pages.length,
    pageWidthPt: w,
    pageHeightPt: h,
    trimPt: mmToPt(trimWidthMm),
    bleedPt: mmToPt(bleedMm),
    safeTopPt: safe.y,
    textBlocks: [],
    fontsEmbedded: 1
  };

  const fontSize = 16;
  const lineHeight = fontSize * 1.4;
  const fontWidthOf = (t: string): number => font.widthOfTextAtSize(t, fontSize);

  for (const page of pages) {
    const pdfPage = doc.addPage([w, h]);
    let y = safe.y + safe.h - lineHeight;
    for (const block of page.textBlocks) {
      const lines = wrap(block.text, safe.w, fontSize, fontWidthOf);
      for (const line of lines) {
        if (y < safe.y) {
          throw new Error(`Text exceeds the page safe area on page ${page.pageNumber}`);
        }
        pdfPage.drawText(line, { x: safe.x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        report.textBlocks.push({ xPt: safe.x, yPt: y, fontSize, text: line });
        y -= lineHeight;
      }
    }
  }

  return { bytes: await doc.save(), report };
}

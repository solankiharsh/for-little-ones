import type { Book } from "@for-little-ones/domain";
import type { CandidateStore, EditorJson, ElementLike, PageLike } from "./candidates";
import { mmToPx } from "./geometry";

/**
 * Adapter feasibility demo: canonical Book (packages/domain, D004) → editor
 * snapshot, and editor state → canonical commands. The editor snapshot is never
 * canonical; this is the only translation boundary (D004/D007 posture question
 * that Spike B must answer).
 */

export interface BookPageSpread {
  pageNumber: number;
  textBlocks: { id: string; text: string }[];
  illustration?: { assetRef: string } | undefined;
  trimMm: number;
  bleedMm: number;
  safeMm: number;
  dpi?: number;
}

export interface SnapshotResult {
  store: CandidateStore;
  snapshot: EditorJson;
  pageCount: number;
  elementCount: number;
}

const DISPLAY_FAMILY = "Palatino Linotype";
/** Not registered headlessly: `store.addFont` needs DOM (document.fonts / style injection). */
const DISPLAY_FONT = {
  fontFamily: DISPLAY_FAMILY,
  styles: [{ sal: 500, weight: 400, url: "mock://fonts/palatino.woff2" }]
};
void DISPLAY_FONT;

export function pageSpreadsFromBook(book: Book, trimMm: number, bleedMm: number, safeMm: number): BookPageSpread[] {
  return book.pages.map((p) => ({
    pageNumber: p.pageNumber,
    textBlocks: p.textBlocks.map((t) => ({ id: t.id, text: t.text })),
    illustration: p.illustration ? { assetRef: p.illustration.assetRef } : undefined,
    trimMm,
    bleedMm,
    safeMm
  }));
}

export function snapshotFromBook(store: CandidateStore, book: Book, trimMm: number, bleedMm: number, safeMm: number): SnapshotResult {
  const wPx = mmToPx(trimMm, store.dpi);
  let elementCount = 0;
  for (const spread of pageSpreadsFromBook(book, trimMm, bleedMm, safeMm)) {
    const page = store.addPage({ width: wPx, height: wPx, bleed: mmToPx(bleedMm, store.dpi), background: "#fff8ef" });
    for (const block of spread.textBlocks) {
      const el = page.addElement({
        type: "text",
        text: block.text,
        x: 40 + (elementCount % 3) * 14,
        y: 60 + (elementCount % 7) * 24,
        width: wPx - 160,
        height: 0,
        fontSize: block.text.length > 40 ? 26 : 34,
        fontFamily: DISPLAY_FAMILY,
        fill: "#1a1a1a",
        align: "left",
        name: `text-${block.id}`
      });
      if (el) elementCount++;
    }
    if (spread.illustration) {
      const el = page.addElement({
        type: "image",
        src: spread.illustration.assetRef,
        x: 0,
        y: 0,
        width: Math.round(wPx / 2),
        height: Math.round(wPx / 2),
        name: `illustration-${spread.pageNumber}`
      });
      if (el) elementCount++;
    }
  }
  store.toggleBleed(true);
  store.toggleRulers(true);
  const snapshot = store.toJSON();
  return { store, snapshot, pageCount: book.pages.length, elementCount };
}

export interface CanonicalCommand {
  kind: "set-text" | "set-element" | "clear-face" | "select";
  pageNumber: number;
  elementId?: string;
  attrs?: Record<string, unknown>;
  text?: string;
}

/** A user edit applied through the adapter becomes canonical commands, never editor JSON. */
export function canonicalCommandsFromUserEdit(
  page: PageLike,
  pageNumber: number,
  textEl: ElementLike,
  nextText: string
): CanonicalCommand[] {
  if (!textEl) return [];
  const image = page.children.find((c) => c.type === "image");
  const commands: CanonicalCommand[] = [{ kind: "set-text", pageNumber, elementId: textEl.id, text: nextText }];
  if (image) {
    textEl.set({ text: nextText, width: Math.min(textEl.width, page.width - 100) });
    const clear = { kind: "clear-face" as const, pageNumber, elementId: image.id };
    commands.push(clear);
  }
  return commands;
}

/** Restore from a snapshot and verify the visible result is byte-identical. */
export function visibleResultStable(reference: EditorJson, store: CandidateStore): boolean {
  const rebuilt = store.toJSON();
  return JSON.stringify(reference) === JSON.stringify(rebuilt);
}
import type { Book } from "@for-little-ones/domain";
import type { EditorJson, EditorStore, ElementLike, PageLike } from "./types";
import { mmToPx } from "./geometry";

/**
 * The single Book → engine translation boundary (D004/D007). A canonical Book
 * becomes an engine snapshot; a user edit becomes canonical commands. The
 * engine JSON output is a derived snapshot — never canonical state, and this is
 * the only place the mapping lives.
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
  store: EditorStore;
  snapshot: EditorJson;
  pageCount: number;
  elementCount: number;
}

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

/**
 * Build the engine snapshot from a canonical Book. One canonical page maps to
 * one engine page (decision recorded in F-014; spread rendering is a view
 * concern layered by the app, not a model mapping). Fonts are not registered
 * here: custom font registration needs the DOM, so only the browser seam calls
 * `store.addFont`; the headless path stays clean.
 */
export function snapshotFromBook(store: EditorStore, book: Book, trimMm: number, bleedMm: number, safeMm: number): SnapshotResult {
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
        fontFamily: "Palatino Linotype",
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

/** A user edit applied through the adapter becomes canonical commands, never engine JSON. */
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
export function visibleResultStable(reference: EditorJson, store: EditorStore): boolean {
  const rebuilt = store.toJSON();
  return JSON.stringify(reference) === JSON.stringify(rebuilt);
}
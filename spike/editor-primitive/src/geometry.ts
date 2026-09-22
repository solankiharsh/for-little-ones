import type { CandidateStore, ElementLike, PageLike } from "./candidates";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Dimensions {
  widthPx: number;
  heightPx: number;
}

/**
 * Print geometry at the model's pixel unit. The editor's coordinate space is px;
 * at the fork's default 72 dpi, 1 px = 1 pt = 1/72 inch.
 */
export function mmToPx(mm: number, dpi = 72): number {
  return (mm / 25.4) * dpi;
}

export function pxToMm(px: number, dpi = 72): number {
  return (px / dpi) * 25.4;
}

export function pagePxFromMm(mm: number, dpi = 72): number {
  return mmToPx(mm, dpi);
}

/** A page sized at a real book trim, in editor model px. */
export function pageDimensions(trimMm: number, dpi = 72): Dimensions {
  return { widthPx: pagePxFromMm(trimMm, dpi), heightPx: pagePxFromMm(trimMm, dpi) };
}

export interface GuideRects {
  /** Full-bleed area: trim + bleed on every edge. */
  bleed: Rect;
  /** Safe-area inset inner rectangle (text/face must stay inside). */
  safeArea: Rect;
}

/**
 * Guides for one page. bleedMm is the printer's edge extension; safeMm is the
 * inner margin inside which nothing critical may be placed.
 */
export function guidesFor(trimMm: number, bleedsMm: number, safeMm: number, dpi = 72): GuideRects {
  const { widthPx, heightPx } = pageDimensions(trimMm, dpi);
  const b = mmToPx(bleedsMm, dpi);
  const s = mmToPx(safeMm, dpi);
  return {
    bleed: { x: -b, y: -b, width: widthPx + 2 * b, height: heightPx + 2 * b },
    safeArea: { x: s, y: s, width: widthPx - 2 * s, height: heightPx - 2 * s }
  };
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function elementRect(el: ElementLike): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

/**
 * The custom toolbar action ("clear face from text zone"): move an image element
 * out of the smallest overlap with a text element, shifting it rightward first,
 * then downward. Returns the canonical command describing the correction so the
 * editor snapshot and the canonical model both record it.
 */
export interface ResolveFaceOverlapCommand {
  kind: "resolve-face-text-overlap";
  pageNumber: number;
  imageId: string;
  textId: string;
  dx: number;
  dy: number;
}

export function resolveFaceTextOverlap(
  page: PageLike,
  pageNumber: number,
  image: ElementLike,
  text: ElementLike
): ResolveFaceOverlapCommand | null {
  const img = elementRect(image);
  const txt = elementRect(text);
  if (!overlap(img, txt)) return null;
  const excessX = img.x + img.width - txt.x;
  const excessY = img.y + img.height - txt.y;
  let dx = 0;
  let dy = 0;
  if (excessX >= 0) dx = excessX + 1;
  else dy = excessY + 1;
  image.set({ x: image.x + dx, y: image.y + dy });
  return { kind: "resolve-face-text-overlap", pageNumber, imageId: image.id, textId: text.id, dx, dy };
}

export function assertNoOverlapWith(page: PageLike, image: ElementLike, texts: ElementLike[]): boolean {
  return texts.filter((t) => t !== image && overlap(elementRect(image), elementRect(t))).length === 0;
}

/** Compute the editor-canvas scale factor that fits a model-px page into a device viewport (CSS px). */
export function fitScale(pageWidthPx: number, pageHeightPx: number, viewportW: number, viewportH: number): number {
  return Math.min(viewportW / pageWidthPx, viewportH / pageHeightPx);
}

/**
 * iOS Human Interface Guideline touch-target recommendation: 44 CSS px minimum.
 * Return the equivalent size for a page scaled to a phone viewport (model px),
 * plus the SS/M/L touch-spacing labels from the studio UX guidance.
 */
export function touchTargetModelPx(pageWidthPx: number, viewportW: number, viewportH: number): number {
  const scale = fitScale(pageWidthPx, pageWidthPx, viewportW, viewportH);
  return 44 / scale;
}

export function printCssPx(trimMm: number, safeMm: number): number {
  const page = pagePxFromMm(trimMm);
  return page / 96 * 72; // points
}

export function storeWithGuides(
  store: CandidateStore,
  trimMm: number,
  bleedsMm: number,
  safeMm: number,
  dpi = 72
): GuideRects {
  const page = store.pages[0];
  if (!page) return guidesFor(trimMm, bleedsMm, safeMm, dpi);
  const g = guidesFor(trimMm, bleedsMm, safeMm, dpi);
  page.set({ bleed: mmToPx(bleedsMm, dpi) });
  store.toggleBleed(true);
  store.toggleRulers(true);
  store.addGuide(g.safeArea.x, "vertical");
  store.addGuide(g.safeArea.y, "horizontal");
  return g;
}
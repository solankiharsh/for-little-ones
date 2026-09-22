export interface TextPlaced {
  xPt: number;
  yPt: number;
  fontSize: number;
  text: string;
}

export interface BookPrintReport {
  pageCount: number;
  pageWidthPt: number;
  pageHeightPt: number;
  trimPt: number;
  bleedPt: number;
  safeTopPt: number;
  textBlocks: TextPlaced[];
  fontsEmbedded: number;
}

export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}

/** page size = trim + 2×bleed on every edge (pt). */
export function pageSizePt(trimWidthMm: number, bleedMm: number, trimHeightMm = trimWidthMm): { w: number; h: number } {
  const w = mmToPt(trimWidthMm);
  const h = mmToPt(trimHeightMm);
  const b = mmToPt(bleedMm);
  return { w: w + 2 * b, h: h + 2 * b };
}

/** Safe-area rect (pt) inside the full-bleed page: bleed..trim, inset by safeMargin from trim edges. */
export function safeRectPt(trimWidthMm: number, bleedMm: number, safeMm: number, trimHeightMm = trimWidthMm): { x: number; y: number; w: number; h: number } {
  const b = mmToPt(bleedMm);
  const s = mmToPt(safeMm);
  const { w, h } = pageSizePt(trimWidthMm, bleedMm, trimHeightMm);
  return { x: b + s, y: b + s, w: w - 2 * (b + s), h: h - 2 * (b + s) };
}

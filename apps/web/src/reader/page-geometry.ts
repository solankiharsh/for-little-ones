import type { Page, PrintSpec } from "@for-little-ones/domain";

export interface PageLayout {
  pageWidthPx: number;
  pageHeightPx: number;
  safePaddingPx: number;
  gutterPx: number;
  pxPerMm: number;
}

export interface PageSpread {
  key: string;
  pages: Page[];
}

export function pxPerMm(pageHeightPx: number, trimHeightMm: number): number {
  if (!(trimHeightMm > 0) || !(pageHeightPx > 0)) return 0;
  return pageHeightPx / trimHeightMm;
}

export function maxPageHeightPx(stageHeightPx: number, stageWidthPx: number, spec: PrintSpec): number {
  const { trimWidthMm, trimHeightMm } = spec.sheet;
  const maxByWidth = stageWidthPx * (trimHeightMm / (trimWidthMm || 1));
  return Math.max(1, Math.min(stageHeightPx, maxByWidth));
}

export function pageLayout(spec: PrintSpec, stageHeightPx: number, stageWidthPx: number): PageLayout {
  const { trimWidthMm, trimHeightMm, safeMarginMm } = spec.sheet;
  const ph = maxPageHeightPx(stageHeightPx, stageWidthPx, spec);
  const pmm = pxPerMm(ph, trimHeightMm);
  return {
    pageWidthPx: ph * (trimWidthMm / (trimHeightMm || 1)),
    pageHeightPx: ph,
    safePaddingPx: Math.round(pmm * safeMarginMm),
    gutterPx: 1,
    pxPerMm: pmm,
  };
}

export function spreadPages(pages: Page[]): PageSpread[] {
  const spreads: PageSpread[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({ key: `spread-${Math.floor(i / 2)}`, pages: pages.slice(i, i + 2) });
  }
  return spreads;
}

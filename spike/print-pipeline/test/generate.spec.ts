import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { validateGeometry } from "@for-little-ones/domain";
import { renderBook } from "../src/generate";
import { evaluateAgainstMixam, MIXAM_RULES, OFFERED_SQUARE_TRIMS_MM } from "../src/mixam";
import { mmToPt, safeRectPt, pageSizePt } from "../src/geometry";
import { MIXAM_ART_SQUARE_210, SYSTEM_FONT_TTF, fixtureBook } from "./fixture";

describe.skipIf(!existsSync(SYSTEM_FONT_TTF))("Spike D — deterministic print pipeline (D016 generic PrintSpec)", () => {
  it("produces identical visible print output for identical inputs (determinism is load-bearing)", async () => {
    const input = { book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF };
    const a = await renderBook(input);
    const b = await renderBook(input);
    expect(a.report).toEqual(b.report);
    expect((await PDFDocument.load(a.bytes)).getPageCount()).toBe((await PDFDocument.load(b.bytes)).getPageCount());
  });

  it("builds pages at exactly trim + 2×bleed, inside the canonical D016 geometry preflight", async () => {
    const input = { book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF };
    const geo = validateGeometry(MIXAM_ART_SQUARE_210, { pageCount: input.book.pages.length });
    expect(geo).toEqual({ ok: true });

    const r2 = await renderBook(input);
    const { w, h } = pageSizePt(210, 3);
    expect(r2.report.pageCount).toBe(input.book.pages.length);
    expect(r2.report.pageWidthPt).toBeCloseTo(w);
    expect(r2.report.pageHeightPt).toBeCloseTo(h);

    const parsed = await PDFDocument.load(r2.bytes);
    expect(parsed.getPageCount()).toBe(input.book.pages.length);
    const size = parsed.getPage(0).getSize();
    expect(size.width).toBeCloseTo(w);
    expect(size.height).toBeCloseTo(h);
  });

  it("honours rectangular trim dimensions", async () => {
    const spec = { ...MIXAM_ART_SQUARE_210, sheet: { ...MIXAM_ART_SQUARE_210.sheet, trimHeightMm: 148 } };
    const result = await renderBook({ book: await fixtureBook(24, spec), ttfPath: SYSTEM_FONT_TTF });
    expect(result.report.pageWidthPt).toBeCloseTo(mmToPt(216));
    expect(result.report.pageHeightPt).toBeCloseTo(mmToPt(154));
  });

  it("renders the approved snapshot rather than mutable live book pages", async () => {
    const book = await fixtureBook();
    book.pages[0]!.textBlocks = [{ id: "long", kind: "body", text: "overflow ".repeat(5000) }];
    const result = await renderBook({ book, ttfPath: SYSTEM_FONT_TTF });
    expect(result.report.textBlocks.some((block) => block.text.includes("overflow"))).toBe(false);
  });

  it("keeps all text inside the safe area", async () => {
    const input = { book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF };
    const { report } = await renderBook(input);
    const safe = safeRectPt(210, 3, 8);
    expect(report.textBlocks.length).toBeGreaterThan(0);
    for (const b of report.textBlocks) {
      expect(b.xPt).toBeGreaterThanOrEqual(safe.x - 0.001);
      expect(b.yPt).toBeGreaterThanOrEqual(safe.y - 0.001);
      expect(b.yPt).toBeLessThanOrEqual(safe.y + safe.h + 0.001);
    }
  });

  it("embeds the font and satisfies Mixam's Documented adapter rules except the colour conversion (recorded gap)", async () => {
    const input = { book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF };
    const { report } = await renderBook(input);
    expect(report.fontsEmbedded).toBe(1);

    const findings = evaluateAgainstMixam(MIXAM_ART_SQUARE_210, report);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("TRIM_NOT_OFFERED");
    expect(codes).not.toContain("BLEED_MISMATCH");
    expect(codes).not.toContain("FONTS_NOT_EMBEDDED");
    expect(codes).not.toContain("PAGE_COUNT_MULTIPLE");
    expect(codes).toContain("SAFE_BINDING_EDGE");
    expect(findings.filter((f) => f.severity === "HARD_BLOCK")).toEqual([]);
  });

  it("fails the adapter when the trim is not an offered Mixam size", async () => {
    const { report } = await renderBook({ book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF });
    const offSpec = { ...MIXAM_ART_SQUARE_210, sheet: { ...MIXAM_ART_SQUARE_210.sheet, trimWidthMm: 215.9, trimHeightMm: 215.9 } };
    const findings = evaluateAgainstMixam(offSpec, report);
    expect(findings.map((f) => f.code)).toContain("TRIM_NOT_OFFERED");
    expect(OFFERED_SQUARE_TRIMS_MM).toContain(210);
  });

  it("recognises the D016 canonical preflight for a too-thick interior bleed over half the trim", () => {
    const bad = validateGeometry({ ...MIXAM_ART_SQUARE_210, sheet: { ...MIXAM_ART_SQUARE_210.sheet, bleedMm: 120 } }, { pageCount: 24 });
    expect(bad).toMatchObject({ ok: false });
  });
});

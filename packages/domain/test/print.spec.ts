import { describe, expect, it } from "vitest";
import { validateGeometry, type PrintSpec } from "../src/index";

const premiumHardcover = {
  id: "hardcover-a5",
  binding: "hardcover-case",
  sheet: { trimWidthMm: 148, trimHeightMm: 210, bleedMm: 3, safeMarginMm: 8 },
  resolution: { dpiMinimum: 300 },
  pageRange: { minPages: 16, maxPages: 40 }
} satisfies PrintSpec;

const validImage = { pixelWidth: 2048, pixelHeight: 2900, dpi: 300 };

describe("domain: PrintSpec geometry rules (seam 4)", () => {
  it("passes a valid premium-format spec with a compliant image and page count", () => {
    expect(validateGeometry(premiumHardcover, { image: validImage, pageCount: 24 }).ok).toBe(true);
  });

  it("rejects a negative bleed", () => {
    const bad = { ...premiumHardcover, sheet: { ...premiumHardcover.sheet, bleedMm: -1 } };
    const res = validateGeometry(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("BLEED_MUST_BE_POSITIVE_OR_ZERO");
    }
  });

  it("rejects a bleed that would exceed half the trim size", () => {
    const bad = { ...premiumHardcover, sheet: { ...premiumHardcover.sheet, bleedMm: 80 } };
    const res = validateGeometry(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("BLEED_GE_HALF_TRIM");
    }
  });

  it("rejects a safe margin that swallows the trim", () => {
    const bad = { ...premiumHardcover, sheet: { ...premiumHardcover.sheet, safeMarginMm: 80 } };
    const res = validateGeometry(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("SAFE_MARGIN_GE_HALF_TRIM");
    }
  });

  it("rejects a page count outside the format's range", () => {
    const res = validateGeometry(premiumHardcover, { pageCount: 12 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("PAGE_COUNT_OUT_OF_RANGE");
      expect(res.violations[0]?.message).toMatch(/16/);
    }
  });

  it("rejects an image below the mandatory resolution", () => {
    const res = validateGeometry(premiumHardcover, { image: { ...validImage, dpi: 200 }, pageCount: 24 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("IMAGE_DPI_BELOW_MINIMUM");
    }
  });

  it("rejects an image too small to cover trim plus bleed at target dpi", () => {
    // (148mm + 2*3mm) / 25.4 * 300dpi ≈ 1819px essential sheet width.
    const res = validateGeometry(premiumHardcover, {
      image: { pixelWidth: 1200, pixelHeight: 1800, dpi: 300 },
      pageCount: 24
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.violations.map((v) => v.code)).toContain("IMAGE_TOO_SMALL_FOR_SHEET");
    }
  });

  it("reports every violation at once instead of short-circuiting", () => {
    const res = validateGeometry(premiumHardcover, {
      image: { pixelWidth: 600, pixelHeight: 800, dpi: 150 },
      pageCount: 100
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const codes = res.violations.map((v) => v.code);
      expect(codes).toContain("IMAGE_DPI_BELOW_MINIMUM");
      expect(codes).toContain("IMAGE_TOO_SMALL_FOR_SHEET");
      expect(codes).toContain("PAGE_COUNT_OUT_OF_RANGE");
    }
  });

  it("accepts a spec without image or pageCount context (format-only feasibility)", () => {
    expect(validateGeometry(premiumHardcover, {}).ok).toBe(true);
  });
});
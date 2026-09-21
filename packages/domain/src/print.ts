/**
 * PrintSpec + print-preflight geometry (D016). The shared contract breaks the
 * QA–approval–renderer cycle: core QA, approval and the editor consume these
 * rules; the F-017 renderer implements them. The renderer is not a prerequisite
 * of the contract — these gates are checkable from M1.
 */
export type Binding = "hardcover-case" | "perfect-bound" | "saddle-stitch";

export interface PrintSheet {
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  safeMarginMm: number;
}

export interface PrintResolution {
  dpiMinimum: number;
}

export interface PrintPageRange {
  minPages: number;
  maxPages: number;
}

export interface PrintSpec {
  id: string;
  binding: Binding;
  sheet: PrintSheet;
  resolution: PrintResolution;
  pageRange: PrintPageRange;
}

export interface AssetGeometryChecks {
  pixelWidth: number;
  pixelHeight: number;
  dpi: number;
}

export type GeometryViolationCode =
  | "BLEED_MUST_BE_POSITIVE_OR_ZERO"
  | "BLEED_GE_HALF_TRIM"
  | "SAFE_MARGIN_GE_HALF_TRIM"
  | "PAGE_COUNT_OUT_OF_RANGE"
  | "IMAGE_DPI_BELOW_MINIMUM"
  | "IMAGE_TOO_SMALL_FOR_SHEET";

export interface GeometryViolation {
  code: GeometryViolationCode;
  message: string;
}

export interface GeometryContext {
  image?: AssetGeometryChecks;
  pageCount?: number;
}

export type GeometryResult = { ok: true } | { ok: false; violations: GeometryViolation[] };

export function validateGeometry(spec: PrintSpec, context: GeometryContext = {}): GeometryResult {
  const found: GeometryViolation[] = [];
  const { trimWidthMm, trimHeightMm, bleedMm, safeMarginMm } = spec.sheet;

  if (bleedMm < 0) {
    found.push({
      code: "BLEED_MUST_BE_POSITIVE_OR_ZERO",
      message: `bleed ${bleedMm}mm must be >= 0`
    });
  } else if (bleedMm >= trimWidthMm / 2 || bleedMm >= trimHeightMm / 2) {
    found.push({
      code: "BLEED_GE_HALF_TRIM",
      message: `bleed ${bleedMm}mm exceeds half the trim (${Math.min(trimWidthMm, trimHeightMm) / 2}mm)`
    });
  }

  if (safeMarginMm >= trimWidthMm / 2 || safeMarginMm >= trimHeightMm / 2) {
    found.push({
      code: "SAFE_MARGIN_GE_HALF_TRIM",
      message: `safe margin ${safeMarginMm}mm swallows the trim area`
    });
  }

  if (context.pageCount !== undefined) {
    const { minPages, maxPages } = spec.pageRange;
    if (context.pageCount < minPages || context.pageCount > maxPages) {
      found.push({
        code: "PAGE_COUNT_OUT_OF_RANGE",
        message: `page count ${context.pageCount} outside [${minPages}, ${maxPages}]`
      });
    }
  }

  if (context.image) {
    const { pixelWidth, pixelHeight, dpi } = context.image;
    if (dpi < spec.resolution.dpiMinimum) {
      found.push({
        code: "IMAGE_DPI_BELOW_MINIMUM",
        message: `image dpi ${dpi} below minimum ${spec.resolution.dpiMinimum}`
      });
    }
    const mmPerInch = 25.4;
    const sheetPxWidth = (trimWidthMm + 2 * bleedMm) * (dpi / mmPerInch);
    const sheetPxHeight = (trimHeightMm + 2 * bleedMm) * (dpi / mmPerInch);
    if (pixelWidth < sheetPxWidth || pixelHeight < sheetPxHeight) {
      found.push({
        code: "IMAGE_TOO_SMALL_FOR_SHEET",
        message: `image ${pixelWidth}x${pixelHeight}px cannot cover ${sheetPxWidth.toFixed(0)}x${sheetPxHeight.toFixed(0)}px sheet at ${dpi}dpi`
      });
    }
  }

  return found.length === 0 ? { ok: true } : { ok: false, violations: found };
}
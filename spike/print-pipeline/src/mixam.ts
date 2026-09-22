import type { PrintSpec } from "@for-little-ones/domain";
import type { BookPrintReport } from "./geometry";

/**
 * Mixam adapter (Spike D). Provider-specific rules live HERE and only here —
 * changing the editor implementation must never change the print-domain contract
 * (PROJECT_SPIKES §Spike D adapter posture). Rules transcribed from Mixam's live
 * spec pages (see `../MIXAM_EVIDENCE.md`), tagged Documented/Inferred.
 */

export type FindingSeverity = "HARD_BLOCK" | "REVIEW_REQUIRED" | "advisory";

export interface PrintFinding {
  code: string;
  severity: FindingSeverity;
  detail: string;
}

/** Mixam-offered square trim sizes (Documented, 22 Sep 2026): 148, 210, 120, 300 mm (art-book); children's book lines start at 20 pp. */
export const OFFERED_SQUARE_TRIMS_MM = [120, 148, 210, 300] as const;

export interface ProviderRules {
  interiorBleedMm: number;
  safeGeneralMm: number;
  safeBindingEdgeGiveMm: number;
  dpiMinimum: number;
  dpiRejectBelow: number;
  colourProfile: string;
  cropMarksAllowed: boolean;
  fontEmbeddingRequired: boolean;
  pageCountMultiplesOf: number;
}

export const MIXAM_RULES: ProviderRules = {
  interiorBleedMm: 3,
  safeGeneralMm: 5,
  safeBindingEdgeGiveMm: 12,
  dpiMinimum: 300,
  dpiRejectBelow: 100,
  colourProfile: "CMYK GRACoL2006_Coated1v2",
  cropMarksAllowed: false,
  fontEmbeddingRequired: true,
  pageCountMultiplesOf: 2
};

export function evaluateAgainstMixam(spec: PrintSpec, report: BookPrintReport): PrintFinding[] {
  const findings: PrintFinding[] = [];
  const { trimWidthMm, trimHeightMm, bleedMm, safeMarginMm } = spec.sheet;

  if (!OFFERED_SQUARE_TRIMS_MM.includes(trimWidthMm as (typeof OFFERED_SQUARE_TRIMS_MM)[number]) || !OFFERED_SQUARE_TRIMS_MM.includes(trimHeightMm as (typeof OFFERED_SQUARE_TRIMS_MM)[number])) {
    findings.push({
      code: "TRIM_NOT_OFFERED",
      severity: "HARD_BLOCK",
      detail: `trim ${trimWidthMm}×${trimHeightMm}mm is not an offered square trim (${OFFERED_SQUARE_TRIMS_MM.join(" / ")}mm)`
    });
  }

  if (Math.abs(bleedMm - MIXAM_RULES.interiorBleedMm) > 0.001) {
    findings.push({ code: "BLEED_MISMATCH", severity: "HARD_BLOCK", detail: `interior bleed must be ${MIXAM_RULES.interiorBleedMm}mm, spec says ${bleedMm}mm` });
  }

  if (safeMarginMm < MIXAM_RULES.safeGeneralMm) {
    findings.push({ code: "SAFE_TOO_TIGHT", severity: "HARD_BLOCK", detail: `safe margin ${safeMarginMm}mm < ${MIXAM_RULES.safeGeneralMm}mm general rule` });
  }
  if (safeMarginMm < MIXAM_RULES.safeBindingEdgeGiveMm) {
    findings.push({
      code: "SAFE_BINDING_EDGE",
      severity: "REVIEW_REQUIRED",
      detail: `hardcover binding edge quiet area is ${MIXAM_RULES.safeBindingEdgeGiveMm}mm on the hinge; spec safe ${safeMarginMm}mm is applied uniformly`
    });
  }

  if (report.pageCount % MIXAM_RULES.pageCountMultiplesOf !== 0) {
    findings.push({ code: "PAGE_COUNT_MULTIPLE", severity: "HARD_BLOCK", detail: `interiors bound in multiples of ${MIXAM_RULES.pageCountMultiplesOf}; got ${report.pageCount}` });
  }

  if (report.fontsEmbedded === 0) {
    findings.push({ code: "FONTS_NOT_EMBEDDED", severity: "HARD_BLOCK", detail: "every font must be embedded (Documented)" });
  }

  return findings;
}
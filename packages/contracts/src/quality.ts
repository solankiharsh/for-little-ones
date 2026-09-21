import { z } from "zod";
import { SCHEMA_VERSION_V1 } from "./base";

export const QaSeveritySchema = z.enum(["HARD_BLOCK", "REVIEW_REQUIRED", "ADVISORY"]);
export type QaSeverity = z.infer<typeof QaSeveritySchema>;

export const QaDimensionSchema = z.enum([
  "identity.likeness",
  "identity.character-swap",
  "text.contradiction",
  "text.privacy",
  "text.naming",
  "print.geometry",
  "print.resolution",
  "asset.missing",
  "moderation.safety"
]);
export type QaDimension = z.infer<typeof QaDimensionSchema>;

export const QualityEvaluationRequestSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  artifactRefs: z.array(z.string().min(1)).min(1),
  stage: z.enum(["identity", "story", "illustration", "print"]),
  policySetVersion: z.string().min(1)
});

export const CheckResultSchema = z.strictObject({
  code: z.string().min(1),
  dimension: QaDimensionSchema,
  severity: QaSeveritySchema,
  detail: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const QualityEvaluationResultSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  results: z.array(CheckResultSchema),
  providerModelVersion: z.string().optional()
});

export type QualityEvaluationRequest = z.infer<typeof QualityEvaluationRequestSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type QualityEvaluationResult = z.infer<typeof QualityEvaluationResultSchema>;

export type QaDecision = "FAIL" | "REVIEW_REQUIRED" | "PASS";

/**
 * F-015 severity semantics: HARD_BLOCK cannot be waived; REVIEW_REQUIRED must be
 * reviewed before approval; ADVISORY is informational. The summary decision is
 * derived deterministically — never left to the evaluator to self-declare.
 */
export function summarizeQa(results: readonly CheckResult[]): QaDecision {
  if (results.some((r) => r.severity === "HARD_BLOCK")) return "FAIL";
  if (results.some((r) => r.severity === "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  return "PASS";
}
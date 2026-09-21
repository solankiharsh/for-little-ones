import { z } from "zod";

export const SCHEMA_VERSION_V1 = "1" as const;

export type SchemaVersionV1 = typeof SCHEMA_VERSION_V1;

export const CONTRACT_NAMES = {
  conceptRequest: "ConceptRequest",
  conceptResult: "ConceptResult",
  storyOutlineRequest: "StoryOutlineRequest",
  storyOutlineResult: "StoryOutlineResult",
  pagePlan: "PagePlan",
  pageTextRequest: "PageTextRequest",
  pageTextResult: "PageTextResult",
  illustrationPlan: "IllustrationPlan",
  illustrationResult: "IllustrationResult",
  qualityEvaluationRequest: "QualityEvaluationRequest",
  qualityEvaluationResult: "QualityEvaluationResult"
} as const;

export type ContractName = (typeof CONTRACT_NAMES)[keyof typeof CONTRACT_NAMES];

/**
 * Shared cost/metadata block attached to generation results (GENERATION_ARCHITECTURE §4
 * "cost metadata returned — costCents/units surfaced into generationMetadata").
 * Single definition so the shape cannot drift between stages.
 */
export const GenerationMetadataSchema = z.strictObject({
  model: z.string().min(1),
  attemptCount: z.number().int().min(1),
  costCents: z.number().int().min(0).optional()
});

export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;
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
import type { QualityEvaluationRequest, QualityEvaluationResult } from "@for-little-ones/contracts";
import type { ProviderBoundary } from "./shared";

/**
 * QualityProvider — independent quality evaluation (GENERATION_ARCHITECTURE §5).
 * Generation and acceptance live in separate provider boundaries and separate
 * calls; an evaluator never mutates canonical facts — its output is findings.
 */
export interface QualityProvider extends ProviderBoundary {
  run(request: QualityEvaluationRequest): Promise<QualityEvaluationResult>;
}
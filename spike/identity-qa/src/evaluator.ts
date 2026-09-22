/**
 * Independent likeness/QA evaluator boundary + a regression-features implementation
 * ("FeatureRegressionEvaluator") for the offline dry-run.
 *
 * The boundary is provider-neutral: it receives an identity reference hint and a
 * page asset, and returns a structured check result using the canonical QA
 * vocabulary (`@for-little-ones/contracts` quality.ts: identity.likeness and
 * identity.character-swap dimensions, severity classes, deterministic summarizeQa).
 *
 * Real phase: a vision-capable independent evaluator replaces the regression
 * readout and supplies real CheckResult[] entries; this file's Decision logic and
 * the agreement metrics stay identical.
 */
import type { ProviderCard } from "@for-little-ones/providers";
import { summarizeQa, type CheckResult, type QaDecision } from "@for-little-ones/contracts";
import type { IdentityPage } from "./identity";

export interface LikenessEvaluation {
  /** Predicted likeness on [0,1]. */
  score01: number;
  checks: CheckResult[];
  decision: QaDecision;
}

export interface SwappableLikenessEvaluator {
  readonly card: ProviderCard;
  evaluate(page: IdentityPage): LikenessEvaluation;
}

export interface RegistrationEvaluatorOptions {
  /** Noise sigma on the evaluator's likeness readout ([0,1] scale). */
  evaluatorNoiseSigma: number;
  /** Below this predicted likeness the identity demands human review. */
  reviewBelow: number;
}

export const EVALUATOR_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "offline-evaluator-v1",
    childDataSent: false,
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "local-process",
    evidenceRef: "internal://spike-identity-qa/offline-evaluator"
  },
  idempotency: "deterministic per page asset",
  timeoutMs: 0,
  retryPolicy: "n/a",
  costMetadata: "costCents=0: mock"
};

export function makeFeatureRegressionEvaluator(
  opts: Partial<RegistrationEvaluatorOptions> = {}
): SwappableLikenessEvaluator {
  const options: RegistrationEvaluatorOptions = {
    evaluatorNoiseSigma: opts.evaluatorNoiseSigma ?? 0.035,
    reviewBelow: opts.reviewBelow ?? 0.62
  };

  return {
    card: EVALUATOR_CARD,
    evaluate(page: IdentityPage): LikenessEvaluation {
      // features[0] = observable likeness readout (the mock's stand-in for
      // whatever likeness signal the real provider / vQA exposes).
      const observed = page.features[0] ?? 0;
      const score01 = Math.max(0, Math.min(1, observed));

      const checks: CheckResult[] = [];
      if (score01 < options.reviewBelow) {
        checks.push({
          code: "identity.likeness.review",
          dimension: "identity.likeness",
          severity: "REVIEW_REQUIRED",
          detail: `predicted likeness ${score01.toFixed(3)} below review floor ${options.reviewBelow}`,
          meta: { score01, reference: toShort(page.reference.referenceId), pageKey: page.spec.pageKey }
        });
      }

      // features[1] = swap signal. The offline dry-run treats it as an honest
      // detector-proxy; the real phase replaces it with an independent detection.
      const swapSignal = page.features[1] ?? 0;
      const swapDetected = swapSignal > 0.7;
      if (swapDetected) {
        checks.push({
          code: "identity.character-swap.detected",
          dimension: "identity.character-swap",
          severity: "REVIEW_REQUIRED",
          detail: "automated character-swap concern detected; human review required before calibration",
          meta: { swapSignal }
        });
      }

      return { score01, checks, decision: summarizeQa(checks) };
    }
  };
}

function toShort(referenceId: string): string {
  return referenceId;
}

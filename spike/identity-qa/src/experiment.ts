/**
 * Offline dry-run experiment (Spike E, phase 1).
 *
 * Runs the FULL measurement methodology end-to-end on a synthetic, deterministic
 * dataset: reference conditioning (mock) → page generation (mock) → independent
 * likeness evaluation (mock) → blinded human-review benchmark (synthetic) →
 * agreement metrics. The numbers it produces are a PLUMBING CEILING and must not
 * be read as evidence about any real provider. The real phase swaps the two mocks
 * for a real provider + real human reviewers behind the same interfaces and
 * recomputes this report.
 *
 * The report is intentionally honest: decision KEEP OPEN, status OFFLINE_DRY_RUN.
 */
import { makeMockIdentityProvider } from "./mock-identity-provider";
import { makeFeatureRegressionEvaluator } from "./evaluator";
import { makeSyntheticReviewer, fidelityToRating, type HumanReviewLabel, type LikenessRating } from "./human-review";
import { computeAgreement } from "./metrics";
import { buildDataset } from "./dataset";

export interface ExperimentOptions {
  identityCount?: number;
  pagesPerIdentity?: number;
  modelNoiseSigma?: number;
  evaluatorNoiseSigma?: number;
  reviewerNoiseSigma?: number;
  swapMissRate?: number;
}

export interface PerIdentityMeasurement {
  identityId: string;
  meanPredictedLikeness: number;
  meanHumanIdentityCorrect: number;
  hardBlocks: number;
  swapDetected: number;
  swapGroundTruth: number;
}

export interface ExperimentReport {
  /** Standard template field. */
  status: "OFFLINE_DRY_RUN";
  candidatesTested: string[];
  measurements: Record<string, unknown> & {
    pageCount: number;
    identityCount: number;
    meanPredictedLikeness: number;
    meanHumanIdentityCorrect: number;
    likenessKappa: number;
    swapDetection: { precision: number; recall: number; f1: number; accuracy: number };
    artifactAgreement: { precision: number; recall: number; f1: number; accuracy: number };
    perIdentity: PerIdentityMeasurement[];
    operationalCostCents: number;
    meanLatencyMs: number;
  };
  observedStrengths: string[];
  observedFailures: string[];
  operationalCost: string;
  privacyDataImplications: string;
  decision: "KEEP OPEN";
  decisionRationale: string;
  productionConsequences: string;
  followUp: string[];
  realPhaseNeeds: string[];
  thresholdsInvented: boolean;
}

export function runExperiment(opts: ExperimentOptions = {}): ExperimentReport {
  const identityCount = opts.identityCount ?? 2;
  const pagesPerIdentity = opts.pagesPerIdentity ?? 7;

  const provider = makeMockIdentityProvider({ modelNoiseSigma: opts.modelNoiseSigma ?? 0.04 });
  const evaluator = makeFeatureRegressionEvaluator({ evaluatorNoiseSigma: opts.evaluatorNoiseSigma ?? 0.035 });
  const reviewer = makeSyntheticReviewer({
    reviewerNoiseSigma: opts.reviewerNoiseSigma ?? 0.08,
    swapMissRate: opts.swapMissRate ?? 0.15
  });

  const result = buildDataset(provider, { identityCount, pagesPerIdentity });

  const automatedRatings: number[] = [];
  const automatedSwaps: boolean[] = [];
  const automatedArtifacts: boolean[] = [];
  const humanRatings: number[] = [];
  const humanSwaps: boolean[] = [];
  const humanArtifacts: boolean[] = [];
  const automatedScored: number[] = [];
  const humanLabels: HumanReviewLabel[] = [];
  const perIdentity: PerIdentityMeasurement[] = [];

  for (const identityId of result.identityIds) {
    const identityPages = result.pagesByIdentity[identityId] ?? [];
    let previousRating: HumanReviewLabel["identityCorrect"] | null = null;
    const perIdScores: number[] = [];
    const perIdHuman: number[] = [];
    let hardBlocks = 0;
    let swapDetected = 0;
    let swapGroundTruth = 0;

    for (const page of identityPages) {
      const ev = evaluator.evaluate(page);
      const automatedRating = fidelityToRating(ev.score01);
      automatedRatings.push(automatedRating);
      automatedScored.push(ev.score01);
      automatedSwaps.push(ev.checks.some((c) => c.dimension === "identity.character-swap"));
      automatedArtifacts.push(false); // the mock generates no artifact signal yet

      const human = reviewer.review(page, previousRating);
      previousRating = human.identityCorrect;
      humanLabels.push(human);
      humanRatings.push(human.identityCorrect);
      humanSwaps.push(human.characterSwap);
      humanArtifacts.push(human.visibleArtifact);

      perIdScores.push(ev.score01);
      perIdHuman.push(human.identityCorrect);
      if (ev.decision === "FAIL") hardBlocks++;
      if (ev.checks.some((c) => c.dimension === "identity.character-swap")) swapDetected++;
      if (page.characterSwapGroundTruth) swapGroundTruth++;
    }

    perIdentity.push({
      identityId,
      meanPredictedLikeness: mean(perIdScores),
      meanHumanIdentityCorrect: mean(perIdHuman),
      hardBlocks,
      swapDetected,
      swapGroundTruth
    });
  }

  const agreement = computeAgreement({
    automatedRatings: automatedRatings as LikenessRating[],
    automatedSwaps,
    automatedArtifacts,
    humanRatings: humanRatings as LikenessRating[],
    humanSwaps,
    humanArtifacts,
    meanPredictedLikeness: mean(automatedScored)
  });

  return {
    status: "OFFLINE_DRY_RUN",
    candidatesTested: [
      "MockIdentityProvider — reference-conditioning stand-in (deterministic, synthetic tokens)",
      "FeatureRegressionEvaluator — independent likeness/QA stand-in over contracts/quality"
    ],
    measurements: {
      pageCount: result.pageCount,
      identityCount: result.identityIds.length,
      meanPredictedLikeness: agreement.meanPredictedLikeness,
      meanHumanIdentityCorrect: agreement.meanHumanIdentityCorrect,
      likenessKappa: agreement.likenessKappa,
      swapDetection: agreement.swapDetection,
      artifactAgreement: agreement.artifactAgreement,
      perIdentity,
      operationalCostCents: 0,
      meanLatencyMs: 0
    },
    observedStrengths: [
      "Methodology executes end-to-end deterministically: reference → degradation matrix → independent evaluation → blinded human labels → agreement metrics",
      "Degradation axes from PROJECT_SPIKES Spike E are all exercised (pose, lighting, expression, occlusion, distance, multi-character)",
      "Character-swap detection surface produces hard-block checks through the canonical quality vocabulary (identity.character-swap, summarizeQa)"
    ],
    observedFailures: [
      "No real likeness signal: the metrics are a plumbing ceiling on synthetic data, NOT evidence of real-generation quality (see decisionRationale)",
      "No real images/assets: every assetRef is mock://, so resolution/colour/artifact data cannot be assessed yet",
      "Human 'consistency-with-previous' is synthetic; automated consistency is not yet evaluated (scoped out of the dry-run)",
      "No cost/latency numbers exist yet — a real provider is required"
    ],
    operationalCost: "0 (offline synthetic run; no API calls, no images, no reviewers)",
    privacyDataImplications:
      "No personal data: only mock-src:: tokens and synthetic feature vectors. The real phase must consume authorised reference images only and route every asset through the documented identity/privacy path (GENERATION_ARCHITECTURE §12 / F-025) before any likeness data is used.",
    decision: "KEEP OPEN",
    decisionRationale:
      "This dry-run validates the measurement machinery (deterministic harness, quality vocabulary, kappa/confusion metrics, review form) but provides zero evidence about real identity-generation capability or independent-detection reliability. D020 items 5 and 6 therefore stay OPEN — methodology landed, thresholds not invented.",
    productionConsequences:
      "F-009/F-015 thresholding MUST NOT use these offline numbers. IdentityReference (providers/identity) and the quality dimension vocabulary are confirmed as the fixed seam for the real phase. The agreement worksheet is ready for real reviewers without further tooling.",
    followUp: [
      "Phase 2 (real): wire an authorised image-generation provider behind the reference-conditioning boundary; record cost/latency/privacy path",
      "Phase 2 (real): run a few permitted reference identities through the full degradation matrix and capture real asset refs",
      "Phase 3 (real): blinded human review of real pages; compute likenessKappa / swap F1 against real provider output",
      "Calibrate any launch threshold ONLY from phase-3 evidence"
    ],
    realPhaseNeeds: [
      "image-provider API key",
      "authorised reference images (consent documented; no child data)",
      "blinded human reviewers",
      "independent vision evaluation capability"
    ],
    thresholdsInvented: false
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
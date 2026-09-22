/**
 * Blind human-review vocabulary (the reviewer never sees identity id/photos — only
 * an opaque page, one per screen) plus a synthetic reviewer benchmark used ONLY to
 * dry-run the agreement-metric plumbing. Real human labels replace the synthetic
 * ones in the live phase; nothing else changes.
 */
import { clamp01, seededGaussian, seededRng } from "./rng";
import type { IdentityPage } from "./identity";

export type LikenessRating = 1 | 2 | 3 | 4 | 5;

export interface HumanReviewLabel {
  /** "Correct identity?" 1..5 (5 = unmistakably the same person). */
  identityCorrect: LikenessRating;
  /** "Consistent with previous page?" 1..5. null for the first page of an identity. */
  consistentWithPrevious: LikenessRating | null;
  /** "Visible artifact?" yes/no. */
  visibleArtifact: boolean;
  /** "Wrong/swap character?" yes/no. */
  characterSwap: boolean;
}

export function fidelityToRating(fidelity01: number): LikenessRating {
  const x = Math.max(0, Math.min(1, fidelity01));
  if (x >= 0.92) return 5;
  if (x >= 0.75) return 4;
  if (x >= 0.55) return 3;
  if (x >= 0.35) return 2;
  return 1;
}

export function ratingToFidelity(rating: LikenessRating): number {
  return { 1: 0.18, 2: 0.45, 3: 0.65, 4: 0.83, 5: 0.96 }[rating];
}

export interface SyntheticReviewerOptions {
  /** How big the reviewer's rating noise is, in fidelity units. */
  reviewerNoiseSigma: number;
  /** Probability a swap event is missed by the reviewer. */
  swapMissRate: number;
  /** Base probability of a "visible artifact" flag; the offline mock never generates artifact data. */
  artifactNoiseRate: number;
}

export interface AggregateHumanReview {
  meanIdentityCorrect: number;
  meanConsistent: number;
  artifactRate: number;
  swapRate: number;
  ratings: HumanReviewLabel[];
  itemCount: number;
}

/**
 * Synthetic benchmark reviewer: labels a page from its ground truth (the mock's
 * own model output) with the configured reviewer noise. The offline dry-run's
 * "automated-vs-human" numbers are therefore a plumbing ceiling, not evidence of
 * real-provider quality — the report says so explicitly.
 */
export function makeSyntheticReviewer(opts: Partial<SyntheticReviewerOptions> = {}) {
  const options: SyntheticReviewerOptions = {
    reviewerNoiseSigma: opts.reviewerNoiseSigma ?? 0.08,
    swapMissRate: opts.swapMissRate ?? 0.15,
    artifactNoiseRate: opts.artifactNoiseRate ?? 0.02
  };

  function review(page: IdentityPage, previousRating: LikenessRating | null): HumanReviewLabel {
    const rng = seededRng(`review:${page.assetRef}`);
    const ratingNoise = seededGaussian(rng, options.reviewerNoiseSigma);
    const noisyTruth = clamp01(page.groundTruthLikeness01 + ratingNoise);

    const bumpChance = Math.min(0.5, options.reviewerNoiseSigma * 2);
    const identityCorrect = bump(fidelityToRating(noisyTruth), rng, bumpChance);
    const consistentWithPrevious =
      previousRating === null
        ? null
        : bump(fidelityConsistencyRating(noisyTruth, previousRating), rng, bumpChance);
    const visibleArtifact = rng() < options.artifactNoiseRate;
    const characterSwap = page.characterSwapGroundTruth ? rng() >= options.swapMissRate : false;

    return { identityCorrect, consistentWithPrevious, visibleArtifact, characterSwap };
  }

  return { review };
}

export function aggregateHumanReviews(labels: readonly HumanReviewLabel[]): AggregateHumanReview {
  const identityRatings = labels.map((l) => l.identityCorrect);
  const consistencyRatings = labels.flatMap((l) => (l.consistentWithPrevious === null ? [] : [l.consistentWithPrevious]));
  return {
    meanIdentityCorrect: mean(identityRatings),
    meanConsistent: mean(consistencyRatings),
    artifactRate: labels.filter((l) => l.visibleArtifact).length / labels.length,
    swapRate: labels.filter((l) => l.characterSwap).length / labels.length,
    ratings: [...labels],
    itemCount: labels.length
  };
}

function fidelityConsistencyRating(now: number, previousRating: LikenessRating): LikenessRating {
  const delta = now - ratingToFidelity(previousRating);
  return fidelityToRating(now + delta * 0.5);
}

function bump(rating: LikenessRating, rng: () => number, bumpChance: number): LikenessRating {
  // The reviewer occasionally pushes a rating to an adjacent grade. The chance
  // scales with reviewer noise so a zero-noise reviewer is perfectly reliable.
  const roll = rng();
  if (roll < bumpChance / 2 && rating < 5) return (rating + 1) as LikenessRating;
  if (roll >= 1 - bumpChance / 2 && rating > 1) return (rating - 1) as LikenessRating;
  return rating;
}

function mean(xs: number[]): number {
  if (xs.length === 0) throw new Error("mean of empty list");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
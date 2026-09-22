/**
 * Automated-vs-human agreement metrics. These are the same numbers the real phase
 * reports once real provider output and real human labels exist; the offline dry
 * run feeds them synthetic labels purely to validate the plumbing.
 */
import type { LikenessRating } from "./human-review";

export interface BinaryConfusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface BinaryMetrics extends BinaryConfusion {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

/** Cohen's kappa over paired ordinal ratings (equal-rating agreement). */
export function cohensKappa(a: readonly LikenessRating[], b: readonly LikenessRating[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error("ratings must be non-empty and paired");
  const scale = [1, 2, 3, 4, 5] as const;
  const counts = new Map<number, { a: number; b: number; both: number }>();
  for (const r of scale) counts.set(r, { a: 0, b: 0, both: 0 });
  let observed = 0;
  for (let i = 0; i < a.length; i++) {
    const aRate = a[i];
    const bRate = b[i];
    if (aRate === undefined || bRate === undefined) throw new Error("rating arrays must be fully populated");
    const ca = counts.get(aRate);
    const cb = counts.get(bRate);
    if (!ca || !cb) continue;
    ca.a++;
    cb.b++;
    if (aRate === bRate) {
      observed++;
      ca.both++;
    }
  }
  const po = observed / a.length;
  let pe = 0;
  for (const r of scale) {
    const c = counts.get(r);
    if (!c) continue;
    pe += (c.a / a.length) * (c.b / a.length);
  }
  if (pe === 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

export function binaryMetrics(truth: readonly boolean[], predicted: readonly boolean[]): BinaryMetrics {
  if (truth.length !== predicted.length) throw new Error("binary vectors must be paired");
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (let i = 0; i < truth.length; i++) {
    const t = truth[i];
    const p = predicted[i];
    if (p && t) c.tp++;
    else if (p && !t) c.fp++;
    else if (!p && t) c.fn++;
    else c.tn++;
  }
  const precision = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fn);
  const f1 = precision + recall === 0 ? 0 : 2 * ((precision * recall) / (precision + recall));
  const accuracy = (c.tp + c.tn) / truth.length;
  return { ...c, precision, recall, f1, accuracy };
}

export interface AgreementMetrics {
  likenessKappa: number;
  swapDetection: BinaryMetrics;
  artifactAgreement: BinaryMetrics;
  meanPredictedLikeness: number;
  meanHumanIdentityCorrect: number;
}

export function computeAgreement(input: {
  automatedRatings: LikenessRating[];
  automatedSwaps: boolean[];
  automatedArtifacts: boolean[];
  humanRatings: LikenessRating[];
  humanSwaps: boolean[];
  humanArtifacts: boolean[];
  meanPredictedLikeness: number;
}): AgreementMetrics {
  return {
    likenessKappa: cohensKappa(input.automatedRatings, input.humanRatings),
    swapDetection: binaryMetrics(input.humanSwaps, input.automatedSwaps),
    artifactAgreement: binaryMetrics(input.humanArtifacts, input.automatedArtifacts),
    meanPredictedLikeness: input.meanPredictedLikeness,
    meanHumanIdentityCorrect: meanOf(input.humanRatings)
  };
}

function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
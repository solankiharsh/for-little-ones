/**
 * Spike E — identity vocabulary shared by the reference-conditioning mock, the
 * independent likeness evaluator and the synthetic dataset.
 *
 * The canonical shapes (IdentityReference, ProviderCard) come from
 * `@for-little-ones/providers` / `@for-little-ones/contracts` (D021); everything
 * else here is spike-only and mirrors the F-005/F-009 surface that the real
 * provider phase will fill in.
 */
import type { IdentityReference } from "@for-little-ones/providers";

/**
 * The degradation axes the experiment blinds reviewers against (per PROJECT_SPIKES.md
 * Spike E: poses, close/distant scenes, expressions, lighting, multi-character,
 * occlusion).
 */
export const DEGRADATION_DIMS = [
  "canonical",
  "pose",
  "lighting",
  "expression",
  "occlusion",
  "distance",
  "composition"
] as const;
export type DegradationDim = (typeof DEGRADATION_DIMS)[number];

/**
 * How strongly each dim can attenuate likeness at severity 1.0 (1.0 = no decay).
 * These are the mock's design parameters, not a finding about any real provider.
 */
export const DEGRADATION_ATTENUATION: Record<DegradationDim, number> = {
  canonical: 1.0,
  pose: 0.8,
  lighting: 0.7,
  expression: 0.75,
  occlusion: 0.45,
  distance: 0.9,
  composition: 0.6
};

export interface PageSpec {
  identityId: string;
  pageKey: string;
  /** Page ordinal within an identity (1-based) for consistency-vs-previous review. */
  pageNumber: number;
  dim: DegradationDim;
  severity: number;
  /** Random seed string that pins deterministic mock outputs. */
  seed: string;
  /** base — approximate reason for the degradation (kept for the report). */
  note?: string;
}

/** A page as the mock provider would hand it to storage: an opaque asset ref + evidence. */
export interface IdentityPage {
  reference: IdentityReference;
  spec: PageSpec;
  /** Synthetic storage ref (mock://…). In the real phase this becomes real asset refs. */
  assetRef: string;
  /**
   * The mock knows its own ground-truth likeness (it IS the model). Real phase:
   * truth is replaced by an independent vision evaluation + human labels.
   */
  groundTruthLikeness01: number;
  /** True only when a "wrong/swap character" event was injected (mock). */
  characterSwapGroundTruth: boolean;
  /**
   * Observable trait vector the automated evaluator reads. features[0] is a
   * likeness readout (== truth ± model noise); features[1] encodes swap presence.
   * Real phase: a provider/vQA likeness signal replaces features[0].
   */
  features: number[];
}

export function toCardinal(reference: IdentityReference): string {
  return `${reference.providerId}:${reference.referenceId}`;
}
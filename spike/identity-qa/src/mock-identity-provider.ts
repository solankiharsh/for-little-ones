/**
 * Mock reference-conditioning identity provider.
 *
 * This is NOT a real provider and produces no images. It deterministically models
 * what a provider with reference conditioning would surface: an opaque private
 * reference, a per-page likeness readout that degrades predictably with the scene
 * severity, and an encoded "character swap" event. It exists so the measurement
 * methodology (reference lifecycle, degradation, independent evaluation, agreement
 * vs human review) can be exercised and debugged before any real provider, key or
 * image is introduced.
 *
 * Determinism: same (reference, pageSpec) ⇒ identical page (asset ref, truth,
 * features). Ground-truth likeness IS the mock's internal model output, so the
 * offline dry-run measures pipeline mechanics, not real-generation quality.
 */
import type { ProviderCard } from "@for-little-ones/providers";
import type { IdentityReference } from "@for-little-ones/providers";
import { DEGRADATION_ATTENUATION, toCardinal, type IdentityPage, type PageSpec } from "./identity";
import { clamp01, seededGaussian, seededRng } from "./rng";

const PERMITTED_SOURCE_REF_PREFIX = "mock-src::";

export interface ReferenceConditioningMockOptions {
  /** Feature-noise sigma for the observable likeness readout ([0,1] scale). */
  modelNoiseSigma: number;
  /** Probability that a multi-character ("composition") page swaps identity. */
  swapChance: number;
  /** Deterministic identity-base-fidelity key space (min, max). */
  baseRange: { min: number; max: number };
}

export interface MockIdentityProvider {
  readonly card: ProviderCard;
  /** Deterministically mint a private, reusable identity reference from source refs. */
  deriveReference(sourcePhotoRefs: string[]): { reference: IdentityReference; knownFacesCount: number };
  generatePage(reference: IdentityReference, spec: PageSpec): IdentityPage;
  /** Every mock page (for blinding / dataset bookkeeping). */
  readonly pages: IdentityPage[];
}

export const MOCK_IDENTITY_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "offline-mock-v1",
    childDataSent: false,
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "local-process",
    evidenceRef: "internal://spike-identity-qa/offline-mock"
  },
  idempotency: "deterministic by reference+pageSpec; same inputs ⇒ same outputs",
  timeoutMs: 0,
  retryPolicy: "n/a (synchronous mock)",
  costMetadata: "costCents=0: mock"
};

export function makeMockIdentityProvider(opts: Partial<ReferenceConditioningMockOptions> = {}): MockIdentityProvider {
  const options: ReferenceConditioningMockOptions = {
    modelNoiseSigma: opts.modelNoiseSigma ?? 0.04,
    swapChance: opts.swapChance ?? 0.5,
    baseRange: opts.baseRange ?? { min: 0.62, max: 0.95 }
  };
  const pages: IdentityPage[] = [];
  const references = new Map<string, number>();

  function deriveReference(sourcePhotoRefs: string[]): { reference: IdentityReference; knownFacesCount: number } {
    if (sourcePhotoRefs.length === 0) {
      throw new Error("deriveReference requires at least one source photo ref");
    }
    for (const ref of sourcePhotoRefs) {
      if (!ref.startsWith(PERMITTED_SOURCE_REF_PREFIX)) {
        throw new Error(`mock only accepts local synthetic ${PERMITTED_SOURCE_REF_PREFIX} prefixed refs`);
      }
    }
    const rng = seededRng(`ref:${sourcePhotoRefs.join("|")}`);
    const baseFidelity = options.baseRange.min + rng() * (options.baseRange.max - options.baseRange.min);
    const reference: IdentityReference = {
      providerId: "mock-reference-conditioning",
      referenceId: `ref-${fnv(sourcePhotoRefs.join("|"))}`,
      kind: "private-enduring-reference"
    };
    references.set(toCardinal(reference), baseFidelity);
    return { reference, knownFacesCount: 1 + Math.floor(rng() * 3) };
  }

  function baseFidelity(reference: IdentityReference): number {
    const f = references.get(toCardinal(reference));
    if (f === undefined) throw new Error("reference not derived yet");
    return f;
  }

  function generatePage(reference: IdentityReference, spec: PageSpec): IdentityPage {
    if (!references.has(toCardinal(reference))) {
      throw new Error("deriveReference must precede generatePage");
    }
    const truth = clamp01(baseFidelity(reference) * attenuation(spec));
    const rng = seededRng(`${toCardinal(reference)}|${spec.pageKey}|${spec.dim}|${spec.severity}|${spec.seed}`);
    const swap = spec.dim === "composition" && rng() < options.swapChance;
    const noise = seededGaussian(rng, options.modelNoiseSigma);
    const featureLen = 16;
    const features = new Array<number>(featureLen);
    features[0] = clamp01(truth + noise);
    features[1] = swap ? 0.85 : 0.1 + rng() * 0.2;
    for (let i = 2; i < featureLen; i++) {
      features[i] = clamp01(Math.abs(seededGaussian(rng, 0.1)));
    }
    const page: IdentityPage = {
      reference,
      spec,
      assetRef: `mock://asset/${toCardinal(reference)}/${spec.pageKey}`,
      groundTruthLikeness01: truth,
      characterSwapGroundTruth: swap,
      features
    };
    pages.push(page);
    return page;
  }

  return { card: MOCK_IDENTITY_CARD, deriveReference, generatePage, pages };
}

function attenuation(spec: PageSpec): number {
  const max = DEGRADATION_ATTENUATION[spec.dim];
  if (spec.dim === "canonical") return 1;
  return 1 - (1 - max) * clamp01(spec.severity);
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

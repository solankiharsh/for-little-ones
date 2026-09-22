/**
 * Synthetic experiment dataset: several permitted reference identities, each with
 * a page matrix covering the degradation axes (canonical, pose, lighting,
 * expression, occlusion, distance, composition/multi-character) at increasing
 * severities. Page keys are deterministic, so the whole run reproduces.
 */
import { DEGRADATION_DIMS, type DegradationDim, type IdentityPage, type PageSpec } from "./identity";
import { makeMockIdentityProvider, type MockIdentityProvider } from "./mock-identity-provider";

export interface IdentityExperiments {
  identityIds: string[];
  /** pageNumber -> page, indexed per identity. */
  pagesByIdentity: Record<string, IdentityPage[]>;
  /** Absolute count of pages generated. */
  pageCount: number;
  swapCount: number;
}

/** Each dimension is exercised at least once across the identity's pages. */
export function buildDataset(provider: MockIdentityProvider, opts: { identityCount?: number; pagesPerIdentity?: number } = {}): IdentityExperiments {
  const identityCount = opts.identityCount ?? 2;
  const pagesPerIdentity = opts.pagesPerIdentity ?? 7;

  const dims = DEGRADATION_DIMS;
  // severities per dim, cycling enough to fill pagesPerIdentity
  const severityByPosition = [0.25, 0.5, 0.75, 1.0, 0.4, 0.7, 0.9];

  const identityIds = Array.from({ length: identityCount }, (_, i) => `identity-${String.fromCharCode(65 + i)}`);
  const pagesByIdentity: Record<string, IdentityPage[]> = {};

  for (const identityId of identityIds) {
    const { reference } = provider.deriveReference([
      `mock-src::${identityId.toLowerCase()}-portrait-a`,
      `mock-src::${identityId.toLowerCase()}-portrait-b`
    ]);
    const pages: IdentityPage[] = [];
    for (let p = 1; p <= pagesPerIdentity; p++) {
      const dim = dims[(p - 1) % dims.length];
      if (!dim) continue;
      const severity = severityByPosition[(p - 1) % severityByPosition.length] ?? 0.5;
      const spec: PageSpec = {
        identityId,
        pageKey: `${identityId}-p${p}`,
        pageNumber: p,
        dim,
        severity,
        seed: "dataset-v1"
      };
      pages.push(provider.generatePage(reference, spec));
    }
    pagesByIdentity[identityId] = pages;
  }

  const pageCount = Object.values(pagesByIdentity).reduce((n, p) => n + p.length, 0);
  const swapCount = Object.values(pagesByIdentity).reduce((n, pages) => n + pages.filter((p) => p.characterSwapGroundTruth).length, 0);

  return { identityIds, pagesByIdentity, pageCount, swapCount };
}

export type { DegradationDim };
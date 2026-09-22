import { describe, expect, it } from "vitest";
import {
  aggregateHumanReviews,
  fidelityToRating,
  makeSyntheticReviewer,
  type HumanReviewLabel
} from "../src/human-review";
import { makeMockIdentityProvider } from "../src/mock-identity-provider";
import type { PageSpec } from "../src/identity";

const SOURCE_REFS = ["mock-src::identity-a-portrait-a", "mock-src::identity-a-portrait-b"];

function page(over: Partial<PageSpec> = {}) {
  const provider = makeMockIdentityProvider();
  const ref = provider.deriveReference(SOURCE_REFS).reference;
  return provider.generatePage(ref, { identityId: "identity-A", pageKey: "p1", pageNumber: 1, dim: "pose", severity: 0.5, seed: "t", ...over });
}

describe("human-review", () => {
  it("maps fidelity to the 1..5 scale monotonically", () => {
    expect(fidelityToRating(0.98)).toBe(5);
    expect(fidelityToRating(0.83)).toBe(4);
    expect(fidelityToRating(0.62)).toBe(3);
    expect(fidelityToRating(0.4)).toBe(2);
    expect(fidelityToRating(0.1)).toBe(1);
  });

  it("synthetic reviewer keeps ratings in range and swap flags truth-based", () => {
    const reviewer = makeSyntheticReviewer({ swapMissRate: 0 });
    const ok = page();
    const swapped = page({ dim: "composition", severity: 0.7 });

    for (let i = 0; i < 50; i++) {
      const label = reviewer.review(ok, null);
      expect(label.identityCorrect).toBeGreaterThanOrEqual(1);
      expect(label.identityCorrect).toBeLessThanOrEqual(5);
      expect(label.characterSwap).toBe(false);
    }
    const swappedLabel = reviewer.review(swapped, null);
    expect(swappedLabel.characterSwap).toBe(true);
  });

  it("leaves consistency null on the first page of an identity", () => {
    const reviewer = makeSyntheticReviewer();
    const label = reviewer.review(page(), null);
    expect(label.consistentWithPrevious).toBeNull();
  });

  it("computes aggregate rates from a labelled set", () => {
    const labels: HumanReviewLabel[] = [
      { identityCorrect: 5, consistentWithPrevious: null, visibleArtifact: false, characterSwap: false },
      { identityCorrect: 3, consistentWithPrevious: 4, visibleArtifact: true, characterSwap: true },
      { identityCorrect: 4, consistentWithPrevious: 4, visibleArtifact: false, characterSwap: false }
    ];
    const agg = aggregateHumanReviews(labels);
    expect(agg.meanIdentityCorrect).toBeCloseTo(4, 5);
    expect(agg.meanConsistent).toBeCloseTo(4, 5);
    expect(agg.artifactRate).toBeCloseTo(1 / 3, 5);
    expect(agg.swapRate).toBeCloseTo(1 / 3, 5);
    expect(agg.itemCount).toBe(3);
  });
});
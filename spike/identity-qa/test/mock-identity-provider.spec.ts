import { describe, expect, it } from "vitest";
import { makeMockIdentityProvider } from "../src/mock-identity-provider";
import type { PageSpec } from "../src/identity";

const SOURCE_REFS = ["mock-src::identity-a-portrait-a", "mock-src::identity-a-portrait-b"];

function spec(over: Partial<PageSpec> = {}): PageSpec {
  return { identityId: "identity-A", pageKey: "p1", pageNumber: 1, dim: "pose", severity: 0.5, seed: "t", ...over };
}

describe("MockIdentityProvider", () => {
  it("mints a private-enduring reference deterministically", () => {
    const a = makeMockIdentityProvider();
    const b = makeMockIdentityProvider();
    const ra = a.deriveReference(SOURCE_REFS);
    const rb = b.deriveReference(SOURCE_REFS);
    expect(ra.reference.kind).toBe("private-enduring-reference");
    expect(ra.reference.referenceId).toBe(rb.reference.referenceId);
    expect(ra.knownFacesCount).toBeGreaterThan(0);
  });

  it("is deterministic across fresh providers for identical specs", () => {
    const a = makeMockIdentityProvider();
    const b = makeMockIdentityProvider();
    const ra = a.deriveReference(SOURCE_REFS).reference;
    const rb = b.deriveReference(SOURCE_REFS).reference;
    const pa = a.generatePage(ra, spec());
    const pb = b.generatePage(rb, spec());
    expect(pa).toEqual(pb);
    expect(pa.assetRef).toMatch(/^mock:\/\/asset\//);
  });

  it("degrades likeness monotonically with severity", () => {
    const base = makeMockIdentityProvider();
    const ref = base.deriveReference(SOURCE_REFS).reference;
    const low = base.generatePage(ref, spec({ severity: 0.2 }));
    const high = base.generatePage(ref, spec({ severity: 0.9 }));
    expect(high.groundTruthLikeness01).toBeLessThan(low.groundTruthLikeness01);
  });

  it("keeps ground truth and features within [0,1]", () => {
    const p = makeMockIdentityProvider();
    const ref = p.deriveReference(SOURCE_REFS).reference;
    for (const severity of [0, 0.3, 1]) {
      const page = p.generatePage(ref, spec({ severity }));
      expect(page.groundTruthLikeness01).toBeGreaterThanOrEqual(0);
      expect(page.groundTruthLikeness01).toBeLessThanOrEqual(1);
      for (const f of page.features) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it("only injects character swaps on the composition dimension", () => {
    const p = makeMockIdentityProvider({ swapChance: 1 });
    const ref = p.deriveReference(SOURCE_REFS).reference;
    const onComposition = p.generatePage(ref, spec({ dim: "composition", severity: 0.7 }));
    const onLighting = p.generatePage(ref, spec({ dim: "lighting", severity: 0.7 }));
    expect(onComposition.characterSwapGroundTruth).toBe(true);
    expect(onLighting.characterSwapGroundTruth).toBe(false);
  });

  it("encodes the swap into features[1] when present", () => {
    const p = makeMockIdentityProvider({ swapChance: 1 });
    const ref = p.deriveReference(SOURCE_REFS).reference;
    const swap = p.generatePage(ref, spec({ dim: "composition", severity: 0.7 }));
    const plain = p.generatePage(ref, spec({ dim: "canonical", severity: 0 }));
    expect(swap.features[1]).toBeGreaterThan(0.7);
    expect(plain.features[1]).toBeLessThan(0.7);
  });

  it("rejects photo refs that are not the expected mock source prefix", () => {
    const p = makeMockIdentityProvider();
    expect(() => p.deriveReference(["https://cdn.example.com/photo.jpg"])).toThrow(/mock-src/);
  });
});
import { describe, expect, it } from "vitest";
import { buildDataset } from "../src/dataset";
import { makeMockIdentityProvider } from "../src/mock-identity-provider";
import { DEGRADATION_DIMS } from "../src/identity";

describe("dataset", () => {
  it("builds the expected page matrix deterministically", () => {
    const a = buildDataset(makeMockIdentityProvider());
    const b = buildDataset(makeMockIdentityProvider());
    expect(a.pageCount).toBe(2 * 7);
    expect(a.identityIds).toEqual(["identity-A", "identity-B"]);
    expect(a.pagesByIdentity["identity-A"]?.map((p) => p.assetRef)).toEqual(
      b.pagesByIdentity["identity-A"]?.map((p) => p.assetRef)
    );
  });

  it("exercises every degradation dimension across the identity", () => {
    const ds = buildDataset(makeMockIdentityProvider(), { pagesPerIdentity: 7 });
    const dims = new Set((ds.pagesByIdentity["identity-A"] ?? []).map((p) => p.spec.dim));
    for (const dim of DEGRADATION_DIMS) expect(dims.has(dim)).toBe(true);
  });

  it("keeps page ordinal and pageNumber aligned (1-based, sequential)", () => {
    const ds = buildDataset(makeMockIdentityProvider());
    const pages = ds.pagesByIdentity["identity-A"] ?? [];
    pages.forEach((p, i) => expect(p.spec.pageNumber).toBe(i + 1));
  });

  it("counts swaps injected by the composition dimension", () => {
    const ds = buildDataset(makeMockIdentityProvider({ swapChance: 1 }));
    expect(ds.swapCount).toBeGreaterThan(0);
  });
});
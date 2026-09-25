import { describe, expect, it } from "vitest";
import { authorizeGeneration, generationAccessFor, paymentEntitlement } from "../src/index";

describe("generation access and cost budget", () => {
  it("allows a bounded teaser before payment", () => {
    const access = generationAccessFor("TEASER");

    expect(access.visibleStoryPages).toBe(1);
    expect(access.nextPageExcerptCharacters).toBe(140);
    expect(access.imageBudget).toEqual({ maximumAssets: 2, maximumAttemptsPerAsset: 1, maximumPixelArea: 1_048_576 });
    expect(access.watermarkImages).toBe(true);
    expect(access.canUseStudio).toBe(false);
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 1 })).toEqual({ allowed: true, remainingAssets: 1 });
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 2 }).allowed).toBe(false);
  });

  it("unlocks production generation and the studio only after captured payment", () => {
    expect(paymentEntitlement("authorized")).toBe("TEASER");
    expect(paymentEntitlement("captured")).toBe("PAID");
    expect(generationAccessFor("PAID").canUseStudio).toBe(true);
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 12 }).allowed).toBe(true);
  });

  it("fails closed for refunded or revoked purchases", () => {
    expect(paymentEntitlement("refunded")).toBe("REVOKED");
    expect(authorizeGeneration({ entitlement: "REVOKED", operation: "STUDIO_EDIT", assetsGenerated: 0 })).toEqual({
      allowed: false,
      reason: "Payment entitlement is not active.",
      remainingAssets: 0
    });
  });
});

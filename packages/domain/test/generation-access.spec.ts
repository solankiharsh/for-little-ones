import { describe, expect, it } from "vitest";
import {
  authorizeGeneration,
  authorizeGenerationCommand,
  generationAccessFor,
  LOCKED_ILLUSTRATION_CUE,
  LOCKED_PAGE_TEXT,
  paymentEntitlement,
  projectStoryForEntitlement
} from "../src/index";

const teaserAsset = { slot: "cover", attempt: 1, pixelArea: 1_048_576, watermark: true } as const;
const productionAsset = { slot: "interior", attempt: 1, pixelArea: 4_194_304, watermark: false } as const;

describe("generation access and cost budget", () => {
  it("allows a bounded teaser before payment", () => {
    const access = generationAccessFor("TEASER");

    expect(access.visibleStoryPages).toBe(1);
    expect(access.nextPageExcerptCharacters).toBe(140);
    expect(access.imageBudget).toEqual({ maximumAssets: 2, maximumAttemptsPerAsset: 1, maximumPixelArea: 1_048_576 });
    expect(access.teaserImageSlots).toEqual(["cover", "interior"]);
    expect(access.watermarkImages).toBe(true);
    expect(access.canUseStudio).toBe(false);
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 1, asset: teaserAsset })).toEqual({
      allowed: true, entitlement: "TEASER", remainingAssets: 1
    });
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 2, asset: teaserAsset }).allowed).toBe(false);
  });

  it("unlocks production generation and the studio only after captured payment", () => {
    expect(paymentEntitlement("authorized")).toBe("TEASER");
    expect(paymentEntitlement("captured")).toBe("PAID");
    expect(generationAccessFor("PAID").canUseStudio).toBe(true);
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 12, asset: productionAsset }).allowed).toBe(true);
    expect(authorizeGeneration({ entitlement: "PAID", operation: "STUDIO_EDIT", assetsGenerated: 0 }).allowed).toBe(true);
  });

  it("fails closed for refunded or revoked purchases", () => {
    expect(paymentEntitlement("refunded")).toBe("REVOKED");
    expect(authorizeGeneration({ entitlement: "REVOKED", operation: "STUDIO_EDIT", assetsGenerated: 0 })).toEqual({
      allowed: false,
      reason: "Payment entitlement is not active.",
      entitlement: "REVOKED",
      remainingAssets: 0
    });
  });
});

describe("per-asset authorisation", () => {
  it("refuses an illustration that does not declare its slot, attempt, size and watermark", () => {
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0 }).reason)
      .toBe("Illustration generation must state its slot, attempt, size and watermark mode.");
  });

  it("bounds attempts per asset rather than only the aggregate count", () => {
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0, asset: { ...teaserAsset, attempt: 2 } })).toEqual({
      allowed: false, reason: "The illustration attempt limit for this slot has been used.", entitlement: "TEASER", remainingAssets: 2
    });
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 0, asset: { ...productionAsset, attempt: 3 } }).allowed).toBe(false);
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 0, asset: { ...productionAsset, attempt: 2 } }).allowed).toBe(true);
  });

  it("bounds resolution to the entitlement's own maximum", () => {
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0, asset: { ...teaserAsset, pixelArea: 1_048_577 } }).reason)
      .toBe("That illustration is larger than this purchase allows.");
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0, asset: { ...teaserAsset, pixelArea: 0 } }).allowed).toBe(false);
  });

  it("requires the watermark mode the entitlement mandates", () => {
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0, asset: { ...teaserAsset, watermark: false } }).reason)
      .toBe("Preview illustrations must be watermarked.");
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 0, asset: { ...productionAsset, watermark: true } }).reason)
      .toBe("Production illustrations must not be watermarked.");
  });

  it("refuses an unknown illustration slot", () => {
    const unknown = { ...teaserAsset, slot: "back-cover" } as unknown as typeof teaserAsset;
    expect(authorizeGeneration({ entitlement: "TEASER", operation: "TEASER_IMAGE", assetsGenerated: 0, asset: unknown }).reason)
      .toBe("That illustration slot does not exist.");
    expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated: 0, asset: { ...productionAsset, slot: "cover" } }).allowed).toBe(true);
  });

  it("will not let a caller under-report usage to reopen the budget", () => {
    for (const assetsGenerated of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(authorizeGeneration({ entitlement: "PAID", operation: "PRODUCTION_IMAGE", assetsGenerated, asset: productionAsset }).allowed).toBe(false);
    }
  });
});

describe("server command authorisation", () => {
  it("maps the payment record the server read, never a browser flag", () => {
    expect(authorizeGenerationCommand({ paymentState: "pending", operation: "STORY_PREVIEW", attempts: 0 })).toEqual({
      allowed: true, entitlement: "TEASER", remainingAssets: 2
    });
    expect(authorizeGenerationCommand({ paymentState: "captured", operation: "STORY_PREVIEW", attempts: 2 }).allowed).toBe(true);
    expect(authorizeGenerationCommand({ paymentState: "cancelled", operation: "STORY_PREVIEW", attempts: 0 })).toEqual({
      allowed: false, reason: "Payment entitlement is not active.", entitlement: "REVOKED", remainingAssets: 0
    });
  });

  it("bounds story and concept attempts so a held owner credential cannot buy unlimited provider work", () => {
    expect(authorizeGenerationCommand({ paymentState: "pending", operation: "STORY_PREVIEW", attempts: 1 }).reason)
      .toBe("The story studio has been used as often as this purchase allows.");
    expect(authorizeGenerationCommand({ paymentState: "pending", operation: "CONCEPT_BUNDLE", attempts: 2 }).allowed).toBe(true);
    expect(authorizeGenerationCommand({ paymentState: "pending", operation: "CONCEPT_BUNDLE", attempts: 3 }).allowed).toBe(false);
    expect(authorizeGenerationCommand({ paymentState: "captured", operation: "STORY_PREVIEW", attempts: 3 }).allowed).toBe(false);
  });

  it("keeps production work unreachable from a merely authorised payment", () => {
    expect(authorizeGenerationCommand({ paymentState: "authorized", operation: "PRODUCTION_IMAGE", asset: productionAsset }).reason)
      .toBe("Complete payment to unlock full generation.");
    expect(authorizeGenerationCommand({ paymentState: "authorized", operation: "PAGE_REGENERATION" }).allowed).toBe(false);
    expect(authorizeGenerationCommand({ paymentState: "authorized", operation: "STUDIO_EDIT" }).allowed).toBe(false);
  });
});

describe("entitlement-shaped story projection", () => {
  const story = {
    schemaVersion: "1",
    title: "Milo and the Quiet Star",
    pages: Array.from({ length: 6 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Page ${index + 1}: ${"milo walked ".repeat(40)}`,
      illustrationCue: `Scene ${index + 1}`
    }))
  };

  it("keeps the locked text out of anything a teaser customer can read", () => {
    const projected = projectStoryForEntitlement(story, "TEASER");

    expect(projected.pages[0]).toEqual(story.pages[0]);
    expect(projected.pages[1]?.text.length).toBeLessThanOrEqual(141);
    expect(projected.pages[1]?.illustrationCue).toBe(LOCKED_ILLUSTRATION_CUE);
    expect(projected.pages.slice(2).every((page) => page.text === LOCKED_PAGE_TEXT)).toBe(true);
    const serialised = JSON.stringify(projected);
    expect(serialised).not.toContain("Scene 6");
    expect(serialised).not.toContain(story.pages[5]?.text.slice(0, 60));
  });

  it("returns the complete story only for a captured payment", () => {
    expect(projectStoryForEntitlement(story, "PAID")).toEqual(story);
    expect(projectStoryForEntitlement(story, "REVOKED").pages.every((page) => page.text === LOCKED_PAGE_TEXT)).toBe(true);
  });
});

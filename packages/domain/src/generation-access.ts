export type GenerationEntitlement = "TEASER" | "PAID" | "REVOKED";
export type PaymentState = "pending" | "authorized" | "captured" | "refunded" | "cancelled";
export type GenerationOperation = "TEASER_IMAGE" | "PRODUCTION_IMAGE" | "PAGE_REGENERATION" | "STUDIO_EDIT";

export interface GenerationAccess {
  visibleStoryPages: number | "ALL";
  nextPageExcerptCharacters: number;
  imageBudget: {
    maximumAssets: number;
    maximumAttemptsPerAsset: number;
    maximumPixelArea: number;
  };
  watermarkImages: boolean;
  canRegeneratePages: boolean;
  canUseStudio: boolean;
}

const ACCESS: Record<GenerationEntitlement, GenerationAccess> = {
  TEASER: {
    visibleStoryPages: 1,
    nextPageExcerptCharacters: 140,
    imageBudget: { maximumAssets: 2, maximumAttemptsPerAsset: 1, maximumPixelArea: 1_048_576 },
    watermarkImages: true,
    canRegeneratePages: false,
    canUseStudio: false
  },
  PAID: {
    visibleStoryPages: "ALL",
    nextPageExcerptCharacters: 0,
    imageBudget: { maximumAssets: 25, maximumAttemptsPerAsset: 2, maximumPixelArea: 16_777_216 },
    watermarkImages: false,
    canRegeneratePages: true,
    canUseStudio: true
  },
  REVOKED: {
    visibleStoryPages: 0,
    nextPageExcerptCharacters: 0,
    imageBudget: { maximumAssets: 0, maximumAttemptsPerAsset: 0, maximumPixelArea: 0 },
    watermarkImages: true,
    canRegeneratePages: false,
    canUseStudio: false
  }
};

export function generationAccessFor(entitlement: GenerationEntitlement): GenerationAccess {
  return ACCESS[entitlement];
}

export function paymentEntitlement(state: PaymentState): GenerationEntitlement {
  if (state === "captured") return "PAID";
  if (state === "refunded" || state === "cancelled") return "REVOKED";
  return "TEASER";
}

export function authorizeGeneration(input: {
  entitlement: GenerationEntitlement;
  operation: GenerationOperation;
  assetsGenerated: number;
}): { allowed: boolean; reason?: string; remainingAssets: number } {
  const access = generationAccessFor(input.entitlement);
  const remainingAssets = Math.max(0, access.imageBudget.maximumAssets - input.assetsGenerated);
  if (input.entitlement === "REVOKED") {
    return { allowed: false, reason: "Payment entitlement is not active.", remainingAssets };
  }
  if (input.operation === "TEASER_IMAGE") {
    return input.entitlement === "TEASER" && remainingAssets > 0
      ? { allowed: true, remainingAssets }
      : { allowed: false, reason: "The teaser image budget has been used.", remainingAssets };
  }
  if (input.entitlement !== "PAID") {
    return { allowed: false, reason: "Complete payment to unlock full generation.", remainingAssets };
  }
  if (input.operation === "PRODUCTION_IMAGE" && remainingAssets === 0) {
    return { allowed: false, reason: "The production image budget has been used.", remainingAssets };
  }
  return { allowed: true, remainingAssets };
}

export type GenerationEntitlement = "TEASER" | "PAID" | "REVOKED";
export type PaymentState = "pending" | "authorized" | "captured" | "refunded" | "cancelled";
export type IllustrationSlot = "cover" | "interior";
export type GenerationOperation =
  | "CONCEPT_BUNDLE"
  | "STORY_PREVIEW"
  | "TEASER_IMAGE"
  | "PRODUCTION_IMAGE"
  | "PAGE_REGENERATION"
  | "STUDIO_EDIT";

export interface GenerationAccess {
  visibleStoryPages: number | "ALL";
  nextPageExcerptCharacters: number;
  imageBudget: {
    maximumAssets: number;
    maximumAttemptsPerAsset: number;
    maximumPixelArea: number;
  };
  /** The only illustration slots a teaser customer may spend on (D023). */
  teaserImageSlots: readonly IllustrationSlot[];
  maximumConceptAttempts: number;
  maximumStoryPreviews: number;
  watermarkImages: boolean;
  canRegeneratePages: boolean;
  canUseStudio: boolean;
}

const ACCESS: Record<GenerationEntitlement, GenerationAccess> = {
  TEASER: {
    visibleStoryPages: 1,
    nextPageExcerptCharacters: 140,
    imageBudget: { maximumAssets: 2, maximumAttemptsPerAsset: 1, maximumPixelArea: 1_048_576 },
    teaserImageSlots: ["cover", "interior"],
    maximumConceptAttempts: 3,
    maximumStoryPreviews: 1,
    watermarkImages: true,
    canRegeneratePages: false,
    canUseStudio: false
  },
  PAID: {
    visibleStoryPages: "ALL",
    nextPageExcerptCharacters: 0,
    imageBudget: { maximumAssets: 25, maximumAttemptsPerAsset: 2, maximumPixelArea: 16_777_216 },
    teaserImageSlots: [],
    maximumConceptAttempts: 3,
    maximumStoryPreviews: 3,
    watermarkImages: false,
    canRegeneratePages: true,
    canUseStudio: true
  },
  REVOKED: {
    visibleStoryPages: 0,
    nextPageExcerptCharacters: 0,
    imageBudget: { maximumAssets: 0, maximumAttemptsPerAsset: 0, maximumPixelArea: 0 },
    teaserImageSlots: [],
    maximumConceptAttempts: 0,
    maximumStoryPreviews: 0,
    watermarkImages: true,
    canRegeneratePages: false,
    canUseStudio: false
  }
};

const IMAGE_OPERATIONS: readonly GenerationOperation[] = [
  "TEASER_IMAGE",
  "PRODUCTION_IMAGE",
  "PAGE_REGENERATION"
];

export const LOCKED_PAGE_TEXT = "Story page ready after payment.";
export const LOCKED_ILLUSTRATION_CUE = "Locked until payment is confirmed.";

export function generationAccessFor(entitlement: GenerationEntitlement): GenerationAccess {
  return ACCESS[entitlement];
}

export function paymentEntitlement(state: PaymentState): GenerationEntitlement {
  if (state === "captured") return "PAID";
  if (state === "refunded" || state === "cancelled") return "REVOKED";
  return "TEASER";
}

/**
 * The per-asset facts a caller must declare before an image is authorised. They are
 * inputs, not options: an image command that cannot state its slot, attempt number,
 * output area and watermark mode is refused rather than assumed compliant.
 */
export interface ImageAssetRequest {
  slot: IllustrationSlot;
  attempt: number;
  pixelArea: number;
  watermark: boolean;
}

export interface GenerationAuthorization {
  allowed: boolean;
  reason?: string;
  entitlement: GenerationEntitlement;
  remainingAssets: number;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function authorizeGeneration(input: {
  entitlement: GenerationEntitlement;
  operation: GenerationOperation;
  /** Aggregate illustration assets already produced for this purchase. */
  assetsGenerated: number;
  /** Attempts already spent on this text operation (concepts or story previews). */
  attempts?: number;
  /** Required for every illustration operation. */
  asset?: ImageAssetRequest;
}): GenerationAuthorization {
  const access = generationAccessFor(input.entitlement);
  const countableAssets = isCount(input.assetsGenerated) ? input.assetsGenerated : 0;
  const remainingAssets = Math.max(0, access.imageBudget.maximumAssets - countableAssets);
  const deny = (reason: string): GenerationAuthorization => ({
    allowed: false, reason, entitlement: input.entitlement, remainingAssets
  });

  if (input.entitlement === "REVOKED") return deny("Payment entitlement is not active.");
  if (!isCount(input.assetsGenerated)) return deny("The generation request is not valid.");

  // The payment gate is settled first: a caller without the entitlement never
  // learns which per-asset limits apply to the tier it cannot reach.
  if (input.operation === "TEASER_IMAGE" && input.entitlement !== "TEASER") {
    return deny("Preview illustrations are only available before payment.");
  }
  if (input.operation === "PRODUCTION_IMAGE" && input.entitlement !== "PAID") {
    return deny("Complete payment to unlock full generation.");
  }
  if (input.operation === "PAGE_REGENERATION" && (!access.canRegeneratePages || input.entitlement !== "PAID")) {
    return deny("Complete payment to unlock page regeneration.");
  }
  if (input.operation === "STUDIO_EDIT" && (!access.canUseStudio || input.entitlement !== "PAID")) {
    return deny("Complete payment to unlock the editing studio.");
  }

  if (IMAGE_OPERATIONS.includes(input.operation)) {
    const asset = input.asset;
    if (!asset) return deny("Illustration generation must state its slot, attempt, size and watermark mode.");
    if (asset.slot !== "cover" && asset.slot !== "interior") return deny("That illustration slot does not exist.");
    if (input.operation === "TEASER_IMAGE" && !access.teaserImageSlots.includes(asset.slot)) {
      return deny("That illustration slot is not part of the preview.");
    }
    if (!isCount(asset.attempt) || asset.attempt < 1) return deny("That illustration attempt is not valid.");
    if (asset.attempt > access.imageBudget.maximumAttemptsPerAsset) {
      return deny("The illustration attempt limit for this slot has been used.");
    }
    if (!isCount(asset.pixelArea) || asset.pixelArea < 1) return deny("That illustration size is not valid.");
    if (asset.pixelArea > access.imageBudget.maximumPixelArea) {
      return deny("That illustration is larger than this purchase allows.");
    }
    if (asset.watermark !== access.watermarkImages) {
      return deny(access.watermarkImages
        ? "Preview illustrations must be watermarked."
        : "Production illustrations must not be watermarked.");
    }
  }

  if (input.operation === "TEASER_IMAGE" || input.operation === "PRODUCTION_IMAGE") {
    return remainingAssets > 0
      ? { allowed: true, entitlement: input.entitlement, remainingAssets }
      : deny("The illustration budget has been used.");
  }

  const attempts = input.attempts ?? 0;
  if (!isCount(attempts)) return deny("The generation request is not valid.");
  const maximum = input.operation === "CONCEPT_BUNDLE"
    ? access.maximumConceptAttempts
    : access.maximumStoryPreviews;
  return attempts < maximum
    ? { allowed: true, entitlement: input.entitlement, remainingAssets }
    : deny("The story studio has been used as often as this purchase allows.");
}

/**
 * The single entry point a server command uses: the caller supplies the payment
 * record it read (never a browser-supplied flag) and the policy maps it to an
 * entitlement before any provider work or enqueue happens.
 */
export function authorizeGenerationCommand(input: {
  paymentState: PaymentState;
  operation: GenerationOperation;
  assetsGenerated?: number;
  attempts?: number;
  asset?: ImageAssetRequest;
}): GenerationAuthorization {
  return authorizeGeneration({
    entitlement: paymentEntitlement(input.paymentState),
    operation: input.operation,
    assetsGenerated: input.assetsGenerated ?? 0,
    ...(input.attempts === undefined ? {} : { attempts: input.attempts }),
    ...(input.asset === undefined ? {} : { asset: input.asset })
  });
}

export interface StoryPageLike {
  pageNumber: number;
  text: string;
  illustrationCue: string;
}

export interface StoryLike {
  pages: StoryPageLike[];
}

/**
 * Shape a generated story for what its entitlement may see. The complete story
 * stays server-side; only a captured payment yields every page, so neither the
 * HTTP response nor anything the browser persists can hold the locked text.
 */
export function projectStoryForEntitlement<T extends StoryLike>(story: T, entitlement: GenerationEntitlement): T {
  const access = generationAccessFor(entitlement);
  const visiblePages = access.visibleStoryPages;
  if (visiblePages === "ALL") return story;
  const pages = story.pages.map((page, index): StoryPageLike => {
    if (index < visiblePages) return page;
    if (index === visiblePages && access.nextPageExcerptCharacters > 0) {
      return {
        ...page,
        text: `${page.text.slice(0, access.nextPageExcerptCharacters)}…`,
        illustrationCue: LOCKED_ILLUSTRATION_CUE
      };
    }
    return { pageNumber: page.pageNumber, text: LOCKED_PAGE_TEXT, illustrationCue: LOCKED_ILLUSTRATION_CUE };
  });
  return { ...story, pages };
}

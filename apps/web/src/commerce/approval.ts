/**
 * Storefront-side approved-book purchase data.
 *
 * The opaque reference mirrors `packages/commerce` (`ApprovedRevisionLineItemReference`).
 * It is duplicated here — rather than imported — because `@for-little-ones/commerce`
 * ships a compiled `dist/` that is gitignored, so the web app cannot resolve it on a
 * clean checkout. Keep the four field names and types in sync with the package;
 * `packages/commerce/test/checkout.spec.ts` is the canonical-side invariant test.
 *
 * Privacy invariant (guide §6/§7): this is the ONLY metadata a cart line may carry —
 * never child names, story text, photos or addresses.
 */
export interface ApprovedLineReference {
  approvedBookRevisionId: string;
  contentHash: string;
  productFormatId: string;
  printSpecId: string;
}

const OPAQUE_FIELDS = ["approvedBookRevisionId", "contentHash", "productFormatId", "printSpecId"] as const;

export function isOpaqueLineReference(value: unknown): value is ApprovedLineReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !OPAQUE_FIELDS.some((field) => field === key))) return false;
  return OPAQUE_FIELDS.every((field) => typeof record[field] === "string" && (record[field] as string).trim().length > 0);
}

/** Fail closed on any personalised data attempting to ride a cart line. */
export function assertOpaqueLineReference(value: unknown): asserts value is ApprovedLineReference {
  if (!isOpaqueLineReference(value)) {
    throw new Error("Cart line metadata must be exactly the four opaque approved-revision fields");
  }
}

export interface PurchaseOption {
  title: string;
  variantSku: string;
  reference: ApprovedLineReference;
  /** Price shown before payment; the charged total must equal it exactly (F-018 §8). */
  unitPrice: number;
  currencyCode: "gbp";
  /** Product-facing ETA copy. Real provider windows arrive with F-019. */
  arrivalEstimate: string;
  sandboxFormatLabel: string;
}

/** Seed buyer used by the sandbox (apps/commerce/src/scripts/seed.ts). */
export const SANDBOX_EMAIL = "buyer@example.test";
/** Seed store region, matched by name through the Store API. */
export const SANDBOX_REGION_NAME = "UK Sandbox";

/**
 * Demo catalogue: the one sandbox-approved revision, mirroring the fixture seeded by
 * `apps/commerce/src/scripts/seed.ts` (revision `approved_sandbox_1`, sku
 * `hardcover-square-210`). Production catalogues resolve the option from an
 * authenticated `GET /books/{id}/approval` read (a Book-service boundary that does
 * not exist yet — DEFER until a Book API follows F-016).
 */
export function demoPurchaseOption(): PurchaseOption {
  return {
    title: "The Fox Who Lost the Moon",
    variantSku: "hardcover-square-210",
    reference: {
      approvedBookRevisionId: "approved_sandbox_1",
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      productFormatId: "hardcover-square-210",
      printSpecId: "square-210-3mm",
    },
    unitPrice: 29.2,
    currencyCode: "gbp",
    arrivalEstimate: "Arrives 12–15 Oct",
    sandboxFormatLabel: "Hardcover square · 210 mm",
  };
}
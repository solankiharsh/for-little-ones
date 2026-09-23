/**
 * Storefront view models and Medusa Store API wire shapes. No Medusa SDK types
 * ever leak past this module into components (D021: apps → packages, not the
 * other way; the storefront stays headless against the Store API, guide §6).
 */

export interface StoreRegionView {
  id: string;
  name: string;
  currencyCode: string;
}

export interface StoreVariantView {
  id: string;
  sku: string;
  priceAmount: number;
  currencyCode: string;
}

export interface StoreCartLineView {
  id: string;
  title: string;
  quantity: number;
  lineTotal: number;
  /** Opaque approved-revision reference only; asserted before it is ever sent. */
  metadata: unknown;
}

export interface StoreCartTotals {
  itemTotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export interface StoreCartView {
  id: string;
  currencyCode: string;
  regionId: string | null;
  lines: StoreCartLineView[];
  totals: StoreCartTotals;
}

/** Wire response of `POST /store/flo/checkout-cart` (the server completion seam). */
export interface BeginCheckoutResult {
  orderId: string;
  total: number;
  currencyCode: string;
  receiptKey: string | null;
  deduped: boolean;
}

// ---- lightweight wire readers (structural, runtime-checked) ----

export function readRegion(value: unknown): StoreRegionView | undefined {
  const record = value as { id?: unknown; name?: unknown; currency_code?: unknown } | null;
  if (!record || typeof record.id !== "string" || typeof record.name !== "string") return undefined;
  return { id: record.id, name: record.name, currencyCode: typeof record.currency_code === "string" ? record.currency_code : "gbp" };
}

export function readCartView(value: unknown): StoreCartView {
  const payload = value as { cart?: Record<string, unknown> | null } | null;
  const cart = payload?.cart;
  if (!cart || typeof cart.id !== "string") throw new Error("Cart not found in storefront response");
  const items = Array.isArray(cart.items) ? cart.items : [];
  return {
    id: cart.id,
    currencyCode: typeof cart.currency_code === "string" ? cart.currency_code : "gbp",
    regionId: typeof cart.region_id === "string" ? cart.region_id : null,
    lines: items.map((item) => {
      const line = item as Record<string, unknown>;
      if (typeof line.id !== "string") throw new Error("Malformed cart line");
      return {
        id: line.id,
        title: typeof line.title === "string" ? line.title : "Book",
        quantity: Number(line.quantity ?? 1),
        lineTotal: Number(line.subtotal ?? 0),
        metadata: line.metadata ?? null,
      };
    }),
    totals: {
      itemTotal: Number(cart.item_subtotal ?? 0),
      shippingTotal: Number(cart.shipping_total ?? 0),
      discountTotal: Number(cart.discount_total ?? 0),
      taxTotal: Number(cart.tax_total ?? 0),
      total: Number(cart.total ?? 0),
    },
  };
}

export function readCheckoutResult(value: unknown): BeginCheckoutResult {
  const record = value as Partial<BeginCheckoutResult> | null;
  if (!record || typeof record.orderId !== "string") throw new Error("Malformed checkout result");
  return {
    orderId: record.orderId,
    total: record.total ?? 0,
    currencyCode: record.currencyCode ?? "gbp",
    receiptKey: record.receiptKey ?? null,
    deduped: record.deduped ?? false,
  };
}
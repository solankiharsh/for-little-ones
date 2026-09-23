import { assertOpaqueLineReference, type ApprovedLineReference } from "./approval";
import { MAX_GIFT_MESSAGE_LENGTH, MAX_QUANTITY, MAX_RECIPIENT_LENGTH, MIN_QUANTITY, shippingAddressError, type LineGift, type ShippingAddress } from "./cart";
import {
  readCartView, readCheckoutResult, readRegion,
  type BeginCheckoutResult, type StoreCartView, type StoreRegionView, type StoreVariantView,
} from "./types";

/**
 * Minimal fetch shape so the client is testable without DOM globals and the
 * default implementation stays a thin wrapper over `globalThis.fetch`.
 */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type Fetcher = (
  input: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

function asJson(response: FetchResponse): Promise<unknown> {
  return response.json().catch(() => {
    throw new Error(`Storefront request failed (HTTP ${response.status})`);
  });
}

function errorMessage(json: unknown, fallback: string): string {
  const message = (json as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export interface StorefrontClientOptions {
  medusaUrl: string;
  publishableKey: string;
  fetcher?: Fetcher;
  /** Email captured at checkout (F-018 §5/§8). Sandbox uses the seeded buyer. */
  email?: string;
}

export class StorefrontCommerceClient {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: StorefrontClientOptions) {
    this.fetcher = options.fetcher ?? ((input, init) => {
      const requestInit: RequestInit = {};
      if (init.method !== undefined) requestInit.method = init.method;
      if (init.headers !== undefined) requestInit.headers = init.headers;
      if (init.body !== undefined) requestInit.body = init.body;
      return globalThis.fetch(input, requestInit);
    });
  }

  private async request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const requestInit: { method?: string; headers?: Record<string, string>; body?: string } = {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": this.options.publishableKey,
        ...init.headers,
      },
    };
    if (init.body !== undefined) requestInit.body = JSON.stringify(init.body);
    const response = await this.fetcher(`${this.options.medusaUrl}${path}`, requestInit);
    const json = await asJson(response);
    if (!response.ok) throw new Error(errorMessage(json, `Storefront request failed (HTTP ${response.status})`));
    return json;
  }

  /** `GET /store/regions` — resolve a region for cart creation. */
  async fetchRegions(): Promise<StoreRegionView[]> {
    const json = await this.request("/store/regions");
    const regions = (json as { regions?: unknown[] | null }).regions ?? [];
    return regions.map(readRegion).filter((region): region is StoreRegionView => region !== undefined);
  }

  /** Resolve a product variant by SKU through the published catalogue. */
  async resolveVariant(sku: string): Promise<StoreVariantView> {
    const json = await this.request(`/store/products?handle=personalised-book`);
    const products = (json as { products?: unknown[] | null }).products ?? [];
    const candidates: StoreVariantView[] = [];
    for (const product of products) {
      const record = product as Record<string, unknown>;
      if (!Array.isArray(record.variants)) continue;
      for (const raw of record.variants) {
        const variant = raw as { id?: unknown; sku?: unknown; calculated_price?: { amount?: unknown; currency_code?: unknown } };
        if (typeof variant.id !== "string") continue;
        candidates.push({
          id: variant.id,
          sku: typeof variant.sku === "string" ? variant.sku : "",
          priceAmount: Number(variant.calculated_price?.amount ?? 0),
          currencyCode: typeof variant.calculated_price?.currency_code === "string" ? variant.calculated_price.currency_code : "gbp",
        });
      }
    }
    const match = candidates.find((candidate) => candidate.sku === sku);
    if (!match) throw new Error(`Published variant not found: ${sku}`);
    return match;
  }

  /** `POST /store/carts` — start a cart in a region for the given buyer email. */
  async createCart(input: { regionId: string; currencyCode?: string }): Promise<string> {
    const json = await this.request("/store/carts", {
      method: "POST",
      body: {
        region_id: input.regionId,
        currency_code: input.currencyCode ?? "gbp",
        email: this.options.email,
      },
    });
    const cart = readCartView(json);
    return cart.id;
  }

  /**
   * `POST /store/carts/{id}/line-items` — add an approved revision as an opaque line.
   * The only metadata ever sent is the four-field approved-revision reference.
   */
  async addApprovedItem(input: { cartId: string; sku: string; quantity: number; reference: ApprovedLineReference }): Promise<void> {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < MIN_QUANTITY || input.quantity > MAX_QUANTITY) {
      throw new Error(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}`);
    }
    assertOpaqueLineReference(input.reference);
    const variant = await this.resolveVariant(input.sku);
    await this.request(`/store/carts/${input.cartId}/line-items`, {
      method: "POST",
      body: { variant_id: variant.id, quantity: input.quantity, metadata: { ...input.reference } },
    });
  }

  /** `POST /store/carts/{id}/shipping-methods` — attach a shipping option. */
  async configureShipping(input: { cartId: string; optionId: string }): Promise<StoreCartView> {
    const json = await this.request(`/store/carts/${input.cartId}/shipping-methods`, {
      method: "POST",
      body: { option_id: input.optionId },
    });
    return readCartView(json);
  }

  /** `GET /store/carts/{id}` — the persisted cart as a storefront view. */
  async getCart(input: { cartId: string }): Promise<StoreCartView> {
    const json = await this.request(`/store/carts/${input.cartId}`);
    return readCartView(json);
  }

  /**
   * `POST /store/flo/checkout-cart` — hand a client-built cart to the server for
   * completion: it revalidates every line's approved revision, attaches delivery,
   * pays through the sandbox provider and captures exactly once (business-effect
   * idempotency via `x-flo-idempotency-key`). Delivery + gift details ride only in
   * this envelope (guide §7/§12) — never on line metadata.
   */
  async beginCheckout(input: {
    cartId: string;
    idempotencyKey: string;
    shippingAddress: ShippingAddress;
    gifts: LineGift[];
  }): Promise<BeginCheckoutResult> {
    const addressFailure = shippingAddressError(input.shippingAddress);
    if (addressFailure) throw new Error(`Check your delivery details: ${addressFailure}`);
    const seenLines = new Set<number>();
    for (const gift of input.gifts) {
      if (!Number.isSafeInteger(gift.lineIndex) || gift.lineIndex < 0) throw new Error("Gift line is out of range");
      if (seenLines.has(gift.lineIndex)) throw new Error("Each book can carry one gift");
      seenLines.add(gift.lineIndex);
      if (!gift.recipientLabel.trim() || gift.recipientLabel.length > MAX_RECIPIENT_LENGTH) {
        throw new Error(`Gift recipient must be 1–${MAX_RECIPIENT_LENGTH} characters`);
      }
      if (gift.message.length > MAX_GIFT_MESSAGE_LENGTH) throw new Error(`Gift message must be ${MAX_GIFT_MESSAGE_LENGTH} characters or fewer`);
    }
    const address: Record<string, string> = {
      first_name: input.shippingAddress.firstName,
      last_name: input.shippingAddress.lastName,
      address_1: input.shippingAddress.address1,
      city: input.shippingAddress.city,
      postal_code: input.shippingAddress.postalCode,
      country_code: input.shippingAddress.countryCode,
    };
    if (input.shippingAddress.address2) address.address_2 = input.shippingAddress.address2;
    const json = await this.request("/store/flo/checkout-cart", {
      method: "POST",
      body: {
        cart_id: input.cartId,
        shipping_address: address,
        gifts: input.gifts.map((gift) => ({
          line_index: gift.lineIndex,
          recipient_label: gift.recipientLabel,
          message: gift.message,
        })),
      },
      headers: { "x-flo-idempotency-key": input.idempotencyKey },
    });
    return readCheckoutResult(json);
  }
}
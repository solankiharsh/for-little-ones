import { describe, expect, it } from "vitest";
import { StorefrontCommerceClient, type Fetcher, type FetchResponse } from "./client";
import { demoPurchaseOption } from "./approval";

const MEDUSA_URL = "http://localhost:9000";
const PUBLISHABLE_KEY = "pk_test_123";
const SKU = "hardcover-square-210";
const option = demoPurchaseOption();

interface CapturedRequest {
  input: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

/** Recorded fixtures from the sandbox seed (region UK Sandbox, £29.20 hardcover). */
const CART_FIXTURE = {
  cart: {
    id: "cart_demo_1",
    currency_code: "gbp",
    region_id: "reg_uk_sandbox",
    items: [
      { id: "li_1", title: "The Fox Who Lost the Moon", quantity: 2, subtotal: 58.4, metadata: { ...option.reference } },
    ],
    item_subtotal: 58.4,
    shipping_total: 0,
    discount_total: 0,
    tax_total: 0,
    total: 58.4,
  },
};

function serverResponse(body: unknown, status = 200, message: string | undefined = undefined): FetchResponse {
  return { ok: status < 400, status, json: async () => (message ? { message } : body) };
}

function clientWith(route: (request: CapturedRequest, index: number) => FetchResponse) {
  const calls: CapturedRequest[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const call = { input, init: init ?? {} };
    calls.push(call);
    return route(call, calls.length - 1);
  };
  return { client: new StorefrontCommerceClient({ medusaUrl: MEDUSA_URL, publishableKey: PUBLISHABLE_KEY, email: "buyer@example.test", fetcher }), calls };
}

function defaultRoute(request: CapturedRequest): FetchResponse {
  if (request.input.includes("/store/products")) {
    return serverResponse({ products: [{ id: "prod_1", variants: [{ id: "variant_1", sku: SKU, calculated_price: { amount: 29.2, currency_code: "gbp" } }] }] });
  }
  if (request.input.includes("/store/regions")) {
    return serverResponse({ regions: [{ id: "reg_uk_sandbox", name: "UK Sandbox", currency_code: "gbp" }] });
  }
  if (request.input.includes("/line-items")) return serverResponse({ cart: { ...CART_FIXTURE.cart } });
  if (request.input.includes("/shipping-methods")) return serverResponse(CART_FIXTURE);
  if (request.input.includes("/store/flo/checkout-cart")) {
    return serverResponse({ orderId: "order_1", total: 29.2, currencyCode: "gbp", receiptKey: "receipt_1", deduped: false });
  }
  if (request.input.endsWith("/store/carts")) {
    return serverResponse({ cart: { ...CART_FIXTURE.cart, id: "cart_demo_1" } });
  }
  return serverResponse(CART_FIXTURE, 200);
}

describe("StorefrontCommerceClient", () => {
  it("creates a cart against the Store API with the publishable key and buyer email", async () => {
    const { client, calls } = clientWith(defaultRoute);
    const cartId = await client.createCart({ regionId: "reg_uk_sandbox", currencyCode: "gbp" });

    expect(cartId).toBe("cart_demo_1");
    const call = calls.find((call) => call.input === `${MEDUSA_URL}/store/carts`);
    expect(call).toBeDefined();
    expect(call!.init.method).toBe("POST");
    expect(call!.init.headers?.["x-publishable-api-key"]).toBe(PUBLISHABLE_KEY);
    expect(JSON.parse(call!.init.body!)).toEqual({
      region_id: "reg_uk_sandbox", currency_code: "gbp", email: "buyer@example.test",
    });
  });

  it("adds a line whose metadata is exactly the four opaque fields — nothing else", async () => {
    const { client, calls } = clientWith(defaultRoute);
    await client.addApprovedItem({ cartId: "cart_demo_1", sku: SKU, quantity: 1, reference: option.reference });

    const call = calls.find((call) => call.input.includes("/line-items"));
    expect(call).toBeDefined();
    const body = JSON.parse(call!.init.body!) as { variant_id: string; quantity: number; metadata: Record<string, string> };
    expect(body.variant_id).toBe("variant_1");
    expect(body.quantity).toBe(1);
    expect(Object.keys(body.metadata).sort()).toEqual(
      ["approvedBookRevisionId", "contentHash", "printSpecId", "productFormatId"].sort(),
    );
  });

  it("fails closed when a line would carry personalised data, with no request sent", async () => {
    const { client, calls } = clientWith(defaultRoute);
    const tainted = { ...option.reference } as Record<string, unknown>;
    tainted.childName = "Mira";
    await expect(client.addApprovedItem({
      cartId: "cart_demo_1", sku: SKU, quantity: 1,
      reference: tainted as unknown as typeof option.reference,
    })).rejects.toThrow("exactly the four opaque");
    expect(calls.length).toBe(0);
  });

  it.each([0, 6, 1.5])("rejects out-of-bounds quantity %s before calling the store", async (quantity) => {
    const { client, calls } = clientWith(defaultRoute);
    await expect(client.addApprovedItem({ cartId: "cart_demo_1", sku: SKU, quantity, reference: option.reference })).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it("reports a friendly storefront error when a line quantity exceeds the catalogue", async () => {
    const { client } = clientWith(() => serverResponse({ message: "Quantity must be between 1 and 5" }, 400));
    await expect(client.addApprovedItem({ cartId: "cart_demo_1", sku: SKU, quantity: 9, reference: option.reference })).rejects.toThrow(
      "Quantity must be between 1 and 5",
    );
  });

  it("reads the persisted cart as a storefront view model with literal totals", async () => {
    const { client } = clientWith(defaultRoute);
    const cart = await client.getCart({ cartId: "cart_demo_1" });

    expect(cart.id).toBe("cart_demo_1");
    expect(cart.currencyCode).toBe("gbp");
    expect(cart.lines[0]!.quantity).toBe(2);
    expect(cart.lines[0]!.lineTotal).toBe(58.4);
    expect(cart.totals).toEqual({ itemTotal: 58.4, shippingTotal: 0, discountTotal: 0, taxTotal: 0, total: 58.4 });
  });

  it("attaches a shipping method and returns the updated view", async () => {
    const { client, calls } = clientWith(defaultRoute);
    const cart = await client.configureShipping({ cartId: "cart_demo_1", optionId: "opt_sandbox_std" });

    const call = calls.at(-1);
    expect(call?.input).toBe(`${MEDUSA_URL}/store/carts/cart_demo_1/shipping-methods`);
    expect(JSON.parse(call!.init.body!)).toEqual({ option_id: "opt_sandbox_std" });
    expect(cart.totals.total).toBe(58.4);
  });

  it("completes checkout with its idempotency key and surfaces dedupe", async () => {
    const { client, calls } = clientWith(defaultRoute);
    const first = await client.beginCheckout({ cartId: "cart_demo_1", idempotencyKey: "key_1" });
    const call = calls.at(-1);
    expect(call?.init.headers?.["x-flo-idempotency-key"]).toBe("key_1");
    expect(JSON.parse(call!.init.body!)).toEqual({ cart_id: "cart_demo_1" });
    const replay = await client.beginCheckout({ cartId: "cart_demo_1", idempotencyKey: "key_1" });
    expect(first.deduped).toBe(false);
    expect((replay).orderId).toBe("order_1");
  });

  it("surfaces the server completion error verbatim", async () => {
    const { client } = clientWith(() => serverResponse({ message: "Approved revision unavailable to buyer" }, 500));
    await expect(client.beginCheckout({ cartId: "cart_demo_1", idempotencyKey: "key_2" })).rejects.toThrow(
      "Approved revision unavailable to buyer",
    );
  });

  it("lists regions from the Store API", async () => {
    const { client } = clientWith(defaultRoute);
    const regions = await client.fetchRegions();
    expect(regions).toEqual([{ id: "reg_uk_sandbox", name: "UK Sandbox", currencyCode: "gbp" }]);
  });
});
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import {
  addShippingMethodToCartWorkflow,
  capturePaymentWorkflow,
  completeCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { database, validateCart } from "../../../../lib/approvals";
import { envelopeToAddress, parseCheckoutEnvelope } from "../../../../lib/checkout-envelope";
import { claimCheckoutKey, markCheckoutDone, orderSummary, releaseCheckoutClaim } from "../../../../lib/checkout";
import { drainFakePrinter, reconcileOrders } from "../../../../lib/handoff";

/**
 * Completes a storefront-built cart (created over the Medusa Store API by
 * `apps/web/src/commerce/client.ts`). The client already carried the opaque
 * approved-revision references on each line; the server OWNs the checkout gate:
 * it revalidates every line against the approval registry here AND again inside
 * the `completeCartWorkflow` hook, attaches fixture buyer/shipping for the
 * sandbox, pays through the local system provider and captures exactly once.
 * Idempotent per `x-flo-idempotency-key`; a replayed key returns the same order.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.COMMERCE_SANDBOX !== "true") {
    return res.status(403).json({ message: "Sandbox checkout is disabled" });
  }
  const key = req.headers["x-flo-idempotency-key"];
  if (typeof key !== "string" || !key.trim()) {
    return res.status(400).json({ message: "Missing x-flo-idempotency-key header" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.cart_id !== "string" || !body.cart_id.trim()) {
    return res.status(400).json({ message: "Missing cart_id" });
  }
  if (Object.keys(body).some((key) => !["cart_id", "shipping_address", "gifts"].includes(key))) {
    return res.status(400).json({ message: "Unexpected checkout field" });
  }
  let envelope;
  try {
    envelope = parseCheckoutEnvelope({ shipping_address: body.shipping_address, gifts: body.gifts });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid checkout envelope" });
  }
  const container = req.scope;
  const db = database(container);

  const claim = await claimCheckoutKey(db, key);
  if (claim.kind === "done") {
    return res.json({ ...(await orderSummary(container, db, claim.orderId)), deduped: true });
  }
  if (claim.kind === "busy") {
    return res.status(409).json({ message: "Checkout already in progress for this key" });
  }

  try {
    const cartModule = container.resolve(Modules.CART);
    const [region] = await container.resolve(Modules.REGION).listRegions({ name: "UK Sandbox" });
    const [shipping] = await container.resolve(Modules.FULFILLMENT).listShippingOptions({ name: "Sandbox standard" });
    const buyers = container.resolve(Modules.CUSTOMER);
    const buyer = (await buyers.listCustomers({ email: "buyer@example.test" }))[0] ?? await buyers.createCustomers({ email: "buyer@example.test" });
    if (!region || !shipping) {
      return res.status(500).json({ message: "Sandbox not seeded" });
    }
    const cart = await cartModule.retrieveCart(body.cart_id);
    const itemCount = (cart.items ?? []).length;
    if (envelope.gifts.some((gift) => gift.lineIndex >= itemCount)) {
      await releaseCheckoutClaim(db, key, claim.token);
      return res.status(400).json({ message: "Gift line out of range" });
    }
    // The storefront demo sells to the sandbox buyer; production resolves the
    // customer from the authenticated session (F-001 claim flow, not built).
    await cartModule.updateCarts(body.cart_id, {
      customer_id: buyer.id,
      email: buyer.email,
      region_id: region.id,
      currency_code: "gbp",
      shipping_address: envelopeToAddress(envelope),
    });
    await validateCart(container, {
      customer_id: cart.customer_id ?? buyer.id,
      items: (cart.items ?? []).map((item) => ({
        metadata: item.metadata as Record<string, unknown> | null,
        quantity: Number(item.quantity),
        variant_id: item.variant_id ?? null,
      })),
    });
    const hasShipping = Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0;
    if (!hasShipping) {
      await addShippingMethodToCartWorkflow(container).run({ input: { cart_id: body.cart_id, options: [{ id: shipping.id }] } });
    }
    const { result: collection } = await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: body.cart_id } });
    await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: collection.id, provider_id: "pp_system_default", customer_id: buyer.id } });
    const { result: order } = await completeCartWorkflow(container).run({ input: { id: body.cart_id } });
    const payments = container.resolve(Modules.PAYMENT);
    const [payment] = (await payments.retrievePaymentCollection(collection.id, { relations: ["payments"] })).payments ?? [];
    if (!payment) throw new Error("Payment missing after checkout");
    await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } });
    // Delivery + gift details live on the order only — never on cart line
    // metadata (the four opaque approved-revision fields stay untouched).
    await container.resolve(Modules.ORDER).updateOrders(order.id, {
      metadata: { flo_envelope: { shippingAddress: envelope.shippingAddress, gifts: envelope.gifts } },
    });
    await reconcileOrders(container);
    await drainFakePrinter(container);
    await markCheckoutDone(db, key, order.id);
    return res.json({ ...(await orderSummary(container, db, order.id)), deduped: false });
  } catch (error) {
    await releaseCheckoutClaim(db, key, claim.token);
    return res.status(500).json({ message: error instanceof Error ? error.message : "Storefront checkout failed" });
  }
}
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import {
  addShippingMethodToCartWorkflow,
  capturePaymentWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { commerceGateway } from "../../../../lib/gateway";
import { database, fixtureReference, FORMAT } from "../../../../lib/approvals";
import { claimCheckoutKey, markCheckoutDone, orderSummary, releaseCheckoutClaim } from "../../../../lib/checkout";
import { drainFakePrinter, reconcileOrders } from "../../../../lib/handoff";

/**
 * Sandbox-only checkout for the fixture approved revision. Clearly demo
 * scaffolding: fixed buyer, fixed format, local system payment. Production
 * checkout needs customer auth, real approval resolution and Stripe.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.COMMERCE_SANDBOX !== "true") {
    return res.status(403).json({ message: "Sandbox checkout is disabled" });
  }
  const key = req.headers["x-flo-idempotency-key"];
  if (typeof key !== "string" || !key.trim()) {
    return res.status(400).json({ message: "Missing x-flo-idempotency-key header" });
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
    const [buyer] = await container.resolve(Modules.CUSTOMER).listCustomers({ email: "buyer@example.test" });
    const [region] = await container.resolve(Modules.REGION).listRegions({ name: "UK Sandbox" });
    const [variant] = await container.resolve(Modules.PRODUCT).listProductVariants({ sku: FORMAT });
    const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "FLO Sandbox" });
    const [shipping] = await container.resolve(Modules.FULFILLMENT).listShippingOptions({ name: "Sandbox standard" });
    if (!buyer || !region || !variant || !channel || !shipping) {
      return res.status(500).json({ message: "Sandbox not seeded" });
    }
    const { result: cart } = await createCartWorkflow(container).run({
      input: {
        customer_id: buyer.id, email: buyer.email, region_id: region.id,
        sales_channel_id: channel.id, currency_code: "gbp",
        shipping_address: { first_name: "Sandbox", last_name: "Buyer", address_1: "1 Test Road", city: "London", country_code: "gb", postal_code: "SW1A 1AA" },
      },
    });
    await commerceGateway(container).addApprovedItem({ cartId: cart.id, variantId: variant.id, quantity: 1, reference: fixtureReference });
    await addShippingMethodToCartWorkflow(container).run({ input: { cart_id: cart.id, options: [{ id: shipping.id }] } });
    const { result: collection } = await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } });
    await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: collection.id, provider_id: "pp_system_default", customer_id: buyer.id } });
    const { result: order } = await completeCartWorkflow(container).run({ input: { id: cart.id } });
    const payments = container.resolve(Modules.PAYMENT);
    const [payment] = (await payments.retrievePaymentCollection(collection.id, { relations: ["payments"] })).payments ?? [];
    if (!payment) throw new Error("Payment missing after checkout");
    await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } });
    await reconcileOrders(container);
    await drainFakePrinter(container);
    await markCheckoutDone(db, key, order.id);
    return res.json({ ...(await orderSummary(container, db, order.id)), deduped: false });
  } catch (error) {
    await releaseCheckoutClaim(db, key, claim.token);
    return res.status(500).json({ message: error instanceof Error ? error.message : "Sandbox checkout failed" });
  }
}
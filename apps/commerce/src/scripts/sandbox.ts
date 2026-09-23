import assert from "node:assert/strict";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCartWorkflow, addShippingMethodToCartWorkflow, createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow, completeCartWorkflow, capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import { commerceGateway } from "../lib/gateway";
import { database, FORMAT, fixtureReference } from "../lib/approvals";
import { drainFakePrinter, reconcileOrders } from "../lib/handoff";

export default async function sandbox({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [buyer] = await container.resolve(Modules.CUSTOMER).listCustomers({ email: "buyer@example.test" });
  const [region] = await container.resolve(Modules.REGION).listRegions({ name: "UK Sandbox" });
  const [variant] = await container.resolve(Modules.PRODUCT).listProductVariants({ sku: FORMAT });
  const [channel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "FLO Sandbox" });
  const [shipping] = await container.resolve(Modules.FULFILLMENT).listShippingOptions({ name: "Sandbox standard" });
  assert(buyer && region && variant && channel && shipping, "Run seed first");
  const gateway = commerceGateway(container);
  const db = database(container);
  const approvalBefore = await db("flo_sandbox_approval").where({ id: fixtureReference.approvedBookRevisionId }).first();

  async function prepareCart() {
    const { result: cart } = await createCartWorkflow(container).run({ input: { customer_id: buyer.id, email: buyer.email,
      region_id: region.id, sales_channel_id: channel.id, currency_code: "gbp",
      shipping_address: { first_name: "Sandbox", last_name: "Buyer", address_1: "1 Test Road", city: "London", country_code: "gb", postal_code: "SW1A 1AA" } } });
    await gateway.addApprovedItem({ cartId: cart.id, variantId: variant.id, quantity: 1, reference: fixtureReference });
    await addShippingMethodToCartWorkflow(container).run({ input: { cart_id: cart.id, options: [{ id: shipping.id }] } });
    const { result: collection } = await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } });
    await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: collection.id, provider_id: "pp_system_default", customer_id: buyer.id } });
    return { cart, collection };
  }

  const { cart, collection } = await prepareCart();
  // Server-owned approval rejection occurs in the actual Medusa completion hook.
  await db("flo_sandbox_approval").where({ id: fixtureReference.approvedBookRevisionId }).update({ status: "REVOKED" });
  try {
    await assert.rejects(completeCartWorkflow(container).run({ input: { id: cart.id } }), (error: unknown) => {
      return JSON.stringify(error).includes("unavailable");
    });
  } finally {
    await db("flo_sandbox_approval").where({ id: fixtureReference.approvedBookRevisionId }).update({ status: "APPROVED" });
  }
  const { result: first } = await completeCartWorkflow(container).run({ input: { id: cart.id } });
  const { result: retry } = await completeCartWorkflow(container).run({ input: { id: cart.id } });
  assert.equal(first.id, retry.id, "Repeated checkout must return the same order");
  await reconcileOrders(container);
  assert.equal((await db("flo_print_outbox").whereRaw("payload->>'orderId' = ?", [first.id])).length, 0, "Authorization is not capture");
  const payments = container.resolve(Modules.PAYMENT);
  const [payment] = (await payments.retrievePaymentCollection(collection.id, { relations: ["payments"] })).payments ?? [];
  assert(payment, "Authorized payment exists");
  await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } });
  await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } });
  const captured = await payments.retrievePayment(payment.id, { relations: ["captures"] });
  assert.equal(captured.captures?.length, 1, "Duplicate capture must not charge twice");

  const { cart: secondCart, collection: secondCollection } = await prepareCart();
  const { result: second } = await completeCartWorkflow(container).run({ input: { id: secondCart.id } });
  assert.notEqual(first.id, second.id, "A reorder is a distinct order");
  const [secondPayment] = (await payments.retrievePaymentCollection(secondCollection.id, { relations: ["payments"] })).payments ?? [];
  await capturePaymentWorkflow(container).run({ input: { payment_id: secondPayment.id } });

  await Promise.all([reconcileOrders(container), reconcileOrders(container)]);
  await Promise.all([drainFakePrinter(container), drainFakePrinter(container)]);
  await reconcileOrders(container);
  await drainFakePrinter(container);
  for (const orderId of [first.id, second.id]) {
    const { data: [order] } = await query.graph({ entity: "order", fields: ["id", "total", "currency_code", "items.metadata"], filters: { id: orderId } });
    assert.equal(Number(order.total), 29.2);
    assert.equal(order.currency_code, "gbp");
    assert.deepEqual(order.items[0].metadata, fixtureReference);
    const receipts = await db("flo_fake_print_receipt").where({ order_id: orderId });
    assert.equal(receipts.length, 1, "One durable fake print receipt per order item");
  }
  assert.deepEqual(await db("flo_sandbox_approval").where({ id: fixtureReference.approvedBookRevisionId }).first(), approvalBefore);
  console.log("PASS: checkout rejection/retry, £29.20 order, duplicate checkout/capture, reorder, concurrent/replayed handoff, immutable approval.");
  console.log("Payment provider: Medusa local system provider. Stripe test-mode verification is a separate credential-dependent check.");
}

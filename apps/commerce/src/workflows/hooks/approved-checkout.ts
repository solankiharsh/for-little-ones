import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { validateCart } from "../../lib/approvals";

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  await validateCart(container, cart);
  // Medusa does not itself compare the session amount with current cart totals.
  const collection = cart.payment_collection;
  const sessions = collection?.payment_sessions ?? [];
  if (!collection || Number(collection.amount) !== Number(cart.total) ||
      !sessions.some((session: { amount: unknown; currency_code: string }) => Number(session.amount) === Number(cart.total) && session.currency_code === cart.currency_code)) {
    throw new Error("Payment session must match the current cart total and currency");
  }
});

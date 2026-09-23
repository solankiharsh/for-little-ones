import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import crypto from "node:crypto";
import type { Knex } from "knex";

const POLL_ATTEMPTS = 120;
const POLL_INTERVAL_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type CheckoutClaim =
  | { kind: "claimed"; token: string }
  | { kind: "done"; orderId: string }
  | { kind: "busy" };

/**
 * Atomic single-winner claim on a checkout idempotency key. The first request
 * wins the empty `PENDING:` seat; everyone else polls for the stored order id.
 * Returns `done` with the existing order on a replayed key, `busy` if a
 * sibling attempt is still running past the poll budget.
 */
export async function claimCheckoutKey(db: Knex, key: string): Promise<CheckoutClaim> {
  await db("flo_idempotency").insert({ key, order_id: "" }).onConflict("key").ignore();
  const token = `PENDING:${crypto.randomUUID()}`;
  const claimed = await db("flo_idempotency").where({ key, order_id: "" }).update({ order_id: token });
  if (claimed === 1) return { kind: "claimed", token };
  for (let i = 0; i <= POLL_ATTEMPTS; i++) {
    const current = await db("flo_idempotency").where({ key }).first();
    const currentOrder = current?.order_id as string | undefined;
    if (currentOrder && !currentOrder.startsWith("PENDING:")) return { kind: "done", orderId: currentOrder };
    await sleep(POLL_INTERVAL_MS);
  }
  return { kind: "busy" };
}

export function markCheckoutDone(db: Knex, key: string, orderId: string) {
  return db("flo_idempotency").where({ key }).update({ order_id: orderId });
}

export function releaseCheckoutClaim(db: Knex, key: string, token: string) {
  return db("flo_idempotency").where({ key, order_id: token }).delete();
}

export async function orderSummary(container: MedusaRequest["scope"], db: Knex, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "total", "currency_code", "items.metadata"],
    filters: { id: orderId },
  });
  if (!order) throw new Error("Order not found after checkout");
  const [receipt] = await db("flo_fake_print_receipt").where({ order_id: orderId });
  return {
    orderId: order.id as string,
    total: Number(order.total),
    currencyCode: order.currency_code as string,
    lineMetadata: (order.items as { metadata: unknown }[])[0]?.metadata ?? null,
    receiptKey: (receipt?.key as string | undefined) ?? null,
  };
}
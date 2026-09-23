import { CommerceEventAdapter, type PaidOrderProjection, type PrintHandoff } from "@for-little-ones/commerce";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { approvalResolver, database } from "./approvals";

/** Transactional outbox. Reconciliation safely retries partial multi-line deliveries. */
export async function reconcileOrders(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "customer_id", "status", "total", "payment_collections.*",
    "items.id", "items.quantity", "items.variant_sku", "items.metadata"] });
  const db = database(container);
  const adapter = new CommerceEventAdapter(approvalResolver(container), {
    async enqueueOnce(command) {
      await db("flo_print_outbox").insert({ key: command.operationKey, payload: JSON.stringify(command) }).onConflict("key").ignore();
    }
  });
  for (const order of orders) {
    if (!order.customer_id) continue;
    const projection: PaidOrderProjection = {
      id: order.id, ownerId: order.customer_id, cancelled: order.status === "canceled",
      paymentStatus: (order.payment_collections ?? []).reduce((sum: number, payment: { captured_amount?: number; refunded_amount?: number }) =>
        sum + Number(payment.captured_amount ?? 0) - Number(payment.refunded_amount ?? 0), 0) >= Number(order.total) && Number(order.total) > 0 ? "captured" : "unpaid",
      items: (order.items ?? []).map((item: { id: string; quantity: number; variant_sku?: string; metadata: unknown }) => ({ id: item.id, quantity: Number(item.quantity),
        productFormatId: item.variant_sku ?? "", reference: item.metadata }))
    };
    await adapter.handle(projection);
  }
}

/** Fake printer stores a receipt in the SAME transaction as outbox completion. No physical side effect. */
export async function drainFakePrinter(container: MedusaContainer) {
  const db = database(container);
  await db.transaction(async (tx) => {
    const pending = await tx("flo_print_outbox").whereNull("completed_at").forUpdate().skipLocked();
    for (const row of pending) {
      const command = row.payload as PrintHandoff;
      await tx("flo_fake_print_receipt").insert({ key: command.operationKey, order_id: command.orderId,
        approved_revision_id: command.approvedBookRevisionId, content_hash: command.contentHash }).onConflict("key").ignore();
      await tx("flo_print_outbox").where({ key: row.key }).update({ completed_at: tx.fn.now() });
    }
  });
}

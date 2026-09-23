import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { reconcileOrders } from "../lib/handoff";

export default async function paidOrder({ container }: SubscriberArgs<{ id: string }>) {
  await reconcileOrders(container);
}
export const config: SubscriberConfig = { event: ["order.placed", "payment.captured"], context: { subscriberId: "flo-print-outbox" } };

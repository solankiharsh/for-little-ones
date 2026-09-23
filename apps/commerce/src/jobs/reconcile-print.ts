import type { MedusaContainer } from "@medusajs/framework/types";
import { reconcileOrders, drainFakePrinter } from "../lib/handoff";
export default async function reconcilePrint(container: MedusaContainer) {
  await reconcileOrders(container);
  await drainFakePrinter(container);
}
export const config = { name: "flo-reconcile-print", schedule: "* * * * *" };

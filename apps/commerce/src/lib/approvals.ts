import { validateApprovedItem, type ApprovedRevisionResolver } from "@for-little-ones/commerce";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Knex } from "knex";

export const FORMAT = "hardcover-square-210";
export const FIXTURE_APPROVAL = "approved_sandbox_1";
export const FIXTURE_HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const fixtureReference = { approvedBookRevisionId: FIXTURE_APPROVAL, contentHash: FIXTURE_HASH,
  productFormatId: FORMAT, printSpecId: "square-210-3mm" };

export function database(container: MedusaContainer): Knex {
  return container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
}

// Synthetic opaque registry only. Production must query the authenticated Book service.
export function approvalResolver(container: MedusaContainer): ApprovedRevisionResolver {
  return { async resolve(id) {
    const row = await database(container)("flo_sandbox_approval").where({ id }).first();
    return row ? { approvedBookRevisionId: row.id, contentHash: row.content_hash, productFormatId: row.format_id,
      printSpecId: row.print_spec_id, ownerId: row.owner_id, status: row.status } : undefined;
  } };
}

export async function validateCart(container: MedusaContainer, cart: {
  customer_id?: string | null;
  items?: { metadata?: Record<string, unknown> | null; quantity: number; variant_id?: string | null }[] | null;
}) {
  if (!cart.customer_id || !cart.items?.length) throw new Error("Checkout requires a buyer and approved items");
  for (const item of cart.items) {
    if (!item.variant_id) throw new Error("Book variant required");
    const variant = await container.resolve(Modules.PRODUCT).retrieveProductVariant(item.variant_id);
    await validateApprovedItem({ ownerId: cart.customer_id, reference: item.metadata,
      quantity: Number(item.quantity), productFormatId: variant.sku ?? "" }, approvalResolver(container));
  }
}

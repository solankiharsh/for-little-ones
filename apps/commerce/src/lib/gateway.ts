import type { CommerceGateway } from "@for-little-ones/commerce";
import { validateApprovedItem } from "@for-little-ones/commerce";
import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";
import { approvalResolver } from "./approvals";

export function commerceGateway(container: MedusaContainer): CommerceGateway {
  return { async addApprovedItem(input) {
    const cart = await container.resolve(Modules.CART).retrieveCart(input.cartId);
    const variant = await container.resolve(Modules.PRODUCT).retrieveProductVariant(input.variantId);
    const reference = await validateApprovedItem({ reference: input.reference, ownerId: cart.customer_id ?? "",
      productFormatId: variant.sku ?? "", quantity: input.quantity }, approvalResolver(container));
    await addToCartWorkflow(container).run({ input: { cart_id: cart.id, items: [{ variant_id: variant.id,
      quantity: input.quantity, metadata: { ...reference } }] } });
  } };
}

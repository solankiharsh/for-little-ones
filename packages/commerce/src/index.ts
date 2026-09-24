/** Opaque commerce projection: no book content, image URLs, or child details. */
export interface ApprovedRevisionLineItemReference {
  approvedBookRevisionId: string;
  contentHash: string;
  productFormatId: string;
  printSpecId: string;
}

export interface RevisionEligibility extends ApprovedRevisionLineItemReference {
  ownerId: string;
  status: "APPROVED" | "REVOKED";
}

export interface ApprovedRevisionResolver {
  resolve(id: string): Promise<RevisionEligibility | undefined>;
}

export interface CommerceGateway {
  addApprovedItem(input: {
    cartId: string;
    variantId: string;
    quantity: number;
    reference: ApprovedRevisionLineItemReference;
  }): Promise<void>;
}

const fields = ["approvedBookRevisionId", "contentHash", "productFormatId", "printSpecId"] as const;

export function parseRevisionReference(value: unknown): ApprovedRevisionLineItemReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing approved revision reference");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key as typeof fields[number]))) {
    throw new Error("Unexpected personalised metadata");
  }
  for (const field of fields) {
    if (typeof record[field] !== "string" || !(record[field] as string).trim()) throw new Error(`Invalid ${field}`);
  }
  return {
    approvedBookRevisionId: record.approvedBookRevisionId as string,
    contentHash: record.contentHash as string,
    productFormatId: record.productFormatId as string,
    printSpecId: record.printSpecId as string
  };
}

/** Revalidate at checkout; neither client metadata nor a prior cart check is authority. */
export async function validateApprovedItem(input: {
  reference: unknown;
  ownerId: string;
  productFormatId: string;
  quantity: number;
}, resolver: ApprovedRevisionResolver): Promise<ApprovedRevisionLineItemReference> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 5) throw new Error("Invalid quantity");
  const reference = parseRevisionReference(input.reference);
  const approved = await resolver.resolve(reference.approvedBookRevisionId);
  if (!approved || approved.status !== "APPROVED" || approved.ownerId !== input.ownerId) {
    throw new Error("Approved revision unavailable to buyer");
  }
  if (fields.some((field) => approved[field] !== reference[field]) || input.productFormatId !== approved.productFormatId) {
    throw new Error("Approved revision format or hash mismatch");
  }
  return reference;
}

export interface PrintHandoff extends ApprovedRevisionLineItemReference {
  operationKey: string;
  orderId: string;
  itemId: string;
  quantity: number;
}

/** Adapter must persist/deduplicate this business key, not the incoming event id. */
export interface PrintHandoffQueue {
  enqueueOnce(command: PrintHandoff): Promise<void>;
}

export interface PaidOrderProjection {
  id: string;
  ownerId: string;
  paymentStatus: string;
  cancelled: boolean;
  items: { id: string; quantity: number; productFormatId: string; reference: unknown }[];
}

export class CommerceEventAdapter {
  constructor(private readonly revisions: ApprovedRevisionResolver, private readonly queue: PrintHandoffQueue) {}

  async handle(order: PaidOrderProjection): Promise<void> {
    if (order.cancelled || order.paymentStatus !== "captured") return;
    // Validate all lines before emitting any work.
    const commands = await Promise.all(order.items.map(async (item) => ({
      ...await validateApprovedItem({ reference: item.reference, ownerId: order.ownerId,
        productFormatId: item.productFormatId, quantity: item.quantity }, this.revisions),
      operationKey: JSON.stringify(["print", order.id, item.id]),
      orderId: order.id, itemId: item.id, quantity: item.quantity
    })));
    for (const command of commands) await this.queue.enqueueOnce(command);
  }
}

/**
 * Delivery + gift-recipient envelope carried between the storefront and the
 * checkout seam. Travels ONLY in the checkout request and the created order
 * (never in cart line metadata); contains buyer-typed delivery details and a
 * bare "to:" label for the printed book, never child identity fields.
 * Mirrors: apps/commerce/src/lib/checkout-envelope.ts and
 * apps/web/src/commerce/cart.ts MUST stay in sync with this contract.
 */
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export interface LineGift {
  lineIndex: number;
  recipientLabel: string;
  message: string;
}

export interface CheckoutEnvelope {
  shippingAddress: ShippingAddress;
  gifts: LineGift[];
}

const POSTCODE_GB = /^[A-Z]{1,2}[0-9][A-Z]?\s?[0-9][A-Z]{2}$/i;
const ADDRESS_KEYS = ["first_name", "last_name", "address_1", "address_2", "city", "postal_code", "country_code"] as const;
const GIFT_KEYS = ["line_index", "recipient_label", "message"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function parseCheckoutEnvelope(value: unknown): CheckoutEnvelope {
  if (!isRecord(value)) throw new Error("Missing shipping_address");
  if (Object.keys(value).some((key) => key !== "shipping_address" && key !== "gifts")) {
    throw new Error("Unexpected checkout field");
  }
  const rawAddress = value.shipping_address;
  if (!isRecord(rawAddress)) throw new Error("Invalid shipping_address");
  if (Object.keys(rawAddress).some((key) => !ADDRESS_KEYS.includes(key as typeof ADDRESS_KEYS[number]))) {
    throw new Error("Unexpected shipping address field");
  }
  const required = ["first_name", "last_name", "address_1", "city", "postal_code", "country_code"] as const;
  const shippingAddress: ShippingAddress = {
    firstName: requiredString(rawAddress, "first_name"),
    lastName: requiredString(rawAddress, "last_name"),
    address1: requiredString(rawAddress, "address_1"),
    city: requiredString(rawAddress, "city"),
    postalCode: requiredString(rawAddress, "postal_code"),
    countryCode: requiredString(rawAddress, "country_code"),
  };
  if (!POSTCODE_GB.test(shippingAddress.postalCode)) throw new Error("Invalid postal code");
  if (shippingAddress.countryCode !== "gb") throw new Error("country must be gb");
  const rawAddress2 = rawAddress.address_2;
  if (rawAddress2 !== undefined) {
    if (typeof rawAddress2 !== "string") throw new Error("Invalid address_2");
    if (rawAddress2.trim()) shippingAddress.address2 = rawAddress2.trim();
  }

  const rawGifts = value.gifts;
  if (!Array.isArray(rawGifts)) throw new Error("Invalid gifts");
  const seen = new Set<number>();
  const gifts = rawGifts.map((rawGift, index) => {
    if (!isRecord(rawGift)) throw new Error("Invalid gift");
    if (Object.keys(rawGift).some((key) => !GIFT_KEYS.includes(key as typeof GIFT_KEYS[number]))) {
      throw new Error("Unexpected gift field");
    }
    const lineIndex = rawGift.line_index;
    if (typeof lineIndex !== "number" || !Number.isSafeInteger(lineIndex) || lineIndex < 0) {
      throw new Error("Invalid line_index");
    }
    if (seen.has(lineIndex)) throw new Error("Duplicate gift line");
    seen.add(lineIndex);
    const recipientLabel = rawGift.recipient_label;
    if (typeof recipientLabel !== "string" || !recipientLabel.trim() || recipientLabel.length > 40) {
      throw new Error("Invalid recipient");
    }
    const rawMessage = rawGift.message;
    let message = "";
    if (rawMessage !== undefined) {
      if (typeof rawMessage !== "string" || !rawMessage.trim() || rawMessage.length > 200) {
        throw new Error("Invalid message (max 200)");
      }
      message = rawMessage.trim();
    }
    return { lineIndex, recipientLabel: recipientLabel.trim(), message } satisfies LineGift;
  });
  return { shippingAddress, gifts };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${key}`);
  return value.trim();
}

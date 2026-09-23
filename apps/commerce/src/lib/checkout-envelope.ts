/**
 * Delivery + gift-recipient envelope parsing for the server checkout seam.
 * MUST stay in sync with the canonical contract + tests:
 * packages/commerce/src/index.ts (`parseCheckoutEnvelope`) and the matching
 * web carryover in apps/web/src/commerce/cart.ts.
 * Privacy: the envelope never touches cart line metadata; the route writes it
 * to the created order only.
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
const ADDRESS_KEYS = ["first_name", "last_name", "address_1", "address_2", "city", "postal_code", "country_code"];
const GIFT_KEYS = ["line_index", "recipient_label", "message"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function parseCheckoutEnvelope(value: unknown): CheckoutEnvelope {
  if (!isRecord(value)) throw new Error("Missing shipping_address");
  if (Object.keys(value).some((key) => key !== "shipping_address" && key !== "gifts")) {
    throw new Error("Unexpected checkout field");
  }
  const rawAddress = value.shipping_address;
  if (!isRecord(rawAddress)) throw new Error("Invalid shipping_address");
  if (Object.keys(rawAddress).some((key) => !ADDRESS_KEYS.includes(key))) {
    throw new Error("Unexpected shipping address field");
  }
  const required = ["first_name", "last_name", "address_1", "city", "postal_code", "country_code"];
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
  const gifts = rawGifts.map((rawGift) => {
    if (!isRecord(rawGift)) throw new Error("Invalid gift");
    if (Object.keys(rawGift).some((key) => !GIFT_KEYS.includes(key))) {
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

export function envelopeToAddress(envelope: CheckoutEnvelope): Record<string, string> {
  const address: Record<string, string> = {
    first_name: envelope.shippingAddress.firstName,
    last_name: envelope.shippingAddress.lastName,
    address_1: envelope.shippingAddress.address1,
    city: envelope.shippingAddress.city,
    postal_code: envelope.shippingAddress.postalCode,
    country_code: envelope.shippingAddress.countryCode,
  };
  if (envelope.shippingAddress.address2) address.address_2 = envelope.shippingAddress.address2;
  return address;
}
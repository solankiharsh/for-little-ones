import type { ApprovedLineReference, PurchaseOption } from "./approval";

export interface CartEntry {
  /** Opaque approved-revision id — one line per approved book (guide §4). */
  key: string;
  title: string;
  formatLabel: string;
  reference: ApprovedLineReference;
  unitPrice: number;
  currencyCode: "gbp";
  arrivalEstimate: string;
  quantity: number;
  /** Gift detail is UI-only and NEVER rides the commerce line (guide §7). */
  giftTo: string | null;
  giftMessage: string;
}

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 5;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function lineTotal(entry: CartEntry): number {
  return roundMoney(entry.unitPrice * entry.quantity);
}

/** Single money formatter for the storefront UI (launch scope is GB, so £). */
export function formatMoney(value: number): string {
  return `£${roundMoney(value).toFixed(2)}`;
}

export function toEntry(option: PurchaseOption): CartEntry {
  return {
    key: option.reference.approvedBookRevisionId,
    title: option.title,
    formatLabel: option.sandboxFormatLabel,
    reference: { ...option.reference },
    unitPrice: option.unitPrice,
    currencyCode: option.currencyCode,
    arrivalEstimate: option.arrivalEstimate,
    quantity: 1,
    giftTo: null,
    giftMessage: "",
  };
}

/** Adding an approved book again raises its quantity toward the shared cap (5). */
export function addEntry(entries: CartEntry[], option: PurchaseOption): CartEntry[] {
  const existingIndex = entries.findIndex((entry) => entry.key === option.reference.approvedBookRevisionId);
  if (existingIndex === -1) return [...entries, toEntry(option)];
  return entries.map((entry, index) =>
    index === existingIndex ? { ...entry, quantity: Math.min(MAX_QUANTITY, entry.quantity + 1) } : entry,
  );
}

export function setQuantity(entries: CartEntry[], key: string, quantity: number): CartEntry[] {
  const clamped = Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.floor(quantity) || MIN_QUANTITY));
  return entries.map((entry) => (entry.key === key ? { ...entry, quantity: clamped } : entry));
}

export function removeEntry(entries: CartEntry[], key: string): CartEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function setGift(entries: CartEntry[], key: string, giftTo: string | null, giftMessage: string): CartEntry[] {
  return entries.map((entry) => (entry.key === key ? { ...entry, giftTo, giftMessage } : entry));
}

export interface CartTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
}

/**
 * Launch market is UK with no custom tax engine (F-018 §8) and the sandbox
 * fixture ships free; totals stay in step with the charged total on the order.
 */
export function totals(entries: CartEntry[], shipping: number): CartTotals {
  const subtotal = roundMoney(entries.reduce((sum, entry) => sum + lineTotal(entry), 0));
  const tax = 0;
  return { subtotal, shipping, tax, total: roundMoney(subtotal + shipping + tax) };
}

export function itemCount(entries: CartEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * Delivery + gift-recipient envelope for the checkout seam. Copy of the
 * canonical contract; MUST stay in sync with packages/commerce/src/index.ts
 * (`parseCheckoutEnvelope`) and apps/commerce/src/lib/checkout-envelope.ts.
 * Privacy (guide §7/§12): this travels ONLY in the checkout request body and
 * lands on the created order — never in cart line metadata.
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

export const MAX_RECIPIENT_LENGTH = 40;
export const MAX_GIFT_MESSAGE_LENGTH = 200;

const POSTCODE_GB = /^[A-Z]{1,2}[0-9][A-Z]?\s?[0-9][A-Z]{2}$/i;

export type ShippingAddressField = "firstName" | "lastName" | "address1" | "city" | "postalCode";
export type ShippingAddressError = Partial<Record<ShippingAddressField, string>> & { countryCodeUnknown?: string };

/** Per-field delivery validation for inline form errors (UK launch market). */
export function shippingAddressErrors(address: ShippingAddress): ShippingAddressError {
  const errors: ShippingAddressError = {};
  const required: ShippingAddressField[] = ["firstName", "lastName", "address1", "city", "postalCode"];
  for (const field of required) {
    if (!address[field].trim()) errors[field] = "Required";
  }
  if (address.postalCode.trim() && !POSTCODE_GB.test(address.postalCode.trim())) {
    errors.postalCode = "Enter a valid UK postcode, e.g. SW1A 1AA";
  }
  if (address.countryCode !== "gb") errors.countryCodeUnknown = "UK delivery only in the sandbox";
  return errors;
}

/** First failing delivery error, for fail-closed pre-flight and status summary. */
export function shippingAddressError(address: ShippingAddress): string | null {
  const entry = (Object.entries(shippingAddressErrors(address)) as [string, string][])[0];
  return entry ? entry[1] : null;
}

/** Per-line gift gate: a message needs a recipient; both respect length bounds. */
export function giftError(entry: Pick<CartEntry, "giftTo" | "giftMessage">): string | null {
  if (entry.giftMessage && !entry.giftTo) return "Add who the gift is for to keep this message.";
  if (entry.giftTo && entry.giftTo.length > MAX_RECIPIENT_LENGTH) {
    return `Recipient name must be ${MAX_RECIPIENT_LENGTH} characters or fewer.`;
  }
  if (entry.giftMessage.length > MAX_GIFT_MESSAGE_LENGTH) {
    return `Gift message must be ${MAX_GIFT_MESSAGE_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Maps cart lines that carry a gift (gift only ever travels off the line, at checkout). */
export function checkoutGifts(entries: CartEntry[]): LineGift[] {
  return entries.flatMap((entry, lineIndex) => {
    if (!entry.giftTo) return [];
    return [{ lineIndex, recipientLabel: entry.giftTo, message: entry.giftMessage } satisfies LineGift];
  });
}
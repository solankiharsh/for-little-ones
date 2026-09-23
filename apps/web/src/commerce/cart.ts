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
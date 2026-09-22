import type { Approval, Book, BookRevision } from "@for-little-ones/domain";

/**
 * Spike C — commerce candidate vs minimal self-built surface.
 *
 * The hard invariant (PROJECT_SPIKES.md §Spike C): commerce references an
 * approved Book revision by an OPAQUE id + hash only; it never receives or
 * stores child, story, page or character data, and never owns/mutates the Book.
 * This module is the minimal self-built commerce surface used to validate the
 * demo path headlessly (cart line → format/SKU → price → payment sandbox →
 * order) and to carry the invariant.
 */

export const FORMAT_HARDCOVER_SQUARE = "hardcover-square" as const;

export interface FormatSpec {
  sku: string;
  label: string;
  /** Price in minor units (pence), per copy. */
  basePriceMinor: number;
}

export const FORMATS: Record<typeof FORMAT_HARDCOVER_SQUARE, FormatSpec> = {
  [FORMAT_HARDCOVER_SQUARE]: { sku: "HB-SQ-AVA", label: "Hardcover square 21.6×21.6 cm", basePriceMinor: 2499 }
};

/**
 * The ONLY thing commerce may carry about an approved revision. Constructed
 * from the canonical Approval object, but only these two opaque fields ever
 * leave this module — enforced at runtime by `toOrderPayload`.
 */
export interface OpaqueApprovedRevisionRef {
  approvedBookRevisionId: string;
  revisionHash: string;
}

export interface CartLine {
  lineId: string;
  format: FormatSpec;
  quantity: number;
  /** Optional recipient name kept with the order, never canonical book data. */
  recipientLabel?: string;
  /** Set once the buyer's checkout is bound to an approved revision. */
  opaqueRef?: OpaqueApprovedRevisionRef;
}

export function opaqueRefFromApproved(revision: BookRevision, approval: Approval): OpaqueApprovedRevisionRef {
  return { approvedBookRevisionId: revision.id, revisionHash: approval.hash };
}

/** Commerce may only be offered an APPROVED revision. Anything else is rejected up front. */
export function approvalOf(book: Book): Approval | null {
  if (book.status !== "APPROVED" || !book.approval) return null;
  return book.approval;
}

export interface PaymentRequest {
  amountMinor: number;
  providerId: "sandbox";
}

export type PaymentState = "requires_capture" | "captured" | "failed";

export interface PaymentResult {
  paymentId: string;
  state: PaymentState;
}

export interface CommerceOrderItem {
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  opaqueRef: OpaqueApprovedRevisionRef;
  recipientLabel?: string;
}

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "FAILED";

export interface CommerceOrder {
  orderId: string;
  createdAt: string;
  status: OrderStatus;
  items: CommerceOrderItem[];
  totalMinor: number;
  payment: { paymentId: string; state: PaymentState };
}

export function buildOrderItem(line: CartLine, ref: OpaqueApprovedRevisionRef): CommerceOrderItem {
  return {
    sku: line.format.sku,
    quantity: line.quantity,
    unitPriceMinor: line.format.basePriceMinor,
    opaqueRef: ref,
    ...(line.recipientLabel ? { recipientLabel: line.recipientLabel } : {})
  };
}

export function orderTotalMinor(items: CommerceOrderItem[]): number {
  return items.reduce((acc, it) => acc + it.unitPriceMinor * it.quantity, 0);
}

/**
 * Serialize ONLY what commerce may transmit/store. Used by tests to prove the
 * canonical Book never leaks into commerce payloads.
 */
export function toOrderPayload(order: CommerceOrder): string {
  return JSON.stringify({
    orderId: order.orderId,
    status: order.status,
    items: order.items.map((it) => ({
      sku: it.sku,
      quantity: it.quantity,
      unitPriceMinor: it.unitPriceMinor,
      approvedBookRevisionId: it.opaqueRef.approvedBookRevisionId,
      revisionHash: it.opaqueRef.revisionHash,
      ...(it.recipientLabel ? { recipientLabel: it.recipientLabel } : {})
    })),
    totalMinor: order.totalMinor,
    payment: order.payment
  });
}
import { describe, expect, it } from "vitest";
import type { Book } from "@for-little-ones/domain";
import {
  FORMATS,
  FORMAT_HARDCOVER_SQUARE,
  approvalOf,
  buildOrderItem,
  orderTotalMinor,
  opaqueRefFromApproved,
  toOrderPayload
} from "../src/order";
import { SandboxPayment } from "../src/payment";

function approvedBook(): Book {
  return {
    id: "book-1",
    status: "APPROVED",
    metadata: { locale: "en" },
    childProfileIds: ["child-ava"],
    characters: [{ id: "char-ava", characterId: "char-ava", version: "v2", name: "Ava", styleTokensRef: "mock://style/ava" }],
    relationships: [],
    pages: [
      {
        pageNumber: 1,
        status: "READY",
        textBlocks: [{ id: "t1", kind: "story", text: "Ava lives on Sprout Street." }],
        illustration: { assetRef: "mock://assets/p1.png", planKey: "plan-1" }
      }
    ],
    revisions: [
      {
        id: "rev-7",
        revisionSeq: 7,
        createdAt: "2026-09-20T00:00:00.000Z",
        status: "APPROVED",
        pageNumbers: [1]
      }
    ],
    printSpecId: "print-mixam-art-sq",
    approval: { revisionId: "rev-7", approvedAt: "2026-09-21T00:00:00.000Z", hash: "sha256:abc123" }
  };
}

describe("Spike C — commerce demo path + hard invariant (minimal self-built surface)", () => {
  it("runs the demo path: approved revision → cart line → SKU/price → payment sandbox → order", () => {
    const book = approvedBook();
    const revision = book.revisions[0]!;
    const ref = opaqueRefFromApproved(revision, book.approval!);
    const line = {
      lineId: "ln-1",
      format: FORMATS[FORMAT_HARDCOVER_SQUARE],
      quantity: 1,
      recipientLabel: "From Mum & Dad",
      opaqueRef: ref
    };
    const item = buildOrderItem(line, ref);
    expect(item.sku).toBe("HB-SQ-AVA");
    expect(item.unitPriceMinor).toBe(2499);
    expect(orderTotalMinor([item])).toBe(2499);

    const pay = new SandboxPayment();
    const auth = pay.authorize({ amountMinor: 2499, providerId: "sandbox" });
    const hook = pay.capture({ amountMinor: 2499, providerId: "sandbox" }, auth.paymentId, "evt-capture-1");
    expect(hook.kind).toBe("payment.captured");
    expect(pay.state(auth.paymentId)).toBe("captured");
  });

  it("rejects any book that is not APPROVED — commerce cannot touch unapproved content", () => {
    const draft = approvedBook();
    draft.status = "DRAFT";
    delete (draft as Partial<Book>).approval;
    expect(approvalOf(draft)).toBeNull();
    const editing: Book = { ...approvedBook(), status: "EDITING" };
    expect(approvalOf(editing)).toBeNull();
    expect(approvalOf(approvedBook())).not.toBeNull();
  });

  it("orders reference the approved revision by opaque id + hash only — canonical data never leaks", () => {
    const book = approvedBook();
    const ref = opaqueRefFromApproved(book.revisions[0]!, book.approval!);
    const item = buildOrderItem({ lineId: "ln-2", format: FORMATS[FORMAT_HARDCOVER_SQUARE], quantity: 1 }, ref);
    const payload = toOrderPayload({
      orderId: "ord-1",
      createdAt: "2026-09-22T00:00:00.000Z",
      status: "PAID",
      items: [item],
      totalMinor: 2499,
      payment: { paymentId: "pay_1", state: "captured" }
    });

    expect(payload).toContain('"approvedBookRevisionId":"rev-7"');
    expect(payload).toContain('"revisionHash":"sha256:abc123"');
    expect(payload).not.toContain("Ava");
    expect(payload).not.toContain("Sprout Street");
    expect(payload).not.toContain("child-ava");
    expect(payload).not.toContain("char-ava");
    expect(payload).not.toContain("mock://assets");
    expect(payload).not.toContain("story");
  });

  it("is idempotent against duplicate payment webhooks (at-least-once delivery)", () => {
    const pay = new SandboxPayment();
    const auth = pay.authorize({ amountMinor: 2499, providerId: "sandbox" });

    const first = pay.capture({ amountMinor: 2499, providerId: "sandbox" }, auth.paymentId, "evt-capture-dup");
    const dup = pay.deliver({ eventId: "evt-capture-dup", kind: "payment.captured", paymentId: auth.paymentId, deliveredAt: "x" });
    const second = pay.capture({ amountMinor: 2499, providerId: "sandbox" }, auth.paymentId, "evt-capture-dup");

    expect(first.kind).toBe("payment.captured");
    expect(dup.deduped).toBe(true);
    expect(second.kind).toBe("payment.failed"); // paymentId already captured — no double capture
    expect(pay.state(auth.paymentId)).toBe("captured");
    expect(pay.deliver({ eventId: "never-seen", kind: "payment.captured", paymentId: auth.paymentId, deliveredAt: "x" }).deduped).toBe(false);
  });
});
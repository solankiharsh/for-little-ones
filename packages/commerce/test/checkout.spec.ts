import { describe, expect, it } from "vitest";
import { CommerceEventAdapter, validateApprovedItem, type RevisionEligibility, type PrintHandoff } from "../src";

const approved: RevisionEligibility = {
  approvedBookRevisionId: "approved-1", contentHash: "sha256:fixture",
  productFormatId: "hardcover-square", printSpecId: "square-210", ownerId: "buyer-1", status: "APPROVED"
};
const reference = { approvedBookRevisionId: approved.approvedBookRevisionId, contentHash: approved.contentHash,
  productFormatId: approved.productFormatId, printSpecId: approved.printSpecId };
const resolver = { async resolve(id: string) { return id === approved.approvedBookRevisionId ? approved : undefined; } };

describe("commerce approved-revision boundary", () => {
  it("returns only opaque metadata", async () => {
    expect(await validateApprovedItem({ reference, ownerId: "buyer-1", productFormatId: "hardcover-square", quantity: 1 }, resolver)).toEqual(reference);
  });

  it.each([
    { ownerId: "other-buyer" }, { quantity: 0 }, { quantity: 1.5 },
    { reference: { ...reference, contentHash: "tampered" } },
    { reference: { ...reference, approvedBookRevisionId: "missing" } },
    { productFormatId: "paperback" },
    { reference: { ...reference, childName: "Must not reach commerce" } }
  ])("rejects invalid purchase input %j", async (overrides) => {
    await expect(validateApprovedItem({ reference, ownerId: "buyer-1", productFormatId: "hardcover-square", quantity: 1, ...overrides }, resolver)).rejects.toThrow();
  });

  it("revalidates revoked approval before checkout", async () => {
    await expect(validateApprovedItem({ reference, ownerId: "buyer-1", productFormatId: "hardcover-square", quantity: 1 },
      { async resolve() { return { ...approved, status: "REVOKED" }; } })).rejects.toThrow("unavailable");
  });

  it("ignores failed/authorized payments, deduplicates by order item, and allows reorders", async () => {
    const queued = new Map<string, PrintHandoff>();
    const adapter = new CommerceEventAdapter(resolver, { async enqueueOnce(command) { queued.set(command.operationKey, command); } });
    const order = { id: "order-1", ownerId: "buyer-1", cancelled: false, paymentStatus: "authorized",
      items: [{ id: "item-1", quantity: 1, productFormatId: "hardcover-square", reference }] };
    await adapter.handle(order);
    await adapter.handle({ ...order, paymentStatus: "failed" });
    expect(queued.size).toBe(0);
    await adapter.handle({ ...order, paymentStatus: "captured", cancelled: true });
    expect(queued.size).toBe(0);
    await Promise.all([adapter.handle({ ...order, paymentStatus: "captured" }), adapter.handle({ ...order, paymentStatus: "captured" })]);
    expect(queued.size).toBe(1);
    await adapter.handle({ ...order, id: "order-2", paymentStatus: "captured" });
    expect(queued.size).toBe(2);
  });
});

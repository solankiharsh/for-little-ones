import { describe, expect, it } from "vitest";
import { CommerceEventAdapter, parseCheckoutEnvelope, validateApprovedItem, type RevisionEligibility, type PrintHandoff } from "../src";

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

const validEnvelope = {
  shipping_address: { first_name: "Harsh", last_name: "Solanki", address_1: "1 Test Road", city: "London", postal_code: "SW1A 1AA", country_code: "gb" },
  gifts: [{ line_index: 0, recipient_label: "Niece", message: "A little story just for you" }],
};

describe("commerce checkout envelope (delivery + gift recipient)", () => {
  it("maps an opaque safe shipping address and gift details", () => {
    expect(parseCheckoutEnvelope(validEnvelope)).toEqual({
      shippingAddress: { firstName: "Harsh", lastName: "Solanki", address1: "1 Test Road", city: "London", postalCode: "SW1A 1AA", countryCode: "gb" },
      gifts: [{ lineIndex: 0, recipientLabel: "Niece", message: "A little story just for you" }],
    });
  });

  it("accepts an envelope with no gifts", () => {
    expect(parseCheckoutEnvelope({ shipping_address: validEnvelope.shipping_address, gifts: [] }).gifts).toEqual([]);
  });

  it.each([
    [{ shipping_address: { ...validEnvelope.shipping_address, postcode: "SW1A 1AA" }, gifts: [] }, "Unexpected shipping address field"],
    [{ shipping_address: { ...validEnvelope.shipping_address, postal_code: "not-a-postcode" }, gifts: [] }, "Invalid postal code"],
    [{ shipping_address: { ...validEnvelope.shipping_address, country_code: "us" }, gifts: [] }, "country"],
    [{ shipping_address: { ...validEnvelope.shipping_address, first_name: "" }, gifts: [] }, "first_name"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: 0, recipient_label: "Niece", message: "x".repeat(201) }] }, "message.*200"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: 0, recipient_label: "N".repeat(41), message: "hi" }] }, "recipient"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: 0, recipient_label: "", message: "hi" }] }, "recipient"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: 0, recipient_label: "Niece", message: "hi", child_name: "must never arrive" }] }, "Unexpected gift field"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: 0, recipient_label: "Niece", message: "hi" }, { line_index: 0, recipient_label: "Other", message: "hey" }] }, "Duplicate"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: -1, recipient_label: "Niece", message: "hi" }] }, "line_index"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: [{ line_index: "0", recipient_label: "Niece", message: "hi" }] }, "line_index"],
    [{ shipping_address: validEnvelope.shipping_address, gifts: validEnvelope.gifts, extra: true }, "Unexpected checkout field"],
    [null, "shipping_address"],
    [{ shipping_address: "london", gifts: [] }, "shipping_address"],
  ])("rejects invalid envelope %j with %s", (body, message) => {
    expect(() => parseCheckoutEnvelope(body)).toThrow(new RegExp(message));
  });

  it("treats an empty address_2 as absent", () => {
    expect(parseCheckoutEnvelope({ shipping_address: { ...validEnvelope.shipping_address, address_2: "" }, gifts: [] })).toEqual({
      shippingAddress: { firstName: "Harsh", lastName: "Solanki", address1: "1 Test Road", city: "London", postalCode: "SW1A 1AA", countryCode: "gb" },
      gifts: [],
    });
  });
});

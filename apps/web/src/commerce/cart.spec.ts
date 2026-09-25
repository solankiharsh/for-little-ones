import { describe, expect, it } from "vitest";
import {
  addEntry, checkoutGifts, giftError, itemCount, lineTotal, removeEntry, toEntry,
  setGift, setQuantity, shippingAddressErrors, totals, type CartEntry, type ShippingAddress,
} from "./cart";
import { demoPurchaseOption } from "./approval";

const option = demoPurchaseOption();
const shipping = 0;
const VALID_ADDRESS: ShippingAddress = {
  firstName: "Harsh", lastName: "Solanki", address1: "1 Test Road", city: "London", postalCode: "SW1A 1AA", countryCode: "gb",
};

function entry(overrides: Partial<CartEntry> = {}): CartEntry {
  return {
    key: "approved_sandbox_1",
    title: "The Fox Who Lost the Moon",
    formatLabel: "Hardcover square · 210 mm",
    reference: { ...option.reference },
    unitPrice: 29.2,
    currencyCode: "gbp",
    arrivalEstimate: "Arrives 12–15 Oct",
    quantity: 1,
    giftTo: null,
    giftMessage: "",
    ...overrides,
  };
}

describe("storefront cart model", () => {
  it("keeps a personalised basket line separate without changing its approved reference", () => {
    const personalisedOption = { ...option, cartKey: "draft:one", title: "Milo’s Small adventures" };
    const personalised = toEntry(personalisedOption);
    expect(personalised.key).toBe("draft:one");
    expect(personalised.reference.approvedBookRevisionId).toBe("approved_sandbox_1");
    const basket = addEntry([entry()], personalisedOption);
    expect(basket).toHaveLength(2);
    expect(basket[1]!.title).toBe("Milo’s Small adventures");
  });

  it("adds an approved book as one line, then raises its quantity on repeat", () => {
    const once = addEntry([], option);
    expect(once).toHaveLength(1);
    expect(once[0]!.quantity).toBe(1);

    const twice = addEntry(once, option);
    expect(twice).toHaveLength(1);
    expect(twice[0]!.quantity).toBe(2);
  });

  it("caps quantity at 5 per line, matching the checkout bound", () => {
    let entries: CartEntry[] = [];
    for (let n = 0; n < 7; n += 1) entries = addEntry(entries, option);
    expect(entries[0]!.quantity).toBe(5);
  });

  it("clamps manual quantity within 1..5", () => {
    expect(setQuantity([entry()], "approved_sandbox_1", 0)[0]!.quantity).toBe(1);
    expect(setQuantity([entry()], "approved_sandbox_1", 12)[0]!.quantity).toBe(5);
  });

  it("computes line and basket totals from worked literals", () => {
    expect(lineTotal(entry({ quantity: 2 }))).toBe(58.4);
    const entries = [
      entry({ quantity: 2 }),
      entry({ key: "approved_sandbox_2", quantity: 1, unitPrice: 12.5 }),
    ];
    const sums = totals(entries, shipping);
    expect(sums.subtotal).toBe(70.9);
    expect(sums.total).toBe(70.9);
    expect(itemCount(entries)).toBe(3);
  });

  it("keeps gift details out of the commerce metadata surface", () => {
    const gifted = setGift([entry()], "approved_sandbox_1", "Grandma", "For the little lost-moon watcher");
    expect(gifted[0]!.giftTo).toBe("Grandma");
    expect(Object.keys(gifted[0]!.reference).sort()).toEqual(
      ["approvedBookRevisionId", "contentHash", "printSpecId", "productFormatId"].sort(),
    );
  });

  it("removes a line entirely", () => {
    const entries = [entry(), entry({ key: "approved_sandbox_2" })];
    expect(removeEntry(entries, "approved_sandbox_2")).toHaveLength(1);
    expect(itemCount(removeEntry(removeEntry(entries, "approved_sandbox_1"), "approved_sandbox_2"))).toBe(0);
  });
});

describe("delivery + gift envelope validation", () => {
  it("accepts a complete UK delivery address", () => {
    expect(shippingAddressErrors(VALID_ADDRESS)).toEqual({});
  });

  it("flags required delivery fields, with a formatted postcode message for bad codes", () => {
    const errors = shippingAddressErrors({ ...VALID_ADDRESS, firstName: "", postalCode: "NOPE" });
    expect(errors.firstName).toBe("Required");
    expect(errors.postalCode).toMatch(/valid UK postcode/);
    const empty = shippingAddressErrors({ ...VALID_ADDRESS, city: "" });
    expect(empty.city).toBe("Required");
  });

  it("allows a space-free postcode and an optional-second-line address", () => {
    expect(shippingAddressErrors({ ...VALID_ADDRESS, postalCode: "EC1A1BB", address2: "Flat 3" })).toEqual({});
  });

  it("rejects a non-UK country in the envelope", () => {
    expect(shippingAddressErrors({ ...VALID_ADDRESS, countryCode: "us" })).toMatchObject({ countryCodeUnknown: expect.stringMatching(/UK/) });
  });

  it("requires a recipient once a gift message is present, and bounds both fields", () => {
    expect(giftError({ giftTo: null, giftMessage: "hello" })).toMatch(/who the gift is for/);
    expect(giftError({ giftTo: "N".repeat(41), giftMessage: "" })).toMatch(/40 characters/);
    expect(giftError({ giftTo: "Niece", giftMessage: "x".repeat(201) })).toMatch(/200 characters/);
    expect(giftError({ giftTo: "Niece", giftMessage: "A little story" })).toBeNull();
  });

  it("builds the checkout gift list by line position, skipping ungifted lines", () => {
    const entries = [
      entry({ giftTo: "Grandma", giftMessage: "For the moon watcher" }),
      entry({ key: "approved_sandbox_2" }),
    ];
    expect(checkoutGifts(entries)).toEqual([
      { lineIndex: 0, recipientLabel: "Grandma", message: "For the moon watcher" },
    ]);
    expect(checkoutGifts([entry()])).toEqual([]);
  });
});

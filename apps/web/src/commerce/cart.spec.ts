import { describe, expect, it } from "vitest";
import { addEntry, itemCount, lineTotal, removeEntry, setGift, setQuantity, totals, type CartEntry } from "./cart";
import { demoPurchaseOption } from "./approval";

const option = demoPurchaseOption();
const shipping = 0;

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
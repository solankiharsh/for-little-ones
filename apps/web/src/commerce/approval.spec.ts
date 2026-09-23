import { describe, expect, it } from "vitest";
import { assertOpaqueLineReference, demoPurchaseOption, isOpaqueLineReference } from "./approval";

describe("storefront approved-line reference (opaque metadata contract)", () => {
  it("exposes a sandbox purchase option whose reference is exactly the four opaque fields", () => {
    const option = demoPurchaseOption();
    expect(Object.keys(option.reference).sort()).toEqual(
      ["approvedBookRevisionId", "contentHash", "printSpecId", "productFormatId"].sort(),
    );
    expect(isOpaqueLineReference(option.reference)).toBe(true);
    expect(() => assertOpaqueLineReference(option.reference)).not.toThrow();
  });

  it("rejects any personalised data attempting to ride a cart line", () => {
    const reference = { ...demoPurchaseOption().reference };
    expect(() => assertOpaqueLineReference({ ...reference, childName: "Mira" })).toThrow();
    expect(() => assertOpaqueLineReference({ ...reference, storyDraft: "the moon stays in my pocket" })).toThrow();
    expect(() => assertOpaqueLineReference({ ...reference, contentHash: "" })).toThrow();
    expect(() => assertOpaqueLineReference(null)).toThrow();
  });

  it("does not leak child data into the demo catalogue copy itself", () => {
    const option = demoPurchaseOption();
    expect(option.title).toContain("Fox");
    expect(JSON.stringify(option.reference)).not.toContain("Mira");
    expect(JSON.stringify(option.reference)).not.toContain("child");
    expect(JSON.stringify(option.reference)).not.toContain("address");
  });
});
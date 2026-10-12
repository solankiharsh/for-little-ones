import { describe, expect, it } from "vitest";
import { readCheckoutKey, writeCheckoutKey } from "./checkout-recovery";

describe("checkout recovery across refresh", () => {
  it("restores the same pending checkout identity and clears it only after success", () => {
    let stored: string | null = null;
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => { stored = null; } };
    writeCheckoutKey(storage, "checkout-recovery-key-123");
    expect(readCheckoutKey(storage)).toBe("checkout-recovery-key-123");
    writeCheckoutKey(storage, null);
    expect(readCheckoutKey(storage)).toBeNull();
  });
});

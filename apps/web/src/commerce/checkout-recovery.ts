const CHECKOUT_KEY = "flo:cart:pending-checkout";
export function readCheckoutKey(storage: Pick<Storage, "getItem">): string | null {
  try { const value = storage.getItem(CHECKOUT_KEY); return value && value.length >= 16 && value.length <= 100 ? value : null; }
  catch { return null; }
}
export function writeCheckoutKey(storage: Pick<Storage, "setItem" | "removeItem">, value: string | null): void {
  try { if (value) storage.setItem(CHECKOUT_KEY, value); else storage.removeItem(CHECKOUT_KEY); }
  catch { /* The in-memory key still protects this browser session. */ }
}

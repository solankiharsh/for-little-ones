import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StorefrontCommerceClient } from "./client";
import { demoPurchaseOption, SANDBOX_EMAIL, SANDBOX_REGION_NAME, type PurchaseOption } from "./approval";
import {
  addEntry, checkoutGifts, itemCount, removeEntry, setGift, setQuantity,
  shippingAddressError, totals, type CartEntry, type ShippingAddress,
} from "./cart";

const MEDUSA_URL = import.meta.env.VITE_MEDUSA_URL ?? "http://localhost:9000";
const PUBLISHABLE_KEY = import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY as string | undefined;
const LINES_KEY = "flo:cart:lines";

export interface CheckoutStatus {
  state: "idle" | "working" | "done" | "error";
  orderId?: string;
  total?: number;
  currencyCode?: string;
  deduped?: boolean;
  message?: string;
}

interface CartContextValue {
  entries: CartEntry[];
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (option: PurchaseOption) => void;
  changeQuantity: (key: string, quantity: number) => void;
  changeGift: (key: string, giftTo: string | null, message: string) => void;
  remove: (key: string) => void;
  addSample: () => void;
  cartCount: number;
  cartTotals: ReturnType<typeof totals>;
  shippingAddress: ShippingAddress;
  setShippingAddress: (address: ShippingAddress) => void;
  checkout: (shippingAddress: ShippingAddress) => Promise<void>;
  status: CheckoutStatus;
  dismissStatus: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_SHIPPING_ADDRESS: ShippingAddress = {
  firstName: "",
  lastName: "",
  address1: "",
  city: "",
  postalCode: "",
  countryCode: "gb",
};

function readLines(): CartEntry[] {
  try {
    const raw = window.sessionStorage.getItem(LINES_KEY);
    return raw ? (JSON.parse(raw) as CartEntry[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>(readLines);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CheckoutStatus>({ state: "idle" });
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>(EMPTY_SHIPPING_ADDRESS);
  const clientRef = useRef<StorefrontCommerceClient | null>(null);
  const entriesRef = useRef(entries);
  /**
   * Business-effect idempotency key for the current charge attempt. Minted once and
   * reused across retries so a re-entrant or double-tapped Pay can never create a
   * second order; cleared only once an order is confirmed (a deliberate re-buy of
   * the same basket afterwards gets a fresh key).
   */
  const checkoutKeyRef = useRef<string | null>(null);

  useEffect(() => {
    entriesRef.current = entries;
    try {
      window.sessionStorage.setItem(LINES_KEY, JSON.stringify(entries));
    } catch {
      // sessionStorage is best-effort; the cart still works for the session.
    }
  }, [entries]);

  const client = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new StorefrontCommerceClient({
        medusaUrl: MEDUSA_URL,
        publishableKey: PUBLISHABLE_KEY ?? "",
        email: SANDBOX_EMAIL,
      });
    }
    return clientRef.current;
  }, []);

  const checkout = useCallback(async (address: ShippingAddress) => {
    if (!PUBLISHABLE_KEY) {
      setStatus({ state: "error", message: "Missing VITE_MEDUSA_PUBLISHABLE_KEY — run the commerce sandbox-config script and add it to apps/web/.env.local." });
      return;
    }
    // Fail closed before any network work: delivery must be complete and every
    // gift must have its recipient within bounds. Cart lines stay untouched.
    const deliveryError = shippingAddressError(address);
    if (deliveryError) {
      setStatus({ state: "error", message: `Check your delivery details: ${deliveryError}` });
      return;
    }
    setStatus({ state: "working" });
    try {
      const current = entriesRef.current;
      if (current.length === 0) throw new Error("Your basket is empty");
      const storefront = client();
      const regions = await storefront.fetchRegions();
      const region = regions.find((region) => region.name === SANDBOX_REGION_NAME) ?? regions[0];
      if (!region) throw new Error("No sandbox region configured on the storefront");
      if (!checkoutKeyRef.current) checkoutKeyRef.current = crypto.randomUUID();
      const checkoutKey = checkoutKeyRef.current;
      const cartId = await storefront.createCart({ regionId: region.id, currencyCode: "gbp" });
      for (const entry of current) {
        await storefront.addApprovedItem({
          cartId,
          sku: entry.reference.productFormatId,
          quantity: entry.quantity,
          reference: entry.reference,
        });
      }
      const result = await storefront.beginCheckout({
        cartId,
        idempotencyKey: checkoutKey,
        shippingAddress: address,
        gifts: checkoutGifts(current),
      });
      checkoutKeyRef.current = null;
      setStatus({
        state: "done",
        orderId: result.orderId,
        total: result.total,
        currencyCode: result.currencyCode,
        deduped: result.deduped,
      });
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : "We had trouble placing your order — your books are safe." });
    }
  }, [client]);

  const value = useMemo<CartContextValue>(() => ({
    entries,
    open,
    setOpen,
    add: (option) => setEntries((current) => addEntry(current, option)),
    changeQuantity: (key, quantity) => setEntries((current) => setQuantity(current, key, quantity)),
    changeGift: (key, giftTo, message) => setEntries((current) => setGift(current, key, giftTo, message)),
    remove: (key) => setEntries((current) => removeEntry(current, key)),
    addSample: () => setEntries((current) => addEntry(current, demoPurchaseOption())),
    cartCount: itemCount(entries),
    cartTotals: totals(entries, 0),
    shippingAddress,
    setShippingAddress,
    checkout,
    status,
    dismissStatus: () => setStatus({ state: "idle" }),
  }), [entries, open, shippingAddress, checkout, status]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}
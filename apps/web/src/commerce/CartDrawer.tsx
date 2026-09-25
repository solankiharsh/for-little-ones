import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCart, type CheckoutStatus } from "./CartContext";
import {
  formatMoney, giftError, lineTotal, MAX_GIFT_MESSAGE_LENGTH, MAX_QUANTITY, MAX_RECIPIENT_LENGTH,
  shippingAddressErrors, type CartEntry, type ShippingAddressField,
} from "./cart";

function LineRow({ entry }: { entry: CartEntry }) {
  const { changeQuantity, changeGift, remove } = useCart();
  const [giftOpen, setGiftOpen] = useState(entry.giftTo !== null);
  const [giftTo, setGiftTo] = useState(entry.giftTo ?? "");
  const [giftMessage, setGiftMessage] = useState(entry.giftMessage);
  const [giftFailure, setGiftError] = useState<string | null>(null);

  function commitGift() {
    const failure = giftError({ giftTo: giftTo.trim() ? giftTo.trim() : null, giftMessage: giftMessage.trim() });
    if (failure) {
      setGiftError(failure);
      return;
    }
    changeGift(entry.key, giftTo.trim() ? giftTo.trim() : null, giftMessage.trim());
    setGiftError(null);
    setGiftOpen(false);
  }

  return (
    <li className="flo-cart-line">
      <div className="flo-cart-line-head">
        <span className="flo-cart-cover" aria-hidden="true">{entry.title.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}</span>
        <div className="flo-cart-line-copy">
          <p className="flo-cart-title">{entry.title}</p>
          <p className="flo-cart-meta">{entry.formatLabel}</p>
          <p className="flo-cart-eta">{entry.arrivalEstimate}</p>
        </div>
        <button type="button" className="flo-cart-remove" aria-label={`Remove ${entry.title}`} onClick={() => remove(entry.key)}>
          ✕
        </button>
      </div>
      <div className="flo-cart-line-controls">
        <div className="flo-cart-qty" aria-label={`Quantity for ${entry.title}`}>
          <button type="button" aria-label="Fewer" disabled={entry.quantity <= 1} onClick={() => changeQuantity(entry.key, entry.quantity - 1)}>−</button>
          <span>{entry.quantity}</span>
          <button type="button" aria-label="More" disabled={entry.quantity >= MAX_QUANTITY} onClick={() => changeQuantity(entry.key, entry.quantity + 1)}>+</button>
        </div>
        <span className="flo-cart-line-total">{formatMoney(lineTotal(entry))}</span>
      </div>
      <div className="flo-cart-gift">
        {giftOpen ? (
          <div className="flo-cart-gift-form" role="group" aria-label="Gift details">
            <input
              className="flo-cart-input"
              type="text"
              value={giftTo}
              maxLength={MAX_RECIPIENT_LENGTH}
              placeholder="To — a name on the label"
              aria-label="Gift recipient"
              onChange={(event) => setGiftTo(event.currentTarget.value)}
            />
            <textarea
              className="flo-cart-input"
              value={giftMessage}
              rows={2}
              maxLength={MAX_GIFT_MESSAGE_LENGTH}
              placeholder="A message (up to 200 characters)"
              aria-label="Gift message"
              onChange={(event) => setGiftMessage(event.currentTarget.value)}
            />
            {giftFailure ? <p className="flo-cart-form-error" role="alert">{giftFailure}</p> : null}
            <div className="flo-cart-gift-actions">
              <button type="button" className="flo-btn flo-btn-small" onClick={commitGift}>Keep gift details</button>
              <button type="button" className="flo-btn flo-btn-small flo-btn-ghost" onClick={() => setGiftOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="flo-cart-gift-toggle" onClick={() => setGiftOpen(true)}>
            {entry.giftTo ? `This is a gift for ${entry.giftTo}` : "This is a gift"}
          </button>
        )}
      </div>
    </li>
  );
}

function StatusPane({ status }: { status: CheckoutStatus }) {
  const { dismissStatus } = useCart();
  if (status.state === "idle") return null;
  if (status.state === "working") return <p className="flo-cart-status" role="status">Placing your order…</p>;
  if (status.state === "done" && status.orderId) {
    return (
      <p className="flo-cart-status flo-cart-status-done" role="status">
        {status.deduped ? "Same order returned — no duplicate charge. " : "Test order placed — nothing will be printed or charged. "}
        Order <code>{status.orderId}</code>
        {typeof status.total === "number" ? <> · {formatMoney(status.total)} {status.currencyCode?.toUpperCase()}</> : null}
        <button type="button" className="flo-cart-status-close" aria-label="Dismiss order confirmation" onClick={dismissStatus}>✕</button>
      </p>
    );
  }
  return (
    <p className="flo-cart-status flo-cart-status-error" role="alert">
      {status.message ?? "We had trouble placing your order — your books are safe."}
      <button type="button" className="flo-cart-status-close" aria-label="Dismiss error" onClick={dismissStatus}>✕</button>
    </p>
  );
}

const SHIPPING_FIELDS: { key: ShippingAddressField | "address2"; label: string; autoComplete: string; placeholder?: string }[] = [
  { key: "firstName", label: "First name", autoComplete: "given-name" },
  { key: "lastName", label: "Last name", autoComplete: "family-name" },
  { key: "address1", label: "Street address", autoComplete: "address-line1", placeholder: "House number and street" },
  { key: "address2", label: "Apartment, suite (optional)", autoComplete: "address-line2" },
  { key: "city", label: "Town or city", autoComplete: "address-level2" },
  { key: "postalCode", label: "Postcode", autoComplete: "postal-code", placeholder: "e.g. SW1A 1AA" },
];

function ShippingForm({ attempted }: { attempted: boolean }) {
  const { shippingAddress, setShippingAddress } = useCart();
  const errors = shippingAddressErrors(shippingAddress);

  function fieldValue(key: ShippingAddressField | "address2"): string {
    return key === "address2" ? (shippingAddress.address2 ?? "") : shippingAddress[key];
  }

  function setField(key: ShippingAddressField | "address2", value: string) {
    setShippingAddress({ ...shippingAddress, [key]: value });
  }

  return (
    <section className="flo-cart-delivery" aria-label="Delivery address">
      <div className="flo-cart-section-head">
        <span className="flo-cart-section-number" aria-hidden="true">1</span>
        <div>
          <h3>Delivery address</h3>
          <p className="flo-cart-help">Where should we send your finished book?</p>
        </div>
      </div>
      <div className="flo-cart-country" aria-label="Delivery country: United Kingdom">
        <span>Delivery country</span>
        <strong>United Kingdom</strong>
      </div>
      <div className="flo-cart-delivery-grid">
        {SHIPPING_FIELDS.map((field) => {
          const error = field.key === "address2" ? undefined : errors[field.key];
          const show = error !== undefined && (attempted || (fieldValue(field.key).trim() !== "" && error !== "Required"));
          return (
            <div key={field.key} className={`flo-cart-field ${field.key.startsWith("address") ? "flo-cart-field-wide" : ""}`}>
              <label htmlFor={`shipping-${field.key}`}>{field.label}</label>
              <input
                className="flo-cart-input"
                id={`shipping-${field.key}`}
                aria-describedby={show ? `shipping-${field.key}-error` : undefined}
                type="text"
                value={fieldValue(field.key)}
                autoComplete={field.autoComplete}
                aria-label={field.label}
                aria-invalid={show}
                placeholder={field.placeholder ?? ""}
                onChange={(event) => setField(field.key, event.currentTarget.value)}
              />
              {show ? <p id={`shipping-${field.key}-error`} className="flo-cart-form-error" role="alert">{error}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CartDrawer() {
  const { open, setOpen, status, entries, addSample, cartCount, cartTotals, shippingAddress, checkout } = useCart();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [addressAttempted, setAddressAttempted] = useState(false);

  useEffect(() => {
    if (!open) { setAddressAttempted(false); return; }
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.body.style.overflow = overflow; trigger?.focus(); };
  }, [open]);

  function onPay() {
    if (Object.values(shippingAddressErrors(shippingAddress)).some(Boolean)) {
      setAddressAttempted(true);
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    void checkout(shippingAddress);
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "Tab") return;
    const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? [])];
    if (controls.length === 0) return;
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="flo-cart-layer" onKeyDown={trapFocus}>
          <motion.div
            className="flo-cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <motion.aside
            className="flo-cart-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Your books"
            ref={panelRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flo-cart-panel-inner">
              <header className="flo-cart-head">
                <p className="flo-kicker">Your books</p>
                <h2 className="flo-cart-title-head">
                  {cartCount} {cartCount === 1 ? "book" : "books"} waiting
                </h2>
                <button type="button" className="flo-cart-close" aria-label="Close cart" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </header>

              <div className="flo-cart-scroll">
              <StatusPane status={status} />

              {entries.length === 0 ? (
                <div className="flo-cart-empty">
                  <p>Books you approve live here, ready to be made.</p>
                  <button type="button" className="flo-btn flo-btn-primary" onClick={() => addSample()}>
                    Add the sample book
                  </button>
                </div>
              ) : (
                <>
                  <ul className="flo-cart-lines">
                    {entries.map((entry) => <LineRow key={entry.key} entry={entry} />)}
                  </ul>
                  <ShippingForm attempted={addressAttempted} />
                  <footer className="flo-cart-foot">
                    <dl className="flo-cart-totals">
                      <div><dt>Books</dt><dd>{formatMoney(cartTotals.subtotal)}</dd></div>
                      <div><dt>Delivery</dt><dd>{cartTotals.shipping === 0 ? "Free" : formatMoney(cartTotals.shipping)}</dd></div>
                      <div className="flo-cart-total"><dt>Total</dt><dd>{formatMoney(cartTotals.total)}</dd></div>
                    </dl>
                    <button
                      type="button"
                      className="flo-btn flo-btn-primary flo-btn-lg flo-cart-pay"
                      disabled={status.state === "working"}
                      onClick={onPay}
                    >
                      {status.state === "working" ? "Placing your order…" : <>Pay {formatMoney(cartTotals.total)} — no real charge</>}
                    </button>
                    <p className="flo-cart-note">Test checkout · No payment is taken and no book is printed.</p>
                  </footer>
                </>
              )}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

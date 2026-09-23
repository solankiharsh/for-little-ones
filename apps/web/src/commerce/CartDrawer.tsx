import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCart, type CheckoutStatus } from "./CartContext";
import { formatMoney, lineTotal, MAX_QUANTITY, type CartEntry } from "./cart";

function LineRow({ entry }: { entry: CartEntry }) {
  const { changeQuantity, changeGift, remove } = useCart();
  const [giftOpen, setGiftOpen] = useState(entry.giftTo !== null);
  const [giftTo, setGiftTo] = useState(entry.giftTo ?? "");
  const [giftMessage, setGiftMessage] = useState(entry.giftMessage);

  function commitGift() {
    changeGift(entry.key, giftTo.trim() ? giftTo.trim() : null, giftMessage.trim());
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
              placeholder="To — a name on the label"
              aria-label="Gift recipient"
              onChange={(event) => setGiftTo(event.currentTarget.value)}
            />
            <textarea
              className="flo-cart-input"
              value={giftMessage}
              rows={2}
              maxLength={200}
              placeholder="A message (up to 200 characters)"
              aria-label="Gift message"
              onChange={(event) => setGiftMessage(event.currentTarget.value)}
            />
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
        {status.deduped ? "Same order returned — no duplicate charge. " : "Order placed — we’ve started making it. "}
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

export default function CartDrawer() {
  const { open, setOpen, status, entries, addSample, cartCount, cartTotals, checkout } = useCart();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("button, [href], input, textarea")?.focus();
  }, [open]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "Tab") return;
    const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>("button, [href], input, textarea, select") ?? [])];
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
                      onClick={() => void checkout()}
                    >
                      {status.state === "working" ? "Placing your order…" : <>Pay {formatMoney(cartTotals.total)} — no real charge</>}
                    </button>
                    <p className="flo-cart-note">Sandbox checkout against the local Medusa store. Nothing is printed or charged.</p>
                  </footer>
                </>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
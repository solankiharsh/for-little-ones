# 18_CART_AND_CHECKOUT.md — Cart & Checkout

> **Spec ID:** F-018 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-016 Approval, F-017 Print Rendering, F-015 Book QA; feeds F-019 Fulfilment, F-020 Tracking, F-026 Admin
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Cart and checkout for personalised print + digital books, delivered on **Medusa — the adopted commerce foundation (D006, self-hosted at `apps/commerce`)** behind our `CommerceModule`/`CommerceGateway` seam. A customer can buy several books — for several children, in paperback or hardcover, print-only or print+digital, some as gifts — in one checkout with country-aware currency, saved addresses, wallet/card payment and an estimated arrival shown before payment. Payments are captured with **business-effect idempotency**; an order is created only on successful payment; and every line item references an immutable approved Book revision (D011), so the book previewed and approved is exactly what ships and nothing is silently regenerated after purchase. The book itself never leaves `APPROVED` — commerce state lives on the order (guide §4, state split).

## 1. Goal

spec §16 is explicit: commerce must be easier than competitors'. Diffrun still forces one order per book; we allow several personalised books in a single cart and a checkout a gift buyer completes one-handed on a phone (D012). Required capability list (spec §16): multiple books in one cart; multiple children; saved addresses; Apple Pay, Google Pay and cards; country-aware currency; estimated arrival **before payment**; gift-recipient shipping; gift message; digital+print bundle; paperback/hardcover; quantity and sibling discounts; reorders; express delivery where printers support it. The goal is a checkout that is correct (only approved revisions, only reserved prices), safe (one charge, exactly once) and trust-building (delivered product known before the card is taken).

## 2. User value

Buying a personalised gift is emotional and high-value; a brittle checkout destroys confidence exactly at the pay point. One cart for multiple grandchildren removes the industry's most cited friction (spec §16, Diffrun). ETA before payment removes delivery anxiety — the category's largest complaint cluster (spec §24). Sibling/quantity discounts are felt at the moment of decision. Because the approved revision is locked (D011) buyers get exactly the preview they approved, and a failed payment never forces regeneration or re-creation of a book.

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

There is no existing checkout to migrate: **Medusa is ADOPTED (D006, re-opened and adopted 2026-09-22 on a constraint change — self-hosted at `apps/commerce`, v2.21.0/MIT verified; edition question closed in D014 item 3)**, a build decision not a migration (D013). Re-verification found no licensing/architectural blocker (`RESEARCH_LOG.md` "D006 re-opening"; `spike/commerce/MEDUSA_EVIDENCE.md` re-verification appendix). Spike C's invariant tests (opaque line-item ref, approved-only checkout, idempotent duplicate webhooks) remain the semantic minimum this feature must satisfy — ported to `packages/commerce` in the foundation PR.

**Adoption framing (guide §6, D006 ADOPTED).** What the Medusa-based `CommerceModule` provides: commerce primitives — regions/currencies, price lists, promotions, cart, customers & addresses, taxes, payment providers (cards + Apple/Google Pay via the first-party Stripe provider), order/draft-order lifecycle, shipping options and the fulfilment step. What it does **not** provide, and therefore stays OURS: the canonical Book model and revisions (D004), child profiles/Character Bible, approval & production lock (F-016), QA (F-015), deterministic print rendering (F-017), the `PrintProvider` adapter (F-019), the subscriber-side idempotent print handoff (`CommerceEventAdapter`), and any generation logic (F-008/09). A commerce product code (`book-{format}-{binding}-{digital}`) is all the commerce layer ever sees — never a book, a child or a story.

## 4. Problems with current implementation

Not applicable (greenfield) — state the risks the design itself must avoid:

1. **Coupling the canonical Book model to Medusa.** The Book model stays OURS (D004); a Book must never be represented *as* a Medusa Product. Commerce references a book only by id pointer.
2. **Live-book references.** A cart or line item that points at the live Book invites silent regeneration after purchase — a D011 / spec §18 violation. Only Approved revisions may enter commerce.
3. **Non-idempotent payment capture.** Double-tap or provider retry must produce exactly one charge and one order.
4. **Order created before payment.** Unpaid draft "orders" leaking into production/fulfilment activity.
5. **Price drift.** The price displayed at approval must equal the price charged; promotion state may not silently change the charged total (spec §25 checkout quality bar: nothing goes to print before the buyer understands exactly what is ordered).
6. **Privacy leakage to providers.** Children's photos/names must not ride cart, payment or shipping payloads (guide §7).

## 5. Desired UX

Walkthrough — Ava, age 5 (from F-001). Her parent approved Ava's hardcover book (F-016), then wants a second book for Leo (paperback) and a gift copy of Ava's hardcover for Grandma at a different address.

1. **From "Approve & Print"** the format picker (paperback / hardcover / hardcover+digital) is inline on the numbering card; selecting a format shows its price and ETA and "Add to cart" (F-016 → F-018 boundary).
2. **Cart** (mobile slide-up): all three items with approved-cover thumbs, format switcher per item, quantity steppers, gift flag per line, per-item ETA ("Arrives 12–15 Oct"), sticky total + "Checkout".
3. **Checkout gate**: only now is an email asked (spec §20: ask when needed to save/resume/order). Anonymous users get the claim-project flow (F-001) — approvals are not lost.
4. **Shipping**: saved addresses for account users, one-use address otherwise; gift line toggles to Grandma's name/address + "from" line + gift message.
5. **Payment**: Apple Pay / Google Pay as primary affordance, cards behind it; country of ship-to resolves region, currency and tax; totals broken down (subtotal, sibling discount −10%, tax, shipping).
6. **Pay** → native wallet sheet or card form → success screen ("We've started making Ava's book ≈ 12–15 Oct") with a Track CTA (F-020); digital copy, if purchased, appears in the library (F-021); receipt email sent.

Gift walkthrough (the other dominant journey — a grandparent, on their own account or anonymous, F-001): the buyer still lands on story→concept→approval, but at cart they toggle "This is a gift" → recipient name + ship-to + "to … from …" message shown and saved per line. The gift line carries its own ETA and its own tracking timeline (F-020); the buyer's confirmation lists per-recipient items ("Leo's book → delivered to Leo). The child whose likeness is in the book is never printed on the shipping label or the gift _to_ field (the recipient name is, when different); address and gift data are household/PII as in §12.

Failure states: card declined → friendly inline retry, cart fully intact, nothing regenerated; user abandons between payment intent and confirm → reserved-but-unpaid, an email nudge offers resumption (cart ttl, §9); capture times out after the payment was taken → reconciliation job (PaymentCaptureJob) finds the intent and completes the order rather than double-charging; the approved revision is never touched in any path.

## 6. UI specification

- **Cart list**: cover thumbnail only — a low-res render of the approved cover, never the child's source photos (guide §7); display name + book title; format chips; qty stepper with the discount hint nearby ("2 books for this child −10%"); gift toggle + message field (≤200 chars); per-item ETA line; remove.
- **Sticky bottom bar**: subtotal, discount, tax, shipping, total, single "Pay …" CTA once a method is selected.
- **Express pay**: Apple/Google buttons first, rendered by the wallet; cards collected only inside the payment provider's iframe; never our own field markup for PAN/CVV.
- **Validation gates before wallet opens**: complete address, valid postal code formatting per country, shipping-method chosen, ETA visible on every physical line.
- **Success** has no dead-end: per-item "In production" status chips, refreshed ETA, Track CTA. Errors are friendly and recoverable ("We had trouble charging your card. Your cart and books are safe."), product-facing language only (D002) — no "gateway error", no provider terms. Mobile-first per design system; the whole flow works one-handed (D012).

## 7. Domain model

```text
Order → OrderItem → ApprovedBookRevision → PrintArtifact        (guide §3)
Order { id, customerId, regionId, currency, totals, tax, status, paymentId, created }   [CommerceModule]
OrderItem {
  id, orderId, productCode,                // format×binding×bundle SKU, not a book
  approvedBookRevisionId, contentHash,     // D011: the ordered thing is the revision
  printFormat (paperback|hardcover), digitalIncluded, quantity,
  unitPriceSnapshot, currency, discountAmount,
  giftTo { name, addressId }, giftMessage, shipToAddressId, deliveryMethodId,
  arrivalEstimateEarliest, arrivalEstimateLatest
}                                        // draft created by F-016/17 approvals
ApprovedBookRevision { revisionId, bookId, immutableSnapshot, contentHash }   (F-016)
PrintArtifact { artifactId, revisionId, format, files, printQuote, printSpec } (F-017)
```

Book metadata, children, characters and story stay in ours (`BookService` / `BookRepository`). Medusa owns the commerce graph (customer, addresses, regions/currencies, price lists, promotions, cart, draft order, payment sessions, tax, shipping). **Personalised configuration is never embedded in the catalogue**: a product code is just `book-{format}-{binding}-{digital}`; the personalisation is pointers on the line item. **Resolved (D006/D007-era decision needed, now closed):** the pointer rides Medusa line-item `metadata` (`approvedBookRevisionId`, `contentHash`, `productFormatId`, `printSpecId`, `displayTitle`, `quantity` + non-sensitive ops metadata like `recipientLabel`) — the documented Medusa personalisation recipe — plus our ops projection for lineage (F-026), so totals lifecycle stays with Medusa and lineage stays queryable. Medusa never receives child/story/page data (hard boundary, guide §6).

## 8. Backend/API requirements

The adopted `CommerceModule` (Medusa, D006 — self-hosted `apps/commerce`) supplies: regions & currencies; price lists for delivery of catalogue prices; promotions for discounts; customers & addresses; shipping options incl. delivery-time estimates fed from PrintProvider quotation windows (F-017/F-019); payment providers (cards, Apple/Google Pay — first-party Stripe provider); draft orders; tax calc (Region + Tax modules, launch market configured only — no custom tax engine).

Our command boundary (proposed, not existing): `AddToCart(revisionId, format, bundle, qty)` — validates the revision exists and is `APPROVED` (F-016) before any price is shown; `EstimateArrival(itemIds, shipToCountry)` — returns provider-sourced windows; `BeginCheckout(cartId, customerSession, shipping)`; `ConfirmPayment(orderId, paymentId, idempotencyKey)` — on payment success Medusa creates the order, `CommerceEventAdapter` records the opaque order link on the approval (`orderLinks[]`; **the book stays `APPROVED`** — guide §4 state split) and emits `ORDER_CREATED` (guide §5 event list). **Idempotency (business-effect level, never exactly-once):** every confirm carries a client idempotency key; the server dedupes by key + payment intent; capture happens at most once per attempt and the idempotent consumer replays the stored result on duplicate webhooks/retries; a provider-crash uncertain-outcome case goes to reconciliation rather than double-capture or blind replay. Order is created **after** successful payment. Reorders reuse the approved revision and ship-to history (F-022 path). Per-market payment/tax routing is configured via Medusa regions (D006/D014 item 3 — closed: self-hosted, launch market only; additional markets are region configuration, not architecture changes).

## 9. Background jobs

- `PaymentCaptureJob` — triggered by wallet/webhook/confirm (Medusa payment webhook route + our subscriber-side handler); re-validates totals before capture (price parity with snapshot, discount validity); idempotent via payment intent + idempotency key; success → `ORDER_CREATED`; failure → payment-failure state on the Medusa payment/order, surfaced to cart (friendly) and ops (F-026) — **never as `BookStatus`** (the approved book is untouched). A dedicated **capture-reconciliation pass** matches provider-side successful intents against confirmed orders on a schedule so a timeout between provider success and our confirm cannot strand a paid-for book as unpaid (or vice-versa) — the reconciliation, not a manual email, is the recovery path for spec §16 order-integrity errors.
- `CartExpiryJob` — expires abandoned carts; approved books remain untouched in "Our Stories" (F-021); cart data removed per retention (§12, F-025).
- `ArrivalEstimateJob` — periodic refresh of ETA windows from PrintProvider scheduling (F-019) so the pre-payment estimate and post-payment review agree (spec §16 "estimated arrival before payment").
- `DiscountValidationJob` — recomputes sibling/quantity discounts at capture; an invalid stacking blocks checkout notice, never silently changes the total after payment (spec §25).

## 10. AI behaviour

No AI here. The only AI-adjacent rule: `BOOK_APPROVED` (F-016) freezes the revision; after that, any "Try another" belongs to a *new* revision on a duplicate book (F-022), never a mutation of the shipped one (D011). If illustration text/QA (F-015) is incomplete at cart time, the item cannot be priced — a failed QA gate blocks purchase, not "ship anyway".

## 11. QA

Pre-capture gates: revision exists and `APPROVED`; ordered artifact `contentHash` equals the approved revision hash; format SKU available with matching PrintSpec (F-017); price snapshot equals catalogue and displays agree (approval card → cart → order); totals non-negative; region/currency consistent with ship-to; ETA inside provider-supported window; gift message length; discount stacking not double-applied; digital entitlement recorded when bundled. These enforce spec §25 "Nothing should go to print before the user understands exactly what is being ordered."

## 12. Privacy/security

spec §18 makes privacy UX part of the purchase experience, not just legal pages: state what photos are used for, that they are not sold, and the **training/data-use position — made visible only once the F-025 provider data-use audit verifies it (F-025 §10 verification chain; copy subject to provider/legal review), never as an absolute guarantee in advance** — plus the retention/deletion schedule and the delete-now control (F-025; retention windows PROPOSED pending legal sign-off). Cart/order payloads carry **no** child photos; thumbnails are low-res renders of the approved cover. Payment data is held entirely by Medusa's payment providers (first-party Stripe provider; D006) — PAN/CVV never reach our service (tokenized). Gift data is minimal (name, address, message) and never linked to child data beyond the revision pointer. Addresses are household data with F-025 deletion. No child names in payment/fulfilment/log payloads (guide §7).

## 13. Analytics

Only genuinely useful events (guide §13): `checkout_started`, `checkout_completed`. No child PII, no photos, no card data, no full addresses. Funnel: cart_add → checkout_started → checkout_completed; per-step abandonment and ETA-accuracy sampling feed F-027 cost/margin reporting.

## 14. Acceptance criteria

1. Given a customer adds two approved books (different formats, one gift to a different address) → one checkout, one gift line with message, a single payment and ONE order whose line items each carry `approvedBookRevisionId` + `contentHash`.
2. Given the user double-taps Pay / the provider retries → exactly one charge and one `ORDER_CREATED` (idempotency-key dedupe).
3. Given a card declines → payment failure on the Medusa order/payment shows a friendly retry, the cart and approvals are fully restored, the book remains `APPROVED`, and no partial order or regeneration occurs.
4. Given the approved revision is later edited (a new revision elsewhere) → the ordered item still references the original immutable revision and produces a matching print artifact (D011).
5. Given ship-to in a different country → region, currency and tax recalc before payment; ETA shown before payment; charged total equals displayed total exactly.
6. Given an abandoned cart expires → cart data is purged, approved books remain intact in the library, and no charge ever occurs.

## 15. Dependencies

Requires F-016 (approval/revision freeze), F-017 (print artifact + quote/scheduling windows for ETA), F-015 (QA gates), F-001 (account/claim at checkout). Parallel Track D with F-019/F-020/F-026 per the feature map; reorder (F-022) later reuses this spec's reorder path.

## 16. Priority

**P0 — category parity** (spec §26: checkout, shipping are launch parity). Product filter (spec §27): makes purchase safer and more confident (locked revision + ETA), easier (multi-book one-cart), and structurally reduces support cases (correct orders, clean recovery). Ship with launch.
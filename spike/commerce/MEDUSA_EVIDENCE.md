# Spike C — Medusa (D006 candidate) evidence digest

Captured 2026-09-22 against the official docs (Medusa v2.x line, v2.21 era). Every fact is tagged
**Documented** (official doc page fetched) / **Observed** (read in source/PR) / **Inferred** (reasonable
conclusion, not yet verified). Sources are the URL fragments; full URLs in `docs.medusajs.com` +
`github.com/medusajs/medusa`.

## Self-host footprint (deployment)
- **Documented:** v2 is a modular monolith; production deployment needs **PostgreSQL**, **Redis**, a
  **server** process (API + admin) and a **worker** process (`workerMode: server|worker|shared`; `shared`
  is dev-oriented). Redis is documented as required for sessions and recommended for the
  Event/Caching/Workflow-Engine/Locking modules; the default Local Event Module is dev-only.
  Sources: `/learn/introduction/architecture`, `/learn/deployment/general`, `/learn/production/worker-mode`, `/learn/installation`
- **Documented:** storefront is a separate app (Next.js starter optional). Node v20.19+/v22.12+.
  Sources: `/learn/installation`, `/learn/introduction/architecture`

## Cart → checkout → order
- **Documented:** 5-step checkout; complete = `POST /store/carts/{id}/complete` → `completeCartWorkflow`
  returns `type:"order"` on success or `"cart"` on failure (payment auto-reverted).
  Sources: `/resources/storefront-development/checkout`, `/checkout/complete-cart`, `/api/store/carts/complete-cart`
- **Documented:** `PaymentCollection` is central in v2 (collection → PaymentSessions → Payments →
  providers) — not removed; only leftover v1 fields were cleaned up in early 2025 (PR #10987).
  Sources: `/resources/commerce-modules/payment`, `/payment/payment-collection`, `/payment/payment-flow`

## Idempotency / duplicates
- **Documented:** workflow-level once-only via `createWorkflow({ idempotent: true })` keyed on transaction id;
  `completeCartWorkflow` guards concurrent duplicate completion (refund skipped).
  Sources: `/resources/references/workflows/createWorkflow`, `/checkout/complete-cart`
- **Inferred:** for self-hosted payment webhooks there is no native dedup-by-request-id documented — you
  build it on workflow/status guards (your own idempotency layer is required either way).

## Webhooks / events
- **Documented:** OSS self-host has in-process events→subscribers only (Local or Redis Event Module); the
  **managed outgoing-webhook delivery with signed retries is Medusa Cloud-only**.
  Sources: `/learn/fundamentals/events-and-subscribers`, `/cloud/webhooks/reference`
- **Documented:** built-in `/hooks/payment/[identifier]_[id]` route for payment-provider webhooks →
  authorize/capture/completes the cart. Sources: `/resources/commerce-modules/payment/webhook-events`
- **Documented:** emitted events include `order.placed`, `order.fulfillment_created`, `payment.captured`,
  `shipment.created`, `product.*`, `cart.*`. Source: `/resources/references/events`

## Order metadata / personalisation
- **Documented:** `metadata` on orders/carts/products/line items; values string/number/boolean/date/object/arrays;
  a personalisation recipe = child's name/message in line-item `metadata`; richer data → custom module linked to LineItem.
  Sources: `/api/store/manage-metadata`, `/resources/recipes/personalized-products`
- **Inferred:** no documented size cap (Postgres `jsonb` limits apply).

## Rest of surface (heading-level)
- **Documented:** Tax Module (per-country regions, rates/rules, pluggable tax providers) — `/resources/commerce-modules/tax`
- **Documented:** Regions bundle currency + countries + tax + payment/shipping; multi-currency via multiple regions —
  `/resources/commerce-modules/region`
- **Documented:** Inventory (stock locations, reservations, kits), Fulfilment (providers, shipping options),
  Orders (Returns/Edits/Exchanges/Claims, versioned timeline, refunds) — `/inventory`, `/resources/commerce-modules/fulfillment`, `/order`
- **Documented:** all `@medusajs/*` versioned together; minor releases can carry breaking changes; migrations
  `medusa db:migrate`; codemods. Source: `/learn/update`

## What this means for us (Inferred)
- At our actual scale (one format, already approved-revision-bound orders) adopting Medusa = operating
  Postgres + Redis + server + worker + admin + storefront, versioned as one breaking-release surface, to
  get cart/order/payment primitives whose distinguishing capabilities (multi-region, tax engines,
  inventory/watchouses, marketplaces, returns/exchanges) we do not currently need.
- **Documented:** OSS has no outbound webhooks — the book→print order handoff is a custom idempotent job
  either way. The thing Medusa would save us (payment state machine + cart + order model) is exactly what
  `packages/domain` (+ a thin commerce surface, see `README.md`) already owns at the app boundary.
- Live Medusa runtime was NOT measured in this phase; the comparison above is docs-grounded (Documented)
  plus reasoning (Inferred). If a later requirement needs Medusa's mature primitives (marketplace,
  multi-region, inventory, promotions), the revisit triggers below apply.

## Revisit triggers (flip to re-evaluate Medusa)
1. Multiple product formats/SKUs with option/variant complexity (beyond 1 format constant).
2. Multi-region tax/payment/shipping beyond one country, or a marketplace/3rd-party sellers.
3. Existing fulfilment/inventory provider network we must plug into that offers a Medusa integration.
4. Team no longer wants to own a payment-provider adapter + idempotent webhook layer (the self-build core).
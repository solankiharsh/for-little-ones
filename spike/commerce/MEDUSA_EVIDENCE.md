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

---

## 2026-09-22 re-verification (D006 re-opening — appended; original digest above unchanged)

D006 was re-opened because the product constraint changed (operational complexity now accepted
in exchange for mature commerce primitives), not because the original findings were wrong.
Re-verified against current official sources on 2026-09-22:

- **Documented:** current stable is **v2.21.0** (`@medusajs/medusa` npm `latest`; docs `/learn/update`
  "Medusa's current version is v2.21"). All `@medusajs/*` still version together; minors can carry
  breaking changes; `medusa db:migrate` / `db:rollback`. Original update-process claims hold.
- **Documented:** **MIT license** (`LICENSE` on `medusajs/medusa` master). No licensing blocker for
  the components we use. Medusa Cloud remains a separate commercial service — we self-host.
- **Documented:** self-host footprint unchanged: Postgres + Redis (sessions required; event/cache/
  workflow/locking modules in production) + `workerMode: server|worker`; ≥2 GB RAM; Node
  v20.19+/v22.12+ (`/learn/deployment/general`, `/learn/production/worker-mode`).
- **Documented:** first-party Stripe provider ships in core (`@medusajs/medusa/payment-stripe`:
  `apiKey`, `webhookSecret`, `capture`, `automatic_payment_methods`); inbound webhooks at
  `{server_url}/hooks/payment/{identifier}_{id}` (e.g. `/hooks/payment/stripe_stripe`).
- **Documented:** regions (currency+countries+settings per region), tax regions/rates/rules with
  pluggable providers, promotions (rules/campaigns/budgets), fulfilment (providers+shipping options),
  orders (returns/exchanges/claims/refunds) are all first-class modules — heading-level claims above
  re-confirmed at module-page depth.
- **Documented:** personalisation recipe = line-item `metadata` for pointer data; custom module +
  module link for richer data; `completeCartWorkflow` `orderCreated` hook — matches our opaque-
  reference boundary.
- **Documented:** events → in-process subscribers (`src/subscribers`) over Local (dev) / Redis
  (production) Event Module; `order.placed`, `payment.captured`, `order.fulfillment_created`,
  `shipment.created` emitted.
- **Citation correction (conclusion unchanged):** the `/cloud/webhooks/reference` source cited above
  for "no OSS outbound webhooks" is the Cloud *platform* webhooks page (build/deploy events), not
  commerce outbound delivery. There is still **no documented outbound-webhook delivery for
  self-hosted OSS** — commerce integration goes through subscribers; payment webhooks come *in* via
  `/hooks/payment/*`. Spike conclusion stands; citation fixed here.

**Outcome:** no newly discovered architectural, licensing or blocking issue → **D006 ADOPTED**
(see `DECISIONS.md` D006 and the `RESEARCH_LOG.md` re-opening entry). Honest gap retained: Medusa
runtime still not measured (docs-grounded); live `medusa dev` remains optional alongside the
implementation PR.

## Revisit triggers — status after adoption (2026-09-22)
All four triggers are now pre-emptively exercised by choice (self-host Medusa now) rather than
waited for; they no longer gate a re-evaluation — they document what drove the re-opening.
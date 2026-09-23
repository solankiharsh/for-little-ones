# Commerce foundation (Medusa sandbox)

Sandbox-only Medusa backend for the F-018 foundation slice. It proves cart →
payment → order → print-handoff against synthetic approved revisions without
serving real purchases.

## Layout

- `medusa-config.ts` — sandbox guard (`COMMERCE_SANDBOX=true`, never
  production), Postgres/Redis, Redis event bus + workflow engine, optional
  Stripe test-mode provider.
- `compose.yaml` — local Postgres (127.0.0.1:5434) + Redis (127.0.0.1:6381).
- `src/scripts/seed.ts` — one UK/GBP region, one hardcover variant (£29.20),
  synthetic buyer, opaque approval registry, fake-printer tables.
- `src/scripts/sandbox.ts` — database-backed acceptance harness.
- `src/workflows/hooks/approved-checkout.ts` — server-side approval +
  payment-session/total validation on `completeCartWorkflow`.
- `src/lib/gateway.ts` — `CommerceGateway.addApprovedItem` (validates before
  adding to cart).
- `src/lib/handoff.ts` — transactional outbox + fake-printer drain.
- `src/subscribers/paid-order.ts` — reconcile on `order.placed` /
  `payment.captured`.
- `src/jobs/reconcile-print.ts` — `flo-reconcile-print`, every minute.

`packages/commerce` holds our boundary (`validateApprovedItem`,
`CommerceEventAdapter`); it never imports Medusa internals.

## Run

```sh
colima start --profile flo-commerce
docker-compose -f apps/commerce/compose.yaml up -d
cp apps/commerce/.env.example apps/commerce/.env  # fill local secrets only
npm install
npm run migrate --workspace @for-little-ones/commerce-app
npm run seed --workspace @for-little-ones/commerce-app
npm run sandbox --workspace @for-little-ones/commerce-app
```

## Verified

- Revoked approval rejected at checkout, then retry succeeds.
- Repeated checkout returns the same order; duplicate capture charges once.
- Same approved revision can back a second, distinct order.
- Authorization alone never enqueues print work; only captured totals do.
- Duplicate/concurrent reconciliation yields one durable fake-print receipt
  per order item; approval row unchanged.
- Line-item metadata carries only opaque revision references.

## Not verified here

- Stripe test-mode payment + webhook round-trip (needs `STRIPE_API_KEY=sk_test_…`
  and `STRIPE_WEBHOOK_SECRET`).
- Real print provider (Mixam still provisionally selected); the drain writes a
  fake receipt only.
- Production approval source: the sandbox registry is synthetic and must be
  replaced by the authenticated Book service.
- Customer-facing cart/payment UI (next slice).

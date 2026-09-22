# Spike C — Commerce (candidate vs minimal self-built surface)

Status: **HARNESS GREEN — original decision: REJECT Medusa as the foundation now (2026-09-22).**
**SUPERSEDED: D006 re-opened 2026-09-22 (constraint change) → Medusa ADOPTED** (see
`DECISIONS.md` D006 and `RESEARCH_LOG.md` "D006 re-opening"). All evidence below is retained
unchanged as the proven semantic minimum for the Medusa integration; only the product constraint
changed, not the findings. Runtime: headless, sandboxed, no Docker/services.

## Question (PROJECT_SPIKES §Spike C)

> Does adopting the commerce platform reduce total risk enough to justify its operational/domain
> complexity? — at our actual expected scale (one product format, personalised books, small store).

## Method

Two parts, both offline:

1. **Minimal self-built demo path** (headless, `src/`, `test/order.spec.ts`): approved-book-revision
   fixture → cart line → format/SKU → price → payment sandbox → order, with the **hard invariant**
   (`CommerceOrderItem → opaque approvedBookRevisionId + revisionHash`; commerce never receives child,
   story, page or character data) enforced by a round-trip payload test, and duplicate-webhook
   idempotency exercised explicitly. This is the "what the repo already contains" comparison half
   (AGENTS.md: *First compare it against what the repository already contains*).
2. **Medusa surface digest** (`MEDUSA_EVIDENCE.md`): current v2.x facts from the official docs, tagged
   Documented / Observed / Inferred, covering footprint, cart→payment→order, idempotency, webhooks,
   metadata/personalisation, tax, multi-region, fulfilment.

## Results

- `npm run typecheck` clean; `npm test` **4/4** (`order.spec.ts`).
- Demo path passes end-to-end: SKU `HB-SQ-AVA` @ 2499 minor → authorize → capture → `PAID`.
- **Invariant proven:** `toOrderPayload` serialization contains the opaque ref (`rev-7`,
  `sha256:abc123`) and never any canonical token (child id, character name, story text, asset ref).
- **Idempotency proven:** duplicate webhook re-delivery is a no-op; second capture on an already-captured
  payment is refused (single-shot capture); a fresh event is still delivered.
- Unapproved books (`DRAFT`, `EDITING`) are rejected at the checkout entry — commerce can only reference
  an approved revision (D011-consistent).

## Comparison (self-build vs Medusa) — why REJECT now

| Axis | Minimal self-build (this spike) | Medusa OSS (Documented) |
|---|---|---|
| Cart→payment→order | Owned; 4 green tests; invariant structural | Owned; mature; PaymentCollection central |
| Personalized line metadata | `recipientLabel` on item | `lineItems[].metadata` recipe (Documented) |
| Idempotent webhooks | Explicit at-least-once handling, tested | Workflow-level once-only; **no OSS outbound webhooks** — custom idempotent job required anyway |
| Ops footprint (prod) | none beyond app (`DurableExecutionContract` we already own) | Postgres **+ Redis** + server **+ worker** + admin + storefront; breaking minor releases |
| Multi-region/tax/marketplace/inventory | not needed at scale | powerful but unused at our scale |
| Rejection of unapproved | hard gate in code | you'd build the same gate |

The platform's distinguishing value is marketplace-grade commerce; at one-format scale it adds
operational surface we must run and version without removing risk (self-hosted webhook delivery to the
print provider is custom either way — Medusa OSS has no outbound webhooks). The self-built core is small
and already invariant-clean. **Do not migrate for architectural neatness (AGENTS.md).**

## Decision (record → RESEARCH_LOG / DECISIONS D006)

- **ORIGINAL (2026-09-22): REJECT (defer) Medusa** as the commerce foundation; adopt a **thin
  self-built commerce surface** behind the usual app/domain seam, with the opaque-revision
  invariant hard-coded.
- **SUPERSEDED (2026-09-22, constraint change): D006 ADOPTED — Medusa is the commerce
  foundation** (self-hosted, `apps/commerce`), behind the same opaque-revision boundary; the
  invariant tests here remain the minimum the integration must satisfy (ported to
  `packages/commerce` in the implementation PR).
- The open purchase decision is the **real payment provider adapter** (Stripe-class) + idempotent
  webhook ingestion and any shipping/tax compute — the sandbox proves the state machine and
  invariant, not the external payment rails. (Resolved direction: Medusa's first-party Stripe
  provider + its inbound `/hooks/payment/*` route; our idempotent layer sits on the subscriber
  side.)
- Revisit triggers (all four) documented in `MEDUSA_EVIDENCE.md` — now pre-emptively exercised
  by choice rather than waited for.

## Honesty notes

- Medusa runtime was **not** measured here (docs-grounded only). If the foundation decision were
  contended, the next step is a live `medusa dev` run against local Postgres.
- The sandbox payment does not model 3DS/SCA or real capture flows; those belong to the provider adapter.
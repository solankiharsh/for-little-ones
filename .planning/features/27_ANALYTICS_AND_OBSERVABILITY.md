# 27_ANALYTICS_AND_OBSERVABILITY.md — Analytics & Observability

> **Spec ID:** F-027 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-010/28 (generation jobs/retries), F-018 (checkout funnel), F-016 (approval), F-019 (prints); feeds F-026 ops and margin decisions
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Privacy-safe analytics and observable costs for a margin-dependent personalised-print business. Product events are restricted to a small set of decisions that genuinely steer the roadmap; cost accounting attributes every build cost (generation, images, QA, storage, print, shipping) to a book so margins are measurable; error tracking and logs carry no child PII.

## 1. Goal

Two needs: (a) product decisions from real usage — but only events that change what we build, never a dragnet of children's activity (guide §13 product filter); (b) unit economics — personalised AI books have variable costs per book (generations, failed attempts, image count), and launching without measuring them risks negative margins at scale (spec §22 identifies cost accounting as core backend research). The goal is a small event model plus a cost ledger that answers "what does one Ava's-Moon-Adventure actually cost, and is the price right?" without ever logging a child's data.

## 2. User value

Not directly customer-visible; it protects the product indirectly — accurate ETA (F-018/20), honest pricing, and generation budgets that keep the ~95/5 UX (D003) affordable. Internally it is the evidence base for product-filter decisions (spec §27) and for F-026 reliability fixes.

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

## 4. Problems with current implementation

Not applicable (greenfield). Design risks: funnel-style analytics that ingests child identifiers or photo references (guide §7 — no sensitive payloads); cost attribution lumped at the order rather than the book (blurs margin per format); logs with titles/names/story snippets; third-party analytics vendors receiving personal data without documentation (guide §7 provider rule).

## 5. Desired UX

No user-facing UX. Consumers are product, ops and finance. Product reads funnel + event mix; ops reads errors/retries per F-026; finance reads the cost ledger and margin report. All views render approved dashboards; no raw logs by default.

## 6. UI specification

Internal dashboards only (desktop): (1) Funnel – concept_selected → book_approved → checkout_started → checkout_completed with step-level loss; (2) Reliability – generation/auth/fulfilment errors grouped by cause, retry counts per step (F-010/28); (3) Cost & margin – per-book, per-format and per-region cost rows with unit economics. No customer-visible surface.

## 7. Domain model

```text
Event { name (allow-listed), ts, anonymous_project_id (hashed), book/order refs (no PII) }
CostLedger entry { bookId, revisionId, account (generation|image|qa|storage|print|shipping|payment),
  kind, attemptedAt, usage {model, tokens/images}, costRaw, currency, succeeded }
```

The ledger is append-only and internal (never customer-facing). Order-level charges stay F-018's totals; the ledger is the cost side of margin = sale price − (gen + qa + storage + print + shipping), computed per approved revision.

## 8. Backend/API requirements

A minimal write-only ingestion endpoint for allow-listed events (server-enforced whitelist: `story_concept_selected`, `generation_failed`, `page_regenerated`, `character_fix_applied`, `book_approved`, `checkout_started`, `checkout_completed`; plus ops events `fulfilment_failed` etc. from F-019). All client/public authz: hashed project refs only — no emails, no child names, no photos, no full addresses. Cost entries are recorded by the jobs themselves (F-010/17/19) at the exact bounded usage. Error tracking: a culture-side collector (e.g. Sentry-compatible) previewed to strip PII at the SDK boundary; stack traces only, no structured book fields. Logs: a logger contract (no child fields, no provider payloads; correlation ids link to the LineageView in F-026 instead).

## 9. Background jobs

`CostAggregationJob` — nightly roll-up of the ledger into per-book/per-format/per-region margins (idempotent, rebuildable from the ledger); `EventRetentionJob` — TTL purge of raw events (no child PII → short retention fine); `AnomalyAlertJob` — flags margin outliers and error-rate spikes into F-026. All aggregate jobs are resumable per D010.

## 10. AI behaviour

None, but this spec charges AI usage: every StoryProvider/IllustrationProvider/QA call is metered (model, token/image count, succeeded/failed) at the provider boundary so a regeneration storm is visible in cost before it is visible in billing.

## 11. QA

Event names pass the whitelist validator (unknown names rejected); no sensitive payloads in any event (schema test: a field named "child_name"/"email"/"photo" fails CI); cost ledger balances against provider invoices monthly; margin report matches sale price minus aggregate costs; error collector strip-rules unit-tested against realistic exception payloads.

## 12. Privacy/security

Non-negotiable: events carry only hashed project refs + booleans; no names, photos, addresses, emails, or card data; logs are the F-026 correlation id surface, not a symptom store; third-party collectors documented in the provider registry (guide §7, F-025) and receive zero child data by contract; retention TTLs enforce minimal-data. All dashboards internal, while customer data is never used for third-party advertising.

## 13. Analytics

The events above ARE the analytics; there is no separate analytics section here — the product-event allow-list is this feature's core and will asymptotically shrink rather than grow.

## 14. Acceptance criteria

1. Given the checkout completes → the only recorded events are the allow-listed funnel events with hashed refs; a payload check on the collector shows no child name/photo/id.
2. Given a page is regenerated 4 times → the ledger records every attempt (image cost ×4, all marked succeeded/failed truthfully), and the margin report surfaces the higher unit cost for that book.
3. Given an exception with a story snippet in context → the collector's output contains no story/book fields after the strip rule (verified by test).
4. Given an error-rate or margin spike → an anomaly job opens a case in F-026 with the lineage ref, no raw logs.
5. Given a monthly reconciliation → ledger totals equal provider invoices within the documented tolerance; annual price/margin decisions use this report.

## 15. Dependencies

Requires F-010/28 metering hooks, F-018 checkout events, F-019 fulfilment events, F-016 approval events; outputs to F-026. Builds in parallel Track E (design early, ingest late).

## 16. Priority

**P1 — reliability & economics guardrail** (spec §§22/27: cost accounting informs pricing/priorities). Not launch parity, but the event allow-list and ledger schema should exist before P0 launches to avoid building uninstrumented; full dashboards land P1.
# 20_ORDER_TRACKING.md — Order Tracking

> **Spec ID:** F-020 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-019 Fulfilment (status events + tracking numbers), F-018 Cart/Checkout (order), F-026 Admin; reads F-027 for health
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Customer-facing order tracking: a single lifecycle timeline — `ORDERED → IN_PRODUCTION → SHIPPED → DELIVERED` (guide §4 order/fulfilment machines — these states ride the **order projection**, sourced from Medusa order/fulfilment events + F-019 provider events; they are never `BookStatus`, D006 state split), with payment-failure/`FULFILMENT_FAILED`/`CANCELLED` shown as recoverable states — driven by fulfilment events (F-019) and provider tracking numbers. Status is visible in-app with pull-to-refresh and via email; tracking payloads never contain sensitive child data.

## 1. Goal

spec §26 lists order tracking as P0 category parity; the ideal journey includes "Track" after print (spec §20). Delivery anxiety is the category's largest complaint cluster (spec §24). The goal: the customer always knows what is happening, in words matched to the previewed product — without our support team answering "where's my book?" manually (the "why is this stuck?" answer must live here and in F-026, not in inboxes).

## 2. User value

Gift buyers gift a promise; "your book arrived the 14th" is the payoff. ETA honesty pre-payment (F-018) plus in-flight status removes uncertainty at the two anxious moments (waiting for production, waiting for delivery). Fewer support tickets is a direct filter win; email notification keeps the value without app re-engagement.

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

## 4. Problems with current implementation

Not applicable (greenfield). Design risks: leaking child identity in tracking payloads/emails (guide §7); displaying provider-internal jargon or vendor status names (D002); a stuck order that looks "unknown" instead of recoverable (D010); tracking numbers that cannot be obtained from the provider (see §8 decision).

## 5. Desired UX

After checkout, the order confirmation and the order's tracking page both show a timeline of dated, illustration-friendly steps. Walkthrough: Ava's hardcover order → "15 Oct — We're making your book" (`IN_PRODUCTION`), "18 Oct — On its way! Tracking 4L-…8124" (`SHIPPED`, tracking number visible, tap opens the carrier's page), "21 Oct — Delivered" (`DELIVERED`). Pull-to-refresh updates status; a stale status past the ETA window shows "We're checking with the printer" — never an error. A failed order shows a warm recovery card ("Something went wrong with printing — we're on it") linking to support (F-026). Emails mirror the timeline with a tracking link; gift orders from the buyer's perspective retain the gift message framing.

## 6. UI specification

Single timeline component (order page + email): nodes/steps, earliest→latest, each with date + friendly label + optional carrier tracking link; current step emphasised, future steps dimmed. Pull-to-refresh re-fetches; retry table on refresh combines F-019 events with provider data. Failure states align with the guide's exceptional **order/fulfilment** states (payment failure, `FULFILMENT_FAILED`, `CANCELLED`) rendered as recoverable, agent-named alternatives — never raw provider status text, never written onto the Book. No child photos on this screen; cover thumbnails only.

## 7. Domain model

```text
OrderTrackingView { orderId, orderItemSummaries[], stages[], updatedAt }
TrackingStage { stage (ORDERED|IN_PRODUCTION|SHIPPED|DELIVERED|FAILED|CANCELLED),
  at, label, detail, carrier?, carrierTrackingUrl? }
```

Derived read model: projection of order (F-018) + `PrintSubmission`/events (F-019). Store the timeline ourselves; provider numbers are mirrored onto `PrintSubmission` as data, never referenced indirectly, so the view is stable even if the carrier page changes.

## 8. Backend/API requirements

`GET /orders/:id/tracking` (auth-scoped) returns the derived timeline; `PATCH`-free (pure projection). Provider Webhook/poll (F-019) appends transitions. **Decision needed:** whether the selected PrintProvider (F-019) supplies tracking numbers/shipment events for every delivery method — if not, tracking degrades to stage-level (`IN_PRODUCTION → DELIVERED`) and "shipped" notification is omitted rather than faked. Delivery-target comms: notification preference per order, one digest per stage change; email includes tracking link but no child name in subject/body (§12).

## 9. Background jobs

`TrackingSyncJob` — polls provider shipment status on interval (e.g. hourly) and reconciles; late updates past ETA → nudge event to F-026. `TrackingEmailJob` — triggered per stage transition, idempotent (a repeated sync must not re-send). No child data in job inputs beyond order refs.

## 10. AI behaviour

None. All stage labels are fixed, human-approved copy; no model-generated status text.

## 11. QA

Stage transitions obey guide §4's order/fulfilment machines (no `DELIVERED` before `SHIPPED`, no backward jumps; states on the order projection, never the Book); timeline consistency with F-019 events; tracking URL belongs to the carrier domain only (no injection); ETA window (F-018) matches delivery stage; email renders correctly and carries no child PII.

## 12. Privacy/security

Tracking payloads (API + email + carrier redirect) contain order refs, carrier numbers and dates only — never child name, photos or story data (guide §7). Carrier receives gracable ship-to: full address is required for delivery but only the tracking number (+ order id) travels in customer-facing comms. Deletion (F-025) must retroactively suppress tracking emails for deleted records.

## 13. Analytics

`tracking_viewed`, per-stage delivery times and ETA accuracy — aggregate, no PII; feeds F-027 margins and F-018 estimate calibration. No child identity in event properties.

## 14. Acceptance criteria

1. Given the provider marks an order shipped with a number → the timeline shows `SHIPPED` with a working carrier link, and one email is sent with no child name/PII.
2. Given a stage is out of order (e.g. duplicate SHIPPED event) → the view dedupes and keeps the first occurrence; state never walks backwards.
3. Given fulfilment stalls past its ETA → the page shows the "we're checking with the printer" recovery state and F-026 receives the item, without exposing anything raw to the customer.
4. Given a provider with no tracking numbers → tracking shows stage-level progress with no fabricated number and no "on its way" email (decision §8).

## 15. Dependencies

Requires F-018 (order existence) and F-019 (events/tracking numbers); uses F-026 for review escalation and F-027 for health metrics. Parallel in Track D.

## 16. Priority

**P0 — category parity** (spec §26: order tracking). Filter (spec §27): confidence in the delivered product + fewer support problems. Launch scope: stage-level tracking is sufficient; carrier-level detail is the premium increment.
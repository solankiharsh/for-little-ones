# 19_FULFILMENT.md — Print Fulfilment

> **Spec ID:** F-019 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-017 Print Rendering (print artifact), F-018 Cart/Checkout (paid order, D011 revision pointer); feeds F-020 Tracking, F-026 Admin
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Fulfilment is handled through the proposed `PrintProvider` interface: after a paid order (F-018) we submit the immutable approved print artifact (F-017), record the provider quote, drive the submission through provider status events and emit `FULFILMENT_SUBMITTED` and downstream states. Digital copies are delivered when purchased. Failures become `FULFILMENT_FAILED`, surfaced to ops (F-026) and to the customer via comms — never silently retried or silently shipped wrong.

## 1. Goal

spec §16 requires fulfilment parity with the category — reliable shipping, express where the printer supports it — and the physical book must match the approved revision exactly (D011). The goal is a fulfilment pipeline that is observable (each submission tracked from quote to delivered), idempotent (a worker crash never double-ships or loses a job, D010) and honest about failure (lost or garbled submissions escalate instead of stalling).

## 2. User value

Customers trust "it arrived, and it is the book I approved." Delivery honesty and ETA consistency (F-018 → F-020) directly attack the category's biggest complaint cluster (delivery issues, spec §24). Clean artifacts give ops and support fast resolution on the rare failure, cutting support load and refunds (filter: fewer support problems).

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

`PrintProvider` is a **proposed** interface. **Decision needed:** print partner choice; required formats/DPI/bleed/colour; whether the partner exposes live scheduling windows (feeds pre-payment ETA in F-018) and anonymous tracking webhooks.

## 4. Problems with current implementation

Not applicable (greenfield). Design risks to avoid: vendor hard-coupling (guide §6 — abstract only where switching is realistic; a print partner is exactly that); submitting a non-approved revision (D011); double submission on worker restart (idempotency); uploading the child photo pool instead of only the print artifact (guide §7); losing fulfilment state on restart (D010).

## 5. Desired UX

Customer-facing: the confirmation and tracking timeline (F-020) show `In production → Shipped → Delivered`, fed by this spec's events; no new customer screen. Comms fire only on meaningful changes (production start, shipped + tracking number, delivered, or a warm non-jargon failure notice per D002). States are never unknown; no spinner.

## 6. UI specification

No customer UI beyond F-020's tracking surface. Ops incident work (provider submission, artifact links, failure diagnosis, manual re-submit) lives in F-026. Comms templates render server-side with no child data in subjects or payloads (§12); gift ordinals use the recipient name only.

## 7. Domain model

```text
Order → OrderItem → ApprovedBookRevision → PrintArtifact       (guide §3)
PrintSubmission { id, orderItemId, provider, providerOrderRef,
  artifactId (immutable ApprovedBookRevision contentHash), printSpec snapshot,
  shipTo, quantity, binding/format, status, events[], etaWindow{earliest,latest},
  providerQuote {currency, amount}, created, updated }
DigitalDelivery { entitlementId, orderItemId, artifactId (digital render),
  issuedAt, accessUrl, accessExpiry, revokedByDeletion? }        (F-021/F-025)
```

`PrintArtifact` comes from F-017 keyed to the approved revision; the submission mirror is a snapshot (shipTo, printSpec, quote), so a later edit of a book never affects an in-flight job (D011). `PrintProvider` is ours (an adapter around the partner API); the commerce module's fulfilment step (Medusa candidate — D006) marks the order fulfilled once submission succeeds.

## 8. Backend/API requirements

`PrintProvider.submit(artifactRef, printSpec, shipTo, quantity, binding)` → `providerOrderRef`, with server-side idempotency key = `orderItemId` (+ `attempt` on retry) so restart can't double-submit. Status is polled or webhook-driven into `status`/`events[]`; each transition emits an event to tracking (F-020) and ops (F-026): `FULFILMENT_SUBMITTED → IN_PRODUCTION → SHIPPED → DELIVERED`; failure emits `FULFILMENT_FAILED`. Digital: `deliverDigitalCopy(orderItemId)` issues the entitlement access URL (short-lived, revocable — F-021 reads, F-025 deletion). Quote is informational (cost ledger, F-027); the customer always pays the catalogue price from F-018, never the raw provider quote.

## 9. Background jobs

- `SubmitPrintJob` — submit artifact; retry policy: bounded (e.g. 3 attempts, backoff), each attempt idempotent; terminal failure → `FULFILMENT_FAILED` and escalation (F-026).
- `FulfilmentStatusPoll` — reconcile provider status with our timeline; late/no update past ETA window → flag for ops review.
- `DeliverDigitalJob` — emits the digital entitlement idempotently once, and only after payment confirms.
- `EtaWindowRefresh` — feeds F-018 pre-payment and F-020 in-flight ETAs.

## 10. AI behaviour

None. Ill-designed generation output is never shipped: the artifact submitted is the QA-cleared deterministic print render (F-015/F-017), not a live model output.

## 11. QA

Artifact `contentHash` matches the approved revision before submit; quantity/binding/format match the order lines; ETA window within provider-supported range; digital entitlement links resolve only for the owner (authz check); fulfilment status transitions strictly follow the guide §4 state machine (`ORDERED → IN_PRODUCTION → SHIPPED → DELIVERED`).

## 12. Privacy/security

Provider receives only ship-to address + the approved print artifact, which contains the generated likeness — treat the artifact as PII by policy (guide §7, generated likenesses are identifiable) and record the provider in the registry with its retention documented (F-025). No source photos, no profile dump, no other data. Comms/logs are PII-free (no child names in log lines); tracking payloads (F-020) carry order refs, never child data.

## 13. Analytics

Ops events only, no PII: `fulfilment_submitted`, `fulfilment_failed`, provider SLA/ETA accuracy, defect rate per provider — these feed F-027 cost and margin accounting (print + shipping per line) without exposing the child.

## 14. Acceptance criteria

1. Given a paid order → the approved artifact is submitted once with an idempotency key; duplicate worker attempts produce a single provider submission (D010).
2. Given the provider reports a defect or rejects the file → `FULFILMENT_FAILED` fires, ops (F-026) sees artifact + submission + error, and customer comms explain warmingly; there is no silent infinite retry loop.
3. Given digital+print was purchased → the digital entitlement is issued exactly once, after payment, and is revocable via F-025 deletion.
4. Given a book is edited after the order → the submission, artifact and quote remain snapshots of the approved revision; the shipped book is unchanged (D011).

## 15. Dependencies

Needs F-017 (deterministic artifact) and F-018 (paid order + D011 pointer). Heavily depends on F-026 for failure handling and F-020 for the visible timeline; runs in parallel Track D. F-025 defines artifact retention.

## 16. Priority

**P0 — category parity** (spec §26: physical printing, shipping). Filter (spec §27): every criterion above is "confidence the printed book will be excellent" and "fewer support problems". Ship with launch.
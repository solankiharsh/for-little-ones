# 26_ADMIN_AND_SUPPORT.md — Ops & Support View

> **Spec ID:** F-026 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-018 Cart/Checkout, F-019 Fulfilment; consumes state from F-010/28 generation jobs, F-016 approval, F-020 tracking, F-025 privacy/deletion, F-027 cost
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

An ops/support console that answers "why is this book stuck?" **without reading logs**: every lineage link — customer, child profile, book, generation status, failed jobs + retries, approved revision, order, payment, print artifact, provider submission, tracking, and privacy/deletion state — visible on one screen. Access is role-gated, and staff never see child photos unless the specific failure demands it.

## 1. Goal

spec §§19/24 frame the studio promise: failures should be structurally prevented and, when they still occur, resolved without customer-side escalations. P0 features (F-018/19/20) generate orders and submissions; without a support surface, every "where's my book?" or "generation broke" ends in a log hunt. The goal is a join-on-lineage view so support answers in minutes, actions (re-submit, refund-hold, force-recovery) happen in place, and privacy (F-025) stays auditable.

## 2. User value

Reduced support turnaround and refunds are the direct filter win (fewer support problems). For customers, the effect is "they knew exactly what was happening with my child's book" — the trust that makes the studio feel personal (spec §19). For staff, it removes guesswork and keeps them out of raw logs and raw child media by default.

## 3. Current implementation

```text
None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md.
Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

## 4. Problems with current implementation

Not applicable (greenfield). Design risks: building a generic admin framework (anti-goal — keep it thin over shared state, F-028); exposing source photos broadly (guide §7 — show them only under a permission + purpose); letting support mutate production data without an audit trail; diverging from the F-010/28 persisted states so the console lies.

## 5. Desired UX

A support lookup starts with order id, email, or customer id → one "Order 10042 — Ava's Moon Adventure" page: top summary chips (order state, payment state, fulfilment state, tracking stage, revision locked), a tabbed timeline of the generation job (F-010: each step + retries + failure reason for the stuck page only), approval (F-016: who/when/whether contentHash matches), print artifact (F-017: link, couldn't-render reason), provider submission + events (F-019), payment status, and privacy row (photos retained? delete-now date? F-025). The "stuck" answer renders the block step + its last error string with a friendly translation; buttons are conservative: "Retry page" (per-page, D010 — never whole-book), "Re-submit fulfilment", "Refund hold", "Escalate to ops". Child photos appear only behind an explicit "View reference photo" purpose toggle, logged.

## 6. UI specification

Mobile-unfriendly by design (desktop console). Layout: search box (by order id/email), result card, banner alert if any blocked state; entity timeline left, detail panel right; every block annotated with "since <time>" and the retry policy state (F-010/28). No raw JSON default; "Show JSON" is an explicit auxiliary. Ops dashboards reuse the same lineage views.

## 7. Domain model

```text
LineageView { orderId, customerId, projectId, bookId, revisionId(Snapshot),
  childDisplayName (never photo), generationStatus (F-010), failures[], retryCount,
  approvalHash, paymentRef, submissionRef (F-019), tracking, privacyState (F-025) }
```

A single projected read model over the existing entities — no new source-of-truth tables; derived from Order (F-018), PrintSubmission (F-019), Book lifecycle (guide §4), GenerationJob (F-010), Privacy ledger (F-025). AuditEvent { actor, action, targetRef, at, note } records every state-changing support action.

## 8. Backend/API requirements

`GET /internal/cases?orderId=|email=|customerId=` → lineage view (staff-auth, role-scoped). Read-mostly principle: mutations go through the same command path as product code (`RetryPage`, `ResubmitFulfilment`, `RefundHold`, `TriggerDeletion`) so invariants hold; only explicitly internal actions augment it. Idempotent, rate-limited, audit-logged. **Decision needed:** role model (support vs ops vs admin) and whether internal APIs are exposed only via a network-isolated console route.

## 9. Background jobs

`FailureQueue`/`EscalationAlerts` — FULFILMENT_FAILED (F-019) and repeated generation failures (F-010/28) create support tasks with full pre-joined lineage; `StuckOrderProber` — flags orders stalled past ETA (F-020) into the same queue. No job re-submits silently beyond documented policy. Child data never appears in job inputs.

## 10. AI behaviour

None. Failure summaries are translated from structured error codes (D002 + guide §7: avoid raw provider text onscreen).

## 11. QA

Lineage view is a pure projection — cross-check it equals the underlying entities on each load (or clearly "stale"); every retry mutates the same F-010/28 state the app reads; audit trail captures actor/action/time on every mutation; photo viewing is permission-gated and logged; deletion (F-025) reflected immediately.

## 12. Privacy/security

Staff access is least-privilege and role-based; photos withheld by default and never shown en masse (guide §7 — "staff do not see child photos unnecessarily"); all photo access is purpose-scoped + audited; internal APIs are outside customer auth scope; logs are PII-free; deletion state is surfaced so support never "undeletes"; bulk views contain display names only.

## 13. Analytics

Internal-only counters: case_created/case_resolved, time-to-resolution, mute-stuck orders, retries used, refund rate — aggregated, no child PII, feeding F-027 reliability cost.

## 14. Acceptance criteria

1. Given a stuck order → a staff member finds it by email or order id and the lineage view shows the blocked step, its retry count, and its last failure in one screen without opening logs.
2. Given staff tries to view child photos → access is gated behind purpose toggle, denied silently without marginal permission, and every allowing is audited.
3. Given a fulfilment failure → a support case exists (from F-019) with artifact + submission + tracking linked, and "resubmit" routes through the product command path idempotently.
4. Given a deletion request → the privacy row shows deletion pending/complete (F-025) and the console prevents any "recovery" action on purged records.
5. Given a support action (retry/resubmit/refund-hold) → an audit event records actor, action, target and timestamp.

## 15. Dependencies

Consumes F-018/19/20/10/16/25 state; F-027 provides health/cost overlays. Builds in parallel Track E; a minimal version is needed before launch for fulfilment failures.

## 16. Priority

**P1 — key differentiation** (spec §26: P1 includes fewer support problems via structure, spec §24). Not customer-facing, but without it F-019 failures and privacy (F-025) are unmanageable at scale; a thin launch version ships with P0, full features land P1.
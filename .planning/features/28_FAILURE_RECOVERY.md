# 28_FAILURE_RECOVERY.md — Cross-Cutting Durability & Failure Recovery

> **Spec ID:** F-028 · **Priority:** P0 (durability core) · **Status:** draft
> **Scope note:** this spec is the shared discipline for every long-running feature and gates paid generation; the queue-substrate choice is **not** made here (D014 spike decides). Sections §3–§8 are milestone-linked rather than M1-locked; the acceptance library (§12/§13) ships with the job spine.
> **Depends on:** decisions D010 (reliability is product functionality) · D014 (durable-execution-substrate spike — candidate classes to be decided; wording neutral until then, D019) · no feature-spec dependency: this spec **provides** the durability/concurrency principles (job states, idempotency keys, lease/heartbeat, retry/backoff, outbox/dedupe, dead-letter, cancellation) that the `DurableExecutionContract` (D019) encodes and F-010 implements; F-015/16, F-018/19, F-020, F-022, F-025, F-027 consume the outcomes.
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The reliability backbone: generation and order flows must be **durable, restartable, retryable, observable, resumable and idempotent** (spec §6 pipeline; mission §25 Recovery bar: "generation failures can resume rather than restart the entire book"; D010). Default architecture is a **durable execution substrate** with explicit job states — the substrate is **two candidate classes (PostgreSQL-backed vs Redis-backed/BullMQ-class), chosen by the D014 spike; a workflow engine only if the spike shows the step graph needs it** (Decision needed, with a recommended spike; D019 keeps wording neutral until then). It standardises per-step idempotency keys, retry/backoff policies, timeouts, cancellation, one-page failure isolation, worker-restart-safe book state, and duplicate-webhook/payment-callback safety, plus a shared acceptance scenario library.

## 1. Goal

"No button → request → spinner → hope" (guide §5). A parent refresh, a crashed worker, one bad page, or a redelivered payment webhook must never destroy a book, double-charge, or double-print. Failures become friendly, recoverable states (guide §8), and every step of the pipeline is independently failed/repaired.

## 2. User value

- The book survives refresh, reconnect, and server restart (D010) — a parent never loses an hour of waiting on a spinner.
- One-page failures don't torch the book (D010 ✓), which directly reduces refund/support load.
- Checkout and payment are safe against retries: no double charge, no duplicate order.

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems: `GenerationJob` (durable job entity + states), `BookService`/`BookRepository` (state transitions, outbox), `PrintProvider` (fulfilment submission/callback).

## 4. Problems with current implementation

Not applicable — greenfield. The design risks: choosing a workflow engine (e.g. Temporal) before measuring the actual need; in-memory job state that dies on restart; idempotency gaps that allow duplicate payments/prints; and treating webhook redelivery as "second event" instead of "same event". The spec mandates the recovery primitives, not a tool vendor.

## 5. Desired UX

Every long action has a durable progress view (F-010): refresh mid-generation resumes on the same step; "We had trouble creating page 12 — the rest of your book is safe", with **Try again** (guide §8 friendly failures). Payment: tapping Pay twice or a callback redelivery never doubles the charge or the order. Reorder never re-runs AI. A mobile checkout interrupted by a phone call resumes the same cart/order with a single idempotent `requestId`.

## 6. UI specification

- Progress: per-step indicators (F-010 "meaningful progress"), persisted so reload shows steps not a blank spinner.
- Failure: inline, per-page when page-level (page flagged `FAILED`, others `READY`); book-level banner on step-wide failure with retry/skip actions where skippable (e.g. fallback stylistic choice).
- Offline/reconnect: optimistic state + auto-resume banner; no destructive actions when a retry storm is in progress (throttle via backoff shown as "We'll retry in a moment").

## 7. Domain model

```text
Job { jobId, kind(story|page_illustration|qa|print_artifact|webhook_dispatch|deletion|retention),
      bookId, step, status(queued|running|succeeded|failed|retrying|cancelled|dead),
      idempotencyKey, attempts, maxAttempts, nextRetryAt, timeoutAt, cancelRequested,
      precedes{...} preceding-step state, payloadRef, parentChildScope }
OutboxMessage { msgId, topic, aggregateId, idempotencyKey, attempts, publishedAt, status }
```

Job state is **durable and the source of truth**; in-memory state is never authoritative (worker restart reads the DB). Steps are the smallest unit (per-page illustration, per-QA-check, per-webhook) so one failure is isolated (D010).

## 8. Backend/API requirements

- Idempotency: every mutating command carries a client-generated `Idempotency-Key`; the keyed result is stored and replayed on redelivery (payment callbacks, fulfilment webhooks, checkout requests).
- **Outbox pattern** for webhook/payment events: write-then-publish from the DB, `publishJob` retries until `publishedAt`; consumers dedupe on `idempotencyKey`.
- Workers: lease/token per job (`leaseUntil`), heartbeat, requeue on lost lease; restart preserves all job rows; no uncommitted page state is considered published until `succeeded`.
- Cancellation: `cancelRequested` flag inspected between steps; cancelling a book/child (F-025) stops queue growth, not in-flight provider calls already sent (those are awaited or documented as orphaned and swept).
- Approval/order integrity: `OrderItem → ApprovedBookRevision` (hashed, F-016); payment/fulfilment callbacks can never obtain a different revision.

## 9. Background jobs

- **Retry policy (default):** exponential backoff with jitter, e.g. attempts 1→2→4→8→…→16 min cap, `maxAttempts` per step (configurable per step kind); provider rate-limit and 5xx respected; journeys to `dead` → admin alert (F-026/F-027) rather than silent drop.
- **Timeouts:** per-step ceilings (story steps longer than page-illustration steps); exceed → step fails → retried under policy, not hung.
- **Resumability:** each step stores its preceding output (structured) in the job row/artifact; a restart re-enqueues exactly the unfinished step.
- **Webhook safety:** webhook handlers run under `OutboxMessage` dedupe; delivery is retried with backoff; correctness is **at-least-once delivery + idempotent business-effect handling** (state transitions are idempotent, so redelivery replays the stored result — never exactly-once delivery, which no HTTP webhook provider can guarantee).
- Default substrate: **two candidate classes — PostgreSQL-backed vs Redis-backed/BullMQ-class — chosen by the D014 spike; if Redis-backed is chosen, an outbox + reconciliation sweep is mandatory for the Redis copy path.** A workflow engine (e.g. Temporal) only if the spike shows need. **Decision needed flagged below** (wording neutral until then, D019).

## 10. AI behaviour

Covered by F-008/F-009/F-015; this spec governs *how* those steps run, not their prompts. `StoryProvider`/`IllustrationProvider` calls are wrapped as jobs with structured inputs/outputs pinned by `idempotencyKey` so retries never submit duplicate generations (bill-protection) and never reuse a half-written page.

**Fail closed vs graceful degradation (GENERATION_ARCHITECTURE §10).** Every long-running capability is classified at definition into one of the two modes, and the mode is code, not vibes:

- **Fail closed** (the path stops/blocked): invalid structured model output (schema failure), authorization uncertainty, missing approved revision, corrupt print asset, mandatory QA unavailable (`UNKNOWN`, never silent PASS — F-015), unsafe/invalid print geometry (D016 non-overridable), moderation `HARD_BLOCK` (F-015 catalogue), page/bible version incoherence (F-013 §7).
- **Graceful degradation** (proceed without): nonessential recommendation unavailable, analytics unavailable, optional enrichment unavailable. Degraded paths never gate approval or order.

Retry budgets (`maxAttempts`) are code-configured constants per step kind — **never a model output field**. A model output may carry cost/status metadata; it cannot change how many retries occur, whether a page is `READY`, or whether the book may be approved.

The structured-contract treatment of model output (F-008 §10 / F-009 / F-015 × GENERATION_ARCHITECTURE §3) means an invalid model result is a **typed step failure** that fails closed — it is retried under the job policy, never coerced into a best-effort "good enough" artifact.

## 11. QA

Recovery QA checks (extend F-015/F-027): after each simulated failure, assert (a) book state matches the last durable checkpoint, (b) no orphaned jobs, (c) no duplicate billable generation, (d) per-page isolation held, (e) one job kind can fail without others cascading.

## 12. Privacy/security

Job payloads hold child data (photos, likeness refs) — jobs carry the same retention as their scope and are deleted by the F-025 cascade (pending `GenerationJob` steps cancelled). Job rows reference private storage keys, never public URLs. Dead-letter and audit rows hold no photo bytes.

## 13. Analytics

`generation_failed(step)`, `job_retried(attempt)`, `job_dead`, `webhook_redelivered`, `checkout_idempotent_replay`, `worker_restart_recovered`. No sensitive payloads (guide §7).

## 14. Acceptance criteria — Recovery Scenario Library

Each is a stored Given/When/Then, implemented as an integration test:

1. **Refresh during generation:** Given a book `GENERATING`, when the browser refreshes/reconnects, then the progress view resumes at the durable step and no step is re-run.
2. **Worker restart mid-generation:** Given worker death mid-job, when the job lease expires and a worker restarts, then the job resumes from the exact preceding state and the book is unchanged.
3. **One-page generation failure:** Given page 12 fails, when max attempts hit, then page 12 is `FAILED`, pages 1–11/13–24 remain `READY`, and the book stays `READY_FOR_REVIEW` with page 12 flagged — never a full-book restart.
4. **Duplicate webhook:** Given a fulfilment webhook redelivered 3×, when handlers run, then exactly one state transition and one `OutboxMessage` completion occur (at-least-once delivery, idempotent replay of the stored result — §9).
5. **Payment callback retry:** Given the payment provider retries a callback after a transient error, when the original succeeded, then the dedupe key replays the success — no double charge, no second order.
6. **Photo deletion mid-book:** Given a parent deletes a photo while its book generates, when deletion applies, then generation steps using it are cancelled/blocked and the book pages are flagged `REVISION_REQUIRED` instead of producing an orphaned likeness.
7. **Failed image regeneration:** Given an illustration step keeps failing (provider outage), when backoff completes and the provider recovers, then the page regenerates in place without regenerating siblings.
8. **Order references approved revision:** Given a paid order, when any code path runs, then it references the immutable hashed revision — no generated content can silently replace it.
9. **Mobile checkout interruption:** Given a phone call interrupts checkout, when the app reopens, then the cart and order resume via idempotency key — no duplicate charge when the user confirms again.
10. **Invalid structured model output:** Given a `StoryProvider`/`IllustrationProvider` result that fails schema validation, when the step runs, then the step fails closed (`typed` FAILED), retries honour the job policy, and no coerced "good enough" artifact is written (GENERATION_ARCHITECTURE §3/§10).
11. **Graceful degradation:** Given optional enrichment unavailable, when generation proceeds, then the happy path completes with the item absent and no gate (approval/order) is affected; a parallel scenario asserts a fail-closed capability (e.g. mandatory QA) in the same situation *does* block.

## 15. Dependencies

Implements into F-010 (job entity + progress UI — these two are the durable-job pair, F-010 implementing F-028's patterns). Consumed by F-016 (approval lock), F-018/19 (payment/webhooks), F-022 (reorder idempotency), F-025 (cascade/retention jobs), F-027 (observability of retries/dead letters). Fail-closed vs graceful-degradation classification feeds `product/GENERATION_ARCHITECTURE.md` §10 and the approval/order gates (F-016/F-018).

## 16. Priority

**P0 (durability core) — launch-critical, gating everything long-running.** Mission §26 (reliability under P1 "our reason to exist"), §25 Recovery quality bar, D010 and spec §6 make durable recovery non-optional before any paid generation. Without it there is no safe checkout or reorder. As a *feature spec*, its principles are implemented by the M0/M1 job spine (F-010 orchestrating F-008/F-009); the per-webhook/order hardening rides M4/M5.

**Decision needed:** **durable execution substrate — PostgreSQL-backed vs Redis-backed/BullMQ-class vs a workflow engine.** Recommended experiment: a D014 spike instrumenting one full generation book's step graph on a PostgreSQL-backed queue; if the step graph stays ≤ ~2 dozen bounded steps with no unbounded retries, keep the simplest durable choice (PostgreSQL-backed) and skip a workflow engine. Also decide: `maxAttempts` defaults (suggest: 5 for generation steps, 8 for webhooks); dead-letter routing destination once F-026/F-027 exist.
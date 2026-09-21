# 10_GENERATION_PROGRESS.md — Persistent, Observable Generation Progress

> **Spec ID:** F-010 · **Priority:** P0 (durability core) · **Status:** draft
> **Depends on:** F-008/F-009 `GenerationStep` units (the steps to orchestrate) · F-028 durability patterns (lease, retry, idempotency, outbox) · **Provides** the `GenerationStepExecution` runtime that F-009 declares as its execution interface. · **Consumed by:** F-011 (preview), F-012 (repair), F-016 (approval readiness)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Generation is never *"button → request → spinner → hope"* (guide §5; spec §6 vibe). F-010 is the durable, observable, resumable execution layer for the whole generation pipeline (spec §6 conceptual workflow): a **DB-backed job/queue** (no Temporal by default — guide §5, D009/D010) that records step and per-page state, survives browser refresh and worker restarts, is idempotent at every unit of work, and maps busy internal steps to calm, emotional, product-facing progress labels. It is the spine F-008/F-009 (and later corrections/regenerations) attach to.

## 1. Goal

Make long-running, parallel, per-page generation **safe and legible**. The underlying jobs are backend infrastructure; the product-facing job is to (a) never lose a book's generation state, (b) isolate and repair failures per unit (D010), (c) communicate progress with warmth instead of a spinner, and (d) give every stage of the pipeline the restartable · idempotent · observable · retryable · resumable properties the guide §5 demands — while avoiding Temporal until a spike proves we need it.

## 2. User value

- **Confidence:** meaningful progress + per-page failure cards (product copy) replace the "did it break?" dread (spec §27 confidence in creation; guide §8).
- **Reliability as product:** refresh, navigation, reconnect or process crash never lose the parent's place (D010).
- **Effortless repair:** a single failed page is fixed with one tap, never by restarting the book (spec §25 recovery).
- **Repeat usage:** resuming an in-flight book feels safe enough to come back to later (spec §14 library/revisit).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). Design risks the spec itself must avoid:
- **Client-held generation state** (state lives in the browser → refresh destroys progress) → state lives in the DB, clients observe commits.
- **Whole-book restart on single failure** → per-unit (step/page) state machine with isolation (D010).
- **Duplicate execution** from retries/double-clicks → idempotency keys on every unit.
- **Worker crash leaving pages `GENERATING` forever** → lease/heartbeat expiry re-claims work (F-028).
- **Exposing internal event/progress noise** (queue names, step codes, model verbs) → all UX copy is product-facing (D002, guide §8).

## 5. Desired UX

Progress labels are the product-facing mirror of the pipeline. **Ava, 5**, "The Dino who Lost his Roar":

| Internal step (F-008/F-009) | Product label |
| --- | --- |
| Create/validate book · photos · Character Bible | **"Getting to know Ava…"** |
| Concepts → outline → page text (F-008) | **"Writing the adventure…"** |
| Illustration plans + image generation (F-009) | **"Painting the illustrations…"** |
| Assemble book · story QA · identity QA | **"Putting the book together…"** |
| Print/layout QA → ready | **"Final checks…"** |

Flow:
1. Parent commits the concept. Screen shows the label + a calm progress rail: five milestones; the active one shows a stageless pulsing element only beneath the *current* label (past milestones check-marked, future faded). No percentage wobble at step boundaries.
2. During **"Painting the illustrations…"** pages materialise as thumbnails in reading order (F-009 consumes this rail).
3. **Per-page failure** (any internal step): the page's card shows *"We had trouble creating page 12. The rest of the book is safe. [Try page 12 again]"* (exact wording from guide §8). Retry triggers a per-unit job; on success the card flips to ready; on repeated failure a gentler leaf-flips to the F-012 repair route.
4. **Whole-job failure** (e.g. boom at outline): *"We couldn't put Ava's story together just now. Your work is safe. [Try again]"* — retry resumes from the last completed milestone, never from zero.
5. **Browser refresh / close:** the Book record and job are safe; reopening the book returns to the same screen in the same state (resume, no loss). Reconnect mid-flight simply continues showing live state.
6. Success → **"Your book is ready to explore"** → single CTA to preview (F-011). The parent is never shown queue semantics, providers, seeds or prompts (D002).

States: PENDING (initial), RUNNING (label=active milestone), PARTIAL (some per-page failures, book still progressing), FAILED_STEP (blocking step failed), READY (→ F-011), all with empty-state only where a fresh book has no jobs yet ("Nothing is ready to show yet").

## 6. UI specification

- **Progress rail:** 5 milestone labels, vertical on phone (one-handed, D012), horizontal on desktop; ≤2 lines of copy under the active label (e.g. "Writing the adventure" + "Ava's story is taking shape."). Motion: soft, no neon, no confetti (calm/warm per guide §8).
- **Per-page cards:** page-number chip + thumbnail (once available) + status badge in product words — `ready` = ✓, `generating` = subtle pulse, `failed` = warm red-soft card + retry button, `revision` = "being fixed" animation.
- **Retry buttons:** only the cold-failed units expose retry; no "retry all" that could double-spend (image budget, F-009).
- **Error copy:** always the §5 product strings; a five-second auto-dismiss-less; errors are persistent until resolved — never transient toasts that vanish with the reason.
- **Polling/subscription:** client polls a lightweight status endpoint or long-polls (SSE optional; revisit with F-028 spike). On disconnect, show "Reconnecting…" chip but keep last-known state on screen.

## 7. Domain model

```
GenerationJob
  id, bookId
  kind                    // FULL_BOOK | PAGE_TEXT | ILLUSTRATION | CONCEPT | REVISION
  status                  // PENDING | RUNNING | PARTIAL | FAILED | COMPLETED | CANCELLED
  currentStep             // step enum, see below
  createdAt, updatedAt, heartbeatAt
  priority                // for queue order
  budgetContext           // linked per-unit attempt budgets (e.g. image attempts)

JobStep                     // one row per meaningful stage (guide §5 workflow)
  jobId, stepKey,          // e.g. "outline", "pageText:6", "illustration:6", "qa:identity"
  stepType,                // BULK | PER_PAGE | GATE
  status                   // PENDING | GENERATING | READY | FAILED | SKIPPED
  idempotencyKey,          // unique: deterministic per unit-of-work
  retries, leaseUntil, startedAt, finishedAt, metadata{}  // { model, costCents, attemptCount }

BookUnitState               // per-page truth, shared across jobs (D010 isolation)
  bookId, unitType         // PAGE
  unitId                  // pageNumber
  textStatus, imageStatus  // PENDING | GENERATING | READY | FAILED | REVISION_REQUIRED
  derivedUnitStatus        // worst-of(textStatus, imageStatus)
```

The canonical lifecycle (guide §4) holds the Book: this layer mirrors it — `DRAFT → PREPARING → GENERATING → READY_FOR_REVIEW` transitions are emitted by the job (e.g. after F-008 `STORY_GENERATED`, after F-009 all pages `READY`, after F-015 QA `BOOK_READY_FOR_REVIEW`). Exceptional state `GENERATION_FAILED` = whole-job terminal failure; `CANCELLED` on explicit parent reset.

## 8. Backend/API requirements

- `POST /books/{id}/jobs/generate` → idempotent enqueue of a `FULL_BOOK` job (no-op returning existing job + state when a live one exists).
- `GET /books/{id}/jobs/current` → { label milestone, step, per-page statuses, failed cards } — the sole UI source (no separate dingbat endpoints on the progress screen).
- `POST /books/{id}/units/page/{n}/retry` → enqueue a per-unit retry job; deduped by the unit's idempotency key + nonce; scoped to the owner session.
- `POST /books/{id}/jobs/resume` → after a crash, workers use this to re-claim `PENDING`/expired-lease units without double fire.
- Events (guide §5 list, emitted as the DB records transition): `BOOK_CREATED · CHARACTER_CREATED · CONCEPT_SELECTED · STORY_GENERATION_STARTED · STORY_GENERATED · ILLUSTRATION_GENERATION_STARTED · PAGE_RENDERED · QA_COMPLETED · BOOK_READY_FOR_REVIEW · PAGE_REVISION_CREATED` (introspective list only for this feature's own state; others arrive at later pipeline stages).
- Validation: retries require `unitStatus ∈ {FAILED, REVISION_REQUIRED}` (no double-running READY units); budget checks against `budgetContext`; ownership via session claim (F-001).

## 9. Background jobs

Queue substrate: two candidate classes, selected after the D014 spike — a **PostgreSQL-backed queue** (purpose-built pg job table) as the default candidate, or a **Redis-backed queue** (BullMQ-class). Prefer the simplest durable option; Temporal is considered only if the spike shows its guarantees are needed. In every case job + per-unit state must stay consistent with the Book in the same database (single transaction on every commit); a Redis-backed class additionally requires an outbox/reconciliation bridge. Requirements the spike must satisfy:
- Durability: job + per-unit state in the same DB as the Book (single transaction on every commit).
- Restart safety: on worker boot, re-claim units whose `leaseUntil` expired or whose process heartbeat is stale; crashed work returns to `PENDING` and re-runs against idempotency keys (guide §5: "worker restart must not lose book state", D010).
- Idempotency: every unit keyed (e.g. `pageKey`, `planKey`); consumers no-op if the key already produced `READY` output at the same versions.
- Retry: exponential backoff, jitter, per-unit `retries` cap; DLQ + admin view (F-026).
- Timeouts: per-step (outline 45s, page text 45s, image 120s); lease 2x the timeout.
- Cancellation: superseded jobs (book regenerate, page replace) become `CANCELLED`/`SKIPPED`; no image spend on skipped units.
- Concurrency: `N` workers bounded per stage (image stage concurrency low — cost + provider rate limits); no global serialisation beyond ordered bulk steps (outline → pages).

## 10. AI behaviour

Not directly applicable to *generation* — this feature specifies how the pipeline is **orchestrated and observed**, not how prompts are built. It owns the plumbing that moves work between `StoryModel`/`IllustrationModel`/`QualityModel` calls and the canonical model, enforces idempotency around those calls, and records `generationMetadata` (attempt count, cost, descriptors) as the audit trail for F-027. No model/prompt/seed vocabulary ever reaches this feature's UI (D002).

## 11. QA

- State-machine integrity: each unit transitions through valid states only; derived `BookUnitState` never reports `READY` while a sub-status is `FAILED`.
- Failure stickiness: a `FAILED` unit stays failed until an explicit retry/repair — the parent cannot paint over it accidentally.
- Partial-completion correctness: a job may be `PARTIAL` (F-008 text all `READY`, F-009 one page failing) yet the book remains resumable and consumable as a live preview (F-011 renders `READY` pages).
- Budget/duplicate guards tested (see §14).
- Crash-recovery test: kill a worker mid-page; next boot re-claims and finishes without duplicating or corrupting (F-028).

## 12. Privacy/security

The job layer stores **no photos and no personal values** — `metadata{}` keeps field-name lists, ids, latency, cost, attempt counts only (applies §7 trace: nothing beyond book/unit context in job rows; no prompts cached beyond what F-008/F-009 already persist as canonical structured inputs). Job data retention aligns with the Book's retention window (F-025); no image data in queue payloads (assets are referenced by id, never embedded). Endpoints scoped to session-owned books; retry/resume require ownership.

## 13. Analytics

Events (no sensitive payloads): `generation_job_started`, `generation_step_completed` (stepType, durationMs), `generation_page_failed` (unitType, stage bucket), `generation_page_retried`, `generation_job_resumed` (crash-recovery flag), `generation_job_completed` (durationMs, totalCostCents, pages), `generation_budget_exhausted`.

## 14. Acceptance criteria

Given/When/Then, testable:

- **Refresh safety (D010):** Given a `FULL_BOOK` job mid-running at "Painting the illustrations…", when the parent refreshes and reopens the Book, then the screen resumes at the exact same milestone and per-page states with no re-kick of completed units (verified by idempotency-key log — no duplicate outline/page rows).
- **Worker crash recovery:** Given a worker killed during page 7's image call, when the replacement worker boots, then unit 7's expired lease is re-claimed, re-runs with the same `planKey`, and produces one asset (no orphan, no double-charge).
- **Per-page failure isolation:** Given page 12 `FAILED`, when `POST …/units/page/12/retry` runs, then only unit 12 transitions (`PENDING→GENERATING→READY`); pages 1–11, 13–N never leave `READY`; the retry endpoint rejects a call on a `READY` unit (422).
- **Whole-job failure recovery:** Given an outline-step failure, when the parent taps "Try again", then the job resumes from the last completed milestone (CANCELLED/FULL_BOOK restart) and does not re-run earlier `READY` stages.
- **Double-click idempotency:** Given two identical retry requests in quick succession, when both reach the queue, then exactly one unit job executes (second deduped by idempotency key).
- **Product-facing copy only:** Given any internal failure, when the progress UI renders, then no raw error class, queue name, model name, seed, or provider token appears anywhere on screen (verified by a string-search fixture against a forbidden-strings list).
- **Label integrity:** Given a job in the page-text step, when the UI polls, then the rail shows "Writing the adventure…" as active and each milestone maps to the §5 table.

## 15. Dependencies

- **Required first:** F-008/F-009 to have real units to orchestrate; F-028 durability/concurrency patterns (lease, retry policy) to finalise the queue spike; canonical Book lifecycle (guide §4) shape.
- **Consumed by:** F-011 (preview readiness gate), F-012 (retry/repair hooks), F-016 (approval only from `READY_FOR_REVIEW`), F-027 (observability feed).
- **Parallel-safe:** the queue spike and F-028 policy draft can start immediately against a stub unit.

## 16. Priority

**P0 — launch-critical durability core.** Generation reliability and repair are in the "reason to exist" set (spec §26; D010 "reliability is product functionality") and the P0 surfaces (preview, approval) depend on the durable job spine; an unreliable generate step is a launch blocker. The *incremental* build order still keeps the P0 spine first (F-008/F-009 with a stub queue) and hardens to this spec before launch. Priority rationale per the product filter: **fewer reliability/support problems + more confidence** (mission §33 filter, spec §27).
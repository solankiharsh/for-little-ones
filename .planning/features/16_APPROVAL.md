# 16_APPROVAL.md — Approve & Print

> **Spec ID:** F-016 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-015 Book QA, F-010 Generation Progress, F-011 Book Preview, F-017 Print Renderer (availability + spec), F-013/F-012/F-014 corrections (edit window closes here)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Approval is the single, unmistakable moment where the parent locks the book for production: one CTA, **Approve & Print** (spec §17 — the only obvious purchase-state, not multiple ambiguous ones). Approving commits an **immutable snapshot** of the canonical `Book` plus the chosen `printSpec` into a new `ApprovedBookRevision`; from that instant nothing can silently regenerate or reflow the book (D011). Every later subsystem — order, print, fulfilment, tracking, refund — references this revision, never a live book (guide §2, §3 Order → OrderItem → ApprovedBookRevision → PrintArtifact; D011).

## 1. Goal

The category's worst trust failures happen *after* payment: Magic Moon's FAQ candidly says production is locked after payment and changes can't be made (spec §2). We must invert that anxiety: the parent holds the lock. Approval makes the pre-print contract explicit — this exact revision, this format, this quantity, this price, this delivery range — and makes the production lock dazzlingly clear before checkout (spec §17, §25 "nothing should go to print before the user understands exactly what is being ordered"). It is the gate that makes D011 (approval before printing) a product experience, not a footnote.

## 2. User value

- **Confidence in print (spec §27):** the parent is told precisely what will be printed and when the window to change it closes.
- **Trust / support reduction (spec §24):** "I approved page 20 but got a different drawing" becomes impossible to claim *and* impossible to happen, because regeneration after approval is structurally blocked.
- **Effortless final step:** a single decision — no multiple purchase states, no buried options (spec §17).

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

Proposed subsystems: `BookService` (approveBook command), `BookRepository` (revision freeze), `GenerationJob` (all work must settle before approval), `QualityModel` (approval gate, F-015). Print availability/format/cost come from F-017's `PrintProvider` quotes.

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Live-book references (D011):** any order referencing the mutable book instead of the frozen revision reopens silent-regeneration risk at fulfilment time.
- **Silent mutation of the snapshot:** the approved revision must be deep-immutable — asset refs, text, layout, printSpec all frozen; copy-on-write with no write path after `APPROVED`.
- **Ambiguous CTAs (spec §17):** one primary action only; format/quantity/cost surfaced as *information* on the same screen, not as competing actions.
- **Approval-vs-checkout confusion:** approval is a content lock; payment is a separate step (F-018) with its own failure paths. The parent must know which is which — if payment fails, the approval is not lost and nothing prints.
- **Nonblocking QA:** approval must fail closed if QA is missing/`UNKNOWN` (F-015 §8).

## 5. Desired UX

Emma has corrected three pages, QA shows all clear, and the book is `READY_FOR_APPROVAL`. Top-right in preview (F-011) the single CTA reads **Approve & Print**, amber-haloed but calm.

1. **Tap Approve & Print → approval review screen:**
   - Left: a final reading of the book (F-011 embedded; last chance to flip every page — a "Reprint preview" link back).
   - Right (card, "What we'll print"): cover thumbnail · format selector **Paperback** / **Hardcover** (radio, both pre-validated by F-017 for this revision's page count and printSpec) · quantity stepper (1–5, gift multiples) · price + shipping estimate · **estimated delivery range** (computed from the F-017 quote, shown *before* payment per spec §16).
   - A clear statement in the parent's copy: "From here we print **exactly this version**. After you approve, this book can't be changed — if you spot something, cancel approval and we'll fix it first."
2. **Tap the confirm button** → inline progress "We're saving your approved book…". Small delay only; result:
   - Success: the book state flips to `APPROVED`, a "Saved — what happens next" screen shows the approved snapshot summary (book title, format, quantity, delivery estimate, order status once placed via F-018) and a single CTA **Proceed to payment** → F-018. Also available: "Back to my book" (read-only; edit chrome gone).
   - Failure saving: warm card "We couldn't save your approval. Your book is exactly as you left it — nothing printed yet." with **Try again** (idempotent) and **Go back to my book**. No partial states, no double-approval (idempotency in §8).
3. **After approval, editing surfaces close:** "Something wrong?" (F-012), editor (F-014) and corrections reveal the same message: "This book is approved. To change it, cancel approval first." — the only path back is **Cancel approval** (below).
4. Emma realises she wants a tweak anyway (pre-payment): the approval review screen offers **Cancel approval** (quiet, under "Change something?"). Cancelling deep-frees the revision back to `READY_FOR_REVIEW`, restores edit chrome, and clearly re-states "You'll need to approve again before printing."

## 6. UI specification

- **Primary CTA:** only one on the journey — **Approve & Print**. In preview (F-011) when the book is gated-ready; identical label on the approval screen confirm. No "Buy now", no "Checkout" on this screen (spec §17).
- **Confirmation discipline:** the confirm button performs a *commit*, not a navigation — it shows inline progress and only then navigates on success.
- **Format/quantity selectors** are radio + stepper with live price/delivery recalculations; each format validates against the revision (hardcover page-count/spine limits, F-017) — an unusable format is disabled with a short reason, not error text.
- **"What we'll print" summary** always shows: title, cover thumb, name on cover, format, quantity, unit + total, shipping, delivery range, and a line "Approved for print on {date}". Everything in product language.
- **Reassurance copy block** sits directly under the confirm CTA (spec §17 "make the production lock extremely clear"): one sentence + a "More about what happens after approval" disclosure that opens the printing/steps summary (no legalese; truthfully describes F-017/F-019 pipeline).
- **Pre-payment change path:** "Want to change something?" → quiet **Cancel approval**; confirm dialog "This will unlock your book for edits. Nothing has been printed." (true whenever payment isn't yet captured into production).
- **Mobile (D012):** the approval screen is one column: book → summary card → sticky bottom CTA; estimate from the start; no side-by-side.
- **Post-order, the approved revision is pristine:** view-only re-flow (F-011), and even "Cancel approval" is removed once `ORDERED` — cancellation moves to F-019/fulfilment territory (see §9).
- Accessibility: CTA contrast ≥ AA, focus order keyboard-complete, failure region `aria-live`.

## 7. Domain model

```text
ApprovedBookRevision (immutable snapshot; guide §3 Object model)
├── approvalId, createdAt (UTC)
├── bookId, revisionSeq (the frozen canonical revision)
├── frozen payload: metadata, childProfiles refs, characters, story,
│   pages[] (textBlocks, illustration refs, layout, decorativeElements),
│   printSpec (format, dimensions, bleed, paper, cover, binding, colour profile,
│              min/max pages, resolution, provider metadata)
├── assetManifestRef (all assets + checksums; the print renderer's input contract)
├── qaRunRef (the passing F-015 run; approval gate evidence)
├── quoteRef (F-017 PrintProvider quote at time of approval)
└── status: APPROVED | CANCELLED | ORDERED (once F-018 creates an order)
```

- The **immutability guarantee** is the `assetManifestRef` + frozen payload: F-017 renders from this snapshot or fails a checksum — it cannot render from a live page.
- `approval.status` transitions only `APPROVED → ORDERED` (via F-018) or `APPROVED → CANCELLED` (parent, pre-payment); no other writes. `CANCELLED` rows are audit-history only; a new approval is a new snapshot with a new approvalId, never a mutation.
- The earlier guide states form §4: `READY_FOR_APPROVAL → APPROVED → ORDERED → IN_PRODUCTION → SHIPPED → DELIVERED`; exceptional `RENDER_FAILED`, `PAYMENT_FAILED`, `FULFILMENT_FAILED`, `CANCELLED` all reference the approvalId for traceability (guide §4).

## 8. Backend/API requirements

- `POST /books/{id}/approval` — the only approval command. Body: `{format, quantity}`. Validation: book state == `READY_FOR_APPROVAL`; no open `GENERATING`/`FAILED` pages or jobs (F-010 must report settled); latest QA run for the revision has **no BLOCKING** results (F-015) — else 409 with the blocking list; format+quantity producible per F-017 quote — else 409 with the disabled-format reason; session owns the book; anonymous session may approve only after claiming (F-001).
- **Idempotency:** `approvalIdempotencyKey` — re-POST after a network failure returns the same approved revision, does not double-approve.
- `GET /books/{id}/approval` — current approval or `pending` with the create-one view (quote, estimate, QA summary).
- `DELETE /books/{id}/approval` — **cancel**, only while `status == APPROVED` and no order references it; returns the book to `READY_FOR_REVIEW` preserving all page revisions (nothing is rolled back — the parent's corrections stay; only the freeze lifts). After `ORDERED` this returns 409 (routed to F-019).
- `POST /books/{id}/approval/declare-order` (F-018 internal) — flips `APPROVED → ORDERED` with the created orderId; called only by the commerce layer after payment intent.
- All approval reads/writes go through `BookService`; `BookRepository` enforces no-write-after-freeze at the store level (defence in depth: even a buggy caller cannot alter an approved revision).
- No approval is possible without a passing, revision-scoped F-015 run (fail-closed: `UNKNOWN` QA = not approvable).

## 9. Background jobs

- Approval itself is fast/atomic (snapshot write). The heavy lifts it *frees* are downstream: F-017 `generate-print-artifact` (triggered on `APPROVED` or at `ORDERED`, decided in F-017 — approved by default) and F-019 fulfilment submission — both consume the frozen revision only.
- If the print artifact job fails after approval but before order: book stays `APPROVED`; F-017 retries/resumes; the parent UI shows "Preparing your approved book for printing…" — parent is not asked to re-approve.
- Order-created after approval is cancelled (payment failed, F-018): approval is **preserved** (it is not lossless to revoke a committed snapshot); the parent sees "Payment didn't complete — your approved book is safe and you can try again." F-018's unique concern.

## 10. AI behaviour

None at approval — and enforce that: approval triggers **zero** model calls. No re-generation, no re-inference (D011 "no silent regeneration"). The only tolerable background work is deterministic print assembly (F-017). Any model call in the approval path is a bug.

## 11. QA

Approval is the consumer gate for F-015: it is not approvable while any BLOCKING result exists or any required run is missing/`UNKNOWN`. (A parent overrode a *content*-advisory item earlier in F-015 §6 — approval still requires all BLOCKING to be resolved or explicitly overridden-and-recorded; print-geometry BLOCKING is never overridable, F-015 §6.) The frozen snapshot's `qaRunRef` is re-run **once** against the frozen revision (same inputs → same result by determinism; a pass is required before `ORDERED`).

## 12. Privacy/security

- The approved snapshot is full book content incl. child likenesses and names — PII-tier; stored under the same access control and retention/deletion as the book (F-025), and additionally for the full order-retention window the business needs for fulfilment/reprints (documented in F-025; consumer-facing retention guarantees per spec §18).
- Approval writes are signed/audited (approvalId, actor, timestamp); cancellation audit-trailed for support (F-026).
- No analytics on snapshot content.

## 13. Analytics

`book_approval_started` (format, quantity) · `book_approval_completed` (approvalId anonymised, format, quantity, deliveryRangeDays) · `book_approval_cancelled` (reasonClass: change|wants_review) · `approval_blocked_by_qa` (blockingCheckIds — nudges QAtuning). No page images, no names, no refs.

## 14. Acceptance criteria

1. Given a book in `READY_FOR_APPROVAL` with QA fully passing, when the parent taps **Approve & Print** and confirms, then a deep-immutable `ApprovedBookRevision` with assetManifest + printSpec + quote is created, the book enters `APPROVED`, the CTA is replaced by "Proceed to payment" (F-018), and every editing surface (F-012 sheet, F-014 editor) refuses changes with the approval-lock message.
2. Given a book with a BLOCKING QA item, when the parent taps Approve & Print, then the API returns 409 with the blocking list and the UI shows the friendly per-page cards routed to F-012; no snapshot is created.
3. Given the approval request retried with the same `idempotencyKey` after a network failure, then exactly one revision is created and the second call returns the same approvalId (no double-approval).
4. Given a parent who cancels approval before payment, then the freeze lifts to `READY_FOR_REVIEW`, all correction history is preserved, and re-approving creates a new snapshot (old `CANCELLED` revision remains audit-only).
5. Given an approved book, when any code path attempts to regenerate or edit a page, then the store rejects the write (write-after-freeze guard) and a monitoring alert fires (F-027); the approved revision's checksums never change.
6. Given a print-artifact failure after approval but before order, when F-017 exhausts retries, then the book remains `APPROVED` (never silently reverting to review), ops sees the failure (F-026), and the parent sees the calm "Preparing…" state — never a request to re-approve.
7. Given `ORDERED` status, when the parent attempts cancellation, then approval cancellation is refused (409) and the path routes to F-019/fulfilment, keeping the immutable revision safe.

## 15. Dependencies

- Must exist first: F-015 (approval gate), F-010 (job settle check), F-011 (CTA surface), F-017 (format feasibility, quote, delivery estimate — the review card's numbers), F-012/F-013/F-014 (edit window that closes on approval). F-018 consumes the snapshot (line item = ApprovedBookRevision); F-019 obtains print instructions from it.
- Track order: approval lands after corrections+QA; print/checkout consume it; family library (F-021) reads it for the digital copy.
- Decision needed: whether the F-017 print artifact generates at `APPROVED` (pre-payment) or `ORDERED` (post-payment) — cost/latency tradeoff is F-017's input, but approval events decide it; recommend generate-at-`APPROVED` so checkout is instant.

## 16. Priority

**P0 — category parity + safety.** "Approval before printing" is explicitly a reason-to-exist item but also launch-critical: every competitor's post-payment lockout becomes a trust risk that only a pre-print approval step neutralises (spec §17, §25 checkout principle). It is also the load-bearing wall for D011 — without it, pressures at fulfilment time can silently resurrect the exact generation→spinner→surprise problems the product exists to avoid. Hence P0 even though approval itself is simple: it is cheap and protects everything else.
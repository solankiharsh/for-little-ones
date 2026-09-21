# 15_BOOK_QA.md — Pre-Print QA Suite

> **Spec ID:** F-015 · **Priority:** P0 (QA core) · **Status:** draft
> **Depends on:** F-009 Illustration Generation, F-011 Book Preview, shared PrintSpec/PrintPreflightContract (D016), F-005 Character Bible
> **Severity vocabulary (D016 / guide §3):** `HARD_BLOCK` — cannot be waved; fix, or explicit recorded content override (print-geometry HARD_BLOCK is never overridable). `REVIEW_REQUIRED` — must be reviewed/recorded before approval. `ADVISORY` — informational, non-gating.
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The QA suite catches generation and edit failures **before the parent or the printer sees them** (spec §10 — identity consistency as a product requirement; §25 quality bar). It is a re-runnable, severity-ranked set of checks over the canonical `Book` (plus its assets) exposed through the proposed `QualityModel` interface, executed at defined lifecycle points and surfacing `HARD_BLOCK` / `REVIEW_REQUIRED` / `ADVISORY` results to the parent (in product language) and to ops (precise, for F-026).

## 1. Goal

Competitors' worst recurring complaints — likeness drift, swapped identities, wrong names/pronouns, repeated content, broken images, printing rejects — should be structurally prevented (spec §24's question: "prevent, not just support after"). QA is the automated gate that makes "the customer should ideally never need to discover obvious generation failures manually" (spec §10) true.

## 2. User value

- **Confidence in print:** every HARD_BLOCK check passing before approval means the parent is not browsing for defects in a 41-page book.
- **Fewer support problems (spec §24):** print-rejected files, "pages duplicated", "name misspelled" complaints are caught before payment.
- **Trust:** the parent sees "we checked your whole book" as a concrete, warm confirmation — not a privacy concern to doubt.

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

Proposed subsystem: `QualityModel` (provider interface for content QA) consumed by `BookService`/`GenerationJob`; print-geometry inputs come from F-017's `printSpec`.

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Silent gates:** checks running invisibly erode trust; results must surface.
- **Model-dependent flakiness:** identity/likeness checks use a model — they must be probabilistic with a threshold, re-runnable, and non-blocking unless a *hard* mismatch (see catalogue) tripps.
- **False positives scaring parents:** severity classification must keep ADVISORY noise away from the approval gate (REVIEW_REQUIRED items surface only when a real decision exists).
- **Running on live mutable state:** QA results must be tied to a specific revision, not a moving book.

## 5. Desired UX

After generation completes, Emma sees a soft confirmation in preview: "We checked Ava's book — 41 pages, all good." If something needs a look: "We found 2 things worth a quick look" opening a summary card (HARD_BLOCK items enumerated by page; REVIEW_REQUIRED items listed for her decision; ADVISORY items tucked away). The repeated-illustration item (REVIEW_REQUIRED) lets her choose: "This drawing appears twice — want us to try another? [Try another] [Keep anyway]" — routed through F-012, never leaving QA bare error text. A HARD_BLOCK (e.g. a page that doesn't resemble Ava) shows only a fix path — no "keep anyway" unless print-geometry rules allow an explicit recorded override. Ops (F-026) sees every item with check name, page, revision, severity, and asset refs for triage.

## 6. UI specification

- **Summary state chip** near the top bar of preview (F-011): green "All checked", amber "A few things to look at", red `QA` block with count (HARD_BLOCK items enumerated with page thumbnails; REVIEW_REQUIRED items listed).
- **Per-page badges** on the rail/page: small alert dot; tapping opens the same friendly card with "Try another" (F-012) or "Not a problem — keep anyway" for REVIEW_REQUIRED/ADVISORY-only items.
- **Severity discipline (guide §3):** `HARD_BLOCK` items have no dismiss without an action — either fix (via F-012) or, for *content-level* HARD_BLOCK only, an explicit "I'm happy with this" confirmation that records the decision; **print-geometry HARD_BLOCK (text overflow, resolution, safe area, bleed, missing assets) has no override** — enforced at F-016/F-017 by the printer rules regardless of parent intent. `REVIEW_REQUIRED` items must be explicitly reviewed (fixed or "keep") before approval, but never auto-block it. `ADVISORY` items are informational.
- All copy product-facing; never "QA failed", never error codes (D002, guide §8).
- Mobile: badges render as a "checks" icon with count; full list in a bottom sheet (D012).

## 7. Domain model

```text
QualityCheck (defined catalogue entry)
├── id, severity (HARD_BLOCK | REVIEW_REQUIRED | ADVISORY), scope (BOOK | PAGE), stage trigger

CheckResult (stored per run — tied to a revision)
├── runId, bookRevisionSeq, pageId?, checkId
├── severity, status (PASS | FAIL | SKIPPED | UNKNOWN)
├── detail {field, refs[], expected, actual}
└── suggestedAction (intent or confirm)

QARun
└── runId, revisionSeq, stage, startedAt, finishedAt, results[], summary
```

Check catalogue (title — what it inspects, severity when FAIL):

| Check | Inspects | Severity when FAIL |
| --- | --- | --- |
| Identity consistency | page likeness vs `CharacterBible` (per character) | HARD_BLOCK |
| Wrong child count | children in illustrations vs `childProfiles` | HARD_BLOCK |
| Name mismatch | name strings in text vs child profile (including spelling) | HARD_BLOCK |
| Pronoun mismatch | pronouns vs profile pronouns | HARD_BLOCK |
| Story contradiction | fact conflict between text blocks (immutable-facts block) | HARD_BLOCK |
| Duplicate paragraph | repeated normalized paragraphs across pages | HARD_BLOCK |
| Duplicate page | identical page content while content differs elsewhere | HARD_BLOCK |
| Text overflow | text extent vs print-safe box (PrintSpec/PreflightContract geometry) | HARD_BLOCK (print-geometry, non-overridable) |
| Resolution | illustration PPI vs print DPI floor (PrintSpec/PreflightContract) | HARD_BLOCK (print-geometry, non-overridable) |
| Print safe area | illustration/decoration vs safe + bleed margins | HARD_BLOCK (print-geometry, non-overridable) |
| Layout overflow | element outside canvas / cover bleed | ADVISORY |
| Missing assets | page references an absent/un-openable asset | HARD_BLOCK |
| Repeated illustration | same asset appears with different intent | REVIEW_REQUIRED (parent decides "Try another" or keeps) |
| Generation artifacts | obvious hands/fingers/limb duplication (model-assisted) | ADVISORY |

## 8. Backend/API requirements

- `POST /books/{id}/qa/run` — triggers a full run; body the revision to check; returns runId (re-runnable; idempotent per revision via runKey).
- `GET /books/{id}/qa/runs/{runId}` — results for the parent (product-shaped) and for ops (`?view=ops` adds refs, model scores, stage).
- `GET /books/{id}/qa/latest` — latest run for the revision, used by F-016 approval gating and F-011 badges.
- Approval gate: F-016 reads `latest` run — any HARD_BLOCK result prevents `APPROVED`; every REVIEW_REQUIRED item must be reviewed/recorded (fixed, or an explicit parent decision logged). ADVISORY items never gate approval.
- Permissions: book owner + ops/support (F-026); results carry no external payloads.

## 9. Background jobs

- Run as part of `GenerationJob` completion (F-010): after `PAGE_RENDERED` per book, after `PAGE_REVISION_CREATED` (page-scoped, F-012), before `BOOK_READY_FOR_REVIEW`, and re-run scoped to changed pages before F-016 approval. Uses the DB-backed queue; retry 3×; resumable; cancelled if the target revision is superseded mid-run.
- Failure of a QA job = `UNKNOWN` (never silently PASS); a revision with `UNKNOWN` checks cannot be approved (fails closed).

## 10. AI behaviour

- `QualityModel` interface (proposed): `run(context: {bookRevision, scope, pageScope?, characterBible, printSpec, locale}) → CheckResult[]`; deterministic check **policies** (exact strings, geometry, count, asset existence) run first and are binary; model-assisted checks (likeness, artifacts, contradiction) run second and return a confidence score vs threshold.
- Identity likeness uses `IdentityReferenceModel` embeddings of the `CharacterBible` vs page illustration — threshold set by the calibration methodology (F-009 §10); below-threshold = FAIL (HARD_BLOCK), near-threshold = REVIEW_REQUIRED.
- No provider prompt/seed surfaces; structured output only. Facts are immutable — contradiction checks reference the facts block, never let the model "decide" a fact changed.

## 11. QA

The suite is itself the QA feature: checks are deterministic where possible, probabilistic where necessary, always scoped to a revision, always re-runnable (`runKey = revisionSeq + stage + scope`), with result history for F-026 and F-028 failure forensics.

## 12. Privacy/security

- Likeness scoring uses the source photos' embeddings and generated likenesses — PII-tier; results stored under the same retention/deletion as the book (F-025). No external provider receives raw photos; if a likeness model is external, it is a documented provider under §7 invariants (photos trace: browser → API → storage → model provider → output → deletion).
- QA results never include raw images in analytics; alert payloads carry refs only, ops view restricted to staff.

## 13. Analytics

`qa_run_completed` (stage, blockingCount, advisoryCount, durationMs) · `qa_blocked_approval` (checkId) · `qa_item_resolved` (checkId, via: correction | override). No photos, no refs.

## 14. Acceptance criteria

1. Given a book with a face that drifts from the `CharacterBible`, when the full QA run executes, then identity-consistency check FAILs at HARD_BLOCK and F-016 refuses approval until it is fixed (or, for a content-level identity matter, explicitly recorded as overridden — never silently waived).
2. Given a `SHORTER` text correction (F-012) on page 12, when the page's QA scoped run executes, then only page 12 + its two adjacent pages are rechecked; the rest of the run's prior PASS results for other pages remain valid for that revision.
3. Given a print-geometry violation (text outside safe area via F-014 edit), when QA runs, then the edit is refused at save (F-014 blocks it) and the run still marks it HARD_BLOCK (print-geometry) non-overridable.
4. Given a mid-run revision supersession, when a newer revision lands, then the in-flight run is cancelled and its results are never published as "latest" (fails closed to `UNKNOWN` for approval).
5. Given a QA job process crash, when the worker restarts, then the run resumes from its checkpoint or re-runs from the same revision — no book state is lost and review state is unchanged (D010).
6. Given all checks PASS for the revision, when the parent reaches approval (F-016), then approval is unblocked and the run summary shows "All checked" in the preview chip.

## 15. Dependencies

- Must exist first: F-009 (assets + likeness refs), F-005 (Character Bible), the shared PrintSpec/PrintPreflightContract (D016 — safe-area/DPI/bleed geometry; implemented by F-017 in M4, but QA consumes the contract, not the renderer), F-010 (jobs, revision-level triggers).
- Feeds: F-016 (approval gate), F-011 (badges), F-012 (suggestedAction routing), F-013 (character-wide fix suggestions), F-017 (print-geometry preflight re-run on approved revision).

## 16. Priority

**P0 — launch-critical QA core.** "Reliable cross-page character identity", "approval-before-print" and the quality bar (spec §25) are reason-to-exist items, and QA is the enforcement layer that makes them safe to promise. Because approval (F-016) fails closed on HARD_BLOCK, the QA core must ship before launch — a book without reliable QA is an approval/print trust risk, which is a launch blocker, hence P0 rather than P1. The full per-revision/print-geometry surface still rides the milestone plan (core in M2, full in M4).
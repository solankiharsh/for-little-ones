# 15_BOOK_QA.md — Pre-Print QA Suite

> **Spec ID:** F-015 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-009 Illustration Generation, F-011 Book Preview, F-017 Print Renderer (print-safe geometry), F-005 Character Bible
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The QA suite catches generation and edit failures **before the parent or the printer sees them** (spec §10 — identity consistency as a product requirement; §25 quality bar). It is a re-runnable, severity-ranked set of checks over the canonical `Book` (plus its assets) exposed through the proposed `QualityModel` interface, executed at defined lifecycle points and surfacing blocking vs advisory results to the parent (in product language) and to ops (precise, for F-026).

## 1. Goal

Competitors' worst recurring complaints — likeness drift, swapped identities, wrong names/pronouns, repeated content, broken images, printing rejects — should be structurally prevented (spec §24's question: "prevent, not just support after"). QA is the automated gate that makes "the customer should ideally never need to discover obvious generation failures manually" (spec §10) true.

## 2. User value

- **Confidence in print:** every blocking check passing before approval means the parent is not browsing for defects in a 41-page book.
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
- **False positives scaring parents:** severity classification must keep advisory noise away from approval-blocking.
- **Running on live mutable state:** QA results must be tied to a specific revision, not a moving book.

## 5. Desired UX

After generation completes, Emma sees a soft confirmation in preview: "We checked Ava's book — 41 pages, all good." If something tripped: "We found 2 things worth a quick look" opening a summary card. For the only blocking item she cannot dismiss (repeated illustration), the page shows the friendly "This drawing appears twice — want us to try another? [Try another] [Keep anyway]" — routed through F-012, never leaving QA bare error text. Ops (F-026) sees every item with check name, page, revision, severity, and asset refs for triage.

## 6. UI specification

- **Summary state chip** near the top bar of preview (F-011): green "All checked", amber "A few things to look at", red `QA` block with count (advisory items listed, blocking items enumerated with page thumbnails).
- **Per-page badges** on the rail/page: small alert dot; tapping opens the same friendly card with "Try another" (F-012) or "Not a problem — keep anyway" for advisory-only items.
- Blocking items have no dismiss without an action: either fix (via F-012) or (blocking *content* ones only) an explicit "I'm happy with this" confirmation that records the decision; **print-safety blocking checks (geometry/DPI/bleed) have no override** — they are enforced at F-016/F-017 by the printer rules regardless of parent intent.
- All copy product-facing; never "QA failed", never error codes (D002, guide §8).
- Mobile: badges render as a "checks" icon with count; full list in a bottom sheet (D012).

## 7. Domain model

```text
QualityCheck (defined catalogue entry)
├── id, severity (BLOCKING | ADVISORY), scope (BOOK | PAGE), stage trigger

CheckResult (stored per run — tied to a revision)
├── runId, bookRevisionSeq, pageId?, checkId
├── severity, status (PASS | FAIL | SKIPPED|UNKNOWN)
├── detail {field, refs[], expected, actual}
└── suggestedAction (intent or confirm)

QARun
└── runId, revisionSeq, stage, startedAt, finishedAt, results[], summary
```

Check catalogue (title — what it inspects, fed by):

| Check | Inspects | Severity when FAIL |
| --- | --- | --- |
| Identity consistency | page likeness vs `CharacterBible` (per character) | BLOCKING |
| Wrong child count | children in illustrations vs `childProfiles` | BLOCKING |
| Name mismatch | name strings in text vs child profile (including spelling) | BLOCKING |
| Pronoun mismatch | pronouns vs profile pronouns | BLOCKING |
| Story contradiction | fact conflict between text blocks (immutable-facts block) | BLOCKING |
| Duplicate paragraph | repeated normalized paragraphs across pages | BLOCKING |
| Duplicate page | identical page content while content differs elsewhere | BLOCKING |
| Text overflow | text extent vs print-safe box (F-017 geometry) | BLOCKING (print-geometry, non-overridable) |
| Resolution | illustration PPI vs print DPI requirement (F-017) | BLOCKING (print-geometry) |
| Print safe area | illustration/decoration vs safe + bleed margins | BLOCKING (print-geometry) |
| Layout overflow | element outside canvas / cover bleed | ADVISORY |
| Missing assets | page references an absent/un-openable asset | BLOCKING |
| Repeated illustration | same asset appears with different intent | ADVISORY (parent-aiable); BLOCKING when detected with a "Try another" path |
| Generation artifacts | obvious hands/fingers/limb duplication (model-assisted) | ADVISORY |

## 8. Backend/API requirements

- `POST /books/{id}/qa/run` — triggers a full run; body the revision to check; returns runId (re-runnable; idempotent per revision via runKey).
- `GET /books/{id}/qa/runs/{runId}` — results for the parent (product-shaped) and for ops (`?view=ops` adds refs, model scores, stage).
- `GET /books/{id}/qa/latest` — latest run for the revision, used by F-016 approval gating and F-011 badges.
- Approval gate: F-016 reads `latest` run — any BLOCKING result (except overridden content decisions) prevents `APPROVED`.
- Permissions: book owner + ops/support (F-026); results carry no external payloads.

## 9. Background jobs

- Run as part of `GenerationJob` completion (F-010): after `PAGE_RENDERED` per book, after `PAGE_REVISION_CREATED` (page-scoped, F-012), before `BOOK_READY_FOR_REVIEW`, and re-run scoped to changed pages before F-016 approval. Uses the DB-backed queue; retry 3×; resumable; cancelled if the target revision is superseded mid-run.
- Failure of a QA job = `UNKNOWN` (never silently PASS); a revision with `UNKNOWN` checks cannot be approved (fails closed).

## 10. AI behaviour

- `QualityModel` interface (proposed): `run(context: {bookRevision, scope, pageScope?, characterBible, printSpec, locale}) → CheckResult[]`; deterministic check **policies** (exact strings, geometry, count, asset existence) run first and are binary; model-assisted checks (likeness, artifacts, contradiction) run second and return a confidence score vs threshold.
- Identity likeness uses `IdentityReferenceModel` embeddings of the `CharacterBible` vs page illustration — threshold tuned by the spike; below-threshold = FAIL (BLOCKING), near-threshold = ADVISORY.
- No provider prompt/seed surfaces; structured output only. Facts are immutable — contradiction checks reference the facts block, never let the model "decide" a fact changed.

## 11. QA

The suite is itself the QA feature: checks are deterministic where possible, probabilistic where necessary, always scoped to a revision, always re-runnable (`runKey = revisionSeq + stage + scope`), with result history for F-026 and F-028 failure forensics.

## 12. Privacy/security

- Likeness scoring uses the source photos' embeddings and generated likenesses — PII-tier; results stored under the same retention/deletion as the book (F-025). No external provider receives raw photos; if a likeness model is external, it is a documented provider under §7 invariants (photos trace: browser → API → storage → model provider → output → deletion).
- QA results never include raw images in analytics; alert payloads carry refs only, ops view restricted to staff.

## 13. Analytics

`qa_run_completed` (stage, blockingCount, advisoryCount, durationMs) · `qa_blocked_approval` (checkId) · `qa_item_resolved` (checkId, via: correction | override). No photos, no refs.

## 14. Acceptance criteria

1. Given a book with a face that drifts from the `CharacterBible`, when the full QA run executes, then identity-consistency FLAG is BLOCKING and F-016 refuses approval until it resolves.
2. Given a `SHORTER` text correction (F-012) on page 12, when the page's QA scoped run executes, then only page 12 + its two adjacent pages are rechecked; the rest of the run's prior PASS results for other pages remain valid for that revision.
3. Given a print-geometry violation (text outside safe area via F-014 edit), when QA runs, then the edit is refused at save (F-014 blocks it) and the run still marks it BLOCKING non-overridable.
4. Given a mid-run revision supersession, when a newer revision lands, then the in-flight run is cancelled and its results are never published as "latest" (fails closed to `UNKNOWN` for approval).
5. Given a QA job process crash, when the worker restarts, then the run resumes from its checkpoint or re-runs from the same revision — no book state is lost and review state is unchanged (D010).
6. Given all checks PASS for the revision, when the parent reaches approval (F-016), then approval is unblocked and the run summary shows "All checked" in the preview chip.

## 15. Dependencies

- Must exist first: F-009 (assets + likeness refs), F-005 (Character Bible), F-017 geometry/`printSpec` contract (safe-area, DPI, bleed inputs), F-010 (jobs, revision-level triggers).
- Feeds: F-016 (approval gate), F-011 (badges), F-012 (suggestedAction routing), F-013 (character-wide fix suggestions), F-017 (print-geometry preflight re-run on approved revision).

## 16. Priority

**P1 — differentiation.** "Reliable cross-page character identity", "approval-before-print" and the quality bar (spec §25) are reason-to-exist items; QA is the enforcement layer that makes them safe to promise. P0 features (F-016 approval, F-017 print) depend on it enough that it rides on the P0 track, but standalone it is not category-parity (competitors visibly lack it), hence P1.
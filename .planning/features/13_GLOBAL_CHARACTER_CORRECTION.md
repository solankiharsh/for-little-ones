# 13_GLOBAL_CHARACTER_CORRECTION.md — Character-Wide Correction

> **Spec ID:** F-013 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-005 (Character Bible), F-009 (Illustration generation), F-010 (Generation jobs), F-012 (page-level correction base)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Character-wide correction turns a parent's "Her hair should be longer" (spec §5 example) into one Bible version bump and a scoped page regeneration, instead of 24 manual page edits. The parent picks an action (fix face everywhere, hair everywhere, clothes everywhere, or replace reference photos — spec §9), sees exactly how many pages it will touch and approximately what it costs, applies it, and later approves the new revision (F-016). Story text is never touched, page numbering never changes, and only pages where the character appears are regenerated.

## 1. Goal

Spec §5A and §9 are explicit: correcting a character "should not require manually regenerating 24 pages individually." Competitors offer at best *partial* per-page refinement (spec §2 Diffrun) with no clear whole-character workflow (spec §3 matrix). This feature makes the Character Bible (F-005) the single lever for appearance, and gives the parent a trustworthy, reversible, scoped application mechanism that fits the "AI does 95%, parent corrects 5%" default path (D003).

## 2. User value

- **Confidence:** an error-free paperback is the #1 anxiety in this category (spec §2 reviews: likeness, consistency complaints). Knowing one fix can repair any likeness problem everywhere is exactly the "effortless correction" differentiator.
- **Effortless:** product-language actions in one place (guide §8; no "regenerate/seed/model" ever — D002).
- **Predictable cost:** estimated affected-page count and a cost implication shown *before* applying builds trust and avoids surprise spend.
- **Reversible but safe:** versioned snapshots (F-005) allow diff/rollback before approval, and approved books (D011) are never silently mutated.

## 3. Current implementation

None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). The design must avoid:

1. **Scope creep.** A hair change must regenerate *illustrations only* on *pages where that character appears*: no unrelated story text changes, no structural renumbering, no orphaned decorative edits. Spec §25: "Changing one page must not destroy approved pages."
2. **Unbounded cost.** Naively regenerating every page in the book when four pages even lack the character wastes money and time; the affected-page computation and explicit cost estimate are mandatory.
3. **Version incoherence.** Mixing bible v1 and v2 pages inside a revision breaks identity QA (F-005 §7 contract); the apply flow must flip affected pages to `PENDING → GENERATING → READY` atomically, and v1 snapshots must survive for rollback.
4. **Unconfirmed appearance.** A "fix hair" that guesses a new hairstyle is an inference, not a correction; only parent-confirmed appearance triggers generation (F-005/§10 rule).

## 5. Desired UX

**Entry:** in book review/editing (F-011/F-014), the parent taps **"Make Ava look right everywhere"** (or the per-page "Fix character" that offers the whole-character path — consistent naming, spec §9 actions).

**Choose action** (modal, one of): **Fix the face everywhere** · **Fix hair everywhere** · **Fix clothes everywhere** · **Use a different photo of Ava**. Selecting opens the F-005 appearance editor (photo choice / chip edits) with current values pre-filled. On **Confirm**, the system computes:
`Estimated pages to update: 14 of 24` with the story pages listed (thumbnails) and a cost message: `This will generate 14 new pictures. Cost to you: {included in creation bundle | £X}.` (see §9 decision).

**Apply:** a warm progress view "Ava's new look is being painted — page 3 of 14" (meaningful progress, F-010 events). Per-page failures are isolated: "We had trouble with page 7 — the rest is done. We'll retry it in a moment" (guide §8 friendly language; D010 never whole-book restart).

**Review after:** a **"What changed"** diff list ("Page 2: hair now longer · Page 5: hair now longer") with before/after thumbnails and a **"Not right — undo"** rollback that reverts the bible version to v1 snapshots (F-005) and restores the prior illustrations. The book returns to review state; approval (F-016) is required again before print (D011).

**Edge cases:** no affected pages computed → direct "Nothing would change"; family-shared character (F-023) → "This will also update Ava in 2 other stories" with per-book page counts; a page where the character appears only in background is still affected (identity consistency, spec §10).

## 6. UI specification

- **Modal layout:** 4 option cards (icon, label, helper). Selecting one navigates to the F-005 panel variant pre-scoped to that field (hair editor shows only hair attributes + photo refs; face editor emphasises reference selection + face-consistency; clothes editor shows outfit + accessories).
- **Impact panel:** title "What will change", page-grid with the affected thumbnails highlighted, count line "14 pages · 1 story" plus cost line per §9; primary CTA **"Yes, make Ava right everywhere"**; secondary **"Cancel"**; tertiary **"Preview photos first"** (opens F-004 primary + wanted refs).
- **Apply view:** progress list (page thumbnails flipping pending→done), pause-free, with inline retry on a failed page ("Try again" per page, F-010).
- **Diff review:** before/after slider strip per changed page + per-page thumbnails with a "keep new / use old" toggle if the parent prefers a hybrid. Bottom CTA **"Looks great"** → return to review; **"Undo all"** → rollback.
- **Mobile:** full-screen modal on phones (D012), one-handed CTA reach, thumbnails tappable for close inspection.

## 7. Domain model

No new top-level entity. Reuses CharacterBible versioning (F-005) and canonical Book/Page. Compact sketch of the deltas an apply transaction produces:

```text
CharacterBible(version v2)                     ← F-005; immutable v1 snapshot retained
Book.pages[]:
  page.state: PENDING|GENERATING|READY|FAILED|REVISION_REQUIRED (guide §4 per-page)
  page.generationMetadata.characterBibleVersion: 1 → 2 (affected) | 1 (untouched)
  page.illustrations[]: { assetRef (new, replacing old), generatedFromBibleVersion: 2 }
Story (outline + per-page textBlocks): UNCHANGED byte-identical
Revision: new draft revision (v+1) linked to bible v2; prior revision preserved
           for rollback and for D011 approval/order reference
```

**Explicitly NOT changed by an apply:**
- `story`, `page.textBlocks[]`, `decorativeElements[]` owned by the parent, page numbering/order, `Book.metadata`, book cover unless it contains the character's portrait within its own illustration pipeline (cover is treated as one more "page" for scope purposes — decision below).
- Pages where the character does not appear at all (no illustration pixels reference the bible id) — they stay v1 and `READY`.
- Any other character's illustrations (sibling isolation, F-023).

## 8. Backend/API requirements

Proposed boundary (proposed shared subsystem `BookService`; reminder: proposed names for consistency):

- `BumpCharacterBibleVersion{ bibleId, appearancePatch?, referencePhotoIds? }` — F-005 command; validates confirmed appearance; returns new version; emits `CHARACTER_VERSION_BUMPED`.
- `ComputeAffectedPages{ bookId, bibleId, fromVersion }` → `{ pageIds[], perBookCounts[], estimatedImageCount, costEstimate }` (read-only; feeds the impact panel).
- `RequestCharacterRegeneration{ bookId, bibleId, fromVersion, pageIds }` → transaction: flips selected pages to `PENDING`, enqueues a `GenerationJob` per page (idempotent by `bookId+pageId+bibleVersion`), emits `PAGE_REVISION_CREATED` per completed page.
- `GetApplicationDiff{ bookId, revisionA, revisionB }` → changed page ids + before/after asset refs for the diff UI.
- `RollbackCharacterCorrection{ bookId, toVersion }` → restores bible snapshot + prior illustration refs, resets `generationMetadata.characterBibleVersion`, re-asserts per-page `READY`.
- Validation: `fromVersion` must equal the page's recorded version (optimistic lock, no mixed-apply); apply rejected if book is `APPROVED` or `ORDERED` (D011 — parent must fork a new revision, never mutate an approved one); `appearancePatch` must be parent-confirmed.
- Events: `CHARACTER_VERSION_BUMPED → AFFECTED_PAGES_COMPUTED → CHARACTER_REGEN_REQUESTED → PAGE_RENDERED (×N) → CHARACTER_CORRECTION_COMPLETED`.

## 9. Background jobs

**Job: PageReIllustration** (one per affected page; the F-013 shape of `GenerationJob`):
- Inputs: bible snapshot (version = target), `identityRepresentation`, confirmed `appearance`, `bookOverrides.outfitForBook`, the page's scene/narrative context, prior illustration for reference continuity.
- Outputs: new illustration asset(s) for the page; `generationMetadata` bumped to target version.
- Retry: 3× with backoff per page (isolated); resumable; timeout e.g. 180s/image; failure leaves page `FAILED` (retry-able in UI, D010 — never whole-book restart).
- Cancellation: removing the apply request before any page completes cancels remaining pages; completed pages stay (diff rollback available).

**Cost implication:** image regeneration is per affected page. **Decision needed:** commercial model — (a) N global corrections included per book (bundle), (b) first correction free then micro-charge, or (c) fully included at launch to maximise confidence. Default recommendation: fully included for launch (P1 differentiator, low expected usage), surfaced in the impact panel either way. The `costEstimate` field of `ComputeAffectedPages` adapts to whichever model is chosen.

## 10. AI behaviour

- **IllustrationModel** only. No `StoryModel` call: story text is byte-identical (spec §25, §9 scope).
- Inputs per page: bible snapshot (reference photos + `identityRepresentation` + confirmed appearance + style) and the existing page narrative/context. Face-fix emphasises `identityRepresentation` matching; hair/clothes-fix pass `appearance` as the dominant control; reference-replacement regenerates identity first (`IdentityDerivation`, F-005 §9) before any page runs.
- Loose coupling (D004): provider models receive compiled context, never free-form prompt text from the parent (D002). A provider change only affects `identityRepresentation` rederivation, not the correction flow.
- Where sibling characters (F-023) share a page, the job passes per-character representation explicitly, so one fix to Ava never alters Leo (spec §10 identity swap guard).

## 11. QA

Runs after each successful poly-phase apply (spec §10 catalogue):
- Identity consistency: all regenerated pages must pass resemblance vs references.
- No face/hair/clothing change without story reason: pages generated under bible v2 are the *only* pages whose appearance differs; untouched v1 pages must not suddenly look parent-different (verified via `generations[]` map, F-005 §11).
- Name/pronoun unchanged: QA confirms story block text is byte-identical, catching any accidental text mutation.
- Wrong child count / sibling swap: multi-character pages revalidated per character.
- Missing assets / resolution: every regenerated page passes resolution + print-safe checks (F-015/F-017 gates) before the diff review is offered.
- No duplicate/repeated illustration across the book (F-015 library check) after regen.

## 12. Privacy/security

- New illustration assets are again PII-derived likenesses (guide §7) — stored privately, not logged, not publicly served.
- Reference-replacement and delete-now (F-025) must remove the old likeness bytes and bible snapshots per F-025 retention after rollback windows; versioned snapshots are subject to the same retention as the profile.
- The correction path passes images to the documented `IllustrationModel`/`IdentityReferenceModel` providers only (F-025 audit); provider logs never receive child names or facts.
- `RollbackCharacterCorrection` and delete-now must race-lock (an in-flight regen job for that bible version is cancelled or orphaned-harmlessly by idempotency token `bookId+pageId+bibleVersion`).

## 13. Analytics

`character_fix_opened`, `character_fix_action_selected` (face/hair/clothes/photos), `affected_pages_estimated`, `character_fix_applied`, `character_fix_cancelled`, `character_fix_rolled_back`, `page_regenerated` (count), `character_fix_cost` (estimated vs actual image count — cost telemetry for the §9 commercial decision). No photo refs/values/payloads in events.

## 14. Acceptance criteria

1. Given a book where Ava appears on 14 of 24 pages and her hair changes are confirmed in the Bible, When the parent applies "Fix hair everywhere", Then exactly 14 pages are affected (computed before apply), all 14 regenerate under bible v2, and the other 10 pages remain v1 with byte-identical assets and text.
2. Given the same apply, When the story is inspected, Then every `textBlocks[]` string is byte-identical to the prior revision and no page renumbering or reorder occurs.
3. Given one affected page fails after all retries, When the apply completes, Then the other 13 succeed, the failed page is `FAILED` with a friendly in-place retry, and the book is not forced to restart (D010).
4. **Recovery/rollback:** Given the parent selects "Undo all" after an apply, Then the revised revision is discarded, bible v1 snapshots and prior illustrations are restored, and `characterBibleVersion` metadata correctly reverts to 1.
5. Given a book is `APPROVED` (F-016), When a Bible bump lands, Then the approved revision is untouched and the apply only creates a *new* draft revision the parent must re-approve before it can be ordered (D011).
6. Given a two-character page (Ava + Leo, F-023), When only Ava's face is fixed, Then Leo's illustration pixels and identity metadata are unchanged and QA detects no swap.
7. Given an apply that touches 14 pages, When the impact panel was shown, Then it displayed the correct affected-page count and the cost implication before the parent confirmed.

## 15. Dependencies

- Must exist first: F-005 (Bible versioning + snapshots + `IdentityDerivation`), F-009 (illustration pipeline the jobs reuse), F-010 (persistent, observable, per-page-resumable generation), F-004 (reference replacement needs photo refs), F-025 (retention/deletion contract for snapshots).
- Consumes/builds on: F-012 (page-level correction establishes the diff UI and per-page retry primitives; F-013 reuses them at book scope). Without F-012, first-build a minimal diff view.
- Consumes later: F-016 (re-approval gate), F-023 (per-character scope), F-015 (post-apply QA gate).
- Buildable in parallel: F-014 editor (reads revisions only), F-011 preview (renders new revision).

## 16. Priority

P1 — key differentiation ("our reason to exist", spec §26: page-level *and* global character correction). Whole-character correction is the practical liberation of the persistent-character thesis (spec §4/§5) that no competitor cleanly offers (spec §3 matrix). Rationale per mission §33 filter: more confidence in the printed book (fixes the #1 complaint class), fewer support/refund problems, and it converts a feared AI failure mode into an effortless product capability. Not P0 because launch parity is achievable with the F-005 bible alone plus page-level repair; F-013 is the second-order value that the F-005 versioning contract enables at moderate extra build cost.
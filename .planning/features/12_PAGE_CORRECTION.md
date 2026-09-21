# 12_PAGE_CORRECTION.md — Page-Level Intent-Based Corrections

> **Spec ID:** F-012 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-011 Book Preview, F-010 Generation Progress, F-009 Illustration Generation, F-005 Character Bible
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Page-level correction is the biggest UX advantage over the category (spec §9 — "Make AI Errors Trivial to Repair"): every page exposes simple, product-language intents — *Try another*, *More like Ava*, *Change her expression*, *Make it shorter*, *Funnier* — each of which is a precise, scoped operation. A correction regenerates **only that page** as a new page revision through `GenerationJob`; it never regenerates unrelated or `APPROVED` pages, never silently mutates approved content (D011), and one page's failure never blocks the book (D010). User-facing language never mentions prompts, models or seeds (D002).

## 1. Goal

Spec §9 and competitor teardowns (spec §2, §24) show the category's structural failure modes: wrong likeness, wrong details, undesirable tone, and no easy repair. Parents need to fix a single image or a single paragraph in seconds, in their own words, and trust that nothing else changed.

## 2. User value

- **Effortless correction** (product thesis, spec §4–§5, §9): AI does ~95%, parent corrects ~5% with product instructions (D003).
- **Confidence to approve:** the parent can verify each fix precisely because the rest of the book is untouched; the risk of "fixing 24 pages manually" (spec §5A) is removed at page scope and routed to F-013 for character-wide intent.
- **Trust/reliability:** a failed correction costs one page, not the book (D010); analytics surface this as the key support-risk reducer (spec §24).

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

Proposed subsystems consumed: `CharacterBible` (identity refs), `GenerationJob` (per-page work), `BookService` (page revision commit), provider interfaces `IllustrationProvider`, `StoryProvider` (text intent), `IdentityProvider` (likeness enforcement), `ModerationProvider` (child-content moderation per intent).

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Bleed from page to book:** any "try again" must be scoped to one page revision, or the system recreates the every-page instability reviewers complain about (spec §2 Diffrun face-consistency).
- **Approved-content drift (D011):** corrections must never touch pages in `APPROVED` per-page state or, post-approval, the approved book revision.
- **Prompt/model leakage (D002):** intent parsing must map product language to structured operators; "describe a change" free-text is normalised and confirmed, never passed as a raw prompt.
- **Fact mutation (spec §10, §25):** parent-provided facts are immutable; a tone/structure intent must not rewrite facts (enforced by the immutable-facts block in §10).
- **Non-idempotent regenerations:** a retried correction must not produce divergent pages or miss the original intent.

## 5. Desired UX

Example: Emma reviews "Ava's Moon Adventure" (F-011). On page 6 Ava's hair is drawn short; the text says "puddle" where it should say "muddy puddle"; page 22's line is a touch sad for a bedtime book.

1. Emma taps **Something wrong?** under page 6 → a bottom sheet (mobile) / small panel (desktop) opens inside the reader: "What would you like to change about this drawing?" with the intent chips.
2. She taps **More like Ava** → a thin spinner replaces the illustration on page 6 only with "Just redoing Ava's face…". ~10–20s later the new illustration slots in on page 6, the chip in the rail gains a "new" dot, text on page 6 is unchanged, and every other page is untouched.
3. On page 12 she taps the text intent **Change the words** → an inline text area opens *in reading typography*, pre-filled with the canonical paragraph. She types "muddy puddle"; the facts-block above shows a shield icon "We'll never change your facts." Save → text revision generated for page 12 only.
4. On page 22 she picks **Gentler** → the story-model rewrites page 22's paragraph in-place (illustration unchanged), and an undo affordance (until she leaves the page) restores the previous revision instantly.
5. She is on page 6, taps **Something wrong?** → sees "Drawing" vs "Words" tabs, plus two **escape hatches** (never primary): "Fix Ava's look in the whole book" (routes F-013) and "Edit this page properly" (routes F-014).
6. If the correction fails: the page shows "We had trouble changing this drawing. Page 6 is still the old one and the rest of your book is safe." with **Try again** and **Keep the old one** — book state and other pages unaffected (D010).

One memorable rule for the whole surface: **what you touched is what changes; everything you didn't touch is untouched.**

## 6. UI specification

- **Entry:** "Something wrong?" is the only correction entry in reading mode (F-011), reachable via long-press (mobile) or a per-page footer link (desktop). Never a toolbar or canvas chrome (D003). In F-014 the same actions exist as secondary actions in the page panel.
- **Sheet layout:** header = page thumbnail + "Page 6". Tab: **Drawing** | **Words**. Then intent chips (below), then quiet links to F-013/F-014.
- **Intent chips (image):** *Try another drawing* · *More like [child's display name]* · *Change expression* · *Change pose* · *Change clothes* · *Add something* · *Remove something* · *Describe a change*.
- **Intent chips (text):** *Edit the words* · *Shorter* · *Longer* · *Funnier* · *Gentler* · *More adventurous* · *Simpler words* · *Describe a change*.
- **Describe a change:** opens a single product-language textarea ("e.g. make the dinosaur look friendly, not scary") with a **Preview my change** step that shows the parsed change as a sentence the user confirms ("I'll make the dinosaur friendly and keep everything else the same."). Never shows the raw operator list.
- **Inline text editing:** for *Edit the words*, type in reading typeface; a character count and age-band indicator (green = fine, amber = approaching limit, red = blocked) guard length per reading-age rules.
- **Progress:** replace only the affected illustration/paragraph with a shimmer; never a page-size spinner. Text intent progress is shown as a soft diff ghost (old text dims under new).
- **Undo:** last revision on this page undoable until a new intent on the same page completes or the user navigates away.
- **Error:** warm card, both recovery actions (§5.6). All copy product-facing; no error codes, no "regenerate", "seed", "prompt" (D002, guide §8).
- Accessibility: chips ≥44px, focus rings, `aria-live` on the per-page replacement region, and the sheet is keyboard-dismissible.

## 7. Domain model

Canonical additions (all per-page; no edits to the canonical top-level `Book` shape except the revision append):

```text
PageCorrectionRequest (client payload)
├── bookId, pageId
├── target: IMAGE | TEXT
├── intent: <catalog enum below>
├── params: {expression?, pose?, clothing?, objectsAdd?, objectsRemove?,
│            freeText?, tone?, maxLength?}
├── idempotencyKey (client-generated, retry-safe)
└── origin: PREVIEW | EDITOR

PageRevision  (new canonical page state; guide §2 revisions[])
├── pageId, revisionSeq (monotonic)
├── appliedIntent, params, providerRefs (model call ids, for ops only, §12)
├── textBlocks[] / illustrationRef (immutable snapshot of this revision)
├── sourceRevisionSeq (what this replaced)
├── provenance   // GenerationProvenance for this revision (GENERATION_PROVENANCE §2);
│                //   new immutable record per revision — the replaced revision's
│                //   provenance is never rewritten
├── status: GENERATING | READY | FAILED
└── createdBy: intent | editor | initial
```

Intent catalogue (the only intents the client may send — anything else is rejected):

- **Image:** `TRY_ANOTHER`, `MORE_LIKE_REFERENCE`, `CHANGE_EXPRESSION`, `CHANGE_POSE`, `CHANGE_CLOTHING`, `ADD_OBJECT`, `REMOVE_OBJECT`, `DESCRIBE_IMAGE`.
- **Text:** `EDIT_TEXT` (manual, with full new text), `SHORTER`, `LONGER`, `FUNNIER`, `GENTLER`, `MORE_ADVENTUROUS`, `SIMPLER_WORDS`, `DESCRIBE_TEXT`.

Per-page state machine consumed from F-010: `PENDING · GENERATING · READY · FAILED · REVISION_REQUIRED · APPROVED` (guide §4). Corrections are only valid when the page is `READY` or `REVISION_REQUIRED`; a page in `APPROVED` (book approved, F-016) is immutable.

## 8. Backend/API requirements

- `POST /books/{bookId}/pages/{pageId}/corrections` — body is `PageCorrectionRequest`; returns the new `PageRevision`. Validation: page belongs to the session's book; page not `APPROVED`; intent in catalogue; image intents require page has an illustration; text intents require `textBlocks`; `freeText` length ≤ 2000 chars and passes `ModerationProvider` before any model call. **Reject** anything not in the catalogue (404/422) — the server is the guard for product-language purity.
- **Idempotency:** `idempotencyKey` dedupes retries (same key → same revision; a retry after network failure does not double-generate). A new key always creates a new revision — this is how "Try another" repeatedly works.
- **Read:** page scope via `GET /books/{id}/pages/{pageId}/revisions` (ops/support only, F-026).
- Permissions: reader surface gets only its own `bookId`; cross-book access forbidden. Anonymous sessions supported pre-claim (F-001).
- Event (not event sourcing): `PAGE_REVISION_CREATED` published to `QualityProvider` for per-page recheck (F-015) and to F-011 manifest refresh.

## 9. Background jobs

- Per-page correction runs as a `GenerationJob` scoped to **one page revision**. Trigger: correction request accepted. Inputs: `PageRevision` intent + params + immutable-facts block + `CharacterBible` refs + prior page snapshot (for diff/Qt stability) + target page's existing sibling context (neighbouring text) only where the intent needs continuity (e.g. `SHORTER` must not break the page's continuity with adjacent pages).
- Outputs: new `textBlocks[]` or `illustrationRef` for the revision; writes revision, flips page state `GENERATING → READY | FAILED`. **Re-entry is at the affected stage only** (GENERATION_ARCHITECTURE §8): a text intent re-enters the page-text stage (F-008), an image intent re-enters the illustration stage (F-009) — no earlier stage re-runs, sibling `READY` pages stay untouched, and each revision carries a fresh immutable `GenerationProvenance`.
- Retry: 3 attempts, backoff; resumable across worker restart (D010); timeout per model call; **failure isolates to the page**: book state untouched, previous revision retained and served. An earlier revision stays the live page until the new one is `READY` (never a blank mid-generation page).
- Cancellation: intent superseded by a newer intent on the same page → in-flight job may be flagged cancelled; its results are discarded if a newer revision already exists.
- Queue choice: DB-backed persistent queue (F-028 default; no Temporal unless the queue spike demands it, guide §5).

## 10. AI behaviour

- **Intent → operator mapping (the core of this spec):** each intent is expanded at generation time into a bounded structured operator set against the *page illustration plan* or *paragraph*, never a free prompt:

| Intent | What changes | What it does NOT change (guaranteed) |
| --- | --- | --- |
| `TRY_ANOTHER` | Illustration only; new candidate from the existing plan (subject, setting, action, style) | Text, plan semantics, Character Bible, all other pages |
| `MORE_LIKE_REFERENCE` | Likeness weight/identity conditioning for this illustration only, via `IdentityProvider` using the current `CharacterBible` refs | Pose, setting, clothing plan, text, other pages |
| `CHANGE_EXPRESSION` | `expression` attribute in the page's illustration plan | Everything else in the plan; text intact |
| `CHANGE_POSE` | `pose` attribute | Everything else; text intact |
| `CHANGE_CLOTHING` | `clothing` attribute (page-scoped unless promoted to F-013) | Everything else; text intact |
| `ADD_OBJECT` | one discrete object added to plan + optional placement note | Nothing else; text intact |
| `REMOVE_OBJECT` | the named/suggested object removed from plan | Nothing else; text intact |
| `DESCRIBE_IMAGE` | free text parsed to structured delta (expression/pose/object/lighting/etc.); confirmed with parent before generation (preview step §6) | Anything not confirmed; text intact |
| `EDIT_TEXT` | canonical paragraph replaced verbatim with parent text (validated: age-band length, moderation, fact shield on) | Illustration, layout, facts, other pages |
| `SHORTER` | paragraph condensed to target length band | Facts, page count, illustration, other pages |
| `LONGER` | paragraph expanded within length band | Facts, page count, illustration, other pages |
| `FUNNIER` / `GENTLER` / `MORE_ADVENTUROUS` | tone attributes of the paragraph | Facts, events, page count, illustration, other pages |
| `SIMPLER_WORDS` | vocabulary to reading-age band (uses child age + locale, spec §11) | Facts (never simplified silently — facts are shielded verbatim), page count, illustration |
| `DESCRIBE_TEXT` | free text parsed to tone/event delta, confirmed before generation | Facts, page count, illustration, other pages |

- **Immutable-facts block:** the child's profile facts (spec §6, §13) and the approved `story` facts are injected as a hard constraint; any intent whose draft output contradicts them is retried once, then surfaced as a "We can't change that fact" advisory (never silently modified — spec §10 "facts must never silently mutate", QA `story contradiction`).
- **Context box:** the model receives — target page text (full for text intents), sibling page first/last sentences (for tone/length intents), the illustration plan, Character Bible refs (`IdentityProvider`), the immutable-facts block, reading age, locale. It never sees other users' data or other books.
- `ModerationProvider` gates intent params and generated output (child-content safety); content flagged → the intent fails as `FAILED` with the user-facing friendly error, not a silent rebuild.
- Structured output: text intents return `{text, charCount, factsUsed[], continuityFlags}` so `BookService` can validate before commit; image intents return `{illustrationRef, planDelta}`.

## 11. QA

- Every correction **immediately re-runs the per-page QA subset** (F-015) scoped to this page: identity consistency (vs `CharacterBible`, using `QualityProvider`), text overflow, print safe area (text respects print-safe box), missing assets, repeated illustration. HARD_BLOCK findings roll the revision back to `REVISION_REQUIRED` and show the parent a friendly explanation rather than committing a broken page; REVIEW_REQUIRED items ask for a decision before proceeding.
- Post-commit: `story contradiction` and `duplicate paragraph` checks run against the adjacent two pages (text intents only) because tone/delta edits can collide with continuity.
- The book-level QA state is unchanged by a failing page; only the page revision is affected (D010).

## 12. Privacy/security

- Corrections call model providers with page context, `CharacterBible` identity refs and immutable facts — all treated as PII-tier (guide §7). Provider exposure is the same as generation (F-009/F-008); any new provider receives completed provider docs and moderation coverage (§7 invariant "no additional providers without documentation").
- `providerRefs` and corrected illustration assets are stored with the same access/retention as generated assets; never logged. Analytics carry page ids and intent names only.
- Generated likenesses from corrections are PII-tier; deletion of the source Book/pages (F-025) deletes all revisions and refs, not just the current one.
- Free-text `Describe a change` may contain parent-entered identifiable detail — moderation and retention apply; it never appears in logs or analytics.

## 13. Analytics

- `page_correction_started` (pageId, intent, target)
- `page_correction_succeeded` (pageId, intent, attemptCount, ms)
- `page_correction_failed` (pageId, intent, reasonClass: moderation|model|timeout|qa) — reasonClass only, no payloads
- `page_revision_undone` (target)
- `correction_escape_hatch_used` (F013 | F014) — measures how well intents cover need

## 14. Acceptance criteria

1. Given a page in `READY`, when the parent submits `CHANGE_EXPRESSION`, then only that page's illustration is regenerated, its text is byte-identical, and all other pages' revisions and assets are untouched.
2. Given a retried request with the same `idempotencyKey`, when the first attempt succeeded, then no second generation occurs and the same revision is returned; with a new key, a new revision is created.
3. Given a page whose correction model call fails, when the job exhausts retries, then the previous revision remains the live page, the book remains `READY_FOR_REVIEW`, and the parent sees the warm error with Try again / Keep the old one.
4. Given a `DESCRIBE_IMAGE` free text that parses to a multi-part delta, when the parent taps the make-change chip, then the parsed-changes confirmation sentence shows the full scope before any model call; the parent can cancel with zero effects.
5. Given an immutable fact referenced in a paragraph, when the parent runs `SHORTER`, then the fact string remains exact in the output (QA `story contradiction` passes); if the model contradicts it, the intent surfaces the "can't change that fact" advisory.
6. Given an `APPROVED` page (post-approval book), when any correction is requested, then the API rejects it and no model call occurs (D011).
7. Given a page in `GENERATING` for its correction, when the parent navigates away and back, then the page shows in-progress state restored from the job, never a blank page (D010).

## 15. Dependencies

- Must exist first: F-011 (surface the sheet/manifest), F-010 (per-page job persistence), F-009 (illustration plan + provider), F-005 (Character Bible refs for `MORE_LIKE_REFERENCE`), F-008 (immutable-facts block, story context).
- Soft dependency: F-015 per-page QA (rollback gate); until F-015 exists, corrections run without the QA gate behind a flag.
- Feeds: F-014 (same intents as editor panel actions), F-013 (promotes `CHANGE_CLOTHING`/`MORE_LIKE_REFERENCE` to character-wide). F-016 consumes only `READY` books, so corrections, QA and approval must agree on page state.

## 16. Priority

**P1 — key differentiation.** Per spec §26, "page-level correction" is in the *reason-to-exist* class; it is also the largest structural answer to the category's reported likeness/story-quality complaints (spec §2, §24). Not P0 because the launch category already ships at least *some* regeneration (Diffrun face refinement); we aim to outclass it, not merely match it — that justifies P1 and the isolation guarantees (D010) that make the difference safe.
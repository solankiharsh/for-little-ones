# 08_STORY_GENERATION.md — Story Text Generation Pipeline

> **Spec ID:** F-008 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-007 (selected concept), F-006 (facts), F-003 (profile), F-010 (jobs), F-024 (locale fields) · **Consumed by:** F-009 (illustrations), F-011 (preview)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

From the selected Story Concept, F-008 produces the Book's story: a validated **outline**, then **per-page text blocks** with **directional illustration cues** — all structured, canonical data (never free-floating prompt output; D004). It enforces the spec §25 story bar (no repeated paragraphs, no contradictions, facts immutable), spec §25 age bar (age-adjusted vocabulary/length), and spec §11 locale bar (en-GB vs en-US vocabulary/spelling). Per-page idempotency means one page's failure is repaired in isolation (D010) — a page is generated once per `pageKey` and any retry produces a deterministic replacement.

**Generated unit decision (state the choice):** the independent text-generation unit is the **page** (one page = one primary `textBlock` + one `illustrationCue` + one optional secondary text block). Spread composition is a render-side concern owned by F-017 (print) / F-011 (reading); the Story model stays page-granular so single-page correction (F-012), reordering, and multi-parent flows work without regenerating neighbours.

## 1. Goal

Transform a chosen concept into a complete, coherent, parent-fact-faithful story that hits the quality bar before a single illustration is paid for (spec §25; §17 approval-before-print spirit). The pipeline must make "does this read like a real book for Ava?" the primary deliverable, with JSON so F-009 can paint from cues and F-012 can rewrite one page without rebuilding the rest.

## 2. User value

- **Confidence:** the parent never reads a raw dump; every page is age-shaped, locally correct, and consistent with what they told us about their child.
- **Fewer corrections:** structural QA (contradictions, repeats, pronouns, names) runs *before* the parent ever sees the book, so the 95/5 split (D003) holds.
- **Recovery:** one bad page never holds the book hostage (spec §25 "failures can resume rather than restart the entire book"; D010).
- **Localisation differentiator:** right spelling/school words for the family's locale straight from generation (spec §11).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). Design risks the spec itself must avoid:
- **Fact drift** (Adorabook's football failure, spec §2/§11): parent facts re-interpreted by the model → facts are injected as keyed immutable fields and verified post-generation.
- **Contradictory/repetitive narrative** (spec §25) → outline as a gate + per-page continuity context + lexical/embedding repeated-paragraph check.
- **Wrong names/pronouns appearing** → name/pronoun consistency check across all textBlocks.
- **Locale failure** → explicit locale field + post-process wordlist mapping (see §10), not model spells.
- **Whole-book restart on one page failure** → per-page idempotent generation under `GenerationJob` (F-010).
- **Model output becoming canonical** → strict JSON schema, validated, mapped into canonical `Story`/`Page` model rows.

## 5. Desired UX

Walkthrough (**Ava, 5**, theme Dinosaurs, concept *"The Dino who Lost his Roar"*):

1. Parent tapped "Start with this story" (F-007). The Book moves to `GENERATING`; the progress screen (F-010) shows product label **"Writing the adventure…"**. Internal steps run: outline → outline validated → page text (page by page) → story QA → `STORY_GENERATED`.
2. On success the flow routes to preview (F-011) — the parent *sees the story result as a book*, never as text paragraphs on a form.
3. If a single page fails (e.g. page 6), the others stay `READY`; F-010 surface shows: *"We had trouble writing page 6. The rest of Ava's story is safe. [Try page 6 again]"* — retry regenerates **only** page 6 (D010).
4. If the *outline* fails entirely, a calm state: *"I couldn't find a shape for this story just yet. [Try again]"* — retry re-runs outline with the same inputs (idempotent).
5. All failures are recoverable; there is no state where the parent is stranded without the CTA.

## 6. UI specification

F-008 itself has almost no dedicated screen — it is observed through the **generation progress UI (F-010)** and its outcome through **preview (F-011)**. Requirements here:
- Progress label mapping (F-010): `STORY_GENERATION_STARTED → STORY_GENERATED` shows "Writing the adventure".
- Page-level failure surfaces as the friendly card in §5 (never error codes, D002/§8 UX).
- Success CTA: single "Preview the story" → F-011.
- No raw JSON, no model or prompt vocabulary anywhere (D002).

## 7. Domain model

Canonical artifacts (extend canonical Book model; all storage-side, never editor JSON):

```
Story
  id, bookId
  conceptId            // provenance from F-007
  outline {            // validated gate object
    premise,           // 1 sentence
    act1, act2, act3,  // beats, ≤120 words each
    characters,        // canonical character ids referenced
    arc               // emotionalGoal path (e.g. confidence)
  }
  locale               // en-GB | en-US (from profile, never model-invented)
  readingLevelBand     // 0-3 | 4-6 | 7-9 (from concept)
  factsVersion         // canonical facts snapshot hash (immutability audit)
  qaReport             // story-level QA result (see §11)

Page (per-page unit, text side)
  pageNumber           // 1..N (cover/dedication handled by F-017 layout)
  textBlocks[]         // 1 required + 0..1 optional (autograph/italic line)
  illustrationCue      // directional cue object (see schema below)
  pageKey              // deterministic idempotency key
  status               // PENDING | GENERATING | READY | FAILED | REVISION_REQUIRED
  generationMetadata   // model/call ids, attempt count, cost cents
```

Structured JSON contracts (the `StoryModel` output, validated):

```jsonc
// StoryModel.generateOutline → outline object (§7 above)

// StoryModel.generatePageText → per page:
{
  "pageNumber": 6,
  "textBlocks": [
    {
      "kind": "primary",
      "text": "Ava stood at the edge of the valley, holding Bruno's paw.",
      "wordCount": 12
    }
  ],
  "illustrationCue": {
    "song": "static_scene",
    "shot": "wide",                       // wide | medium | closeup | face
    "subjects": [
      { "characterId": "ava",
        "pose": "standing_still",
        "expression": "brave_smile",
        "position": "left_third" }
    ],
    "setting": "dino_valley_at_dusk",
    "props": ["bruno_lead", "valley_rocks"],
    "styleNote": "warm_soft_shadows",     // references Character Bible style tokens
    "caution": "no_text // keep faces clear of right edge"  // print-safe steer
  }
}
```

Rules: exact—every page has 1 primary textBlock + 1 illustrationCue, or the page is not `READY`. `wordCount` is measured, checked against the age band (see §10). `illustrationCue.subjects` reference `CharacterBible` character ids — never free-text character descriptions (keeps F-009 on canonical identities; spec §5A).

## 8. Backend/API requirements

Commands via `BookService`/`BookRepository`; orchestration via `GenerationJob` (F-010).

- `POST /books/{id}/story/generate` → enqueue outline → then per-page text pipeline; returns the job id; idempotent (no-op + current state if story already `READY` at same `factsVersion`).
- `GET /books/{id}/story` → story + per-page status (for progress UI, F-010).
- `POST /books/{id}/story/pages/{n}/regenerate` → re-generates **only** page `n` (used by F-010 "Try page 6 again" and later F-012 rewrites); returns the page; idempotent via `pageKey`; honours `REVISION_REQUIRED`→`READY`.
- Events emitted along the guide §5 list: `STORY_GENERATION_STARTED`, `STORY_GENERATED`, `PAGE_REVISION_CREATED` when a page regen starts.
- Validation at boundaries: pageNumber in range of print spec (F-017), textBlocks satisfy schema, cue subjects ⊆ CharacterBible ids. 422 with product-copy messages on violations; never a 500 for a content problem.

## 9. Background jobs

Owned by `GenerationJob` (F-010), two dependent steps: **`OUTLINE`** then **`PAGE_TEXT`** per page.
- `OUTLINE`: input = concept + facts slice + locale + age band; output = validated outline; gate — if outline validation fails, the job stays `FAILED` at the outline step and nothing downstream runs (retry re-enters step, idempotent).
- `PAGE_TEXT`: per-page; **`pageKey = sha256(bookId|conceptVersion|pageNumber|factsVersion|locale)`** — the same key always produces the same page intent, so a crashed worker or a duplicate request cannot double-generate or diverge; `POST …/pages/{n}/regenerate` reuses the same key (identical deterministic inputs) or a `revisionNonce` on REVISION_REQUIRED (different intent).
- Retry: up to 2 auto retries/page with exponential backoff, 45s timeout; a page `FAILED` after that never blocks other pages (D010).
- Resume: worker restart loses no work — persisted per-page statuses; pages already `READY` are skipped (F-010 "worker restart safety", F-028).

## 10. AI behaviour

Provider interface: **`StoryModel`** — proposed methods `generateOutline(context): Outline` and `generatePageText(continuityContext): PageText`.

- **Outline context:** concept (title/pitch/emotionalGoal), canonical facts slice (displayName, pronoun, relationships incl. pet, favourites, locale, age band), `readingLevelBand`.
- **Age-adjusted vocabulary/length (spec §25 age):** enforced at the **contract level** — per-band caps, e.g. draft `0-3`: ≤20 words/page, settable; `4-6`: ≤40 words/page, common short words; `7-9`: ≤70 words/page, multi-clause sentences. Impossible by prompt alone — enforced by post-checks (regen if exceeded, never silently trimmed mid-word).
- **Narrative continuity:** `continuityContext` = outline + prior page summaries (1 line/page) + character state notes; prevents contradiction across pages; a contradiction check runs against the outline at QA.
- **Locale-aware vocabulary (spec §11):** `locale` is a hard key in context AND a **post-processing wordlist map** runs on generated text (en-GB: mum/pyjamas/colour/trousers/lift; en-US: mom/pajamas/color/pants/elevator; "football"→ association-football steer per §11 structured facts). The wordlist map is the source of truth for spelling — the model alone is unreliable (Adorabook lesson). F-024 extends the mapping table; the mechanism ships now.
- **Immutable facts:** injected as keyed structured fields (name, pronoun, relationship names, pet species, structured interests); fact validation compares generated text against these keys; any written fact must match or the page regenerates once — no silent mutation (spec §25 facts).
- **Structured output:** both methods return strict JSON (§7); schema validation with typed errors; unknown fields stripped; missing fields → retry then page-level `FAILED`.
- **Moderation:** `ModerationProvider` on outline + every textBlock (profanity/inappropriateness) before `READY`.
- **Cost:** outline ~250 tokens; each page ~300 tokens. Total ≈ outline + Np×pages. Track `costCents` per step in `generationMetadata` for F-027; page regen is billed per page only.

## 11. QA

Story-level checks (run against the complete Story before `STORY_GENERATED`):
- **No repeated paragraphs:** exact-dup and near-dup (normalised edit-distance < threshold) across textBlocks → flagged, that page regenerates.
- **No contradictions:** outline beats vs final text event order; character state notes vs text (e.g. a character can't be "asleep" and "running" in adjacent pages without transition).
- **Pronoun/name check:** every textBlock uses canonical name spelling and the profile's pronouns; a `set(profile.pronouns)` vs text usage check.
- **Facts immutability:** diff facts referenced in text vs the `factsVersion` snapshot; mismatches → regenerated page.
- **Age band:** wordCount and a rare-word check vs band lists.
- **Locale:** wordlist map fully applied (no en-US spellings present in an en-GB book, and vice-versa) + football/measurement steer.
- **Character coverage:** pages reference only CharacterBible ids (wrong-child-count guard feeds forward to F-009).
QA results persist as `Story.qaReport`; failures are actionable per-page, not whole-book.

## 12. Privacy/security

No photos, no address, no payment data — the facts slice is the minimum needed for text. Facts are transmitted to the `StoryModel` provider as needed **per the documented provider contract (§7 trace: profile → provider → output → retention)**; no provider receives canonical profile data beyond this slice. Logged fields are field *names* only. Story rows live in the Book and are subject to profile retention/deletion (F-025, spec §18). `conceptSeed` and prompts are stored as structured inputs, never dumped to logs.

## 13. Analytics

Events (no sensitive payloads): `story_generation_started`, `story_generated` (pages, durationMs, costCents), `outline_failed`, `page_text_generated`, `page_text_regenerated` (reason bucket: retry|user|qa), `story_qa_failed` (check bucket), `page_text_failed`.

## 14. Acceptance criteria

Given/When/Then, testable:

- **Full success:** Given a SELECTED concept for Ava (5, en-GB), when story generation completes, then Story has N pages each `READY` with 1 primary textBlock + 1 illustrationCue, wordCount ≤40/page, `locale=en-GB`, no en-US spellings, and `factsVersion` matches the profile snapshot.
- **Outline gate:** Given an outline that fails validation, when the pipeline runs, then no PAGE_TEXT step starts, the job reports `FAILED` at `OUTLINE`, and retry with identical inputs produces an identical attempt key (no duplicate outline rows).
- **Per-page failure isolation (D010):** Given page 6 `FAILED` after retries, when the parent taps "Try page 6 again", then only page 6 regenerates (its `pageKey` matches, pages 1–5 and 7–N remain `READY`), and the replace commits without touching other pages.
- **Contradiction catch:** Given a draft where page 4 says "The dino hid inside the cave" and page 5 starts "Out in the forest", when QA runs, then the contradiction check flags page 5 and it regenerates before `STORY_GENERATED`.
- **Pronoun/fact immutability:** Given the profile's pronoun "she", when any textBlock contains "he" for Ava, then the name/pronoun check fails that page and the block is regenerated; similarly Bruno must remain a dog everywhere.
- **Regeneration determinism:** Given page 6 regenerated with an identical `pageKey` (no revision), when the response returns, then it overwrites the prior content and `generationMetadata.attemptCount` increments — no orphan pages, no duplicate rows.

## 15. Dependencies

- **Required first:** F-007 (selected concept), F-006 facts + F-003 profile (canonical facts fields incl. `locale`), F-010 job substrate, `StoryModel` interface (architecture v2).
- **Consumed by:** F-009 (illustration plans read `textBlocks` + `illustrationCue`), F-011 (reading preview), F-012 (page rewrite hooks), F-024 (wordlist mapping extension).
- **Parallel-safe:** F-004/F-005 (photos/bible) run independently; F-009 consumes the page contract but does not block text QA.

## 16. Priority

**P0 — launch / category parity.** Story quality is the platform's core output (spec §1, §25), every later surface (preview, illustrations, print) reads this model, and per-page resilience here is a hard reliability requirement (D010, spec §25 recovery). Everything downstream depends on it — no preview or book exists without it.
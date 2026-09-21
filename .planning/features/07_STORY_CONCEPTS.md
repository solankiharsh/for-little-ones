# 07_STORY_CONCEPTS.md — Story Concepts (3 Generated Ideas)

> **Spec ID:** F-007 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-002 (theme seed), F-003 (profile), F-006 (personal facts) · **Consumed by:** F-008 (story generation)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

After discovery (F-002) and personalisation (F-003/F-006), the parent is shown **three story concepts** — title, short pitch, emotional goal, theme, reading level, approximate length — and picks one, asks for a different set, or lightly edits one (spec §7 "The customer chooses one and can optionally modify it"). This is the **first `StoryModel` (text-generation) call** in the pipeline: it must return strict structured JSON that is validated, moderated, and bounded for cost before the Book moves on to story generation (F-008).

## 1. Goal

Turn "theme + child facts" into three *distinct, appealing, appropriate* story pitches so the parent makes a high-quality choice cheaply — never a single dead-end option, never a blank box (spec §7). A concept must be concrete enough to judge (title + pitch), grounded in the child (facts, age, locale), and safe by construction (no profanity, age-appropriate) because everything downstream (text, illustrations, print) inherits the chosen concept.

## 2. User value

- **Confidence:** three written pitches make the AI's intent legible and reducible to a simple "this one" decision.
- **Personal:** concepts use the child's real facts (name, favourites, family, pet, locale), which is the core of the product thesis (spec §19) — the book must "genuinely be written for that child".
- **Easier:** selection is one tap; modifying is optional (95/5 model, D003).
- **Cost discipline:** a single bounded concept call costs far less than a failed full-book generation; parents self-select the story direction before expensive pages run (spec §16, §25 recovery).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). Design risks the spec itself must avoid:
- **Invalid model JSON** breaking the card screen → required schema validation with a typed contract before render.
- **Profanity / inappropriate content** reaching a child-facing pitch → `ModerationProvider` gate.
- **Duplicated concepts** (three versions of the same idea) → uniqueness check on title/pitch.
- **Age-inappropriate vocabulary or story content** → age-band constraint in the prompt contract plus a post-check.
- **Infinite regeneration loops** (parent tapping "different ideas" forever) → bounded regenerate requests + rate limiting, cost visible internally (§13).
- **Leaking implementation detail** (seeds, model names, token counts) → never shown (D002).

## 5. Desired UX

Walkthrough (**Ava, 5**):

1. After the theme "Dinosaurs" and a few facts (Ava, 5, likes dinosaurs + strawberries, brother Leo, pet Bruno the dog), the screen shows a warm header: *"I've got three ideas for Ava's adventure."* Three cards, mobile-stacked:
   - **The Dino who Lost his Roar** — *"Ava helps a shy little dino find its voice — with Bruno by her side."* Tags: `Adventure · ~8 pages · Ages 4–6 · A story about confidence`.
   - **The Great Saurus Picnic** — *"Ava plans the best picnic in dino valley. Strawberries included."* Tags: `Fun · ~8 pages · Ages 4–6 · A story about friendship`.
   - **Bruno vs. the Volcano** — *"Ava and Bruno save a sleepy volcano from grumbling."* Tags: `Adventure · ~6 pages · Ages 4–6 · A story about being brave`.
2. Parent taps one card → it lifts/rings, the CTA becomes **"Start with this story"**.
3. Secondary actions: **"Different ideas"** (regenerate the whole set, up to N attempts, see §9/§10) and a per-card **pencil ("Tweak this one")** showing an inline edit form: editable `title`, editable `pitch` (maxlength enforced), read-only tags. Parent edits, saves.
4. CTA commits the concept → Book.state `CONCEPT_SELECTED`; flow proceeds directly to F-008 (progress label "Writing the adventure", F-010).

States:
- **Loading:** 3 skeleton cards (staggered shimmer), header copy already present; never a bare spinner for >2s.
- **Empty/none:** not a real state — the call always returns ≥3 or fails (see failure).
- **Failure:** "I couldn't think of good ideas just now. [Try again]" + fallback: the **catalogue-authored fallback concepts** stored with the theme (see §10) render instead, marked with a subtle "starter ideas" note. This guarantees the journey never hard-stops on a model outage.
- **Regenerate-limited:** after N (default 3) regenerate clicks, a calm message: "Happy with one of these? You can always change it later." + focus CTA toward selecting.

## 6. UI specification

- **Responsive:** cards stack full-width on phone, 3-across on ≥768px; tap target ≥44px; CTA thumb-reachable (D012).
- **Card anatomy:** title (serif display, warm ink), 1–2 sentence pitch, tag row (emotional goal pill first — "A story about confidence" — then length, age, theme). No AI/model tokens (D002).
- **Primary CTA:** one per card, appears as selected-state confirmation **"Start with this story"**; disabled until a card is selected or edited.
- **Secondary:** "Different ideas" (top-right ghost button) and per-card [Tweak this one] pencil.
- **Edit surface:** inline expand/collapse under the card — two fields (title ≤60 chars, pitch ≤240 chars), char counters, [Save] / [Cancel]; validation errors inline and product-voiced ("That title's a bit long — how about something shorter?").
- **Motion:** ≤200ms ease; selected card rings with accent colour; no parallax/gimmick.
- **Tone tokens:** pending DESIGN_SYSTEM.md (not yet authored — Assumption).

## 7. Domain model

New published concept entity is a **Story Concept** (canonical vocabulary); the Book keeps a reference. Data sketch:

```
StoryConcept
  id                        // uuid
  bookId                    // owning Book
  conceptVersion            // increments on regenerate/edit; used for idempotency
  themeSeedVersion          // captured from F-002 at generation time
  title                     // ≤60 chars
  pitch                     // 1–2 sentences, ≤240 chars
  emotionalGoal             // enum draft: confidence | bravery | kindness | friendship
                            //   | belonging | bedtime_calm | fun | curiosity
  themeId                   // from F-002
  readingLevel              // draft band: 0-3 | 4-6 | 7-9 (age band of vocabulary)
  approximateLengthPages    // int 4..12 (a page = one text page, see F-008)
  charactersRequired[]      // ["ava","bruno"] — subset of Book.relationships used
  locale                    // en-GB | en-US (from profile, F-024)
  source                    // "model" | "fallback" | "edited"
  status                    // PROPOSED | SELECTED | DISCARDED

Book (extension)
  selectedConceptId         // commit point for F-008
```

Structured model output contract (schema for the `StoryModel` call — validated, never trusted):

```jsonc
{
  "concepts": [
    {
      "title": "The Dino who Lost his Roar",
      "pitch": "Ava helps a shy little dino find its voice — with Bruno by her side.",
      "emotionalGoal": "confidence",
      "themeId": "dinosaurs",
      "readingLevel": "4-6",
      "approximateLengthPages": 8,
      "charactersUsed": ["ava", "bruno"]
    }
  ]
}
```

Rules: exactly 3 concepts; `title`/`pitch` required non-empty; `readingLevel` defaulted from the child, not re-invented by the model; `charactersUsed` must be a subset of relationships present in the Book.

## 8. Backend/API requirements

Command/query boundary via `BookService` + `BookRepository`; generation orchestrated by `GenerationJob` (F-010).

- `POST /books/{id}/concepts` → body `{ regeneratedVersion? }` → creates a concept bundle (idempotent: reuse when one exists and is `PROPOSED`, unless explicit `regenerate`), enqueues the `StoryModel` call, returns the bundle when ready/queued.
- `POST /books/{id}/concepts/{conceptId}/select` → sets `Book.selectedConceptId`, transitions Book.state to `CONCEPT_SELECTED`; idempotent re-select returns same result; only one concept can be SELECTED per book.
- `PATCH /books/{id}/concepts/{conceptId}` body `{ title?, pitch? }` → light per-card edit; sets `source=edited`; re-runs moderation gate; rejects (422 with message) if edited copy fails moderation.
- `POST /books/{id}/concepts/regenerate` → produces a *new bundle* (new ids, `conceptVersion+1`); old bundle `DISCARDED`; counted against the per-book budget (default 3; configurable per plan).
- Auth: all scoped to session-owned Book (F-001 claim). Validation: enums, length caps, character subset, locale format.

## 9. Background jobs

A single `GenerationJob` of kind `CONCEPT_BUNDLE` (F-010 step `GENERATE_CONCEPTS`):
- Trigger: `POST …/concepts` (or regenerate).
- Inputs: `themeSeed`, canonical facts subset (name/age/display name/pronouns/favourites/relationships/pet, locale) — **photos never enter this call**.
- Output: validated `StoryConcept[3]` persisted via `BookRepository`.
- Retry: up to 2 automatic retries, exponential backoff, timeout ~45s per call.
- Resumability: bundle persists at `PROPOSED` once written; a crashed worker resumes by checking for an existing `PROPOSED` bundle under the same `bookId`+`conceptVersion` (idempotency key = `bookId:conceptVersion`).
- Failure: job → `FAILED`, Book.state stays pre-concepts; the fallback concepts path (§10) is served from the API, not from a second worker pass.

## 10. AI behaviour

Provider interface: **`StoryModel`** — method `generateConcepts(context): StoryConcept[]` (proposed signature; the interface lives behind the provider adapter boundary, D004).

- Required context fields: `themeSeed` (from F-002, structured), child `displayName` + age band, pronouns, favourite things (top 3), relationships (names + relationship type), pet, `locale`, `readingLevel` band, requested `emotionalGoal` hints if the parent set one in F-006.
- **Immutable facts** (spec §11): name, pronoun, family/pet names, locale, structured interests — injected verbatim as keyed fields; the model must not be allowed to restate them as free prose (they are validated after, §11). Never passes photos (privacy §12).
- Output: JSON matching the §7 schema; the `StoryModel` impl is wrapped by a **schema validator** that strips unknown fields and rejects on missing `title`/`pitch` (degrading to retry, then fallback).
- Post-checks: uniqueness of titles, profanity gate via **`ModerationProvider`** on title+pitch, age-band sanity on `readingLevel`. Any failed concept is regenerated from a narrowed retry (or the whole bundle retried once).
- Fallback: **catalogue-authored fallback concepts** stored on the theme (3 per theme, written by humans at content time, F-026) — served when the model path fails twice, keeping the journey alive.
- Cost: budget the model call ~3 concepts in one request (≤ ~600 output tokens); bound regeneration via the per-book budget in §8. Track spend per concept bundle (feeds F-027).

## 11. QA

Auto-checks at this step (feeds the QA catalogue): identity/name mismatch (concept must use the Book's canonical child name spelling), pronoun consistency, story contradiction (concept-level: pitch must not contradict known facts — e.g. pet Bruno must be a dog, not a cat, when the profile says dog), age appropriateness, profanity/moderation. Validate concept characters are a subset of Book relationships (wrong-child-count guard at the concept level).

## 12. Privacy/security

No photos, no address, no payment, no full profile — only the minimal facts named in §10 are assembled for the provider call and logged as a field-name list, never the values (applies §7 trace: facts → `StoryModel` provider → output → retention). Concept rows are retained with the Book for revision history, are not public, and are covered by the profile deletion contract (§18 of spec, F-025). Provider receives only what the canonical profile exports; no raw photo bytes.

## 13. Analytics

Events (no sensitive payloads): `story_concepts_generated` (count, latency, attempts), `story_concept_selected` (conceptId bucket only), `story_concepts_regenerated`, `concept_edit_applied`, `concepts_served_from_fallback`, `concept_generation_failed`, `concept_generation_cost` (pennies, for F-027).

## 14. Acceptance criteria

Given/When/Then, testable:

- **Happy path:** Given Ava's Book with theme+facts set, when `POST …/concepts` completes, then exactly 3 `PROPOSED` StoryConcepts persist, each with non-empty `title`/`pitch`, reading level `4-6`, and `charactersUsed ⊆ relationships`.
- **Selection idempotent:** Given one concept SELECTED, when the select endpoint is called again, then Book state is unchanged and the response is identical.
- **Moderation block:** Given an edited pitch that trips `ModerationProvider`, when the parent saves, then 422 with product copy, the pitch is not persisted, and no `concept_edit_applied` fires.
- **Model failure recovery:** Given the `StoryModel` call fails twice, when the bundle is requested, then fallback concepts render with "starter ideas" copy, Book state remains navigable, and the flowing app never throws.
- **Regeneration isolation:** Given a regenerate call, when the new bundle persists, then the old bundle is `DISCARDED`, `conceptVersion` increments, and F-008 consumes only the new `selectedConceptId`.
- **Fact immutability:** Given the profile says "Bruno — dog", when any pitch is generated, then the pitch never types Bruno as a cat (validated at QA, §11).

## 15. Dependencies

- **Required first:** F-002 (theme + `conceptSeed`), F-003 (profile base), F-006 (facts), F-010 (job/queue substrate), `StoryModel` provider interface agreed (architecture v2).
- **Consumed by:** F-008 (outline/page text) takes `selectedConceptId` as its narrative contract; F-011 preview and F-012 corrections build on the chosen concept later.
- **Parallel-safe:** F-004/F-005 (photos/bible) run in parallel — concepts deliberately exclude photos.

## 16. Priority

**P0 — launch / category parity & core generation.** Story selection is the heart of the create-a-book flow (spec §7); without it the product falls back to prompt-box or fixed-template, losing the core differentiation in spec §1/§5. It sits ahead of F-008 so category-parity generation is unblocked.
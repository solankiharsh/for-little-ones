# 06_PERSONALISATION.md — Progressive Personalisation (Structured Facts)

> **Spec ID:** F-006 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-003 (Child Profile); consumed by F-007 (concepts), F-008 (story generation), F-024 (localisation)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Personalisation is progressive (spec §6): **Required** (name, age, photo — F-003/F-004), **Useful** (favourite things, interests, animal, colour, toy, people, pet, hobby), **Story-specific** (adventure/bedtime/funny/confidence/starting school/new sibling/kindness/birthday…), and **Optional deep details** (1–3 flavour facts like "Teddy is called Mr Bear"). Everything is captured as structured, typed, locale-aware facts with provenance; nothing is reduced to loose strings (spec §11), and only parent-confirmed facts reach the story generator immutably (spec §25).

## 1. Goal

Two problems shape this feature: (1) a blank-prompt or twenty-field form kills gift buyers (spec §7), so personalisation must be layered and skippable; (2) the more detail a generator gets, the more chances it has to get details *wrong* — Adorabook's football mistake (spec §2, §11) shows that untyped strings get reinterpreted by models. The goal is the deepest personalisation in the category (spec §6) with structured typed facts whose meaning the generator cannot corrupt.

## 2. User value

- **More personal result:** stories reference the child's real favourites, people, pets and quirks naturally, not as clichés (spec §6 "appear naturally rather than being dumped awkwardly into dialogue").
- **Effortless to fill:** progressively layered so most parents give 3–6 facts and skip the rest; only name/age/photo are required.
- **Fewer wrong-detail complaints:** typed, locale-aware facts (sport = association football, team = Nottingham Forest, locale = en-GB, spec §11) remove the category's most embarrassingly visible error class.
- **Repeat usage:** facts persist on the profile (F-003) so the second book stays effortless, aiding retention (spec §13/§14).

## 3. Current implementation

None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). The design must avoid:

1. **Storing semantics as loose strings.** `interests = "football"` is corruptible (spec §11). Every fact has a type, an option from a locale-aware enumeration or a validated value, and a `locale` — so meaning never relies on the model's guess.
2. **Fact mutation.** Parent-confirmed facts are immutable inputs to generation (spec §25). Any regen must re-send the same values; the UI "Changed" banner (§6) is the only mutation path.
3. **AI suggestions crossing into facts unconfirmed.** Like F-005, any AI-suggested value (`suggestedFact`) remains proposal until the parent confirms (guide §10: never store uncertain AI inference as fact).
4. **Over-filling.** Forcing all fields makes gifting take too long; progressiveness is the design guard (spec §6).

## 5. Desired UX

**Flow during first book (Ava, 5):** after photo (F-004), a **one-screen facts card**: a few friendly chips — "Ava's favourites" → taps: Favourite animal 🦖, Favourite colour, Favourite toy, A pet, A person they love, A hobby. Each tap expands one row of *choice chips* (locale-aware: an en-GB list, no free text except where validated). Then **"What should Ava's story feel like?"** → story-specific mood chips (adventure, bedtime, funny, confidence, starting school, new sibling, kindness, birthday — spec §6 list).

Deep details are offered as "Add a lovely little detail (optional)" — 1–3 free-text sentences, each parsed and labelled for insertion ("A boy who…", "A thing…", "A name…"). Example: "Teddy is called Mr Bear" → stored as `customFact{subject: teddy, fact: called Mr Bear}`.

Subsequent books: all Useful + custom facts pre-filled from the profile; parent adjusts only what they want for this story; **Continue** is always enabled even with zero additional facts (only F-003/F-004 mandatory).

**Edit/review:** facts shown on the profile "Likes & the little things" section with "We'll use this in new stories" hint. Changing any fact shows "Changed" confirm: "New stories will use: {value}. This won't rewrite books you've already approved." Fact suggestions (from photo-analysis or story models) appear as "Maybe this?" chips; they do not count as facts until tapped.

**Error/edge case:** a `customFact` free-text contains conflicting sentiment ("loves dinosaurs, hates dinosaurs") → friendly prompt to pick one or it's not stored; a suggested fact model call fails → suggestion chips simply don't render (non-blocking).

## 6. UI specification

- **Facts card:** one column on mobile (D012); each chip row: label + selected value pill + "change". Completed rows collapse; un-tapped rows stay visible but small. Primary CTA **"Write Ava's story"** (enabled always); secondary "Skip the details".
- **Choice chips:** locale-aware typed pickers — a sport row renders the locale's sport list (en-GB: association football, cricket...; en-US: soccer, football ✓ elsewhere) so the string can never be "football/US" ambiguity (spec §11 literal fix). Colour/toy/animal lists likewise typed enums.
- **Mood chips:** single-select story-specific mood; affects F-007 concept generation only, not stored as a fact.
- **Deep details:** 1–3 text fields, each with example placeholder ("Teddy is called Mr Bear"), char limit 200, validated by parse (§7). Visible labels explain what will happen: "We'll weave this into the story."
- **Anytime-edit:** "Your details" sheet from anywhere in creation — add/change/remove facts (confirm on change) — plus the inline Facts card.

## 7. Domain model

Entity **Fact** (canonical vocabulary: profile-typed facts). Compact sketch:

```text
Fact
├── id, childProfileId | storyScoped? (false default)
├── type:  interest | favouriteAnimal | favouriteColour | favouriteToy | favouriteFood
│          | pet | hobby | person | sport | customFact | storyMood(not a fact: config)
├── value (typed):                                  ← never a raw prose string
│     - enumId (locale-aware option) | sport:{game:association-football,team?}
│     | personRef → Relationship id | petRef → Pet id | custom:{subject,claim}
├── locale: en-GB | en-US | …                      ← meaning lives here (spec §11)
├── provenance: parentTyped | parentPicked | aiSuggested
├── state: parentConfirmed | suggested | rejected        ← immutable unless parent acts
├── confirmedAt, confirmedBySession/account
├── freeTextFragments[] for customFact ("called Mr Bear")
└── storyUsage[] {storyId, usedAs}                  ← audit: which story used this fact
```

**Typed taxonomy (spec §6 mapped):**
- *Useful* → `interest`, `favouriteAnimal`, `favouriteColour`, `favouriteToy`, `person` (people they love), `pet`, `hobby`.
- *Story-specific* → not a Fact; it is `StoryConcept.mood` (see F-007).
- *Optional deep* → `customFact` (1–3, free-text but structured: `{subject, claim}`).
- `sport` is a first-class typed fact (association football example, spec §11) with locale binding.

**Rules:**
1. `parentConfirmed` facts are immutable inputs to StoryProvider (F-008). Generation sends type + value + locale, never a flattened prose blob.
2. `suggested` facts are stored outside generation inputs and rendered as "Maybe this?".
3. `rejected` facts are the parent's explicit no — never auto-re-asked for 30 days (provenance hygiene).
4. Locale-aware options are re-resolved at selection time by locale; stored options keep the locale at capture (spec §11 — vocabulary, foods, measurements, seasonal references adjust per book locale later, F-024).

## 8. Backend/API requirements

Proposed boundary (proposed shared subsystem `BookService` + a typed-option catalogue; names consistent):

- `GetFactOptions{ type, locale }` → enumerations (catalogue may be code-defined or DB-driven; **Decision needed:** static enums per locale shipped with app vs a small managed catalogue — static preferred at launch, revisit for new locales in F-024).
- `AddFact{ childProfileId, type, value, provenance }` — `provenance` may be `aiSuggested` only from sanctioned suggestion jobs; client cannot set `parentConfirmed` without a confirmation action.
- `ConfirmFact{ factId }` | `RejectFact{ factId }` | `UpdateFact{ factId, value }` (bumps `confirmedAt`; audit retained).
- `SuggestFacts{ childProfileId }` → job that emits suggested facts (see §9).
- `GetFactsForStory{ childProfileId, mood }` → the generation-eligible, parentConfirmed fact set, typed, locale-bound — the sole fact input to F-007/F-008 (adapter guard: no other fact query path).
- Validation: type-allowed value shapes; customFact ≤ ~200 chars; ≤3 customFacts; sport requires game∈enum + optional team; person/pet must reference valid Relationship ids. Idempotency: `factToken` on `AddFact`.

## 9. Background jobs

**Job: FactSuggestion** (`GenerationJob`; optional enhancement): lightweight pass over confirmed profile facts (and, only with photo consent, derived personality heuristics from F-004's image analysis) to propose missing Useful facts (e.g., "Ava loves dinosaurs?") as `suggested`. Retry 2×; timeout 30s; non-blocking (absence = no suggestions rendered); idempotent (same input ⇒ same suggestion ids, cancellable/overridable). No provider sends profile facts unless documented under F-025. **(Recommended experiment:** measure suggestion acceptance rate; if <5%, disable the job and rely on UI prompts — keeps AI noise out of a warmth-critical moment.)

## 10. AI behaviour

- **StoryProvider (F-008)** contract: receives the §8 `GetFactsForStory` set as immutable structured context. It must: spell names/pronouns exactly (spec §10: name mismatch, pronoun mismatch), use facts verbatim where referenced (contexts like "Mr Bear" are a proper name, not paraphrase material), never invent a counter-fact ("contrary to Ava's favourite colour, the horse was green"), and weave customFacts naturally rather than dumping them into dialogue (spec §6).
- **FactSuggestion emitter** (F-007 concept + this job) may call a cheap LLM only to *propose*, and any proposal is flagged `aiSuggested` — it is promoted only by a parent tap.
- **Locality:** model always receives the fact `locale`; en-GB stories must say "football" = association football without the model choosing an American reading (spec §11). **Decision needed:** whether to pin vocabulary explicitly per locale into the prompt context (recommended) vs rely on locale-tuned models.

## 11. QA

Feeds (catalogue refs): name mismatch — story must match `Fact`/profile first name; pronoun mismatch — must match `pronouns`; story contradiction — a regenerated page must not contradict an already-approved page's fact usage (`storyUsage[]` provides prior usage for the contradiction check); duplicate content — never repeat a fact sentence verbatim across pages. Post-generation, an automated probe asserts every `parentConfirmed` fact that *should* appear for the chosen mood is either referenced accurately or omitted — it must never appear mutated.

## 12. Privacy/security

- Facts (esp. `customFact`, family `person`/`pet` refs, favourites) are sensitive personal data (guide §7): no logging of values, no analytics payloads, no exposure to commerce/print/analytics providers.
- Suggested facts come from the profile image analysis only with photo consent (F-004 consent banner / profile privacy settings).
- Retention follows the Child Profile (F-025); rejecting/removing a fact removes it from `GetFactsForStory` immediately, and `storyUsage` history is scrubbed of the value while the story-id mapping is kept (per F-025 contract).
- `person`/`pet` facts point at Relationship entities, not free-text names, so family-member naming is consistent and centralised (guide §3).

## 13. Analytics

`facts_screen_shown`, `fact_added` (type only), `fact_confirmed`, `fact_suggested_accepted`, `fact_rejected`, `custom_facts_used_in_story` (count). No values, names, or locale-specific personal payloads (guide §13 rule).

## 14. Acceptance criteria

1. Given an en-GB profile with `sport=association football, team=Nottingham Forest`, When F-008 generates a story, Then the generated text describes association football and the team — never "soccer" or a US-league reading (spec §11 verbatim binding).
2. Given a `customFact` "Teddy is called Mr Bear", When the story references the teddy, Then it refers to "Mr Bear" exactly (proper-name fidelity) and does not apologise or over-explain the fact in dialogue.
3. Given a `suggested` fact, When generation runs before confirmation, Then `GetFactsForStory` excludes it and the story contains no trace of it.
4. **Recovery:** Given a parent changes `favouriteColour` after a book is approved, When later books generate, Then they use the new colour while the approved book's revision remains unchanged (D011) — and the "Changed" confirmation banner was shown.
5. Given a parent rejects a suggested fact, Then it enters `rejected` and is not re-asked within 30 days.
6. Given a story that should use the confirmed pet "Bruno", When pages are generated, Then every page where Bruno appears uses the relationship id value "Bruno" — QA finds no name drift.

## 15. Dependencies

- Must exist first: F-003 (Child Profile to attach facts), F-004 (photo; optional suggestion source), F-001 (session for confirmedBy).
- Consumes this spec: F-007 (concepts conditioned on facts + mood), F-008 (immutable fact context), F-024 (locale enumeration rebuilds), F-023 (`person`/`pet` fact refs to Relationships).
- Parallel: F-005 (appearance confirmation is F-005's, not facts), F-012 (corrections).

## 16. Priority

P0 — launch/category parity. Adorabook sets a deep-personalisation benchmark (spec §2) and "child details" is listed P0 parity (spec §26). But the *typed-fact discipline* is what protects us from the category's most visible quality complaint (wrong details, spec §2), and layered skippability protects the gift-buyer moment. Rationale per mission §33 filter: more personal result (depth), fewer support problems (typed facts prevent wrong-detail fallout), repeat usage (facts persist). The optional-deep and suggestion rails could be trimmed to bare `useful` facts at launch without breaking this spec's core contract.
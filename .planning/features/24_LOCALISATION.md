# 24_LOCALISATION.md — Locale-Aware Facts, Localisation & Bilingual Books

> **Spec ID:** F-024 · **Priority:** P2 · **Status:** draft
> **Depends on:** F-003 (Child Profile — locale stored from day one) · F-006 (Personalisation — structured facts) · F-008 (Story Generation) · F-017 (Print Rendering — fonts/glyphs/measurements)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Localisation is structured facts, not translation-with-hope (spec §11, the Adorabook "football" failure). Facts carry locale + disambiguation — `sport=association football · team=Nottingham Forest · locale=en-GB` — and are never reduced to a loose "football" string. Locale steers vocabulary, spelling, school terminology, sports, foods, measurements, seasons and cultural references. en-GB and en-US ship first; bilingual books (EN+Hindi/Punjabi/Spanish/French) are a later differentiator, but the data model carries bilingual text from day one and the locale is stored on the Child Profile from day one.

## 1. Goal

Make a book feel *written for* a family, including how they talk: region-correct vocabulary, correct school words, the right sport, the right units, the right seasons ("autumn" vs "fall", "football" vs "soccer", "Year 1" vs "1st grade", "primary school" vs "elementary"). Failing at this is a visible, embarrassing correctness bug (spec §11 quote). The second goal is a data model that lets one book be genuinely bilingual (EN + a heritage/family language) without retrofitting later.

## 2. User value

- Correctness: no more culturally inappropriate interpretations and no wrong-sport laughs (spec §2, §11).
- Belonging: a Punjabi-English or Hindi-English book is meaningful family value competitors don't provide (spec §11: "particularly strong differentiation"; §26 P2 bilingual).
- Friction-free: locale inherits from the Child Profile on each new book; nothing is re-entered.

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems extended: `BookService`/`BookRepository` (locale on profile + book; bilingual text model), `CharacterBible` (no locale impact), `GenerationJob` (per-locale story variant steps), provider interface `StoryModel` (locale+structured-fact context), F-017 print renderer (font/measurement/glyph handling).

## 4. Problems with current implementation

Not applicable — greenfield. The design risk is the data model: if facts and text blocks have no locale slot, bilingual and region-correct books force an ugly retrofit. This spec requires locale to be a first-class attribute on the Child Profile (F-003) and the Story text model (F-008) from the first implementation.

## 5. Desired UX

Parent (en-GB, Nottingham) starts a book for Ava: locale is pre-filled from Ava's profile (en-GB). Under "What does Ava love?" they pick **Football** from a type-ahead that resolves to `association_football`; a separate field "**Her football team — Nottingham Forest**". The story says "Ava kicked off for her football club", "autumn", "Year 1", "half a metre" — never "soccer", "fall", "1st grade". A second family, telling the same story in en-US (Anya, in Atlanta), gets a genuinely different vocabulary. Later (P2): the same story offers "English + Punjabi" — reading shows a slide-together spread, EN on one page, Punjabi mirror on the other, both generated from the same structured facts.

## 6. UI specification

- Profile locale: a region picker (locale + country) on F-003, defaulting to the identity session's region but parent-editable; shown once, never asked per book.
- Fact fields: structured pickers (sport, team, school year, food, measurement) so parents choose a unit of truth that has a locale, not free-text where a model must guess.
- Bilingual: a chip on the book editor "Your language: English + Punjabi"; per-page slide/paired reading layout in the F-011 reader; print (F-017) renders the second language on the mirror page with correct glyphs (e.g. Gurmukhi). Parsing: if the platform cannot render a script in print, the option is disabled with a clear reason rather than a corrupt page.

## 7. Domain model

Spec §11's structured-fact shape becomes the canonical fact record on F-006:

```text
StructuredFact { factType(sport|school|food|measurement|season|culture),
                 canonicalValue("association_football"), qualifiers{team:"Nottingham Forest"},
                 locale(en-GB|en-US), source(parentConfirmation), immutable=true }
Profile { locale, secondaryLanguages[] }
Book { locale (inherited from protagonist profile), textLocales[],
       textBlocks[].localeTag, textBlocks[].parallelText{localeTag→text} }
```

`textLocales[]` carries the bilingual pair from day one even when only one is populated. Facts with no locale are rejected at the boundary (a sport without disambiguation is ambiguous and must be confirmed by the parent).

## 8. Backend/API requirements

Commands: `setProfileLocale`, `setFact(factType, canonicalValue, qualifiers, locale)`, `setBilingualPair(bookId, [localeA, localeB])`. Validation: `canonicalValue` must resolve against a locale-scoped vocabulary (an en-GB "football" = association_football; en-US "football" must be disambiguated rather than assumed); `qualifier.team` validated to the club not the sport. Locale is immutable history on facts — a parent fixing a fact records a new confirmed fact, never a silent mutation (spec §6, §25).

## 9. Background jobs

Bilingual books run `GenerationJob` story variants per locale: `story_generation_started(locale)` … `story_generated(locale)` as separate steps so one language failing does not fail the book; per-locale QA runs independently; print artifact (F-017) is a per-locale-bound pipeline step.

## 10. AI behaviour

`StoryModel` receives the locale + structured facts only — vocabulary, spelling, school terms, units, seasons and cultural references are constrained to the confirmed facts and locale rules; the model never reinterprets a fact into a different locale's equivalent (spec §6 "preserve and validate facts"). Bilingual: `StoryModel` generates the second language from the *same* structured facts + approved canonical text (translation is a scaffold, not a second invention that can drift). Humour/idiolect instructions are locale-flagged so en-GB vs en-US differ authentically.

## 11. QA

New catalogue checks: **locale-spelling** (en-GB colour/autumn vs en-US color/fall), **locale-vocabulary** (football/soccer, chips/fries, Year-1/1st-grade), **unit consistency** (imperial vs metric never mixed), **seasonal/cultural reference validation** (Christmas vs winter, autumn vs fall), **bilingual pairing** (both `textLocales` present on advertised pages, glyph coverage per print font — spec §25 quality bar re "vocabulary appropriate to selected reading age").

## 12. Privacy/security

Locale itself is minimal, non-sensitive data (guide §7 easing). Confirmed facts remain immutable and per-person; no additional provider exposure beyond what F-025 documents (a bilingual generation may hit additional provider regions — that provider is covered by the §7 provider documentation rule). Deletion contract = Child Profile / Book deletion per F-025; no locale-specific retention.

## 13. Analytics

`locale_set(profile)`, `fact_confirmed(sport|team|food|...)`, `bilingual_pair_selected`, `bilingual_generation_failed(locale)`. Locale values only; no names or photos.

## 14. Acceptance criteria

- **Given** a profile with `locale=en-GB` and fact `sport=association_football, team=Nottingham Forest`, **when** the story generates, **then** every page reads "football" and references the team, and no page contains "soccer", "fall" or other en-US vocabulary.
- **Given** a parent types "football" with no team, **when** the fact saves, **then** the system forces a locale-scoped disambiguation instead of guessing.
- **Given** a bilingual EN+Punjabi book is ordered, **when** print runs, **then** both `textLocales` render with correct Gurmukhi glyphs and safe-area checks pass for both scripts.
- **Recovery** **Given** the Punjabi story variant fails during generation, **when** QA/monitoring notes the step, **then** only that locale's step retries/resumes and the EN variant is never regenerated or lost (per-locale step isolation, F-028).
- **Given** a profile locale changes from en-GB to en-US, **when** a sequel is created, **then** new facts are re-confirmed under en-US and previously confirmed en-GB facts remain recorded unchanged, never silently reworded.

## 15. Dependencies

F-003 (locale on profile — required from day one), F-006 (structured facts), F-008 (locale-aware text), F-017 (print fonts/glyphs — needed before a bilingual book ships to stores). F-015 QA catalogue extension. Can build locale-aware facts before F-023; bilingual pairs slot into the same model. Note: platform UI localisation (the app chrome's translations, distinct from book content) is in scope here only as strings reused across the design system.

## 16. Priority

**P2 — retention/delight**, with a day-one data-model hook. Locale-aware facts are arguably P0-adjacent for correctness (a wrong-sport book is a refund), so the *structured-fact + locale* skeleton lands with F-006; the full en-GB/en-US vocabulary + QA + bilingual output are P2 (spec §26: bilingual = P2 differentiator). En-GB/en-US first per spec §11.

**Decision needed:** which bilingual pairs ship first (spec §11 proposes EN+Hindi/Punjabi/Spanish/French), and whether bilingual books are a SKU premium or a free option (pricing/commerce); whether the "second language" is generated from canonical text or independently authored (fidelity vs naturalness trade-off — recommend generate-from-structured-facts).
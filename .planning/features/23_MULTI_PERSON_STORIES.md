# 23_MULTI_PERSON_STORIES.md — Multi-Person / Family Stories

> **Spec ID:** F-023 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-003 (Child Profile) · F-004 (Photo Upload) · F-005 (Character Bible) · F-006 (Personalisation) · F-008 (Story Generation) · F-009 (Illustration Generation) · F-015 (Book QA)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Families, not just a single child, are modelled as first-class entities (spec §12): **Child, Sibling, Parent, Grandparent, Friend, Pet**. A Book carries a *cast* of child profiles plus typed relationships, and relationships influence the **narrative** — premise, arcs, dialogue, the "family memory" being told — not merely which faces appear in illustrations ("Me and Grandpa", "My New Baby Sister", "The Twins' Space Mission", "Me and Bruno the Dog"). Every cast member has an identity; identity QA must detect sibling-swap and wrong-child-count (spec §10). This extends the F-005 Character Bible (one per person) and F-008 story generation (cast-aware).

## 1. Goal

Competitors paste multiple faces into pictures; we let a relationship tell a story. The deepest personalisation gap (spec §2, §12) is modelling *who people are to each other* and using it in the narrative, while keeping every person visually consistent and QA-checked.

## 2. User value

- Grandparents, new-sibling and pet stories are among the most gift-driven branches (spec §2, §12); each is a visibly different *kind* of book, not a retheme.
- The child sees real family reflected — deeper emotional meaning and repeat purchase (spec §20 journey).
- Confidence: a twin book where both children stay recognisable, where no sibling's face is swapped and the right number of children appears, is a clear differentiator plus a solved support problem (spec §10).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems extended: `BookService` (cast assembly), `CharacterBible` (one identity per person), `GenerationJob` (per-page, per-person identity), provider interfaces `IdentityProvider` (sibling-swap QA), `StoryProvider` (relationship-aware narrative), `QualityProvider` (count/presence checks).

## 4. Problems with current implementation

Not applicable — greenfield. Design risks:

- Reducing a family to "secondary characters" — cast members must be full participants with identities, not decoration (spec §12).
- Relationship-blind generation: premises must come from typed relationships, so "My New Baby Sister" is never about a sibling who isn't there and a dog is never given a child's dialogue.
- Identity QA treating one face as the default and others as optional — every person is a first-class identity subject (sibling-swap = unrecoverable if printed).

## 5. Desired UX

Walkthrough: Leo's parents open a new book. Under "Who's in this story" they pick Leo (Child, existing profile), Sophie (Sibling, new profile: photo + name + age + "big sister"), and Bruno (Pet: photo + "family dog"). They choose a feeling (F-007). Concepts tailor to the group: *The Twins' Space Mission*, *Leo and Sophie's Big Plan*, *Bruno's Birthday Parade*. Selecting one generates a book where both children and the dog carry the action. During review, an identity flag appears on page 4 ("Two faces look swapped — want me to redo this page?") — one tap fixes just that page (F-012). Cast management screens show only the people needed for a story; a single-child book never asks for siblings.

## 6. UI specification

- Cast builder: cards per person with role chips (Child/Sibling/Parent/Grandparent/Friend/Pet); add-person CTA; profile picker reused F-003.
- Concept screen: relationship-aware themes are the default cards (spec §7 examples); a person can be pulled from or pushed into a concept before generation ("add a sibling", spec §9 whole-story action).
- Character select during review: faces labelled by name so the parent can verify who is who (sibling-swap self-check before QA runs).
- Mobile: bottom-sheet role picker; one-handed small avatars.
- Failures: a person whose photo fails QA is blocked with a friendly message ("We couldn't get Bruno to a good likeness — try another photo"), scoped so the rest of the cast proceeds.

## 7. Domain model

Canonical guide §2 already has `childProfiles[]`, `characters[]` (canonical Character Bible entities), `relationships[]`. Roles are set on each participant profile:

```text
PersonProfile { profileId, role(Child|Sibling|Parent|Grandparent|Friend|Pet),
                name, displayName, pronouns, locale, childProfileId? }
Relationship { id, fromPersonId, toPersonId, type, label("big sister","our dog") }
Book { childProfiles:[PersonProfile...], characters:[{profileId→CharacterBible}],
       relationships:[...], cast: unique roleId per participant }
```

`relationKey = (fromType,toType,type)` drives narrative templates: e.g. `Child→Sibling(bigSister)`, `Child→Grandparent`, `Child→Pet(dog)`. Text blocks reference cast members by `roleId` so QA can count and match.

## 8. Backend/API requirements

Commands: `addPersonToBook(bookId, profileId, role)`, `removePersonFromBook(bookId, profileId)` (removes their pages/lines and its Character Bible reference — reversible via re-add + regenerate flag), `setRelationship(type,label,from,to)`, `chooseCastAndConcept`. Validations: a cast needs exactly the book's own protagonist types (≥1 Child; any number of others); preventing wrong-child-count means the *story* must name every cast member — a cast member never mentioned is a QA failure, not a silently dropped child. Idempotency for concept (F-007) and per-person generation payloads.

## 9. Background jobs

`GenerationJob` gains per-person identity inputs: each page's illustration plan references the identities of exactly the people who appear on that page (never the whole cast). A person added mid-draft triggers regeneration of only affected pages. Identity QA for each person runs as a step; sibling-swap is checked pairwise per page. One page failing for one person regenerates only that page with the same identity refs (D010).

## 10. AI behaviour

- `StoryProvider`: gets typed relationships + per-person facts; a structured cast manifest is mandatory context; a prompt referencing an absent role is rejected (structured output + validation, spec §6 "preserve and validate facts").
- `IllustrationProvider`: receives each featured person's identity reference; decorative elements must not imply extra children (QA counts faces vs cast).
- `IdentityProvider`: pairwise comparison per person; outputs per-person swap/count verdicts for `QualityProvider`.
- Facts stay immutable (spec §6, §25); adding a person never mutates an existing profile.

## 11. QA

Adds to the F-015 catalogue: **sibling-swap** (identity compare each character to its Bible; flag swapped), **wrong-child-count** (illustrated faces vs cast present on the page, plus story mentions vs cast), **relationship consistency** (e.g. a parent never drawn as a child, a pet never speaking in child dialogue), plus existing name/pronoun/contradiction checks per person (spec §10 list).

## 12. Privacy/security

More people = more likeness data (guide §7). Each person's photo, likeness and facts live under their own profile with **per-person consent + retention** (F-025 is authoritative). Deleting or revoking one family member propagates: their Character Bible, likeness assets, page content and provider payloads are removed, and affected books are flagged `REVISION_REQUIRED`. Cast data is never logged and never exposed via public URLs.

## 13. Analytics

`cast_size_selected`, `relationship_type_reported(grandparent|sibling|pet|...)`, `sibling_swap_flagged`, `sibling_swap_fixed`, `wrong_child_count_flagged`. No photo/person data in events (guide §7).

## 14. Acceptance criteria

- **Given** a cast of Leo, Sophie and Bruno with a `Child→Pet` relationship, **when** concepts generate, **then** all three are present in prompts and the selected concept's premise is relationship-aware (no concept ignores Bruno).
- **Given** a twin book where two children look swapped on page 6, **when** identity QA runs, **then** the page is flagged as `REVISION_REQUIRED` with a sibling-swap verdict and one-tap repair.
- **Given** a page illustrated with three children in a two-child story, **when** QA runs, **then** `wrong-child-count` blocks approval until the page is regenerated.
- **Recovery** **Given** a generation failure on one page of a four-person story, **when** the job retries that page, **then** only that page regenerates, all four identities stay consistent, and the book resumes to `READY_FOR_REVIEW`.
- **Given** a parent revokes one family member's consent, **when** deletion completes, **then** that person's likeness/contents are removed and every affected book is flagged for revision.

## 15. Dependencies

Extends F-003 (roles on Child Profile), F-005 (per-person Bible), F-006 (per-person facts), F-008/F-009 (cast-aware generation), F-015 (QA catalogue). F-025 provides per-person deletion. Can build in parallel with F-021/22 (cast surfaced in library) and F-024 (per-person locale).

## 16. Priority

**P1 — our reason to exist** (mission §26: "multiple people and relationships" is core differentiation; §33 filter: more personal result, confident print). Multi-person is not just an extra book type — it changes the emotional scope of what a personalised book can be and defeats a visible competitor weakness (Adorabook single-child normal book, spec §2).

**Decision needed:** whether **Friend** and casual one-off participants need a full child profile or only a minimal identity entity (photo + name); whether a **Pet's** identity comes from photos, description, or both (identity-fidelity vs consent trade-off).
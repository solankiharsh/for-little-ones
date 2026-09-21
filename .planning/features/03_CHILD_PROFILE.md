# 03_CHILD_PROFILE.md — Reusable Child Profile

> **Spec ID:** F-003 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-001 (onboarding/anonymous session); consumed by F-004, F-005, F-006, F-023, F-024
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

A Child Profile is the reusable, parent-maintained record of a child (spec §13: name, age, photos, likes, family). It is created inline during the first book and reused across every later book so the second story takes seconds. Facts live here with explicit provenance so generation never stores an uncertain AI inference as a fact (spec §2 Adorabook, §11 football lesson).

## 1. Goal

A parent must not re-enter the same child details for every book (spec §13: "A parent should not upload the same information again for every book"). The profile owns the child-level facts that many features consume: photos (F-004), the Character Bible (F-005), structured personalisation (F-006), multi-person stories (F-023) and locale-aware generation (F-024). It must persist across an anonymous first session and a later-claimed account (spec §20: no account wall; claim at save/resume/order).

## 2. User value

- **Repeat usage:** the profile makes "create the second book in seconds" real (spec §13), converting gift-only buyers into repeat customers — a category-wide weakness (spec §3 matrix: saved child profile).
- **More personal result:** the same trusted facts feed every story, so character and details stay consistent book to book.
- **Fewer support problems:** a single editable source of truthful child facts prevents the classic complaint that generated books get details wrong (spec §2 Adorabook lesson).
- **Trust:** parents see exactly what we know and what we inferred, with controls to confirm or delete.

## 3. Current implementation

None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). The design itself must avoid these risks:

1. **Storing uncertain AI inference as fact.** The Adorabook "football" mistake (spec §2, §11) is the canonical failure. Any value that is not parent-confirmed must be stored as `suggested` and never reach generation as fact.
2. **Profile drift / mutation.** Facts must be immutable inputs to story generation; only the parent changes a fact (spec §25: "Parent-provided facts must never silently mutate").
3. **Scope misuse.** The profile is facts about a child, not book or generation state. Keeping generation metadata out prevents the canonical model (guide §2) from being polluted.
4. **PII leakage.** Name, DOB, photos and family relations are sensitive (guide §7); the profile must not be logged, publicly exposed, or sent to providers that are not documented under F-025.

## 5. Desired UX

**First book (inline creation, anonymous session).** Ava's parent lands (F-001), picks a story theme (F-002), then sees "Who is this story for?" → "Add a child". They enter Ava, her date of birth, and get the photo step (F-004). Name + age reads as one friendly moment, not a form wall (spec §20 §6: name + age after photo quality check).

**Later books.** Landing → story theme → "Who is this for?" offers saved profiles with Ava's photo and age: "Ava, 5". Picking her skips name/age/photo entirely; personalisation (F-006) pre-fills facts from the profile.

**Editing.** "Ava's profile" (reachable from My Books and during creation) shows sections: Name & age · Appearance (photo refs → F-005) · Likes & favourites · Family · Pets · The little things (custom facts) · Privacy. Each fact shows how it is used ("Ava's name will appear in every story."). A "suggested" fact carries a "That's right / That's not right / Remove" confirmation (written by F-006's AI; this spec only defines storage).

**Failure cases.** Network loss during save: the profile is saved locally (idempotent command) and re-synced; nothing is lost on refresh (D010). If the anonymous session expires before claim (F-001), the parent is prompted to claim before any further book work. Age: derived from DOB at read time, never frozen at capture (so an automated annual age prompt stays honest).

## 6. UI specification

- **Screen layout:** stacked card sections with warm, calm styling (guide §8; reference ../product/DESIGN_SYSTEM.md tokens once written). No SaaS form chrome.
- **Fields, group order:** 1) Name + display name ("what the story calls them"), 2) Date of birth, 3) Pronouns (optional), 4) Photos (opens F-004), 5) Likes & interests (F-006), 6) Family & pets (links to Relationships), 7) The little things (custom facts), 8) Languages & locale (defaults to app locale, F-024), 9) Privacy & consent.
- **Controls:** primary CTA "Save for next time" (inline, or "Continue" during book creation). Secondary: "Skip for now" (profile still works with just name+age+photo). Every field editable in place with a "Changed" confirmation banner ("We'll use this from now on.") because facts must not silently mutate.
- **Validation:** name required (trimmed, 1–40 chars); DOB required and must be in the past; consent checkbox required before a profile can be *stored* against an account (see §12). Pronouns from a set (he/him, she/her, they/them, prefer not to say, custom-free-text confirmed).
- **Inferred-fact UI:** any fact flagged `suggested` renders with an amber "Suggested" chip and confirm/remove actions; it never appears as plain fact and never in story generation inputs.
- **Responsive:** single column on mobile, thumb-reachable controls (D012); profile picker cards scroll horizontally one-handed.

## 7. Domain model

Entity **ChildProfile** (canonical vocabulary guide §3). Covers (spec §13): name, DOB/age, preferred display name, pronouns, locale, languages, photos, interests, favourite things, family relationships, pets, custom facts, consent, photo-retention settings. Fields, each classified:

| Field | Type | Mandatory / Optional / Inferred / Parent-confirmed | Notes |
| --- | --- | --- | --- |
| `id` | UUID | internal | |
| `displayName` | string | **Mandatory** | shown across UI |
| `firstName` | string | **Mandatory** | appears in stories (spelling is a fact, spec §10 name check) |
| `dateOfBirth` | date | **Mandatory** | age derived at read time |
| `ageCategory` | string | **Mandatory (derived)** | from DOB; effect on story complexity (spec §2 Adorabook age adaptation) |
| `pronouns` | enum | **Optional** | parent-confirmed when present |
| `locale` | BCP-47 | **Optional (defaults to app locale)** | e.g. `en-GB`; consumed by F-024 |
| `languages` | string[] | **Optional** | for bilingual stories (F-024) |
| `photoReferenceIds[]` | ref | **Optional count 0..N** | → PhotoReference (F-004); the primary photo is a bible input (F-005) |
| `interestIds[]` | ref | **Optional** | typed values from F-006; parent-confirmed |
| `favouriteThingIds[]` | ref | **Optional** | typed values (animal/colour/toy…) from F-006 |
| `relationshipIds[]` | ref | **Optional** | → Relationship (guide §3: Child/Sibling/Parent/Grandparent/Friend/Pet) |
| `petIds[]` | ref | **Optional** | → Pet relationship |
| `customFactIds[]` | ref | **Optional** | 1–3 free-text flavour facts from F-006, typed `customFact` |
| `suggestedFactIds[]` | ref | **Inferred, never store as fact** | waiting for parent confirm/remove; excluded from generation |
| `photoRetention` | string | **Optional (default per F-025)** | retention class for photo refs (guide §7) |
| `consent` | object `{parentConfirmed, recordedAt, who}` | **Mandatory before storing to account** | spec §18: explicit parent/guardian consent expectation |
| `status` | enum | internal | `draft` / `active` / `archived` |

**Rule (non-negotiable):** a field is `parent-confirmed` only if an explicit human confirmation is recorded. Anything the AI derives (appearance attributes, interests suggested from photos) is stored in `suggested` buckets (this spec) or as `CharacterBible` proposed-appearance (F-005) — never as fact. Citation: spec §2 Adorabook lesson, §11 football example, §25 "facts never silently mutate".

Compact sketch:

```text
ChildProfile
├── id, status, ownsFamily (shared profile for multi-person F-023)
├── displayName (M), firstName (M), dateOfBirth (M), ageCategory (derived)
├── pronouns (O), locale (O→en-GB), languages[] (O)
├── photoReferenceIds[] → PhotoUpload(F-004): primary + refs
├── interestIds[], favouriteThingIds[], customFactIds[] → Fact(F-006, typed, parent-confirmed)
├── relationshipIds[] → Relationship (guide §3)
├── suggestedFactIds[] (inferred, never sent to StoryProvider)
├── photoRetention, consent, confirmations[] (audit of fact confirmations)
```

## 8. Backend/API requirements

Proposed command/query boundary (proposed subsystem: `BookService`/`BookRepository` per guide §2 conventions — names shared for consistency).

- `CreateChildProfile` (session-scope id; no auth required; returns profile + temp ref for claim later via F-001). Idempotency: client sends `creationToken`.
- `UpdateChildProfile` (field-level patch; `revision` optimistic-lock token; rejects a stale patch).
- `ConfirmFact(factId)` / `RemoveFact(factId)` — the only writers that flip a `suggested` fact to `parent-confirmed` or delete it. These are audited (see `confirmations[]`).
- `GetChildProfile` / `ListChildProfiles` (used by book creation and F-023 multi-person).
- Validation: name/DOB rules per §6; consent required for stored (account-bound) profiles; DOB must be past.
- AuthZ: profiles are bound to the session/account that created them; sharing a profile across a family (F-023) requires explicit `sharedWith[]` grants. No cross-account read.
- No endpoint ever returns raw photo bytes; only photo references (public assets must not exist — guide §7).

## 9. Background jobs

Not applicable. Profile reads/writes are synchronous, idempotent commands. The only async work hangs off references: photo processing (F-004) and appearance derivation (F-005). Age derivation is computed at read time, not by a job.

## 10. AI behaviour

This spec itself performs no generation. Two interfaces consume/produce profile data:

- **StoryProvider** (F-008) receives facts (name, DOB-derived age, pronouns, locale, typed favourites, custom facts) as immutable structured inputs. It must never receive `suggested` facts.
- **IdentityProvider** (F-005) may derive *proposed* appearance attributes from profile photos; these return into the profile/suggested bucket (or bible `proposedAppearance`) and require parent confirmation before use in generation. Inference is never stored as fact (guide §10 rule line above).

## 11. QA

Lives mostly in F-015 but this spec feeds the checks:

- Spelling: `firstName` used identically across all text (QA catalogue: name mismatch).
- Pronoun agreement driven by stored `pronouns` (pronoun mismatch).
- Age appropriateness: story uses `ageCategory` derived from DOB, never fresh typing.
- Profile completeness gate: book generation (F-008) fails fast with a friendly message if `displayName`, `firstName`, `dateOfBirth` or ≥1 confirmed photo is missing at generation time.
- Locale integrity: `locale` (`en-GB`) must be honoured by F-024 so "football" stays association football (spec §11).

## 12. Privacy/security

- **Data:** name, DOB, pronouns, facts, family relations, consent, retention settings — all sensitive (guide §7).
- **Retention/deletion** via F-025 contract; `photoRetention` per profile; delete-now control surfaces on the profile and jest refresh both profile facts and generated likenesses (guide §7: generated likenesses derived from photos are PII — treat like the source).
- **Provider exposure:** only `StoryProvider`/`IdentityProvider` per documented F-025 provider audit; no child data to commerce, print, or analytics (guide §7).
- **Logging:** no photo or sensitive field logging (dashboard-id avoids name/DOB).
- **Access:** profile-bound to owner account; `sharedWith[]` grants only.
- **Consent:** stored profile against an account requires explicit `parent/guardian` confirmation captured with timestamp and identity (spec §18). Draft-session profiles are temp and auto-purged per F-025.

## 13. Analytics

Events (aggregated only, no sensitive payloads): `profile_created`, `profile_updated`, `profile_reused` (second book referenced an existing profile — retention KPI), `fact_confirmed`, `fact_suggested` (count), `fact_removed`. No names, DOB or photos in events (guide §13 rule).

## 14. Acceptance criteria

1. Given an anonymous first session, When Ava's parent creates a profile with name + DOB + one valid photo and then claims the account later (F-001), Then the profile is bound to that account with all fields intact and no data loss on refresh (D010).
2. Given a confirmed profile, When a second book targets Ava, Then creation skips name/DOB/photo and reuses profile facts verbatim in generation.
3. Given a `suggested` fact exists, When generation starts, Then it is excluded from all StoryProvider inputs (verify a story never contains an unconfirmed suggested value).
4. Given a parent edits `firstName` spelling after a book exists, When any later generation runs, Then it uses the corrected spelling and any previously generated text carrying the old spelling is flagged/qpended for regeneration (never silently reworded).
5. Recovery: Given a network failure during `CreateChildProfile`, When the client retries with the same `creationToken`, Then exactly one profile exists (idempotent), no partial write.
6. Given a stored profile superate removal via F-025 delete-now, When deletion completes, Then profile, photo refs, confirmations log, and derived bible likeness are unrecoverable-pulled and downstream book revisions are revoked from regeneration queues.

## 15. Dependencies

- Must exist first: F-001 (anonymous session + claim), F-002 (story discovery reaches "who is this for?"), F-004 (photo reference storage), F-005 (bible consumes profile), F-006 (typed facts), F-025 (retention/consent contract).
- Buildable in parallel: F-007 concepts (reads profile facts), F-024 (locale on profile from day one).
- Consumed later: F-008, F-009, F-023 (multi-person relationship grants), F-021/22 (library/sequels reuse).

## 16. Priority

P0 — launch/category parity. The profile capture moment (name, age, first photo) is required in the core journey (spec §20) and name/photo personalisation is a category entry bar (spec §26 P0 photo likeness, child details). Reuse across books is typed P1 in spec §26, but it is designed in now because the field-level provenance it requires (Confirmed vs Suggested) is architecturally cheap at capture time and painful to retrofit. Rationale per mission §33 filter: easier creation (second book), more personal result, repeat usage, and fewer detail-errors support problems.
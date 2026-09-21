# 05_CHARACTER_BIBLE.md — Canonical Visual Identity (Character Bible)

> **Spec ID:** F-005 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-003 (Child Profile), F-004 (Photo Upload); consumed by F-009, F-013, F-023
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The Character Bible is the canonical visual identity of a character (spec §5: reference photos, stable identity representation, parent-confirmed appearance, clothing, accessories, relationships, global illustration style). Every page's illustration is generated *from* this one definition, and versioned updates to it are what make whole-character corrections (F-013, spec §9) trivially possible. It is the structural answer to the category-wide failure of page-to-page face drift (spec §2 Diffrun "face consistency" complaints).

## 1. Goal

Spec §5A: "A Persistent Character, Not 30 Independent Image Generations." Today's competitors generate each page nearly independently; reviews show the predictable result — faces drift, siblings swap, hairstyles change for no reason (spec §10 complaint list). This feature defines the child's appearance once, stores a stable identity representation that every illustration call reuses, and versions it so a parent's "Her hair should be longer" (spec §5 example) updates the whole book instead of 24 manual regenerations.

## 2. User value

- **Consistency = the core differentiator** (spec §4 thesis: "the generated child actually stays recognisable"). This is listed P1 "reliable cross-page character identity" in spec §26.
- **Effortless correction:** parent-confirmed appearance + versioning is the foundation F-013 leverages — confidence builders that competitors mostly lack (spec §3 matrix shows weak or absent character-wide correction).
- **Reuse:** a Bible can be shared across a family profile and across books (spec §13 retention; F-022 sequels), so garland for grandpa reuses the same character.
- **Cost control (later):** a single stable identity per character means fewer ad-hoc identity re-embeddings per page.

## 3. Current implementation

None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). The design must avoid:

1. **Provider coupling.** The identity representation is provider-specific; the Bible must hold an abstraction (`identityRepresentation` behind `IdentityProvider`) so switching image providers (D004) does not orphan character identity. Never store raw provider prompt blobs as canonical identity (guide §2: canonical model is ours).
2. **Unconfirmed inference as appearance.** Derived appearance attributes (hair colour guessed from photos) are proposals, not facts (guide §10 rule; spec §2 Adorabook lesson). Only parent-confirmed appearance enters generation.
3. **Version incoherence.** Mixing pages generated under Bible v1 and v2 inside one *approved* revision breaks identity QA. Version handles must be immutable per page and re-verified at approval (F-016).
4. **Character/Book scope confusion.** A Bible is a character-level entity that can span books; per-book differences (outfits for a specific story) belong to the book, not the Bible — otherwise a family-shared character would leak a story's costume into unrelated books.

## 5. Desired UX

**Creation (during first book).** After Ava's photos validate (F-004), a short **"Make Ava look like Ava"** step runs. The Bible is auto-created with primary + top-scoring references. The parent sees a small proposal panel: derived attributes (hair, skin tone, eyes) marked "We think — check it", plus the confirmed fields (from F-006). Primary CTA: **"This looks like Ava"** (approve → appearance is `parent-confirmed`); secondary: "Change hair colour" taps chips, "Try another photo" returns to F-004.

**Retroactive edit (from any book where the character appears).** "Fix Ava" menu (F-013) surfaces options — fix face everywhere, fix hair everywhere, fix clothes everywhere, use another reference photo (spec §9). Any appearance change bumps the Bible version (see §7) and the UI shows "This will update Ava across N book pages" before applying (the estimated affected page count is displayed per F-013).

**Family profile (F-023).** The Bible is listed under the family, one per member/pet, so twin stories (advice from spec §2) keep both children's identities separately and never swap (spec §10 sibling swap check).

**Failure/edge cases:** appearance derivation fails or times out → step proceeds with references only and a "we'll use the photo references" note; approval of appearance can be deferred. Changing references invalidates the identity representation (needs rederiv, §9 job). Deleting a reference photo (F-025) triggers Bible version bump with regeneration of affected pages (cost note per F-013).

## 6. UI specification

- **Appearance panel layout (creation):** left = reference photos grid (primary featured), right = attribute rows with edit chips: hair style, hair colour, skin tone, eye colour, "typical outfit", "favourite accessories" (0–3), and illustration-style picker (watercolour/warm-flat/storybook — a defined list, no free prompt). Every AI-derived row shows an "AI guess" tag with confirm/change; confirmed rows show a check.
- **Controls:** primary CTA **"This looks like Ava"** (disabled until ≥ references ≥1 and any AI-guess rows are confirmed or dismissed); secondary "Not quite — change one thing". Re-ask never uses model jargon (guide §8).
- **Book scoping:** in a specific book, the parent can also set "what Ava wears in this story" (book-level `outfitForBook`) — this is a book-layer override, not a Bible global; UI distinguishes "in this story" vs "everywhere" (D-coded tour, mirroring F-013).
- **Version indicator:** subtle "Version 3 — updated {date} · {N} pages updated" chip on book review for any book depending on a bumped Bible, leading to F-013's apply flow.
- **Responsive:** appearance panel in single column on mobile; chips are generous touch targets (D012).

## 7. Domain model

Entity **CharacterBible** (canonical vocabulary guide §3). Compact sketch:

```text
CharacterBible
├── id, kind: child|sibling|parent|grandparent|friend|pet (guide §3 Relationships vocabulary)
├── childProfileId? (nullable — family/guest characters)          ← shareable across a family profile (F-023)
├── scope: profileShared | bookLimited
├── referencePhotoIds[]           ← from PhotoReference (F-004); primary first
├── identityRepresentation {      ← provider-agnostic abstraction (IdentityProvider)
│     provider, providerRefs[] (normalised embeds/face vectors),
│     modelVersion, derivedAt }}
├── appearance {                  ← canonical, parent-confirmed when present
│     hairStyle, hairColour, skinTone, eyeColour, build?,
│     typicalOutfit, accessories[0..3],
│     style: watercolour | warmFlat | storybook }
├── proposedAppearance { … }      ← AI-derived, unconfirmed (never used by IllustrationProvider)
├── bookOverrides[] { bookId, outfitForBook, … }   ← per-book, not propagated
├── version: int (bumps on any confirmed change)
├── generations: { pageId → bibleVersionUsed }     ← audit for QA + F-015
├── status: derived | pendingApproval | approved | needsAttention
└── createdAt, updatedAt, lastAppliedAt
```

Books reference it: canonical Book `characters[]` entries store `bibleId + bibleVersion`, NOT a copy of appearance. A page's `generationMetadata` records `characterBibleVersion` used per character, enabling identity QA and scope-limited regeneration. This is this spec's slot in the stage pipeline (`product/GENERATION_ARCHITECTURE.md` §2 "Character/profile preparation") and in provenance (`product/GENERATION_PROVENANCE.md`): every illustration carries `characterVersion` + the illustration style `policySetVersion`/`policyHash` active when it was generated.

**Versioning rules (this is the contract F-013 builds on):**
- Version bumps on (a) any confirmed `appearance` change, (b) `referencePhotoIds` change, (c) `identityRepresentation` rederivation, (d) style change with confirmation. Not bumped on book-specific `bookOverrides`.
- Each bump stores the previous version as an immutable snapshot (`bibleVersions[]`) so regenerated pages can be diffed and rolled back before approval.
- A global change propagates via **page-level scheduled regeneration** (F-013): only pages whose `generationMetadata.characterBibleVersion != current` are candidates; untouched pages keep `READY`.

## 8. Backend/API requirements

Proposed command/query boundary (proposed shared subsystem `BookService`; Bible operations live beside it, names consistent):

- `CreateCharacterBible{ childProfileId, referencePhotoIds }` (from F-004's final photo set).
- `ProposeAppearance{ bibleId }` → derives `proposedAppearance` via `IdentityProvider` (job, see §9).
- `ConfirmAppearance{bibleId, appearancePatch}` → merge, set approved, bump version, emit event `CHARACTER_UPDATED`, fan-out candidate page ids (F-013 compute).
- `UpdateCharacterAppearance{bibleId, field, value}` (per-field, idempotent; optimistic lock on `version`).
- `SetBookOutfit{bibleId, bookId, outfit}` (no version bump).
- `ReplaceReferencePhotos{bibleId, photoIds}` → triggers rederivation + bump.
- `GetBible{bibleId, version?}`; `ListBibleVersions{bibleId}`.
- `GetAffectedPages{bibleId, fromVersion}` → returns candidate page ids per book (feeds F-013's estimated-page-count UI).
- Validation: exactly one primary photo; appearance fields against approved enumerations; version maintained by the command, never by clients. Events: `CHARACTER_CREATED → CHARACTER_APPEARANCE_CONFIRMED → CHARACTER_VERSION_BUMPED → AFFECTED_PAGES_COMPUTED`.

## 9. Background jobs

**Job: IdentityDerivation ("BuildAva")** — `GenerationJob`; inputs = `referencePhotoIds` (+ optional `proposedAppearance` seed); runs `IdentityProvider` to produce the stable `identityRepresentation` and derived attribute proposals. Retry 3× backoff; timeout 120s; resumable (D010) and idempotent (same refs ⇒ same providerRefs unless provider model changed). Failure state: `derived` pending → `needsAttention`, UI falls back to "use photo references" (illustration continues with refs only, §5 fallback). Cancellation on photo replacement.

**Job: Single-Page Re-illustration** — is F-013's job, defined there; this spec only defines the *input* contract (bible version snapshot + `identityRepresentation` current).

## 10. AI behaviour

- **IdentityProvider** (guide §6): builds and stores the stable identity rep from references. It is the only interface allowed to write `identityRepresentation`; illustration never re-embeds identity itself.
- **IllustrationProvider** (F-009) receives per page: bible `identityRepresentation` + `appearance` (parent-confirmed fields only) + `bookOverrides.outfitForBook` + scene/narrative context. Never receives `proposedAppearance`, raw prompts, seeds (D002).
- **Appearance derivation is a proposal**: `IdentityProvider` output enters `proposedAppearance`, is shown as "AI guess", and only a parent confirmation promotes it to `appearance` (rule from spec §2/§11, guide §10). Confirmed appearance is an immutable input to all illustration generation until the parent changes it (spec §25).
- Style picker output is a fixed enum, not a free-form style prompt.

## 11. QA

Feeds/consumes (spec §10 catalogue): identity consistency (child resembles references); face changes substantially across pages (all pages must carry the same `identityRepresentation` ref — detectable when `page.generationMetadata.characterBibleVersion` mismatches the current bible for any approved book); sibling identities swap (multi-character pages compare per-character representation); hair/skin/clothing sudden changes (any page generation must pass through the bible `appearance`, so drift is structurally a QA failure not a mystery). `generations[]` map gives the audit trail F-015 needs; combined with each artifact's `GenerationProvenance` (`product/GENERATION_PROVENANCE.md`) a score regression is attributable to the changed version (provider model, `policySetVersion`, or `characterVersion`). Approved books (F-016) that reference an outdated bible version are flagged `needsAttention` — the parent must re-approve the updated revision before print.

## 12. Privacy/security

- Generated likeness (`identityRepresentation`, derived appearance) is **PII derived from photos — treat like the source** (guide §7). Stored in private storage, not logged, not exposed publicly.
- Continues the F-004 trace: references → `IdentityProvider` provider (documented in F-025 audit); the provider may receive normalized reference images but not profile facts.
- Bible version snapshots follow the profile's retention class; F-025 delete-now removes source photos **and** invalidates/removes `identityRepresentation` and any regen queues referencing it.
- Book/character scatter: a family-shared Bible is readable only by owners + `sharedWith[]` grants (F-023); book-level overrides never expose Bible internals.

## 13. Analytics

`character_created`, `character_approved` (appearance confirmed), `appearance_updated` (field, count), `reference_photos_replaced`, `bible_version_bumped`, `bible_pending_regeneration_pages` (estimated count — cost telemetry), `bible_derivation_failed`. Aggregated, no photo refs or identity payloads.

## 14. Acceptance criteria

1. Given a Bible at v1 used by a book, When the parent changes "hair colour" and confirms, Then the version bumps to v2, an immutable v1 snapshot is kept, and only pages whose `generationMetadata.characterBibleVersion=1` are listed as affected (F-013 count) — unrelated pages untouched.
2. Given a derived `proposedAppearance`, When generation is triggered before confirmation, Then `IllustrationProvider` inputs contain only photo references and confirmed fields — never `proposedAppearance`.
3. Given an approved book (F-016) plus a late Bible bump to v2, Then the book is flagged `needsAttention` and must be re-approved before it can be ordered (D011).
4. **Recovery:** Given IdentityDerivation fails after 3 retries, When generation proceeds, Then pages render with references-only fallback (marked in `generationMetadata` as `refs_only`), the parent sees "described with photos only", and a queued retry can repair visibly without regenerating a whole book (D010).
5. Given a family profile where Ava and Leo share a Bible set, When a two-person story page is generated, Then each character's page illustration uses its own `identityRepresentation` and QA compares each independently (no swapping, spec §10).
6. Given a parent deletes a reference photo (F-025), When the deletion lands, Then the Bible's `referencePhotoIds` drops it, a rederivation job runs, affected pages are queued for regen, and the version bumps — no page continues to reference the deleted photo.

## 15. Dependencies

- Must exist first: F-003 (profile), F-004 (photo refs + scoring), F-006 (personalisation facts incl. favourite colour/toy influencing appearance neutral — actually appearance comes from photo+confirmation; F-006 optional), and the F-025 deletion contract.
- Consumes this spec: F-009 (illustration uses bible context), F-013 (global correction = bible bump + page regen), F-023 (multi-character isolation), F-015 (identity QA over `generations[]`).
- Buildable in parallel: F-012 page-level correction (page-scope methods don't mutate the bible), F-014 editor.

## 16. Priority

P1 — key differentiation ("our reason to exist", spec §26). Stable cross-page character identity and the versioning that powers effortless global correction are precisely what competitors lack (spec §3 matrix) and sit at the centre of the product thesis (spec §4, §5). Rationale per mission §33 filter: more personal result (recognisable child), more confidence in the printed book, and fewer likeness support complaints. The capture moment is lightweight (rides the photo step) so low incremental cost despite P1 classification.
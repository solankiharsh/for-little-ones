# 22_REORDER_AND_SEQUELS.md — Reorder, Duplicate & Sequels

> **Spec ID:** F-022 · **Priority:** P2 · **Status:** draft
> **Depends on:** F-021 (Family Library) · F-016 (Approved revision lock, D011) · F-005 (Character Bible) · F-003 (Child Profile) · F-007/F-008 (concepts + story generation for sequels) · F-018 (cart/order)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Three distinct post-purchase actions over an existing book (spec §14): **Reorder** re-prints the exact immutable approved revision (no regeneration — D011); **Duplicate** copies the approved content into a brand-new *draft* the parent may edit; **Sequel** creates a new Book that reuses the existing Child Profiles and Character Bibles and runs concepts→story→illustrations again. All three reuse what the parent already built; nothing forces profiles to be re-uploaded.

## 1. Goal

Buying a gift, reprinting for grandparents, or continuing a child's favourite characters currently means rebuilding a whole book. These flows re-print, copy or continue a finished book without losing what parent and child already own: the approved content, the reusable child profiles, and the consistent characters. Spec §13 ("the second book should take seconds") and §14 are the targets.

## 2. User value

- Reorder: one-tap re-print of the same book (gift a second copy) with zero AI risk — it prints exactly what was approved.
- Duplicate: the escape hatch for "make a copy and change a few things" without touching the approved original.
- Sequel: new, personalised content with the same beloved characters — the highest-value repeat-purchase action and a key retention engine.
- Confidence: nothing silently regenerates a paid product (D011); the parent always sees where a new draft diverges from what they owned.

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems used: `BookService` (reorder/duplicate/sequel command layer, revision copy), `BookRepository` (content + revision persistence), `CharacterBible` (per-person identity reused by sequels), `GenerationJob` (sequel pipeline), `PrintProvider` (reorder fulfilment).

## 4. Problems with current implementation

Not applicable — greenfield. Design risks:

- A reorder must **never** reference a live/edited book — it must pin the stored `ApprovedBookRevision` content hash (D011).
- Duplicate must copy content, not aliases, or later edits to one copy would poison the other (content drift + deletion-refcount surprises).
- Sequel must reference existing Child Profiles and Character Bibles, not clone them — facts on the parent's profile stay immutable (spec §6, §25) and consent stays per-person.

## 5. Desired UX

From the library card menu (F-021):

1. **Make another copy (reorder)** → confirms: "Print the same book again — exactly as approved." One tap adds it to the cart (F-018) as an item referencing the approved revision. No regeneration spinner; cart shows "Ava's Moon Adventure — same as printed".
2. **Make a copy to edit (duplicate)** → instantly opens a new DRAFT titled "Ava's Moon Adventure (copy)" in EDITING state. Parent edits pages normally (F-012/F-014), then reviews → approves → orders a *new* revision.
3. **Make a sequel** → new Book, prefilled children + characters; parent picks "what should this story feel like" (F-007 concepts); generation runs the normal pipeline with the existing Bibles. Draft is separate; the original book and its approved revision are untouched.

Cancellations: any of the three can be abandoned; the original stays delivered in the library.

## 6. UI specification

- All actions live in the library card menu; primary verb is product-facing per guide §8 ("Make another copy", "Make a sequel" — never "reorder" jargon as primary).
- Reorder: confirmation dialog with price/quantity from F-018; estimated arrival before payment (spec §16).
- Duplicate: immediate navigational transition to new draft; toast "Copy created — edit away"; no modal.
- Sequel: a short, warm multi-step flow (story feel → confirm children/characters) before generation; meaningful progress instead of a spinner (guide §8).
- Mobile: bottom-sheet menu on cards; all three actions one-handed.

## 7. Domain model

Canonical vocabulary (guide §3): `Order → OrderItem → ApprovedBookRevision → PrintArtifact`.

```text
Reorder { orderItemId, approvedRevisionId, revisionContentHash, sourceOrderId }
DuplicateBook { newBookId(DRAFT), sourceRevisionId, copiedAt }
Sequel { newBookId, childProfileRefs[], characterBibleRefs[], relationshipsRefs[], sourceBookId }
```

Rules: `revisionContentHash` is computed at approval (F-016) and pinned; a reorder that cannot resolve the hash fails closed. Duplicate creates a fresh Book whose pages deep-copy the approved revision's canonical content; illustrative assets are copied (new object keys) so edits and deletion are independent. Sequel copies only references (`childProfileRefs`, `characterBibleRefs`) — never the profiles themselves (spec §13, §6).

## 8. Backend/API requirements

Commands: `reorderBook(entryId, quantity, giftOpts)` → creates Order + OrderItem bound to `ApprovedBookRevision`; `duplicateBook(entryId)` → new DRAFT Book (copied content, status `EDITING`); `createSequel(entryId)` → new DRAFT Book (referenced profiles/bibles), then `chooseConcept` (F-007). Idempotency: `sourceOrderId`-once for reorder; hammering "Make another copy" must not double-order — a client `requestId` per cart-add. Permissions: owner-only; gift variant goes to cart with gift recipient shipping fields (spec §16).

## 9. Background jobs

Reorder submits a `PrintProvider` fulfilment job for the pinned revision (idempotent per order item, retried — ties into F-028's printer-callback retry). Duplicate is synchronous (copy only). Sequel runs the standard `GenerationJob` pipeline (F-008/F-009) with per-step idempotency, resumability and one-page isolation (D010). Duplicate during active generation is blocked until the source reaches `READY_FOR_APPROVAL`/`APPROVED`.

## 10. AI behaviour

- Reorder: none. Zero model calls; content hash proves reversibility.
- Duplicate: none (deterministic copy).
- Sequel: `StoryModel` generates concepts + outline with existing Character Bible identities injected (not re-created — same `IdentityReferenceModel` handles); illustration generation (F-009) reuses stored identity refs so the child stays recognisable (spec §10). Validation: parent facts remain immutable (spec §6, §25).

## 11. QA

Sequel runs the full F-015 suite including identity consistency and wrong-child-count against the carried-over Bibles. Reorder triggers a storage-integrity check that every asset referenced by the pinned revision still exists before fulfilment (QA "missing assets" / "resolution"). Duplicate carries the source QA state forward and re-flags after any edit.

## 12. Privacy/security

Duplicate creates a second copy of likeness-bearing assets — deletion/refcount handling must cascade to all copies (F-025 is authoritative; each asset lists its owning book). Sequel reuses existing per-person consent on each Child Profile; a person whose consent lapsed (or was deleted) must be excluded from casts until re-consent. Retention: no new retention beyond the normal stored-book contract (F-025).

## 13. Analytics

`reorder_requested`, `reorder_completed`, `duplicate_created`, `sequel_started`, `sequel_generated`, `gift_copy_added`. No sensitive payloads (guide §7).

## 14. Acceptance criteria

- **Given** an approved revision with hash H, **when** a reorder is placed with no intervening edits, **then** the OrderItem references exactly revision H and no generation token is consumed.
- **Given** a duplicate is created, **when** the parent edits one character on page 3, **then** the approved original renders unchanged in the library.
- **Given** a sequel is started, **when** it saves, **then** the Child Profiles and Character Bibles are referenced (not copied) and their facts are unchanged.
- **Recovery** **Given** a reorder fulfilment webhook is redelivered during a `PrintProvider` outage, **when** the callback retry succeeds, **then** exactly one fulfilment submission exists for that order item and the book is never regenerated.
- **Given** a parent deletes their account, **when** deletion completes, **then** duplicates and sequels derived from the same likeness assets are gone (no orphaned copies).

## 15. Dependencies

Requires F-021 (entry actions), F-016 (hash pinning), F-018 (cart/order), F-008/F-009/F-010 (sequel pipeline), F-005 (Bibles), F-017 (print artifact for reorders). Can proceed in parallel with F-023 (multi-person) and F-024 (locale) once sequels exist.

## 16. Priority

**P2 — retention/delight** (mission §33 filter: repeat usage/gifting; §26: sequels, family sharing). Not P0 (no parity gap — competitors can reorder) and not P1 (not a core differentiator), but the highest-leverage repeat-purchase engine after the library exists. Reorder specifically reduces support load (fewer "I want another copy" tickets).

**Decision needed:** whether **Duplicate** is free or is a purchasable digital copy (pricing/commerce model); whether swift reorders should auto-fill the last gift shipping details (product/compliance choice).
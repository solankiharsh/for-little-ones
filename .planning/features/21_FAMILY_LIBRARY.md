# 21_FAMILY_LIBRARY.md — "Our Stories" Family Library

> **Spec ID:** F-021 · **Priority:** P2 · **Status:** draft
> **Depends on:** F-016 (Approve & Print lock) · F-011 (lightweight reading renderer) · F-018 (Cart/Checkout) · F-019 (Fulfilment). Consumed by F-022.
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

"**Our Stories**" is the post-purchase home for every approved book — a library of the family's books, explicitly not an order history (spec §14 / §20: "Book appears permanently in family library"). Each purchased book is readable online via the lightweight reading renderer (F-011), and every card is the entry point for reorder, duplicate, sequel, gift and (later) colouring and narration. Content is the canonical Book model — the library is a derived, presentation-level store, never a copy.

## 1. Goal

After the printer delivers a book, the relationship with the customer currently ends. This feature keeps the product alive after purchase: the book stays present, readable, giftable and extendable. It creates the surface that reorders, sequels, duplicates and gifting (F-022) hang off, and is the digital destination the product thesis ("a small publishing studio that knows your child") depends on.

## 2. User value

- The book is never "lost" once bought — read it on the phone whenever a child asks for it (mobile first-class, D012).
- Repeat usage and gifting without re-uploading or re-discovering anything (profile + characters already exist).
- A memorable, non-transactional post-purchase experience ("Our Stories", not "Orders") that lifts perceived value per book.
- Confidence: reading shows the *exact approved content*, reinforcing trust in what was printed (D011).

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

Proposed subsystems built by this feature: `BookService` (library queries/commands over the canonical Book) and `BookRepository` (read models for the library list). The reader itself is the F-011 lightweight reading renderer (proposed shared subsystem).

## 4. Problems with current implementation

Not applicable — greenfield. Design risks this spec must avoid:

- Storing a second copy of book content — the library must render the canonical Book model (guide §3, D004).
- Letting the library show a live *draft* instead of the immutable approved revision (D011) — once purchased, reading must reproduce the approved content exactly, even if a sequel today edits the draft.
- Exposing covers/pages via public URLs — likenesses are PII (guide §7) and must stay behind authenticated routes.

## 5. Desired UX

Walkthrough (parent, phone): Ava's mum finishes checkout. When the order is placed, "Our Stories" appears in the app nav. Tapping it shows a warm grid of book covers — Ava's Moon Adventure reads "**for Ava, age 5**". A separate "In progress" row shows unfinished drafts. She taps the book → the reader (F-011) opens on the cover exactly as approved; page-flip matches print order. Back in the library, the card menu offers **Read now · Make another copy · Make a sequel · Gift a copy · Colouring edition (coming soon)**. When a book is still printing, the card shows a warm status chip ("On the press") linking to F-020 tracking.

Empty state: no books yet → "Your stories will live here" with a CTA back to story discovery (F-002). Failures: reader errors show a friendly retry that reloads from the approved revision; a missing revision is rare, engineered, and surfaces an admin alert (F-028), not a broken page.

## 6. UI specification

- Grid of cover thumbnails (private, lazily loaded); sort by most-recent activity; filter chips by child (extended by F-023 badges).
- Card: cover thumbnail, title, "for [child]", optional in-progress order chip; primary CTA **Read now**.
- Secondary menu: Reorder · Sequel · Duplicate · Gift · Colouring (futured). All actions accord with UI principles — never "regenerate/prompt" language (guide §8).
- Mobile: single-column card list; thumb reach; reader is full-screen landscape-aware page-flip.
- Loading: skeleton covers; error: inline retry; offline: show cached cover + last-loaded state (reader can be cached via service worker once web app exists — Recommended experiment).

## 7. Domain model

No new canonical concept — the library is a **derived store** over the canonical Book (guide §2). Proposed read/side table `LibraryEntry`:

```text
LibraryEntry { entryId, bookId, accountOwnerId, sourceOrderId,
               createdAt, lastReadAt, status(=ordered|in_production|delivered) }
```

Rules: one LibraryEntry per approved-revision purchase; book content is read via `BookRepository` from the canonical Book, resolved to its `approval.approvedRevisionId` (D011). Future narration (F-015 digital scope) adds text-over-audio read from the same approved revision.

## 8. Backend/API requirements

Commands: `createLibraryEntry(order)`, `markLastRead(entryId)`, `deleteLibraryEntry(entryId)` (only via F-025). Queries: `listLibrary(accountId)`, `getLibraryBook(entryId)`. All owner-scoped; no public asset URLs (guide §7). `createLibraryEntry` is idempotent on `sourceOrderId` so a retried fulfilment webhook never creates a duplicate entry. Validations: only books with an approved revision are listed as delivered; drafts never appear in "Our Stories".

## 9. Background jobs

Reading itself needs no job. Cover/thumbnail materialization is a short-lived job per entry (resumable, cached, deletable with the entry). Narration generation (future, P2) runs as a `GenerationJob` variant triggered from the library entry; deferred to "Digital Experience" (spec §15) planning.

## 10. AI behaviour

None for core library/reading — reading is deterministic rendering of the approved revision. Narration (future) uses `StoryProvider`; deferred by spec §15 ("do not require for initial launch"). Colouring edition (future) is a derived line-art render of approved illustrations — P2/P3, not in this cut.

## 11. QA

- Reading renderer asserts it renders the approved revision bytes (hash check) — never a regenerated or edited draft.
- Thumbnails pass resolution/safe-area when derived from print assets (F-017).
- Reader never exposes editor-only artifacts (F-014); a rendered book must not reference missing assets — QA catalogue check "missing assets".

## 12. Privacy/security

Book content contains generated likenesses of children → handled like the source photo (guide §7). Deletion contract: `deleteLibraryEntry` (or F-025 delete-now) removes the library row, cached thumbnails, reader cache, and — when the child profile or account is deleted — the stored book, its revisions, character bibles, source photos and provider payloads, with propagation to queues and derived likenesses (F-025 is authoritative). Retention: library content is retained while the account/library is active and for ≤30 days after a deletion request; unsaved uploads 48h (F-025). No sharing without an explicit parent-granted link scope (grandparents sharing is later, spec §14).

## 13. Analytics

`library_viewed`, `book_read_started`, `book_read_completed`, `library_action_selected(reorder|sequel|duplicate|gift|colouring)`. No photo or sensitive payloads in analytics events (guide §7 / mission §33 filter).

## 14. Acceptance criteria

- **Given** a book with an approved revision and a completed order, **when** purchase completes, **then** exactly one LibraryEntry appears in "Our Stories" with the approved cover.
- **Given** a delivery webhook is redelivered twice, **when** `createLibraryEntry` runs again, **then** only one entry exists (idempotent on `sourceOrderId`).
- **Given** an order still `IN_PRODUCTION` (fulfilment projection, guide §4 — the Book itself stays `APPROVED`), **when** it renders in the library, **then** it shows the status chip and links to F-020, and its reader warns "your printed book is on its way".
- **Recovery** **Given** the reader loads while an image asset is missing from storage, **when** the page fails, **then** it shows a friendly inline retry and logs an admin alert — it never shows a broken book or falls back to a draft.
- **Given** a parent requests delete-now, **when** the job completes, **then** the library entry, thumbnails, reader cache and stored book are gone and unrecoverable.

## 15. Dependencies

Requires F-016 (approved revision exists), F-018/F-019 (an order exists to trigger entry creation), F-011 (reader). Parallel with F-020 (tracking chip) and F-023 (multi-child filters). F-022 consumes the card menu actions. F-025 governs deletion of entries. F-024 localises library UI strings.

## 16. Priority

**P2 — retention/delight.** Class per mission §33 product filter: library is not category parity (P0) nor core differentiation (P1, e.g. identity/editor); it is the repeat-usage/gifting engine behind sequels and reorders and maximises value of each printed book. Strongly flagged in spec §14 ("the product relationship continues") and §26 (P2: family library, narration, colouring).
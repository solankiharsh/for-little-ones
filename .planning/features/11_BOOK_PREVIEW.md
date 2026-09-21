# 11_BOOK_PREVIEW.md — Reading-Mode Book Preview

> **Spec ID:** F-011 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-008 Story Generation, F-009 Illustration Generation, F-010 Generation Progress
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Reading-mode preview is the way a parent sees the finished book before paying: a real, flip-through book (`../../project-spec-initial.md` §8 — "The Preview Should Be the Product", §15 — digital experience). It is the **reading renderer** of the three-renderer split (`_SPEC_GUIDE.md` §2, `DECISIONS.md` D005): lightweight, polished, read-only, and it never ships or loads the editor framework. It renders the canonical `Book` model directly and is reused by the purchased/digital view and the family library (F-021).

## 1. Goal

Generation must not end in a spinner followed by checkout (spec §8 criticises exactly this pattern in the category). The parent must feel the emotional "wow" before payment and be confident the printed book will be excellent. Preview is the honest representation of what is being bought — the same canonical pages, layout and assets the print renderer consumes, not a mockup.

## 2. User value

- **Confidence in print** (quality principle): what you flip through is structurally what is printed (same canonical model, same text, same final-quality image assets).
- **The wow moment precedes purchase** (spec §8, §19 thesis): the wow is the book, not the checkout.
- **Fewer support problems** (spec §24): parents who previewed have fewer "not what I expected" complaints seated at delivery.
- **The same surface becomes the product after purchase** (spec §14, §15) via F-021, so this is one build covering preview, digital copy and library reading.

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

Proposed subsystems this spec feeds into (not existing): `BookService` (assembles reading projections), `BookRepository` (canonical read source), `GenerationJob` (produces the page assets it displays).

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Editor leakage (D005):** the reading bundle must not import the OpenPolotno/Konva editor package or any editor CSS. Verifiable in CI (bundle-content check, see §8).
- **Canonical drift (D004):** reading must render the canonical `Book`, never the editor JSON snapshot. If `BookRepository` returns canonical pages and the reader renders text from `page.textBlocks` and images from canonical illustration assets, that invariant holds by construction.
- **Mutability leakage:** preview must be read-only. Edit affordances must open an explicit edit surface (F-012/F-014), never in place.
- **Asset privacy (§7 invariants):** signed short-lived URLs only; no public asset URLs (spec §18).
- **Performance:** page images are large; reading must serve proxied/precomputed reading-resolution assets with lazy load.

## 5. Desired UX

Example: Emma, creating "Ava's Moon Adventure" for Ava, age 5. Generation completes; page 12 had failed and was repaired independently (F-010/F-012); the book reaches `READY_FOR_REVIEW`.

**Desktop (spec §8 layout):**
1. Rail (left): page thumbnails — cover + 2–3, 4–5, … spreads, plus the failed-then-repaired page 12 flagged "new".
2. Center: the current spread at print aspect ratio, illustration crisp, text set in the book font. Spreads flip left/right by arrow controls or keyboard ←/→.
3. Footer: minimal "Something wrong?" per-page entry (F-012), "Edit page" (F-014), "♡", and a single persistent book-level CTA "Continue" that advances to QA/approval when the book is `READY_FOR_APPROVAL` or "Approve & Print" (F-016) when gated.
4. Before anything is shown: skeleton rail + dimming center; image lazy-loads progressive (`progressive` JPEG/WebP) so the spread resolves softly rather than as a spinner block.
5. Failure: page 12 image fails → that spread shows a warm inline card, "We had trouble loading this drawing. The rest of the book is safe." with **Retry** and **Something wrong?** (F-012). The rail, all other spreads and navigation remain fully usable (D010).

**Mobile (spec §8, D012):** book-first, one-handed. No rail by default.
1. Full-screen single-page flip (spec §8 "flipping through an actual book"). Swipe right to go back a page, swipe left to advance; a subtle page-peek shadow and slight spring curve. Portrait shows one page; landscape offers spread with a toggle.
2. Tap center of illustration → zoom into the illustration with pinch/pan; tap again to zoom out.
3. A bottom sheet "Something wrong?" opens on long-press or the small "⋯" on any page; it also carries "Go to page 24".
4. Page jump: a bottom "pages" affordance opens a horizontal strip of thumbnails with the current page pinned; tap to jump.

**Loading/empty:** a book with zero readable pages (all illustration pages `PENDING`/`FAILED`) shows the friendly "Ava's book is still coming together." state with per-page cards and a single retry-all; it never renders an empty canvas.

**Reconnect:** if the session reconnects mid-flip, the reader resumes on the page already loaded (client state), and any deferred loads continue; no restart (D010).

## 6. UI specification

- **Rail (desktop, ≥1100px):** vertical list of page chips; active chip highlighted; chip shows state accent — ready, new-revision, or quill icon for text-only change. Rail collapses to a horizontal strip below 1100px.
- **Spread view:** fixed aspect container (print aspect from current `printSpec` if set, otherwise default 2:3 spread), letterboxed, page-turn arrow controls at the spread edges; keyboard ←/→; trackpad/pointer drag as an accepted-but-secondary gesture.
- **Typography:** rendered from the canonical text blocks with the curated book font stacks (the same ones F-017 must embed) — so preview approximates printed type; this is stated as a parity target, not an exact PDF.
- **Primary CTA:** never ambiguous. One context-aware CTA in the top bar: `Continue to review` (`READY_FOR_REVIEW`) → later `Approve & Print` (F-016). No other purchase states live here (spec §17).
- **Edit chrome is explicit and absent by default:** no persistent toolbar, no layer panel, no object inspector. Editing enters only via "Something wrong?" (F-012) or a single "Edit this page" (F-014), and when opened it visibly leaves reading mode (simulated sheet/route change).
- **Animations:** page-turn spring (≤250ms), thumbnails lazy-reveal, zoom springs. No decorative confetti.
- **Accessible:** contrast AA on rail and text; caption/figure rings on focus; `aria-live` for load failures; tap targets ≥44px (D012 mobile reachability).
- **Zoom:** double-tap / toolbar magnify on the illustration only; text never scales out of its block (reading text is always ≥ print-safe text size)
- Refer to `../product/DESIGN_SYSTEM.md` for colour/surface tokens once the design system exists (Decision needed: design tokens not yet authored).

## 7. Domain model

No new canonical entities. Reading views are **projections** of the canonical `Book` via `BookService`:

```text
BookPresentation (derived, not persisted as canonical)
├── bookId, title, coverAssetRef
├── readability state (per page: READY | NEW_REVISION | PENDING | FAILED)
├── spreads[]            ← pairs of canonical pages (or single page on mobile)
│   ├── pages[].text = textBlocks[] (canonical)
│   ├── pages[].illustrationRef = canonical illustration asset (billable/original)
│   ├── layout refs (print-safe aware)
└── printSpecRef (for aspect if present)
```

- Canonical `page.textBlocks[]`, `page.illustrations[]`, `page.layout`, `page.generationMetadata` are the only inputs (`_SPEC_GUIDE.md` §2).
- Reading is a projection; nothing here is stored back into `Book` except analytics observations (§13).

## 8. Backend/API requirements

- `GET /books/{id}/preview` → `BookPresentation` (guards: session/project owner, or library access for F-021; anonymous session permitted pre-claim, F-001). Returns first-page URLs and a manifest; client fetches the rest lazily.
- `GET /assets/{ref}?kind=reading` → signed, short-lived (e.g. 60s) URL to the reading-resolution proxy (≤1600px long edge, WebP/JPEG progressive; original never exposed). Signature covers ref + session; rotation on each request.
- **Bundle isolation (D005):** reading chunk must not contain the editor package. CI asserts: if any reading bundle matches `openpolotno|konva` package identifiers → fail build. (Recommended experiment: confirm the bundler-split technique with our stack before freeze.)
- Read-only: no mutation endpoints served to the reader route. `PATCH`/`POST` under `/books/{id}` are enforced at the gateway for the reader surface.
- Idempotency: not applicable to reads; the client caches the manifest keyed by `book.revisionId` so rail and spreads never flicker across reloads.

## 9. Background jobs

- **Reader asset precomputation (`GenerationJob` variant, proposed):** when illustration `PAGE_RENDERED` fires (F-009/F-010), a job generates the reading-resolution proxy + thumbnail per page. Retry 3×, resumable, never blocks the page's `READY` state for canonical purposes — reading falls back to on-the-fly resize if the proxy is missing.
- No other background work; the reader itself is stateless.

## 10. AI behaviour

None. The reading renderer performs **zero** model calls: images are fetched from storage, text from the canonical model. This is the purity guarantee that keeps the reading bundle small, deterministic and privacy-clean; all AI behaviour lives in F-008/F-009/F-012/F-013.

## 11. QA

Reads the book-facing subset of the QA catalogue (F-015 owns the suite):

- **Missing assets:** every page in a readable spread has a non-null illustration ref; else the page renders the warm failure card (§5).
- **Text presence:** nonzero `textBlocks`; empty page never renders silently blank.
- **Count consistency:** `spreads` build from exactly the canonical page list — a drift here indicates a `BookService` projection bug and is itself an alert (advisory).
- **Screen overflow (advisory):** reflowed text exceeding the block is clamped with an ellipsis and flagged for QA, not expanded into the illustration.

## 12. Privacy/security

- Asset URLs are signed and short-lived; never public (guide §7, spec §18). Generated likenesses derived from photos are treated as PII; the reading proxy is served under the same access control as the source photo.
- No logging of page images or their refs in reader analytics handlers; only book/page ids and event names.
- Reading sessions bind to the owning session or claimed-project owner (F-001); shared reading (grandparents) is out of scope here and defined under F-021.

## 13. Analytics

Only genuinely useful events (mission §33 filter), no photo/sensitive payloads:

- `preview_opened` (bookId, page count, state)
- `preview_page_viewed` (page ordinal)
- `preview_zoomed` (page ordinal)
- `preview_something_wrong_opened` (page ordinal — this is the F-012 funnel entry)
- `preview_continue_clicked` (target: review or approval)

## 14. Acceptance criteria

1. Given a book with ≥1 `READY` page, when the owner opens preview, then the rail lists every page, the centered spread renders canonical text + final-quality illustration at print aspect, and no editor framework code is present in the reading bundle (CI assertion passes).
2. Given a page whose image fails under a severed connection, when the reader tries to load it, then only that page shows the warm retry card and all other spreads/navigation remain usable; a successful retry restores the page without reloading the book.
3. Given the empty-book state (all pages `PENDING`/`FAILED`), when preview opens, then the railing "still coming together" state with per-page status cards and retry-all shows; no blank canvas or raw error text is shown.
4. Given a mobile viewport (D012), when the parent swipes through the book, then each swipe advances exactly one page with the flip spring, one-handed touch targets stay ≥44px, and tapping an illustration enters zoom that preserves print-safe text sizing on exit.
5. Given a page revision created after preview opened (F-012), when the manifest refreshes, then the revision's spread shows and the rail chip updates to "new" without losing the reader's current page.
6. Given a book in `READY_FOR_APPROVAL`, when the parent reaches the preview top bar, then the single CTA reads `Approve & Print` and launches F-016 — never multiple ambiguous purchase states (spec §17).

## 15. Dependencies

- Must exist first: F-008 (canonical page text), F-009 (illustration assets + storage refs), F-010 (page states, persistence of `READY`/`FAILED` per page).
- Reuses: `BookService`/`BookRepository` (canonical reads), asset proxy job.
- Consumers: F-012 (page corrections operate from the "Something wrong?" surface on this reader); F-021 (family library & digital reading reuse this renderer); F-016 (approval presented from this reader).
- Parallel track: F-014 (editor) and F-017 (print renderer) are independent renderers over the same canonical model (Track C).

## 16. Priority

**P0 — category parity.** The entire competitor set previews before payment (spec §2–§3 matrix: "Preview before purchase" for Magic Moon, Adorabook; Diffrun previews 13 pages); without preview we are clearly worse than the category. It also carries the quality-confidence and mobile-differentiation goals (D012). Per mission §26/§33 it is launch-parity, and its reuse by F-021 makes it the cheapest path to the post-purchase library experience.

**Decision needed:** (1) reading asset proxy implementation (precomputed vs on-the-fly) — spike BEFORE F-011 freeze, informed by storage/CDN cost of ~41×300dpi finals vs ~1600px proxies; (2) design tokens/surface spec not yet authored — `../product/DESIGN_SYSTEM.md` should be created before UI freeze.
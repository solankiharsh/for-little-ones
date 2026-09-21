# 14_BOOK_EDITOR.md — Custom Simple Book Editor (above OpenPolotno)

> **Spec ID:** F-014 · **Priority:** P1 · **Status:** draft
> **Depends on:** F-011 Book Preview, F-012 Page Correction, F-013 Global Character Correction, F-017 Print Renderer (font/asset contract)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The editor is the **editing renderer** of the three-renderer split (guide §2, D005): OpenPolotno (`@reyka/openpolotno`) is the low-level editing engine, wrapped behind our own book/editor domain boundary with a **custom, deliberately simple UI** (D007, AGENTS.md). It is an escape hatch (D003 — AI does ~95%, editing is the ~5%), never a generic Canva surface, and its JSON is a derived snapshot — never the canonical Book (D004).

## 1. Goal

After corrections (F-012) cover the common complaints, a small population still wants manual control: adjust text placement, resize a crop, move an element, reorder decorative bits, build the dedication page. The editor must let them do precisely that — nothing more, no power-user complexity (spec §5A, §7 avoids blank-canvas and template-with-face-insertion).

## 2. User value

- **Confidence when corrections can't express it:** manual nudge is the last-resort control that prevents "it's still not right" from becoming a refund (spec §24).
- **Trust in the boundary:** because reading/print come from the canonical `Book`, edits here are visible in preview (F-011) and survive to print (F-017) — no "I fixed it but it printed wrong".

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Editor-first UX (D003):** this surface must be reached via explicit intent, not the default path.
- **OpenPolotno JSON as canonical (D004):** serialisation must always go through the canonical model.
- **Full generic editor leak (D007):** expose a fixed primitive set only (below); hide everything else.
- **Spread/renderer mismatch:** a "page" here must map to exactly one canonical page or one spread, and the mapping must be decided by the spike (D007, feature-map open input) before approval.

## 5. Desired UX

Emma finds page 6 still frames Ava slightly off-centre after F-012. In the preview sheet she taps "Edit this page properly" (F-012 escape hatch; F-011). The editor loads **page 6 only** (no full-book editor) as a canvas at print aspect with the canonical text and illustration already placed, a small page-strip on top (page 6 of 41), a slim right-hand toolbar, and a "Done — back to preview" primary action. She drags the illustration, nudges its crop, and saves. Preview reloads page 6's revision with her layout; print contract intact.

## 6. UI specification

- **Entry points:** only from F-011 sheet and F-013 global-correct confirmation; never a persistent global "Open editor" chrome in the reader.
- **Scope drawer:** default single page; a secondary "whole book" mode copies the current layout to all pages only with explicit confirmation (restricted to layout-level ops, never per-object).
- **Toolbar (slim, custom, not Canva):** Move · Text · Add shape/emoji deco · Crop · Reorder (bring forward/back) · Undo/Redo · Reset page to last revision.
- **Panels as sheets** on mobile (D012); single-column controls; ≥44px targets.
- No layers panel, no alignment rulers beyond basic snap, no blend modes, no animation timeline, no template gallery of generic Canva art.
- Inverse action = "Discard and keep my last version" always visible; autosave of the working snapshot every action (never lose a working edit — D010 in spirit).

## 7. Domain model

```text
EditorSnapshot (derived, per editor + version, cached, NEVER canonical)
├── schemaVersion, sourceRevisionSeq, pages[OpenPolotno-scope per page]
canonical Book (source of truth)
└── pages[].layout, textBlocks[].style, illustrations[].transform, decorativeElements[]
```

Round-trip rules: Editor → `BookService.importEditorSnapshot` validates (schema version, required textBlocks preserved, print-safe box respected, asset refs exist) then writes the canonical page; Reader/Print render only canonical. Unsupported OpenPolotno fields are dropped at import; a diff report lists what was dropped.

## 8. Backend/API requirements

- `GET /books/{id}/editor/snapshot?version=v1` → editor snapshot (only when book state is `EDITING`/`READY_FOR_REVIEW`, page not `APPROVED`).
- `PUT /books/{id}/pages/{pageId}/layout` — single-page canonical layout update (validated: print-safe, asset refs, text length bands). Idempotent via `ifRevisionMatch`.
- `POST /books/{id}/editor/import` — full snapshot import with round-trip validation; returns canonical diff.
- Editor is the only surface that writes `layout`; corrections (F-012) write text/illustration only. The two may both touch the same page — last-writer wins **per field**, tracked via revision ≤ to avoid losing the other's change; a conflict (both changed) produces a "keep which one?" choice.

## 9. Background jobs

Not applicable to core editing — snapshot work is interactive. Reuse F-015's per-page QA job as a post-save check (listened to, can block commit if blocking severity).

## 10. AI behaviour

None inside the editor engine. The "Fix character", "Try another" affordances in the editor's page panel are **F-012 intents invoked through the same API**, not OpenPolotno features (D002 language preserved in editor too).

## 11. QA

Post-save the page enters F-015 per-page checks: text overflow, print safe area, resolution (a dragged image below print DPI is refused at save with "This picture will look blurry when printed"), missing assets, repeated illustration. Blocking findings revert the save with a friendly message.

## 12. Privacy/security

Editor snapshot and working state live under the same session ownership as the book; no new provider receives data (editing is client-side); autosave working snapshots follow the book's retention/deletion (F-025). No logging of canvas content.

## 13. Analytics

`editor_opened` (pageId, via: preview|correction) · `editor_saved` (modifiedFields) · `editor_reset_page` · `editor_conflict_choice`. No canvas bytes, no photo payloads.

## 14. Acceptance criteria

1. Given page 6 in the editor, when Emma moves the illustration and saves, then the canonical `page.layout` for page 6 is updated, all other pages' layouts are byte-identical, and F-011 preview shows the new placement.
2. Given an import with an unsupported OpenPolotno field, when the parent saves, then the field is dropped, the drop is reported in the canonical diff, and the canonical model remains valid for print.
3. Given the reader route open on page 6, when the editor saves a layout, then the reader bundle does not load the editor package (D005 CI assertion passes).
4. Given an `APPROVED` page, when the editor requests a snapshot, then the request is rejected and no save path exists (D011).
5. Given a page with text and layout both changed since the last save (correction + editor), when both save, then the per-field merge keeps both changes and shows the conflict choice when they collide.

### Spike checklist (BLOCKS F-014 approval — record conclusions in `../RESEARCH_LOG.md`)

1. **Spread support:** decide single-canvas-per-page vs Spread canvas; verify OpenPolotno multipage handles the paired cover/inside spreads at 2:3 with correct bleed margin ([D007] direct dep vs pinned vs fork residence is decided here).
2. **Page restore:** prove canonical → snapshot → canonical round-trip survives an editor mid-session browser refresh without data loss.
3. **Child-image actions:** verify custom element path can host our `CharacterBible`-aware actions (swap illustration via F-012, "keep this face") inside OpenPolotno without exposing generic layers.
4. **Font/asset contract with F-017:** verify edits keep the embedded-font and DPI contract the print renderer requires (SVG/text styles export with resolveable fonts).

## 15. Dependencies

- Must exist first: F-011 (entry points + manifest), F-012 (intent API reused in editor panel), F-013 (character-wide actions reachable), F-017 contract (fonts/DPI/safe-area rules the editor validates against). Track C means F-011/F-014/F-017 are parallel over the canonical model, but import/export validation needs the `printSpec` definition from F-017's shared model.

## 16. Priority

**P1 — differentiation.** "Much better preview/editor" and effort-lessness of editing are reason-to-exist items (spec §26). Not P0: competitors ship correction (Diffrun) and the category doesn't expect a full editor; bootstrapping with F-012/F-013 first and a small spike (above) is the cheaper path to a differentiating editor without the OpenPolotno commitment risk (D007).

**Decision needed:** direct dependency vs pinned version vs internal fork of `@reyka/openpolotno` — resolved by spike 1 in `../RESEARCH_LOG.md` before F-014 is marked agreed (feature-map open input).
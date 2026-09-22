# Editor Engine Sponsor Ticket — close D007 with a pinned, wrapped engine

> **Status:** OPEN · **Owner:** a sponsor who lands feature work · **Closes:** DECISIONS.md D020 "editor implementation posture" (currently OPEN with evidence)
> Evidence: `spike/editor-primitive/` (phase 1 + 2), `RESEARCH_LOG.md` 2026-09-22 entries, `tmp/editor-primitive/report.json` + `phase2.json`

## Goal

Commit the spike evidence into an owned posture: adopt `@reyka/openpolotno` as the low-level editing engine behind our own book/editor boundary, wrapped (not depend-without-protection, not fork), pinned to a committable version, with the adapter between canonical `Book` and editor snapshot carrying the only translation logic (D004).

## Why now (evidence)

- Acceptance round-trip PASS, both phases, 36/36 tests (headless + real system Chrome at 390×844).
- Real render + interaction numbers now exist for `@reyka/openpolotno@1.5.0`: exact 1224×1224 raster at pixelRatio 2; deterministic byte-equal SVG; Nunito loads through the engine's own loader (+72.4 px at a 90 px span); self-hosted data-URI font registers via `store.addFont`; drag ≈ 2 ms avg rAF input-to-paint; undo/redo ≈ 2/1/0.5 ms.
- Known surface is bounded (below); nothing in it stops the wrap, so closing D007 is a wiring decision, not another research question.

## Posture (recommendation, decision expected here)

| Option | Evidence signal | Recommendation |
|---|---|---|
| DEPEND direct (no pin) | zero `.d.ts`; deep subpath `model/store` is untyped & unstable; bundle churn | No — needs a pin |
| PIN at a commit | any shake-out costs nothing; upgrade is deliberate | Yes, pins the agreed commit |
| WRAP (our adapter) | D004 already forces the only translation boundary; snapshot never canonical | Yes, regardless of engine |
| FORK internally | no measured defect exists; fork cost is high | Not now |

Decision expected: adopt **pin + wrap**. Record it in `DECISIONS.md` D020 (close the OPEN) with the acceptance criteria below as the closure gate — or, if any criterion fails, record `OPEN` again with the new evidence. Never fabricate.

## Engine facts the wrap must encode (measured, not assumed)

- Engine: `@reyka/openpolotno@1.5.0`; upstream `openpolotno@1.0.2` is the older branch with the identical model surface (both measured in phase 1).
- Entry: `RaeditorApp` / `createRaeditorApp` from the package main; `createStore` is NOT re-exported — deep-import `@reyka/openpolotno/model/store`.
- Sub-path imports take NO `.js` suffix (`.../utils/fonts` resolves, `.../utils/fonts.js` fails).
- Main entry bundles extensionless `@meronex/icons` → not Node-importable; the browser seam needs a bundler.
- No shipped `.d.ts` → the repo owns a type shim (`spike/editor-primitive/src/vendor.d.ts`), pinned to the pinned version.
- Model surface: `addPage(attrs)`, `page.addElement({type})`, `element.set({})`, `store.loadJSON`, `history.transaction(() => {})` + `undo()/redo()` (snapshot-based; debounce avoided inside transaction). No `store.change`.
- Element types: text, image, svg, line, group, video, figure, gif. No path/shape primitives. Crop = `cropX/Y/W/H` (recrops the source then stretches to element bounds — the composited rect does not shrink).
- Bleed/safe-area overlays: `toggleBleed(value?)`, `toggleRulers(value?)`, `addGuide(position, orientation)`; `page.bleed` persists in JSON. The overlay is a view toggle, not persisted state.
- Font loading: engine's own `injectGoogleFont` + `loadFont` (poll-until-measure). `store.addFont({fontFamily, url})` requires a DOM (never call headlessly). `isFontLoaded` is a measure-difference heuristic over ASCII test text — a rendering probe, not a load guarantee; use `document.fonts.check` for load truth.
- Quirk: default text `height:0` normalizes to `1` on `loadJSON` — set heights explicitly.

## Acceptance criteria (closure gate for D020)

1. `packages/` exposes an editor boundary owning the canonical side; the only `Book` → engine path goes through one adapter module (D004), and the engine snapshot is never canonical state.
2. Phase-1 acceptance path re-runs in-package, green: canonical Book → adapter → snapshot → user edit → canonical command → discard snapshot → rebuild → byte-identical visible result.
3. Browser evidence is reproducible from the repo: `npm run phase2` (or its in-package equivalent) yields `status: PASS` with the phase-2 structural checks, and the reading/print preview bundles never import the editor package (D005, `openpolotno|konva` bundle guard).
4. Engine + deep subpath are pinned to a committed revision; the type shim lives next to the adapter and updates only on deliberate upgrade.
5. F-014 spec is promoted from draft to `agreed` with the page→spread mapping decision resolved (single canonical page vs spread) against the measured print geometry (fit 0.637 @ 390×844, safe area 71 px, touch target 69 px).

## Non-goals

- No generic Canva surface (custom, deliberately simple UI — D003).
- No migration of the canonical model to editor JSON.
- No internal engine fork unless a measured defect forces it.

## Escape

Any acceptance criterion that cannot be met with evidence is recorded in `DECISIONS.md` and `RESEARCH_LOG.md` as `OPEN` again with the failing data — D020 discipline. `OPEN` with honesty beats a closed posture on vibes.
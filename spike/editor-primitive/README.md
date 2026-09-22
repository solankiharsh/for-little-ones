# Spike B — Editor Primitive (OpenPolotno validation)

Status: **CLOSED — ADOPT pin + wrap** (D007, 2026-09-22) — phase 1 (headless) + phase 2 (real browser render/interaction) evidence captured; the posture landed as `@reyka/openpolotno@1.5.0` (exact pin) + wrapper in `packages/editor` (see `../../.planning/RESEARCH_LOG.md` D007-closure entry). This spike package remains the repeatable evidence generator (`npm run phase2`).

## Question

Can one of the OpenPolotno candidates serve as the low-level editing engine underneath a custom For Little One interface, without leaking editor JSON into the canonical Book model?

- openpolotno `1.0.2`
- @reyka/openpolotno `1.5.0`

## Phase 1 — Headless

### Method and Result

Headless Node probes only (`tsx` + `vitest`, no React/canvas). The acceptance path and the measurement surface from `PROJECT_SPIKES.md` are implemented in `src/` and asserted in `test/`. The machine-readable report is written to `../../tmp/editor-primitive/report.json` (gitignored).

Run:

```sh
npm run typecheck
npm test
npm run experiment      #   -> tmp/editor-primitive/report.json (status PASS)
npm run bundle-size     # -> tmp/editor-primitive/bundle-size.json
npm run phase2          # -> tmp/editor-primitive/phase2.json (status PASS, real Chrome)
```

Status `PASS`: both candidates run the entire acceptance path headlessly:

> canonical Book page → adapter → editor snapshot → user edit → canonical command → discard snapshot → rebuild → byte-identical visible result.

## Result template fields

**Status** PASS; **Decision** KEEP OPEN.

**Hypothesis** The candidate stores suffice for phase 1 of the D007 posture; the final posture (depend/pin/wrap/fork/reject) needs render + interaction numbers first.

**Approach** Build spread → edit → serialize → restore → undo/redo; measure bytes, latency, print geometry, phone viewport math, and the canonical-adapter boundary. Both packages import via deep file URLs because their `exports` maps reference `.d.ts` files that do not exist.

**Evidence collected**

- Headless document model works (build → edit → serialize → restore → transaction undo/redo) in plain Node, both candidates.
- Acceptance path `jsonStable: true`, `customActionResolvesOverlap`, `customActionDeterministic` for both.
- Page bleed (`page.bleed`) round-trips; `toggleBleed`/`toggleRulers`/`addGuide(position, orientation)` expose bleed + safe-area overlays.
- Undo/redo deterministic via `history.transaction(fn)` → `history.undo()/redo()`, no timers.
- Bundle (gzip): openpolotno main 172 KB → model subimport 45 KB; @reyka main 190 KB → model 48 KB. Latency on 30 elements: change ≈ 89 µs, transaction ≈ 157 µs, undo ≈ 4.6 ms.
- Phone math (390×844 viewport, 215.9 mm page): fit scale 0.637, touch target 69 px model-space, safe area 71 px.

**Observed failures / caveats**

- Zero TypeScript declarations shipped despite `exports` maps referencing `.d.ts` files (`src/vendor.d.ts` shims the deep subpath).
- Deep subpath `dist/model/store.js` is untyped and not a documented stable path — pin it.
- Real canvas rendering, web-font metrics, and true mobile touch/gesture latency are covered in phase 2 (browser), not headlessly.
- No path/shape primitives; crop/mask is a numeric crop surface (`cropX/Y/W/H`), not clip-path.
- `store.fonts` stays empty headlessly: registering custom fonts (`addFont`) touches `document` and needs a DOM.
- Default text `height: 0` normalizes to `1` on load — byte-identity holds once height is set explicitly.

**External opinions calibrated against** GitHub issues on sub-path exports and `.d.ts` absence; results confirmed directly in `node_modules` source.

**Decision/exit** Stay **extended open**: posture depends on real web-font metrics + phone-surface interaction numbers (phase 2).

**Focus period** 2026-09-22 (single sharp session, iterative; ~950 KB → 212 KB model gzip before render claims).

**Board card** Spike B — Editor primitive (see `.planning/PROJECT_SPIKES.md`).

## Phase 2 — Real browser (Chrome, phone viewport)

Closes the phase-1 gaps: canvas render, web-font loading/metrics, crop on actual pixels, undo/redo and pointer-drag latency inside the real editor UI.

Harness (`src/browser/`, `vite-browser.config.ts`, `scripts/phase2.mjs`): a Vite bundle mounts the `@reyka/openpolotno` editor (`RaeditorApp`) on a 390×844 / deviceScaleFactor 3 page; `scripts/phase2.mjs` builds it, serves it, drives it with the system Chrome via `playwright-core` (`channel: "chrome"`), and writes `../../tmp/editor-primitive/phase2.json` (gitignored) plus `browser-spread.svg`, `browser-raster-page-dpi144.png`, `browser-phone-viewport.png`. `test/browser.spec.ts` re-asserts the recorded numbers and self-skips when the run has not happened in this clone.

Status `PASS` (all 9 checks):

- Raster export exact at pixelRatio 2 → 1224×1224 px; ink detected on both page and image; two consecutive SVG exports byte-equal (deterministic), contain text, and mention the loaded font.
- Web font (Google Nunito) loaded through reyka's own `injectGoogleFont` + `loadFont` path: `document.fonts.check` true and rendered width delta 72.4 px @ 90 px test span (waited ≈ 0.7–1 s).
- Self-hosted font via `store.addFont` data-URI (`injectCustomFont` @font-face from a real woff) → `document.fonts.check` true; the store font registry grows; valid even though the ASCII measure heuristic (`isFontLoaded`) stays false for an icon font without ASCII glyph coverage.
- Pointer drag on the text element: 17 rAF samples, avg 1.2–1.3 ms, p90 ≈ 2 ms per input-to-paint sample; history transaction ≈ 2 ms, undo ≈ 1 ms, redo ≈ 0.5 ms.
- Crop verified on real rendered pixels: `cropX/Y/W/H(0.25,.25,.5,.5)` cuts source ink 182 838 → 84 316 px; the composited element rect stays fixed (crop stretches the cropped source to element bounds — recorded as an observed semantic, not a bug).

Browser-package facts learned: `createStore` is not re-exported from the package main entry — deep-import `@reyka/openpolotno/model/store`; sub-path imports resolve without a `.js` suffix (`.../utils/fonts` works, `.../utils/fonts.js` fails); the main entry bundles extensionless `@meronex/icons` imports so it cannot be required from Node and must go through a bundler.

Checks/metrics are intentionally structural (asserting existence, determinism, and that ink/geometry changed the right way) rather than fabricated thresholds; the single hard latency gate is the 1 s undo/redo bound.

## Canonical boundary (D004)

`src/adapt-book.ts` is the only pathway from the canonical `Book` into editor state; it expresses user edits as canonical commands (`canonicalCommandsFromUserEdit` → `{ kind: "set-text" | "clear-face", ... }`), never editor JSON. `test/adapt-book.spec.ts` proves a two-page canonical book becomes a two-page editor spread at real print dimensions and restores byte-identically.
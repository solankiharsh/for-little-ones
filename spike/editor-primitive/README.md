# Spike B — Editor Primitive (OpenPolotno headless validation)

Status: **KEEP OPEN** (D007) — phase 1 evidence captured; real render/interaction pass pending.

## Question

Can one of the OpenPolotno candidates serve as the low-level editing engine underneath a custom For Little One interface, without leaking editor JSON into the canonical Book model?

- openpolotno `1.0.2`
- @reyka/openpolotno `1.5.0`

## Method and Result

Headless Node probes only (`tsx` + `vitest`, no React/canvas). The acceptance path and the measurement surface from `PROJECT_SPIKES.md` are implemented in `src/` and asserted in `test/`. The machine-readable report is written to `../../tmp/editor-primitive/report.json` (gitignored).

Run:

```sh
npm run typecheck
npm test
npm run experiment    #   -> tmp/editor-primitive/report.json (status PASS)
npm run bundle-size   # -> tmp/editor-primitive/bundle-size.json
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
- Real canvas rendering, web-font metrics, and true mobile touch/gesture latency were NOT measured (need a browser+device).
- No path/shape primitives; crop/mask is a numeric crop surface (`cropX/Y/W/H`), not clip-path.
- `store.fonts` stays empty headlessly: registering custom fonts (`addFont`) touches `document` and needs a DOM.
- Default text `height: 0` normalizes to `1` on load — byte-identity holds once height is set explicitly.

**External opinions calibrated against** GitHub issues on sub-path exports and `.d.ts` absence; results confirmed directly in `node_modules` source.

**Decision/exit** Stay **extended open**: posture depends on real web-font metrics + phone-surface interaction numbers (phase 2).

**Focus period** 2026-09-22 (single sharp session, iterative; ~950 KB → 212 KB model gzip before render claims).

**Board card** Spike B — Editor primitive (see `.planning/PROJECT_SPIKES.md`).

## Canonical boundary (D004)

`src/adapt-book.ts` is the only pathway from the canonical `Book` into editor state; it expresses user edits as canonical commands (`canonicalCommandsFromUserEdit` → `{ kind: "set-text" | "clear-face", ... }`), never editor JSON. `test/adapt-book.spec.ts` proves a two-page canonical book becomes a two-page editor spread at real print dimensions and restores byte-identically.
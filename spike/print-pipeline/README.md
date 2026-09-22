# Spike D — Print pipeline against a realistic provider (Mixam)

Status: **HARNESS GREEN — sample PDF produced; decision: first provider = Mixam (hardcover, art-book
square) with an adapter, PrintSpec stays generic (D016)** (2026-09-22). Runtime: fully offline,
deterministic; no browser, no Docker.

## Question (PROJECT_SPIKES §Spike D)

> Build the deterministic renderer against our generic `PrintSpec`; provider-specific rules live in
> the adapter, so changing only the editor implementation never changes the print-domain contract.
> Deliver: one real sample PDF from fixture Book data + measured properties.

## Method

1. **Provider evidence** (`MIXAM_EVIDENCE.md`): Mixam's live specs (trim/bleed/safe, PDF requirements,
   hardcover/spine, embedding, resolution) + Blurb cross-check, tagged Documented/Inferred.
2. **Generic renderer** (`src/generate.ts`): deterministic PDF (pdf-lib + embedded TrueType via
   fontkit) consuming ONLY the canonical `Book` + `PrintSpec` (D016). No editor import anywhere.
3. **Mixam adapter** (`src/mixam.ts`): provider rules encode the delta; `evaluateAgainstMixam` reports
   `HARD_BLOCK`/`REVIEW_REQUIRED` findings.
4. Sample artifact written by `scripts/make-sample.ts` → `../../tmp/print-fixture/sample-book.pdf`.

## Results (`npm run typecheck` clean; `npm test` 8/8)

- **Determinism proved:** identical inputs → **byte-identical PDFs** (two builds, `Buffer.equals`).
- Page geometry exact: 24 pages @ trim + 2×bleed (210 mm + 6 mm → 858.9 pt square), verified by
  re-parsing the PDF (page count + size). `validateGeometry` (D016 canonical preflight) `{ ok: true }`
  for pageCount 24.
- All placed text inside the safe area (asserted for every line).
- Font embedded (1 Arial subset via system TTF); Mixam's embedding rule satisfied.
- Mixam findings for the generated 24-page interior: **only `SAFE_BINDING_EDGE (REVIEW_REQUIRED)`** —
  hardcover binding-edge quiet area is 12 mm (Documented) vs our uniform 8 mm; no `HARD_BLOCK`s.
- Adapter correctly flags `TRIM_NOT_OFFERED` for 215.9 mm square (not an offered art-book trim);
  210 mm passes. D016 canonical gate catches bleed ≥ half trim.
- **Editor independence proved** (`test/boundary.spec.ts`): print-pipeline source never imports
  `@for-little-ones/editor` / `@reyka/openpolotno` / `konva`; `packages/domain` has no editor dep.

## Honest gaps (recorded, not hidden)

- Colour: pdf-lib draws DeviceRGB; Mixam wants CMYK **GRACoL2006_Coated1v2** (Documented). Conversion
  belongs to the F-017 renderer, not the contract — flagged as a production requirement.
- Sample covers **interior pages only**. Cover/spine rules (20 mm cover bleed, spine auto-calc, 5 mm
  hinge, endpapers) are encoded as adapter knowledge but not exercised by a separate cover PDF yet.
- Font: single system TTF (Arial) as a stand-in; real product fonts will come from the canonical font
  set. Sample book is text-only — no measured image-DPI path yet.

## Decision (record → RESEARCH_LOG / DECISIONS)

- **First provider: Mixam** (hardcover, art-book square) — live, precise, matches a personalised-book
  trims (148/210). Contract stays generic: `packages/domain` `PrintSpec` + `validateGeometry` (D016)
  unchanged; supplier deltas pinned in one adapter module.
- Print geometry decision recorded for F-014/F-017: canonical trim should be an **offered** Mixam size
  (210 mm art-book square) or a quoted custom trim — 215.9 mm is not offered.
- Blurb kept as a documented cross-check; at our scale one provider is enough to fix the contract.
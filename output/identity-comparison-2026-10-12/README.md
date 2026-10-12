# Synthetic likeness comparison — 12 October 2026

User selected a matched comparison before the production identity pipeline, and authorised generating a synthetic reference for it.

`reference.png` is an invented photorealistic child portrait generated with the built-in image tool. `a-illustrated.png` was generated with that portrait attached as the sole identity reference. The illustrated garden scene is the exact base of `b-photo-composite.png`; B overlays the original synthetic face with manual registration and a feathered elliptical boundary. No model redraw, colour treatment or beautification is applied to B's protected interior. Scaling uses bilinear resampling, so source pixels are not byte-identical at their original coordinates.

## Observed

- A integrates face, shirt and garden in a painted treatment, but redraws facial features.
- B retains source facial detail within the registered region; its photographic skin treatment is more visible against the painted hair and scene. The edge and pose fit still need parent assessment.
- The compositor reports 0 changed pixels outside the explicit ellipse, 38,127 fully copied/resampled interior pixels, and 0 interior mismatches against the computed source samples. These are preservation checks, not likeness scores.
- Both scenes contain one visible child and share identical composition outside the face region (by construction for B).

## Limits and next decision

One synthetic child, one manually aligned frontal pose, no quantitative likeness threshold, no real-child validation and no commercial provider qualification. B does not preserve the entire head; hair and outer ears remain from A. This does not establish cross-page identity or suitability for rotated/occluded faces. Do not replace production stand-ins based on this experiment.

Ask the parent which treatment to explore. Then repeat using frontal, three-quarter and small-face scenes; measure boundary preservation and review likeness/style separately. A production compositor needs registration and protected-layer handling beyond this fixture.

Reproduce with `node output/identity-comparison-2026-10-12/composite.cjs` from the repository root. Uses the already installed `pngjs` package, no new dependency or network calls.

Generation provenance: reference = `exec-e2c55b49-4e82-457a-80d3-b949706180b6.png`; A = `exec-8737d927-1ab1-41f9-9f4c-5cdc7fa0596b.png`, both generated in this chat on 12 October 2026 and copied locally. B is derived exclusively from those two files by the saved script. `measurements.json` records exact dimensions, normalised registration and test results.

> **Images are not in git.** The PNGs referenced here (reference, A/B renders, comparison sheet) are kept local/private to avoid publishing child-like portraits in a public repository; the JSON measurements, registrations and scripts are committed. Conclusion: [`spike/identity-qa/FINDINGS_2026-10-12.md`](../../spike/identity-qa/FINDINGS_2026-10-12.md).

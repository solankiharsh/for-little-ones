# Varied-pose synthetic comparison — 12 October 2026

User authorised comparing both treatments across three-quarter view, small face and different expression. All images use the original fictional portrait in `../reference.png`; no real child data was used. Left column of `comparison.png`: reference-conditioned watercolor. Right: deterministic source-face composite onto that exact illustrated scene. Rows: three-quarter view, small face, joyful expression.

## Observed findings

- Three-quarter: A turns toward the butterfly. B retains a frontal source face rotated in 2D; its gaze becomes camera-facing and the geometry does not match the original head perspective. The manually registered edge also leaves a conspicuous cheek transition. Treat this as a failed pose fit, not successful perspective preservation.
- Small face: both remain recognisable as the fixture direction at this display size; B shows darker photographic face texture. This scene is a wider shot than the original trial, but the generated head is around 13% of image height including hair, larger than the requested 9%. It is not a demanding tiny-face test and does not validate print resolution or automated identity scoring.
- Expression: A shows the requested open-mouth laugh. B replaces it with the source closed-mouth smile. Copying the source face preserves its expression; it cannot fulfil a different expression request from that one reference.
- Each saved B PNG was decoded and compared against A outside its registered ellipse: **0 changed pixels in all three cases**. Fully source-derived interior pixel counts: 76,489 / 12,789 / 103,096 respectively. Source sampling is bilinear; these counts do not imply equality with unscaled original pixels.
- One visible child per scene. No independent human identity review, measured likeness threshold, provider latency/cost evaluation or parent acceptance was performed.

## Recommendation, pending parent choice

Explore **reference-conditioned illustration with an explicitly parent-approved reference look** as the general storybook path. Keep photo compositing as a constrained option for compatible pose/expression references rather than applying it silently to every page. This is a recommendation from visual fit in four synthetic scenes, not a production provider selection or claim of guaranteed likeness. More photos, 3D reconstruction or generated pose references could change the compositor result, but those techniques were not tested and carry additional tradeoffs.

The next build slice after agreeing the direction is private photo upload/consent and an immutable approved appearance, followed by one recoverable page illustration job. Production eligibility, retention/deletion, real-provider calibration and paid generation checks remain required by the existing specs.

## Reproduce and provenance

From the repository root: `node output/identity-comparison-2026-10-12/pose-trial/run.cjs`. Uses existing `pngjs`, no new dependencies or network calls. `registration.json` holds each manual ellipse and rotation. `measurements.json` holds all checks. The experiment has no automated face registration and is not production code.

Built-in image tool attached the same `reference.png` to each A call, with watercolor treatment, one child, teal shirt, cream trousers and warm garden palette. Scenario prompts requested: picnic and apple basket, head turned 35 degrees toward viewer's right and looking at a butterfly; wide full-body garden walk with head about 9% of frame height; frog discovery with joyful open-mouth laugh. Generated originals:

- Three-quarter: `exec-24b827d6-d040-4e48-ba6a-ba773be91474.png`.
- Small face: `exec-159c99cc-aa05-48ef-b82e-0e5ed0522a20.png`.
- Expression: `exec-16abf93a-d5a9-473a-91ec-0d8628fc8234.png`.

All originals were copied from this chat's generated image directory without replacing prior assets. B uses only the corresponding A and the unchanged synthetic reference. Comparison sheet uses resized previews; inspect individual PNGs for full-resolution edges.

> **Images are not in git.** The PNGs referenced here (reference, A/B renders, comparison sheet) are kept local/private to avoid publishing child-like portraits in a public repository; the JSON measurements, registrations and scripts are committed. Conclusion: [`spike/identity-qa/FINDINGS_2026-10-12.md`](../../../spike/identity-qa/FINDINGS_2026-10-12.md).

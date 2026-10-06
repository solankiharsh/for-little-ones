# Illustration correction and catalogue checkpoint

## Scope

KEEP: canonical Book, reader geometry, existing creation persistence and paid entitlement checks.
MODIFY: catalogue previews, illustrated covers, facing image/text layout, narrow-screen reader, watermark assignment and unavailable-service feedback.
ADD: reversible local preview edits with IndexedDB storage, before/after approval, bounded direct Gemini edit experiment and server-side paid reservation.
DEFER: production AI edits until private result persistence, reconnect/recovery and canonical revision/export integration exist. `IMAGE_EDIT_EXPERIMENT_ENABLED` defaults off; do not enable on production paid books yet.

## Observed

- Garden (Mira) and lighthouse (Leo) have their own fictional cover, middle and ending illustrations and six-page stories. Moon uses Aarav sample assets and the photo-led comparison variant.
- Catalogue pages have no watermark. Locally accepted user edits are watermarked. Original files are never overwritten.
- Browser verified selection, reference upload, before/after, acceptance, IndexedDB restoration after reload, and restoring original artwork.
- A deliberately coarse test overlay looked bad. It was restored. Manual photo overlay is now explicitly named and no longer the default. It is a crop/feather operation, not semantic face editing; the text description is not applied in this mode.
- Edits affect only the device preview, not canonical book revisions or print output. The dialog says this before acceptance.
- Existing `@reyka/openpolotno` can support layout/image placement through the editor adapter. It does not provide identity preservation or hosted AI inpainting. The focused dialog avoids exposing a full design application.
- Source image, optional reference image and selection mask are actual inline image data in the Gemini request, not filenames mentioned in a prompt. Only selected output pixels are composited back into the original. This protects the rest of the illustration, but cannot guarantee facial fidelity.
- No persisted approved identity anchor is yet reused automatically across pages. The creation preview uses world-specific catalogue art and labels it as sample artwork; it is not per-scene personalised generation.

## Provider policy

The user approved replacing OpenAI via Gateway with Gemini directly. The provider is pinned to `gemini-3.1-flash-image`, which has no unpaid API tier, and has no fallback to a free-tier model. Google documents no training use for paid services and limited safety retention at https://ai.google.dev/gemini-api/terms#paid-services; paid-only availability is documented at https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image. No region guarantee or zero-retention guarantee is claimed. Images are sent inline without a Files API upload.

`npm run dev:image-editor` starts a loopback-only experiment on port 8788. Vite proxies the image endpoint to it. It requires a local browser Origin, accepts bounded requests one at a time, moderates instructions, and keeps the API key on the server. It deliberately does not use paid-project reservations because it is a local sample experiment. Do not deploy it or bind it publicly. The production API retains entitlement checks and remains gated pending result durability.

## Live blockers, 2026-10-06

- Vercel Gateway synthetic image smoke test: HTTP 403, valid card required. No child photo was sent for this test.
- Shared Gemini runtime key: direct `gemini-3.8-flash` text and `gemini-3.1-flash-image` fictional-image edit requests both succeeded. The returned image was visually inspected. `gemini-2.5-flash` returned 404 and advised the newer model. Vercel project environments do not contain a Gemini key yet. User approved the direct Gemini route; source and local preview are switched.
- Cloud Run `flo-commerce-backend` remains unavailable. Even isolated same-image Node HTTP startup failed. Restored normal container command/args and removed all diagnostic tags; production remains 100% on `flo-commerce-backend-00018-8qz`.
- Therefore Find three story ideas remains blocked by project persistence. The proxy now returns a retryable 503 with an accurate message instead of generic draft-save rejection. This is error handling, not a claim that hosted persistence is fixed.

## Validation

- Final full suite: 52 files, 482 tests passed after restoring missing bundled Postgres native-library filename links locally (no repository dependency changes).
- Added unavailable-project regression: observed red (502), then green (503 and Retry-After).
- Root, web and commerce typechecks passed. Web production build passed; existing bundle size warning remains.
- Standards/spec review fixed stale pending previews, modal-hidden persistence failures, mixed static world artwork and missing provider policy guard. Paid result durability and canonical revision integration remain explicitly incomplete and gated.

## Final local image check

The browser called the direct Gemini endpoint with a selected sky area and requested a tiny golden star. Before/after appeared successfully. The first hard-edged patch exposed a seam, so edited patches now feather inward at their perimeter. The second preview was visually checked: the star appeared, the seam was removed, and the rest of the illustration remained intact. This preview was left unaccepted for user review. The earlier manual overlay was restored.

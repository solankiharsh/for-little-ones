# 04_PHOTO_UPLOAD.md — Photo Upload & Validation

> **Spec ID:** F-004 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-003 (Child Profile); consumed by F-005 (Character Bible), F-025 (privacy/deletion)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Parents upload 1–5 photos of a child so the Character Bible (F-005) can build a stable likeness (spec §5, §10). Photos are validated client- and server-side — face visibility, resolution, obstruction, two faces, too dark — with graceful fallback so usable photos are never rejected. No generation can start until at least one valid photo exists. This spec fixes the full photo trace (browser → API → storage → model provider → output → deletion) required by guide §7.

## 1. Goal

Photo-based likeness is the category entry bar (spec §26 P0). Competitors accept multiple photos to improve likeness (spec §2 Magic Moon: "multiple uploaded photos to improve likeness"; Diffrun: face refinement). We must collect enough good references up front so per-page face drift (spec §2 Diffrun "face consistency from page to page" complaint) is structurally prevented at the Bible stage (F-005), and so clearly-broken photos never reach generation and waste money/effort.

## 2. User value

- **Confidence:** parents know before generation whether a photo will work, in warm product language ("We couldn't see Ava's face clearly"), not validation jargon.
- **More personal result:** more references → better likeness → the fundamental quality promise (spec §4 thesis).
- **Fewer wasted generations:** bad photos fail fast and are recoverable, tying into reliable generation (D010).
- **Trust:** the privacy message sits at the moment of upload (spec §18), not in legal pages.

## 3. Current implementation

None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). The design itself must avoid:

1. **Rejecting usable photos.** A photo with slight shadow or a phone-tilted face is still useful; validation must allow "pass with caution" tiers, never a binary that rejects 40% of family snaps.
2. **Ambiguous subjects.** A photo with two faces must be disambiguated ("Which person is Ava?") or excluded — spec §10 QA catalogue: "wrong number of children", "sibling identities swap".
3. **Orientation/compression corruption.** EXIF orientation must be normalised and client compression must not destroy face detail needed by `IdentityReferenceModel`.
4. **Privacy-trace leakage** (guide §7): uncontrolled relay to additional providers, public asset URLs, or photo logging.

## 5. Desired UX

**Flow (mobile one-handed, D012):** Ava's parent taps "Add a photo". The device picker opens. After selection the photo immediately appears in a 5-slot grid with an animated "checking…" state (meaningful progress, no spinner-only, guide §8).

Per-photo states: `Checking → Ready` (green check), `Check again` (amber, e.g. dark but salvageable), or `Choose another` (red, e.g. no face at all). For two faces the card asks "Which person is Ava?" with a tap-on-face affordance; tapping a face marks the subject; if the parent can't say, the photo is treated as `Not usable` but never blocked from being replaced.

Empty/partial states: "Ava's face will appear in every story." with a count "2 of 5". The **Continue** CTA is disabled until ≥1 photo is `Ready`. The parent can reorder photos by drag/hold (first = primary), tap to replace, swipe to delete (with "Remove photo?" confirm). A persistent privacy line under the grid: "Your photos are only used to create Ava's book, never sold or used to train AI models" (spec §18) with a "See how we use and delete photos" link to F-025 settings.

**Failure:** upload fails → the slot returns to `Picked, not sent` with "Try again" (idempotent retry, D010). App refreshes mid-upload → queued upload resumes from the last completed chunk or re-sends the whole file with the same `uploadToken`; any validated photos remain validated.

## 6. UI specification

- **Grid:** 5 slots (2 rows: 3 + 2), squared thumbnails, empty slot = "+". Max 5 enforced by hiding slots when full.
- **Primary badge:** star on the top-left of the first (primary) photo; a tooltip "We'll use this as Ava's main reference".
- **Validation results:** inline chips — `Ready` (green), `Check again` (amber, always required action or dismiss-to-nonprimary), `Choose another` (red, photo still kept in local state until replaced).
- **Two-face flow:** modal "Which person is Ava?" + candidate-face chips (crops of detected faces) + "Something else / tap the face". Reorders validate that the selected face stays consistent.
- **Privacy lock-in:** a one-time consent banner "We keep photos only while you're making this book, or 30 days after, unless Avoter keeps the saved profile (see settings)" with confirm/settings links — copied verbatim policy from F-025, not re-drafted here.
- **Dark-mode, low-light:** "Default" face-check runs a brightness gate; a "too dark" photo that otherwise passes face detection is demoted to `Check again` (usable), never to `Choose another` (graceful fallback rule).
- **Loading:** full-slot skeleton shimmer; per-slot progress bar for transfer + "checking" pulse for validation.
- **Accessibility:** every result chip has text content, not colour alone; drag reorder has alternate up/down buttons.

## 7. Domain model

Entity **PhotoReference** (new, canonical vocabulary: profile photo refs feeding Character Bible). Data sketch:

```text
PhotoReference
├── id, childProfileId (F-003)
├── uploadState: picked | uploading | processed | usable | usable_with_caution | unusable | deleted | expired
├── validation: { faceCount, faceBoxes[], resolution {w,h,dpi-ish}, brightness, obstruction, subjectMarked (bool) }
├── subjectDesignation: { decidedVia: auto | parentTap | parentSelect, personRef }   ← "Which person is Ava?"
├── media: { bucket, key, checksum, mime, byteSize, orientationAtUpload (EXIF), orientationNormalized (bool, true after job) }
├── derived: thumbKey, webKey (size-limited, signed, non-public), maxEdge
├── score: 0..1  (likeness reference quality for F-005 sub-photo scoring)
├── primary: bool  (exactly one per profile)
├── createdAt, claimedAt, retentionClass (F-025), sourceIp (hashed, not logged raw)
└── traceHistory: [{ hop: browser|api|storage|model-provider|output, at, providerId }]
```

- **Trace (guide §7):** browser (client compression + EXIF pass-through in original) → API (validate multipart, checksum) → object storage (private bucket, no public URL) → model provider (only the model-processing job passes the normalized image to `IdentityReferenceModel`/`QualityModel`; provider documented in F-025 audit) → output (derived likeness stored back in same private bucket) → deletion (F-025 schedule + delete-now).
- **Scoring:** the validation job emits a 0–1 reference score (face clarity, sharpness, neutral lighting, single subject, no obstruction). The primary + top-scoring photos become `<referencePhotos>` in the Character Bible (F-005). Score is a fact about the photo, not about the child — it never feeds story text.

## 8. Backend/API requirements

Proposed boundary (proposed subsystems `BookService` storage layer + dedicated photo pipeline; names shared for consistency):

- `PresignPhotoUpload{ childProfileId, count, mime, size }` → returns a short-lived, scope-limited upload token + destination key. **Decision needed:** direct-to-storage (browser → S3 presigned, bypassing API) vs API relay (browser → API → storage). Direct-to-storage reduces bandwidth through the API but complicates the validation-then-scan contract; resolve in the security spike, default API relay for a single validation choke-point.
- `CompletePhotoUpload{ uploadToken, checksum }` → triggers processing job; idempotent (same token returns same PhotoReference).
- `ValidatePhotoJobResult` (internal job callback; advances `uploadState`, stores validation + score).
- `SetPhotoPrimary{ photoId }`, `DeletePhoto{ photoId }` (soft-delete; F-025 hard-delete + propagate to Bible likeness), `MarkSubject{ photoId, faceBoxIndex }`.
- `ListPhotoReferences{ childProfileId }[state]` used by §5/6 UI.
- Validation: url/body together; max 5 per profile; uploads rejected if profile not in a creatable state; every write idempotent; no public assets ever returned (only signed, expiring web keys).
- Events (guide §5, no event sourcing): `PHOTO_UPLOADED → PHOTO_VALIDATED → PHOTO_SUBJECT_MARKED → PHOTO_DELETED`.

## 9. Background jobs

**Job: PhotoProcessing** (`GenerationJob` family): input = raw upload (key, checksum, orientation); steps = decode → EXIF-orient → downscale-lossless master (≤ maxEdge for model) → client-uson-level thumb/web sizes → validation (QualityModel face/quality heuristics) → score → persist `PhotoReference` → emit `PHOTO_VALIDATED`. Retry policy: 3 attempts with backoff; resumable (a crash mid-step restarts at the last completed step — D010); timeout 120s; failure leaves `uploadState=uploading` and surfaces "Try again" in UI. Cancellation: delete action cancels a queued job. A job never leaves bytes in logs.

## 10. AI behaviour

No story text here. Two provider interfaces (guide §6):

- **QualityModel** — the validation heuristics: face detection, face count, bounding boxes, eyes/face unobstructed, sharpness, brightness, resolution minimum. Output is a structured `validation` object + score; this model never sees or stores child identity, only the image it validates. **Decision needed:** which provider/vendor the `QualityModel` interface binds to for face detection; evaluate on-device-first (client-side) vs server-side.
- **IdentityReferenceModel** (F-005) — later consumes primary + top-scoring `PhotoReference`s to build the stable identity representation and proposed appearance. This spec only guarantees the photo set quality it consumes.

Fallback rule: if the model throws or times out, the photo is not silently rejected — it falls back to a conservative boolean check (format, size, one image) and is marked `Ready` only if trivial checks pass, with a notice "we'll double-check later". Gratuitously rejecting usable photos is the failure mode we avoid (graceful fallback, §5).

## 11. QA

Checks this spec performs directly (catalogue refs): resolution within min bounds; face clearly visible; obstruction (hand/hair/halo); two faces (wrong-child-count precursor: force subject designation or exclude); too dark. It feeds later QA in F-015 (identity consistency: child must resemble references) by guaranteeing baseline reference quality and by storing `subjectDesignation` so "sibling identities swap" from spec §10 has data to compare against.

## 12. Privacy/security

- **Full trace recorded** per `traceHistory` (guide §7); providers documented in F-025 audit; no additional providers without documentation.
- **No public URLs**, no photo logging, debug logs identify by `id` and hashed source IP only.
- **Retention:** `retentionClass` from F-025 defaults — unsaved uploads deleted within 48h; saved/order-related retained per F-025 then purged (guide §7; spec §2 Diffrun already communicates 48h/30-day windows — parity floor).
- **Generated likenesses derived from photos are PII** (guide §7): deleting a photo must invalidate/re-generate derived likeness metadata per F-025.
- Parent/guardian consent surfaces at the upload moment (spec §18) and is recorded with the first stored photo (`claimedAt`).
- Minimal exposure: photo bytes reach storage and the documented model provider only; commerce, print, analytics never receive photo bytes.

## 13. Analytics

Aggregated, no photo payloads or filenames: `photo_upload_started`, `photo_upload_completed`, `photo_validated` (with distribution of result tier), `photo_rejected_reason` (freq counts: no_face / two_faces / obstruction / dark / low_res), `photo_subject_marked`, `photo_primary_set`, `photo_deleted`. Corollary KPI: validation pass-rate by tier — tracked to tune the graceful-fallback policy.

## 14. Acceptance criteria

1. Given a parent uploads a front-facing, well-lit photo of Ava, When validation completes, Then `uploadState=Ready`, score ≥0.7 in `PhotoReference`, and Continue becomes enabled.
2. Given a photo contains two faces, When validation returns two faces, Then the "Which person is Ava?" modal appears; if the parent marks sub-subject B, the photo is stored as valid for B and later usable in a multi-person book (F-023).
3. Given a dark but face-detectable photo, When validation runs, Then it is demoted to `Check again` with a "usable with caution" tier — never `Choose another` (graceful fallback).
4. **Recovery:** Given an upload fails midway (network drop), When the client retries with the same `uploadToken`, Then the job resumes from the last completed step (D010), no duplicate PhotoReference is created, and validated photos remain validated after refresh.
5. Given a profile has zero `Ready` photos, When the parent tries to continue to generation, Then Continue is disabled and the friendly message explains one ready photo is needed.
6. Given a parent deletes a photo via F-025 delete-now, Then the trace confirms removal from storage, cache, and any model-provider copy, and derived likeness metadata is invalidated (guide §7 "treat like source").

## 15. Dependencies

- Must exist first: F-003 (ChildProfile to attach photos), F-025 (retention classes + provider audit + delete-now).
- Consumes this spec: F-005 (Bible reference selection + scoring), F-009 (illustration generation reads references), F-023 (subject designation across family members).
- Parallel: client upload/compression spike (browser side), resolution/EXIF spike.

## 16. Priority

P0 — launch/category parity. Photo likeness, photo validation and a trustworthy upload moment are category entry bar (spec §26 P0) and the quality foundation for the whole "consistent character" differentiation (spec §5/§10). Rationale per mission §33 filter: more personal result (likeness), more confidence (validation early), fewer support problems (fail-fast photos), and privacy trust that matches Diffrun's communicated windows (spec §2).
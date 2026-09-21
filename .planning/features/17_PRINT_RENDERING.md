# 17_PRINT_RENDERING.md — Deterministic Print Pipeline

> **Spec ID:** F-017 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-016 Approval (frozen revision), shared PrintSpec/PrintPreflightContract (D016), F-010 (long-running job execution). **NOT dependent on F-014** — the editor and the print renderer are parallel surfaces over the same canonical model + print contract.
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

The print renderer is the **deterministic production pipeline** (guide §2, D005): it converts an immutable `ApprovedBookRevision` (F-016) plus a chosen `printSpec` into a validated, print-ready PDF — and **never** a browser screenshot (spec §16 narrative on printing; AGENTS.md printing section). It owns trim size, bleed, safe areas, DPI, resolution checks, embedded fonts, cover + spine arithmetic, page-count rules and colour profile, and it validates against **printer-specific rules that live in provider adapters** (spec §24's structural-prevention discipline applied to print rejects). It exposes a proposed `PrintProvider` interface so printers can be swapped without touching the renderer.

## 1. Goal

The printed book must match the approved book and arrive accepted by the printer: mismatched bleed, low-res images, missing fonts, wrong page counts and un-calculated spines are the classic causes of print rejects, reprints and refunds (spec §24 complaint clusters "Printing / Binding / Delivery"). The renderer prevents these structurally by making geometry and validation deterministic parts of one pipeline, and by refusing to produce an artifact the target printer's rules would reject.

## 2. User value

- **Confidence in print (spec §25, §27):** the parent approved an exact thing; the print pipeline keeps that promise literally.
- **Fewer support problems (spec §24):** rejected-by-printer and "came out wrong" complaints are the category's recurring pain; this is where they are engineered out.
- **Quality consistency across providers:** the same canonical model prints correctly no matter which printer adapter is live (spec §16's express-delivery/quantity options need provider flexibility).

## 3. Current implementation

```text
None (Observed). No application code exists anywhere in the workspace.
See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
```

Proposed subsystems consumed: `BookService`/`BookRepository` (canonical reads), `ApprovedBookRevision` (F-016), `QualityModel` (geometry preflight, F-015), `PrintProvider` interface (defined here, §8).

## 4. Problems with current implementation

Not applicable (greenfield). Risks the **design itself** must avoid:

- **Browser screenshot as print path (D005):** what renders in the reader is not what prints; the pipeline must assemble from canonical data and final assets, not capture the DOM/SVG impressions.
- **Live-book reads (D011):** rendering from a mutable book silently reintroduces post-approval drift; only the frozen revision + `assetManifest` may enter the pipeline (checksum-verified).
- **Hardcoded printer rules:** geometry must come from the target adapter, not from a magic-constant. ("These rules live in adapters" is a load-bearing decision, mission §24.)
- **Font/colour drift:** non-embedded fonts and unprofiled colour are silent, expensive failures; both are validated, not hoped for.
- **Non-determinism:** the pipeline must be re-runnable so the same revision+spec yields the same **visible/content output** — a retry or QA rerun must not change what prints. Note: PDF blobs legitimately embed timestamps/IDs; determinism is defined at the content level (normalized artifact hash · content-manifest hash · per-page raster comparison · geometry validation report), and byte-identical output is an optional hardening if the renderer also excludes timestamps/random IDs (§14).

## 5. Desired UX

The parent sees little of this directly, and that is the point:

1. After Emma approves (F-016), the UI says "We're getting your book ready to print…" while F-017 runs (on `APPROVED`; see Decision in §15).
2. If the pipeline finds a resolvable problem it cannot fix (pathological, pre-approval this should have been caught by F-015), ops (F-026) sees it and Emma sees a calm "A small thing needs checking before printing — we'll email you if we need anything", not a red alert.
3. The printed outcome — a physical book that *looks like the approved preview* — is the visible UX; F-017 keeps the promise by construction.
4. Ops/support (F-026) has a per-order `PrintArtifact` page: checksums, geometry report, printer validation report, submitted files, printer status, tracking (all through `getOrderStatus`/`getTracking`).

## 6. UI specification

- End-customer UI is minimal by design (guide §8 — trust, not dials): one progress state ("Preparing your approved book…") and, on completion, "Ready for printing" (shown at checkout/F-018 and retained in order status, F-020). No renderer parameters are ever user-facing.
- Ops UI (F-026) is the real surface: `PrintArtifact` card showing PDF pages count, file size, checksums, colour profile, geometry validation summary (per-page PASS/FAIL), printer adapter name/version, quote ref, submitted timestamp, current status, events history.
- Failure visuals: per-order banner with failure stage (validate → quote → submit), retry/cancel controls (adapter-dependent), and the provider's rejection payload in a collapsible "printer report" for support triage. No image/marketing chrome.
- No mobile-specific UI: parents consume via progress states only; ops is desktop tooling.

## 7. Domain model

> **Shared contract (D016):** `PrintSpec` + the derived **PrintPreflightContract** (format feasibility, geometry rules, quote inputs) are part of the canonical model (`_SPEC_GUIDE.md` §2/§3). QA (F-015), approval (F-016) and the editor (F-014) consume the contract; this spec *implements* it. Keeping the contract shared is what lets the renderer land in M4 without stalling the M2 QA/approval core.

```text
PrintSpec (canonical; guide §3)
├── format (PAPERBACK | HARDCOVER), dimensions (mm), orientation
├── bleed (mm, per edge), safeArea (mm), binding (PUR | SADDLE | CASE)
├── paper type, cover type, colourProfile, DPI (print)
├── minPages, maxPages, fullBleedPages rule (first/last)
├── spine: soft = f(pages×paperThickness) / hard-calculated by adapter
└── providerMetadata (adapter-owned, opaque)

PrintArtifact (per approved revision + spec; guide §3 Order chain)
├── artifactId, approvedRevisionRef (= F-016 approvalId), revisionSeq
├── printSpecRef, adapterRef (which printer), schemaVersion
├── pdfRef + checksums (sha256 per page + whole doc)
├── pages, resolutionApplied (DPI), fontsEmbedded[], colourProfile
├── validationReportRef (F-015 print-geometry subset + F-017 physical)
├── printerValidationReportRef (adapter's rules), quoteRef
└── printerStatus: NONE → VALIDATED → QUOTED → SUBMITTED → IN_PRODUCTION
                 | SHIPPED | DELIVERED | FAILED | CANCELLED
```

- The pipeline input is `ApprovedBookRevision` + `PrintSpec`; the manifest (`assetManifestRef`, F-016) is checksum-reconciled before a single page is laid out — a mismatch **aborts** the run (fails closed; D011).
- Cover + spine: spine math lives in the adapter (paper thickness + page count are printer-material facts) but the renderer produces the inside cover/spine graphics so the adapter only applies its numeric formula; case-bound hardcovers validate laminated-cover geometry per adapter.

## 8. Backend/API requirements

- `POST /print/artifacts` — create/re-render an artifact for an approved revision + printSpec (idempotent: same revision+spec → same **visible/content output**; returns existing if unchanged).
- `GET /print/artifacts/{id}` — geometry report, PDF download (signed), checksums.
- `POST /print/artifacts/{id}/validate-printer` — push the Artifact through the target adapter's validator (`validateArtifact`) and store `printerValidationReportRef`.
- `POST /print/artifacts/{id}/quote` — resolves the quote from the **shared print catalogue** (`PrintQuote`, D016 — `quote(printSpec, quantity, destination)`); quoted cost is the number shown at F-016. The renderer provides **no approval-facing quote of its own** — capability/quote belong to the catalogue, independent of this pipeline.
- `POST /print/artifacts/{id}/submit` — `submitOrder(approvedRevision, artifact, quote)` → `printOrderId`; `POST /orders/{printOrderId}/cancel` — `cancelOrder` within the adapter's cancellation window; `GET /orders/{printOrderId}` — `getOrderStatus` + `getTracking`.
- Access: ops/staff for all; the parent sees only the order-facing statuses through F-018/F-020. All renderer endpoints are workers/ops-only — no customer-triggered rendering.

**`PrintProvider` interface (proposed, in our domain, implemented once per printer) — fulfilment + validation only:**

```text
validateArtifact(artifact, printSpec) → ValidationReport   # printer-specific rules
submitOrder(approvedRevisionRef, artifactRef, quoteRef) → PrintOrder {printOrderId, events[]}
getOrderStatus(printOrderId) → {status, events[]}
cancelOrder(printOrderId) → {cancelled, reason?}           # honour adapter cancellation window
getTracking(printOrderId) → {events[], carrierRef?}
```

Pricing/delivery quotes (`quote(...)`, `estimate(...)`, `validateFormat(...)`) live in the **shared print catalogue (`PrintCapability`/`PrintQuote`, D016)**, used by approval (F-016) and the editor (F-014) without depending on this renderer; this adapter's `PrintProvider` never answers an approval-facing quote.

- Adapters own: bleed/safe-area exacts, DPI floor, colour profile acceptance (e.g. GRACoL vs ISO Coated), paper stock, spine formulas, page-count parity rules, hardcover lamination. The renderer runs generic geometry first, then the adapter's validator; **both must pass** before a PDF is marked valid.
- Adapter selection is data-driven (per product/region/priority), not code-switching; a failing adapter's rules never leak into another's artifact.

## 9. Background jobs

- `PRINT_RENDERING_JOB`: trigger = `BOOK_APPROVED` event (F-016) (or `ORDERED`, see Decision §15); inputs = approvedRevisionRef + printSpec + adapterRef; steps = (1) manifest reconcile/checksum, (2) per-page geometry preflight (F-015 print-geometry subset), (3) layout engine run — text reflow at fixed metrics, illustration placement at print DPI, decorative elements composited, (4) cover+spine assembly via adapter formula, (5) PDF assembly (font embedding, colour profile set), (6) `validateArtifact` run (adapter), (7) mark VALIDATED.
- Retry: full resumability by step checkpoint (re-running step 4 must reuse step 1–3 outputs; step-by-step outputs are cached by revision checksum, so content-stable). Idempotent by `key = revision + spec + adapter + schemaVersion`. Timeout per provider call; failure state `RENDER_FAILED` (guide §4) with the failing step recorded for F-026/F-028.
- **Determinism requirement:** same key → same visible/content output, verified by normalized artifact hash (content normalized to exclude run metadata) · content-manifest hash · per-page raster comparison · geometry validation report. Seedless layout, fixed source-of-truth text metrics, no timestamp/random in the printed page content (a `producedAt` is added to PDF metadata only, outside the printed pages). Byte-identical PDFs are an optional hardening only if the renderer also strips metadata timestamps/IDs — not the launch requirement.

## 10. AI behaviour

None. Print rendering is fully deterministic, rule-based, numeric. If a generated asset fails a hard check (resolution, aspect, missing), the pipeline fails that page with a structured `FAILED` reason — it does **not** "ask the model to re-fix" (that would violate D011 and reproducibility). Only explicit parent-initiated correction (F-012 pre-approval) may change assets; post-approval, a failed artifact is an ops intervention (F-026) up to and including re-opening the approval with the parent's consent.

## 11. QA

- **F-015 print-geometry subset** (shared, **blocking and non-overridable**): text overflow vs safe area, element outside the valid canvas and layout overflow, illustration resolution ≥ DPI floor, print safe area, invalid/incomplete bleed, page geometry vs `printSpec` (min/max pages, parity, spine), missing assets. These are HARD_BLOCK regardless of parent intent (F-015 §6/§7). Purely stylistic layout observations belong in QA as ADVISORY only.
- **F-017 physical suite** (added here): page-count parity (final PDF pages == `printSpec.min/max`, even-count + full-bleed first/last per adapter), spine width within printer tolerance, font embedding completeness (every glyph used across artboards), colour profile attached and accepted, per-page checksum stable across re-runs.
- Output: `ValidationReport` (both generic + adapter), stored with the artifact; a FAIL opens the `RENDER_FAILED` state, blocks `SUBMIT`, alerts ops.

## 12. Privacy/security

- The artifact contains child likenesses and personal names — PII-tier; stored under order-retention (F-025/fulfilment contract), signed download URLs only (never public), staff-only ops view.
- The approved revision is the only data source — the renderer must never reach for live photos/live profile data at render time (a second privacy invariance: even a later profile edit cannot leak into an approved book).
- Printer submission transmits exactly the artifact + order payload defined by the adapter contract; no additional fields, no photos beyond the final PDF, documented per adapter (guide §7 "no additional providers without documentation").

## 13. Analytics

`print_artifact_created` (pages, sizeMB, geometryResult, adapterRef — no content) · `print_validation_failed` (stage, ruleClass, page?) · `print_submit_succeeded/failed` (providerStatus) · `print_render_duration` (total, per step). No names, no images, no checksums.

## 14. Acceptance criteria

1. Given an approved revision of 41 pages, when the renderer runs, then the PDF has exactly 41 printed pages (cover through back) at the print DPI, with bleed + safe-area satisfied and all fonts embedded; a second run over the same key produces the **same visible/content output** — verified by normalized artifact hash, per-page raster comparison, content-manifest hash, and the geometry validation report. Byte-identical PDF bytes are only asserted if the renderer also excludes timestamps/random IDs.
2. Given a page with an illustration below the DPI floor, when rendering runs, then that page fails with a structured resolution finding, the artifact is `RENDER_FAILED`, nothing is submitted, and ops sees the failing page and rule (no customer-facing error).
3. Given an adapter whose bleed rule differs (e.g. 0.125" vs 3mm), when the same artifact is validated, then the adapter-specific `validateArtifact` outcome is recorded and governs; two adapters never share hardcoded print constants in the renderer.
4. Given a parent who cancels approval (F-016) after an artifact rendered, when a new revision is later approved, then a new artifact is required and the old artifact is archived — it is never reused for the new revision (D011).
5. Given a printer rejection payload at submit, when `submitOrder` returns a failure event, then the artifact flips to `RENDER_FAILED`/rework with the provider report stored, the parent remains on the calm order-status path (F-018/F-020), and ops has one-click re-validate/submit.
6. Given a worker crash mid-step 4, when the job resumes, then steps 1–3 cached outputs are reused from the revision checksum (no drift, no re-layout) and the artifact completes with the same visible/content output for the same key.
7. Given an unsigned/expired asset URL at render time, when the manifest reconcile runs, then the run aborts with a security finding rather than silently embedding a broken or public URL — fails closed.

## 15. Dependencies

- Must exist first: F-016 (the frozen revision + assetManifest), the shared PrintSpec/PreflightContract (D016 — the font/DPI/safe-area rules the editor also respects; the contract is defined up front, in M1, so QA/approval are not blocked on this spec), F-015 (geometry preflight), F-010 (job execution for the long pipeline).
- Downstream consumers: F-018 (line item references the validated artifact + quote), F-019 (submits via `PrintProvider` and owns `IN_PRODUCTION`/`SHIPPED` transitions), F-020 (tracking via `getTracking`), F-024 localisation later (parallel PDF streams per locale rework the same deterministic engine — keep text layout engine locale-parametric from day one).
- **Decision needed — render timing:** generate artifact at `APPROVED` (pre-payment; checkout is instant; minor cost for approvals that never order) vs at `ORDERED` (post-payment; saves cost, adds checkout latency + risk of surprise after payment). Recommendation: generate at `APPROVED`, validate at `ORDERED` — mark agreed in `DECISIONS.md` before F-018 work.
- **Decision needed — PDF standard:** export PDF/X-1a (broad printer acceptance, subset fonts, no transparency) vs device-specific (some printers prefer plain PDF 1.7 + embedded fonts); resolve in the first adapter spike — the pipeline must isolate this in `PrintProvider.validateArtifact` so it is not a renderer fork.

## 16. Priority

**P0 — category parity.** Physical printing is a launch-parity capability (spec §26: "physical printing", "hardcover/paperback" are P0; spec §2's whole matrix assumes a printed book), and it is meaningless without a print renderer that the printer will accept. It is also the load-bearing guarantee for the two brand promises — "what you approved is what prints" (D011) and "the printed product is excellent" (spec §27 quality bar). Everything downstream (F-018 checkout shows delivery estimates, F-019 fulfilment, F-020 tracking) depends on its artifact and quote, so it must land with the P0 shipment.
# 09_ILLUSTRATION_GENERATION.md — Illustration Generation Pipeline

> **Spec ID:** F-009 · **Priority:** P0 · **Status:** draft
> **Depends on:** F-005 (Character Bible), F-008 (page text + cues), the foundational **DurableExecutionContract** / `GenerationStepExecution` interface (guide §3/§5, D019 — enqueue, durable per-unit state, lease/reclaim, retry, cancellation, idempotency, progress observation; F-010 implements the runtime and is NOT a dependency of this spec), shared PrintSpec/PrintPreflightContract (D016 — print sizes; not the F-017 renderer). **Exposes** the `ILLUSTRATION_PLAN`/`ILLUSTRATION` `GenerationStep` units consumed by F-010. · **Consumed by:** F-011 (preview), F-015 (pre-print QA)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

F-009 turns each page's text + `illustrationCue` into a real illustration: a deterministic **IllustrationPlan** is derived first, then the **`IllustrationProvider`** renders an image conditioned on the **Character Bible** identity reference via the **`IdentityProvider`**, and the result is scored by the **`QualityProvider`** for identity and rendering quality (spec §10, §25 identity bar). Identity is treated as a **measured, repairable property — never a guaranteed perfect likeness** (spec §10: "Do not rely only on generation prompts"). Per-page regeneration and a per-page attempt budget isolate cost and failures (D010).

## 1. Goal

Consistent, on-style, print-capable illustrations featuring *this child* across every page (spec §5A "a persistent character, not 30 independent image generations"; spec §10). Meeting this requires: one canonical visual definition per character (Character Bible, F-005), a plan step that pre-decides composition so pages do not drift, measurable identity QA with defined failure thresholds, and a repair path that never rebuilds the book (spec §25 identity bar; D010).

## 2. User value

- **The single biggest differentiator:** cross-page consistency is where competitors visibly fail (spec §2 Diffrun/Adorabook likeness complaints) — a parent who sees the same child page 1→24 stops worrying (spec §27 confidence).
- **Easier:** identity is inherited from the Bible, not re-prompted — parents never tune per-page likeness by hand (95/5, D003).
- **Confidence in print:** every asset must hit the resolution/DPI bar (spec §25 print) *before* preview, not at print time.
- **Fewer support problems:** measurable QA catches a bad page before it reaches the parent, and repair is one tap.

## 3. Current implementation

None (Observed). No application code exists. See ../codebase/README.md and RESEARCH_LOG.md. Greenfield (ADD/BUILD per D013).

## 4. Problems with current implementation

Not applicable (greenfield). Design risks the spec itself must avoid:
- **Claiming perfect identity** (unverifiable; spec §10 honesty) → replace with calibrated QA scores + explicit repair UX.
- **Identity drift across pages** → plan + Bible reference conditioning + similarity scoring, not free prompts.
- **Sibling/profile swaps** and wrong child count → structured subject list per page, validated.
- **Low-resolution assets** slipping to print → resolution gate at generation time (§25 print); never upscaled silently as "good".
- **Runaway cost** (image calls are the expensive step) → hard per-page attempt budget + cost telemetry (F-027).
- **Pre-payment overspend / giving away the complete product** → D025 entitlement gate: at most two low-resolution watermarked teaser assets before payment; production assets, regeneration and studio access require captured payment.
- **Provider coupling** (D004) → all provider work behind `IllustrationProvider`/`IdentityProvider`/`QualityProvider` interfaces.

## 5. Desired UX

Walkthrough (**Ava, 5**, book *"The Dino who Lost his Roar"*):

1. Story `READY` (F-008). Progress screen (F-010) label **"Painting the illustrations…"**. Internal: derive plans for all pages → generate per page → identity QA → story QA → assemble. Pages appear (subtly, in reading order) as illustrated thumbnails on the progress screen — the parent sees the book *materialising*, not a single spinner.
2. A page that fails renders its card red-softly: *"We had trouble creating page 12. The rest of the book is safe. [Try page 12 again]"* (exact copy; D010 per-page isolation). Retry regenerates **only** page 12 within the attempt budget.
3. A page whose identity QA **fails detection** (score below threshold after auto-retry) is not hidden — it shows a calm note: *"This page doesn't quite look like Ava. Want me to try again?"* [Try again] consumes budget; if budget exhausts, the page stays `FAILED` and is flagged for **F-012 page-level repair** (the parent is never told "AI got it wrong" — product voice).
4. Success → all pages `READY` → flow continues to preview (F-011). Every `READY` asset already satisfies print resolution per the shared PrintSpec/PreflightContract (D016), so there is no later "why is my book blurry" surprise.

States: loading (skeleton thumbnails), empty (not applicable — every page of a generated story has a plan), success (thumbnails + "Story complete — let's look inside" CTA), failure (per-page card above; whole-book full-failure state in F-010).

## 6. UI specification

- F-009 like F-008 is mostly observed via F-010 progress + F-011 preview; its own chrome is the **per-page thumbnail rail** on the generation screen: page order, tiny cover thumb, `READY`/`FAILED`/`REVISION_REQUIRED` badges, per-thumb retry affordance (entire rail works one-handed, D012).
- Failure copy per §5; never error codes/hex, never model/seed terms (D002).
- Image cards matte/sand frame matching reading-renderer typography (F-011), no neon.
- CTA on success: "Review the book →" singular; no secondary paths on this screen.

## 7. Domain model

```
IllustrationPlan            // derived deterministically before any image call
  id, pageId, bookId
  sceneSummary               // from textBlocks + illustrationCue (F-008)
  subjects[]                 // canonical character ids + pose/expression/position
                             //   (from illustrationCue, validated ⊆ Book.characters)
  setting, props[], styleNote// style tokens reference Character Bible palette
                             //   (resolved against policies/illustration/illustration-style.md)
  printConstraints           // { w, h, dpi, safeMargin } from the shared PrintSpec/PreflightContract (D016)
  layoutHint                 // where text overlays (keeps faces clear)
  planKey                    // sha256(pageKey|bibleVersion|styleVersion)
  schemaVersion

Illustration                // provider result = typed contract `IllustrationResult`
  id, planId, pageId
  assetUri                   // private store, signed URLs only (§7)
  width, height, dpi         // verified, not declared-believed
  generationMetadata         // { model, attempt, costCents, seedsInternal }
  provenance                 // GenerationProvenance (GENERATION_PROVENANCE §2):
                             //   schemaVersion, policySetVersion/policyHash (illustration.v1),
                             //   provider/model version, characterVersion, storyRevision,
                             //   inputAssetRefs (reference photo refs), jobId, attempt
                             //   — required; a result without it is not canonical state
  status                     // PENDING | GENERATING | READY | FAILED | REVISION_REQUIRED
  qaReport → IdentityQAReport

IdentityQAReport
  pageId, characterQa[]      // per character present on the page
  identityScore              // 0–1, provider-calibrated (see §10)
  passThreshold              // calibrated — see §10 methodology; never a shipping constant
  renderChecks               // resolution, aspect, single-child-count, duplicate-image
  verdict                    // PASS | FAIL | CONDITIONAL

CharacterVisualFacts         // lives in Character Bible (F-005), consumed here
  characterId, hair, skin, eyes, build, distinguishing, outfitTokens, ageLook
```

Contract names follow `product/GENERATION_ARCHITECTURE.md` §3: **`IllustrationPlan`** (deterministic, derived, no model) and **`IllustrationResult`** (the provider's output, runtime-schema-validated, `schemaVersion` recorded; provider-specific response types stay in the adapter).

The Bible (F-005) owns `CharacterVisualFacts`; F-009 only *reads* them as conditioning input — a parent's global edit (F-013) must re-drive illustration regeneration without editing this spec's model.

## 8. Backend/API requirements

Commands via `BookService`/`BookRepository`; image orchestration via `GenerationJob` (F-010).

- `POST /books/{id}/illustrations/plans` → derive all `IllustrationPlan`s from the story (page iteration, deterministic), no image spend. Idempotent at `planKey`; re-derives only when story/`bibleVersion` changed.
- `POST /books/{id}/illustrations/generate` → enqueue per-page illustration jobs; returns job id; idempotent (skips `READY` pages at same `planKey`).
- `POST /books/{id}/illustrations/pages/{n}/regenerate` → regenerate **only** page `n` (same `planKey`; or new `planKey` on REVISION_REQUIRED); consumes one attempt of the page budget.
- `GET /books/{id}/illustrations/{pageId}/asset?token=` → signed, expiring asset URL (short TTL, no public bucket, §7 privacy) for thumbnails/preview/QA renderers only.
- Validation: `subjects ⊆ Book.characters` (wrong-child-count guard), plan within `printConstraints`, URL token expiry. All image endpoints await `GENERATING → READY/FAILED` polling through F-010 (never a blocking request; §6 pipeline design).
- Authorization: every generation/regeneration command resolves server-side payment entitlement and calls the shared generation-access policy before enqueueing. `TEASER_IMAGE` accepts only the cover and one representative interior slot within the low-resolution/watermark budget; `PRODUCTION_IMAGE`, page regeneration and studio mutations reject unless entitlement is `PAID`.

## 9. Background jobs

Execution owned by F-010 runtime; the step units are **`GenerationStep` contract entries defined here** and consumed by F-010: **`ILLUSTRATION_PLAN`** (bulk, cheap) then **`ILLUSTRATION`** per page (expensive).
- Idempotency key = `planKey` (plan) and `planKey + attemptNonce` (image). A crashed worker re-enters: plans re-derive deterministically; `READY` pages skip; no duplicate image spend.
- **Attempt budget (image cost control):** default **2 auto attempts** per page (1 + 1 identity/QA auto-retry). Any further attempt requires an explicit parent or support action ("Try again" / F-012). Budget tracked in `generationMetadata.attemptCount`; exhaustion → `FAILED` with repair routing to F-012.
- **Pre-payment budget:** maximum 2 assets, 1024×1024 pixel area, 1 attempt each, visibly watermarked. These are separate teaser slots and never count as print-ready assets. Full-book fan-out cannot be enqueued until payment is captured (D025).
- Retry: auto-retry 1, backoff, timeout ~120s (image inference is slow); page-level isolation (D010) — other pages continue.
- Worker heartbeat/lease per F-010/F-028; a dead worker's in-flight page returns to `PENDING` and is re-claimed, never left `GENERATING` forever (lease expiry).
- Cancellation: a book-regenerate or page-replace supersedes queued image jobs via `planKey` mismatch; orphaned jobs no-op on run.

## 10. AI behaviour

Three provider interfaces behind adapters (D004):

- **`IdentityProvider`** — ingests the Character Bible's approved reference photos + `CharacterVisualFacts` and produces the **conditioning identity reference** (embedding/CLIP-style identity vector or provider-native reference payload). This is the *only* place raw photos go (§12). Output cache expires with the Bible version.
- **`IllustrationProvider`** — `generate(plan, identityReference, styleTokens) → IllustrationResult` (typed contract, §7; runtime-schema-validated, `schemaVersion` recorded). Prompt = canonical plan JSON + identity reference + Bible style tokens; style tokens resolve from the product policy `policies/illustration/illustration-style.md` (illustration.v1 set) and safety rules from `policies/safety/content-rules.md` are applied via `ModerationProvider` + QA — policy, not prompt. Interior seeds/temperatures never surfaced (D002). Total prompts are the plan fields — no free-text drift. All generation runs carry the illustration.v1 `policySetVersion`/`policyHash` in provenance (GENERATION_PROVENANCE §3).
- **`QualityProvider`** — scores the result: `identityScore(identityReference, generatedImage)` per character present, plus render checks (resolution/aspect/duplicate). **Thresholds are calibrated via a documented methodology, not guessed and not hard-coded into the design.** Per spec §10's honesty rule we do not ship a fixed magic number up front. The method: (1) build a launch calibration set of diverse faces across age bands using our own validation data; (2) run the scoring pipeline on it and record the score distributions per age band; (3) set `passThreshold` so false-PASS of a visible likeness break is statistically rare and false-FAIL stays low enough that repair UX isn't spammy; (4) **record the results in RESEARCH_LOG and version the threshold** alongside the model version so later calibration shifts are tracked, not silently changed. Calibration is a launch-blocking prerequisite (see D014 #5 and F-009 §16); the numbers are an experiment outcome, not a design constant.

Style consistency: shared `styleNote`/palette tokens in every `IllustrationPlan` (spec §5A "global illustration style"); illustration plans list settings/props from the cue so e.g. "the same valley at dusk" stays the same valley.

**Honest identity framing (spec §10):** we do not claim identity is guaranteed. The system (a) conditions generation on the identity reference, (b) measures identity per page, (c) flags sub-threshold pages for repair. Failure detection is a feature; the parent-facing copy in §5 states exactly what we can and cannot promise.

**Resolution (print, spec §25 / shared contract D016):** target ≥300 DPI at trim size (e.g. 8x8in → 2400×2400px). Generation-time gate: below 300 DPI → auto retry once; between 150–300 DPI → `CONDITIONAL` verdict + explicit "may look soft in print" flag surfaced before approval (F-016); <150 DPI → `FAILED` (never upscaled silently as accepted).

## 11. QA

Feeds the QA catalogue with measured, per-page items: identity consistency (score + threshold), wrong child count, sibling swap (subject identity confusion via per-character scores), duplicate/repeated illustration, resolution/dpi gate, aspect ratio, and print constraints (safe margins passed from the plan; full overlap check deferred to layout QA in F-015 against the shared contract). A page failing any check is `REVISION_REQUIRED` or `FAILED` — never presented as `READY`.

## 12. Privacy/security

The **only** illustration-step consumer of `CharacterBible` reference photos is the `IdentityProvider` ingestion (§7 trace: photos → storage → IdentityProvider → conditioning output → retention). Generated illustrations are personally identifiable and treated as sensitive (spec §7): stored privately, served only via signed expiring URLs, no public bucket, no image data in logs (metrics carry sizes/costs, never pixels). Retained per the §18 deletion contract and F-025 (source photos and derived likenesses delete together). Every provider in this spec is documented in the provider audit (§18; F-025).

## 13. Analytics

Events (no sensitive payloads): `illustration_plan_derived` (count, duration), `illustration_generated` (pages, attempts, costCents), `illustration_regenerated` (reason bucket: user|qa|budget), `identity_qa_failed` (verdict + score band, no identity data), `illustration_resolution_failed`, `illustration_budget_exhausted`.

## 14. Acceptance criteria

Given/When/Then, testable:

- **Plan determinism:** Given the same story + Bible version, when plans are derived twice, then both runs produce identical `planKey`s and identical cue-derived composition (no image spend on the second run).
- **Per-page isolation (D010):** Given page 12 `FAILED` at its attempt budget, when the parent taps "Try page 12 again", then only page 12's job reruns against the same `planKey`; pages 1–11, 13–N remain `READY`, and no page regenerates.
- **Identity detection:** Given a generated page where the `QualityProvider` identity score is below `passThreshold`, when QA runs, then the page is `FAILED`/`REVISION_REQUIRED` (not `READY`), an auto-retry consumes one budget slot, and if still failing, the parent-facing repair note (§5) appears and routing to F-012 is recorded.
- **Resolution gate:** Given an asset at 200 DPI, when QA runs, then the verdict is `CONDITIONAL` with a print-softness flag; at 140 DPI → `FAILED`; nothing below the gate is marked `READY`.
- **Wrong-child-count guard:** Given a plan whose `subjects` include a character not in `Book.characters`, when the plan is validated, then the request rejects with 422 before any image spend.
- **Budget enforcement:** Given a per-page budget of 2, when the page fails twice, then the third attempt only starts on an explicit parent action and an analytics `illustration_budget_exhausted` fires.
- **Entitlement enforcement:** Given payment is pending or merely authorized, when full illustration generation, page regeneration or editor access is requested, then the command rejects before enqueue/provider spend; only two bounded teaser slots are available. Given a captured payment webhook is replayed, entitlement is issued once and the production budget does not duplicate.
- **Sibling swap detection:** Given a two-child page where the QA per-character scores are inverted vs the plan, then `characterQa` flags the swap and the page is `REVISION_REQUIRED`.

## 15. Dependencies

- **Required first:** F-005 (Character Bible: `CharacterVisualFacts`, approved references, style tokens), F-008 (`textBlocks` + `illustrationCue` contract), the `DurableExecutionContract` / `GenerationStepExecution` interface (foundational — D019; F-010 implements the runtime + attempt budget; this spec depends on the contract, not on F-010), the shared PrintSpec/PreflightContract (D016) print trim/dpi constants.
- **Consumed by:** F-011 (preview thumbnails/reading render), F-012 (page repair), F-015 (pre-print QA suite), F-013 (global corrections trigger full re-plan when the Bible changes).
- **Parallel-safe:** F-008 text work proceeds independently; the `QualityProvider` calibration experiment (§10) can run before front-end work.

## 16. Priority

**P0 — launch / category parity.** Photo likeness is P0 parity (spec §26) and no preview (P0), book or print pipeline exists without illustrations; the consistency layer is the difference against competitors (spec §2, §5). Calibration of identity thresholds (§10 methodology, results in RESEARCH_LOG) is a launch-blocking prerequisite, assigned to the F-005/F-009 owner.

# IMPLEMENTATION_ROADMAP.md — Vertical-Slice Roadmap

> **Status:** Draft — align to `PRODUCT_ARCHITECTURE_V2.md` + feature specs.
> **Shape:** each milestone is a **usable vertical slice**, never "backend first, frontend later, tests at the end". At the end of every milestone a parent can do something real on a phone.
> **Greenfield note:** there is no code to migrate (D013). Milestone 0 stands in for "the monorepo rails" the mission's existing-app half assumed.

## Milestone 0 — Foundation rails (hidden, no customer value)

Sets the scaffolding that makes every later slice shippable.

- Git repo initialised; monorepo scaffold: `shared / api / web / admin`.
- Postgres schema + migration tooling; object-storage setup; secrets management; CI (typecheck, lint, unit+integration).
- Provider-adapter skeleton (`StoryProvider / IllustrationProvider / IdentityProvider / QualityProvider / ModerationProvider / PrintProvider`) with **mock adapters** default in tests/staging.
- Generation contracts + provenance (D018): typed stage schemas (canonical contract names, `_SPEC_GUIDE` §3), `GenerationProvenance` schema, `/policies` skeleton + manifest (machine-readable version/hash) — so every M1+ stage runs against the invariant from day one.
- Durable-execution substrate spike → decision (candidate classes: PostgreSQL-backed vs Redis-backed/BullMQ-class; **simplest durable option wins**; a workflow engine only if the spike shows its guarantees are needed) recorded in `DECISIONS.md` (D014/D019; feeds F-028/F-010).
- **Exit:** single hello-world vertical slice runs in CI (Web → API → Postgres); skeletons committed.

## Milestone 1 — Stable creation core

Customer-visible: a parent can create a complete story and see it.

| Feature | Work |
| --- | --- |
| F-001 Anonymous session (v0) | `anonymous_project_id` + ownership token; refresh-safe; purge/claim contract (email claim lands M6) |
| F-003 Child Profile | Reusable profile (name/DOB/display name/pronouns/locale/interests/facts/consent) — **no visual reference photos in M1** |
| F-006 Personalisation | Personal-facts staging → immutable-facts block feeding F-002/F-007/F-008 |
| F-002 Story Discovery | Data-driven theme/occasion catalogue |
| F-007 Story Concepts | 3 concepts via StoryProvider (structured JSON, moderation, fallback human concepts) |
| F-008 Story Generation | Stage pipeline (`OUTLINE` gate → per-page `PAGE_TEXT`); typed `StoryOutlineResult`/`PageTextResult` (runtime-schema-validated, `schemaVersion`); `text.v1` policy set (age/story/localisation under `/policies`); immutable-fact injection; per-page provenance |
| F-010 Generation Progress (v0) | Durable job, per-step + per-page states, refresh-safe, emotional labels |
| F-011 Book Preview (v0) | Lightweight reader: thumbnail rail + spread (desktop), flip (mobile); fixture/placeholder illustrations — the M1 print-look preview; real illustrated assets land M2 |
| D016 Shared print contract | Canonical `PrintSpec` + `PrintPreflightContract` (stable format feasibility and geometry) consumed by F-015/F-016/F-014; provider capabilities stay in printing and live quotes stay in commerce, with checkout snapshotting the purchased quote; the F-017 print renderer lands M4 |
| F-025 Privacy & Deletion (core v0) | Retention classes, consent in upload/checkout copy, delete-now baseline, provider-audit contract (F-025 full = M6) |

**Acceptance:** anonymous user → discover story → create profile (no photos) → pick concept → generate (progress UI survives refresh) → reads full story in reader — **text + layout with fixture/placeholder illustrations**. One-page text failure retried without restart. "Printability" gates against the shared contract are checkable even though the real renderer ships in M4.

## Milestone 2 — Reliable book generation

Customer-visible: the generated child looks like the child on every page (**child photos enter the product here**), and failures are rare + recoverable.

| Feature | Work |
| --- | --- |
| F-004 Photo Upload | 1–5 photos, client compression, validation tiers, delete; browser direct signed upload to private storage followed by server-side validation (D017, qualified before M2) |
| F-005 Character Bible (v0) | Reference photos + approved appearance + versioning (region, cross-book later) |
| F-009 Illustration Generation | Illustration plans + identity-conditioned images; typed `IllustrationPlan`/`IllustrationResult` (schemaVersion); `illustration.v1` policy set; per-artifact provenance; per-page attempt budget, ≥300 DPI gating |
| F-015 Book QA (core) | Identity, wrong-child-count, name/pronoun, contradiction, duplicate checks |
| F-028 Failure Recovery (core) | Idempotency keys, backoff, timeouts, worker-restart safety, one-page isolation; fail-closed vs graceful-degradation classification per capability (D018) |
| F-010 Generation Progress (v1) | Lease/heartbeat, resumable steps, failure comms ("page 12 safe — try again") |

**Acceptance:** 24-page book generates with measured identity QA pass (thresholds calibrated via the F-009 §10 methodology; calibration results recorded in RESEARCH_LOG). Worker killed mid-generation → resumes/states preserved. QA-blocked pages surfaced as repair intents. The M1 text/layout preview upgrades in-place to the illustrated preview (F-011 M2).

## Milestone 3 — Excellent correction UX

Customer-visible: "something is slightly wrong → click it → fixed in seconds", including whole-character fixes.

| Feature | Work |
| --- | --- |
| F-012 Page Correction | Intent catalogue (image + text), what-changes/what-doesn't per intent, page revisions |
| F-013 Global Character Correction | Bible version bump → affected-page computation → scoped regen → cost surfaced |
| F-014 Book Editor (v1) | OpenPolotno wrapper behind editor boundary; minimal custom UI; canonical↔snapshot adapter; spikes done first |
| F-015 Book QA (full) | Re-run on edits; per-revision results; HARD_BLOCK/REVIEW_REQUIRED/ADVISORY semantics; flag-to-parent surfacing |

**Acceptance:** "Make her hair longer" updates only pages containing the character with estimated count + apply. Editing page 6 never touches approved pages 1–5, 7–24. Undo/redo sane.

## Milestone 4 — Print-quality system

Customer-visible: an exact book is locked and a print-ready artifact exists.

| Feature | Work |
| --- | --- |
| F-017 Print Rendering | Deterministic pipeline (implements the M1 shared contract): trim/bleed/safe/DPI/fonts/cover/spine/page rules → PDF/PDF-X artifact |
| F-016 Approval | Single "Approve & Print"; deep-immutable `ApprovedBookRevision` + hash; production lock; format feasibility via the shared contract |
| F-015 QA (print gates) | Resolution/safe-area/overflow/missing-asset geometry gates (HARD_BLOCK, non-overridable) fail-closed before export |

**Acceptance:** approved book produces a validated print artifact; any post-approval edit yields a new revision and the old artifact is preserved byte-for-byte; print rendering is deterministic at the content level — same `ApprovedBookRevision` + same `PrintSpec` → same visible/content output (normalized artifact hash · content-manifest hash · per-page raster comparison · geometry validation). Byte-identical PDF bytes are only required if the renderer also excludes timestamps/random IDs.

## Milestone 5 — Real commerce

Customer-visible: buy it — cart, payment, order, tracking.

| Feature | Work |
| --- | --- |
| F-018 Cart & Checkout | Medusa commerce foundation (D006 ADOPTED — self-hosted `apps/commerce`; foundation PR lands scaffold/cart/checkout first); multi-book cart; ETA before payment; business-effect idempotent capture; line item references approved revision (opaque ref); profile the current 35–40 s sandbox order path, instrument each Medusa/payment/print-handoff stage, then remove avoidable sequential waits and Cloud Run/Redis cold-start latency |
| F-019 Fulfilment | PrintProvider submit/get status; FULFILMENT_SUBMITTED; digital copy delivery; no double-ship |
| F-020 Order Tracking | IN_PRODUCTION→SHIPPED→DELIVERED timeline; email + in-app; PII-free payloads |
| F-026 Admin (v1) | Lineage "why is this stuck" view; retries; refunds; photo default-hiding |
| F-027 Observability (v1) | Event allow-list + cost ledger; error tracking |

**Acceptance:** phone purchase of a personalised book end-to-end (cart→pay→order→fulfilment submission→tracking). Duplicate payment webhook does not double-charge/double-ship. Reorder renders the identical approved revision.

## Milestone 6 — Retention & family

Customer-visible: the book lives on; the next one is faster.

| Feature | Work |
| --- | --- |
| F-021 Family Library | "Our Stories": library (not orders), read any owned book online |
| F-022 Reorder & Sequels | Reorder = approved revision pin; Sequel = new Book reusing profiles/Bibles; Duplicate |
| F-023 Multi-person stories | Sibling/family/pet cast; relationship-driven narrative; per-person identity + swap QA |
| F-024 Localisation | en-GB/en-US spine + locale-aware facts; bilingual data model live |
| F-025 Privacy & Deletion (full) | Provider audit, retention windows (PROPOSED — legal sign-off), delete-now cascade, consent in-flow |
| F-001 Onboarding (account claim) | Anonymous→claim via magic link; personal library continuity |

**Acceptance:** second book for the same child in minutes; reorder pins exact artifact; deletion request removes photos/likeness across storage/DB/queues/providers on schedule; reporters can regen a sibling story with consistent family cast.

---

## Parallelism (beyond milestone order)

- **M3 corrections** overlaps **M2 identity** (both consume F-010 jobs + F-015 QA); keep QA shared, not duplicated.
- **M5 commerce** can develop against stub approved-revision/print data in parallel with **M4 print** — contract (`OrderItem.approvedBookRevisionId`) fixed at M5 start.
- **F-026/F-027** should be built incrementally from M2 (they consume events), not parked until M5.

## Cross-cutting acceptance library

Run from M2 onward (full set in F-028): refresh during gen · worker restart mid-gen · one-page failure · duplicate webhook · payment retry · photo deletion mid-book · failed image regen · reorder pinning · mobile checkout on 3 device sizes.

## Definition of ready for each milestone

1. Decision-log entries added for each decision made.
2. Feature specs of that milestone promoted `proposed → agreed` (with `_SPEC_GUIDE.md` compliance).
3. Acceptance criteria green incl. failure cases; CI green; staging playable on phone.
4. Cost ledger accounting present for any AI/print step introduced.


## Next work selection — 2026-09-25

The [creation-flow tracker](market/2026-09-25_CREATION_FLOW_LEARNINGS.md) originally selected guided creation → personal touches → durable progress → preview navigation. The first customer-visible slice now exists: the browser saves the guided draft, Vercel AI Gateway returns a validated six-page story preview, intentional illustration stand-ins are shown, and checkout stays locked until the generated text is reviewable.

That slice is a working product path, not competitor-level maturity. Continue in this order:

1. **Durable projects and generation jobs.** Move draft/revision state from browser-only storage to an anonymous server-owned project with an ownership token. Persist each generation attempt and expose named progress stages that survive refresh, retry and worker restart.
2. **Story discovery and correction.** Generate three moderated concepts, let the parent select tone/theme, edit or regenerate one page, and keep approved pages unchanged. Add fallbacks, provider timeouts, cost metadata and an age-specific policy/evaluation set.
3. **Image and character-consistency pipeline.** Introduce photo consent/upload, a versioned character bible, one approved reference look, per-page illustration jobs, identity/child-count QA and isolated page regeneration. Keep the current stand-ins until this gate is reliable.
4. **Book-quality preview.** Replace the long form preview with cover/dedication/story tabs, spread navigation, thumbnails, mobile reading, generation progress and clear locked/purchasable states. Add colouring pages only after the canonical story-page model supports them.
5. **Constrained OpenPolotno studio.** Expose a small set of safe actions—crop/position artwork, edit bounded text, choose approved layouts and undo/redo—through the existing editor adapter. Keep the canonical Book revision authoritative and regenerate print assets from it.
6. **Production and retention.** Complete immutable approval, deterministic print rendering, real payment/fulfilment/tracking, family library, reorder and deletion/retention workflows. Profile and shorten the known slow sandbox order-completion path during the commerce milestone.

The next implementation slice is item 1. Items 2–4 are the largest gaps visible in the competitor references: richer concept choice, recoverable generation, multi-character/personal detail controls, full-book exploration and clear product-value presentation before purchase.

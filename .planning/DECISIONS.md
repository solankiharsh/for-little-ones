# Product and Architecture Decisions

This file records decisions that are currently accepted or being actively evaluated.

Decisions can change when new evidence appears.

Do not silently reverse a decision.

If new evidence contradicts one, update this file with the reasoning.

---

## D001 — Do Not Rewrite Working Systems Solely for Cleanliness

**Status:** Superseded for the current state (2026-09-21) by D013; retained as a **generic future rule**.

The principle applies to whatever code actually exists at the time:

Whenever code exists, inspect and classify it as:

- KEEP
- MODIFY
- REPLACE
- ADD
- DEFER
- REJECT

Do not rewrite working systems solely for architectural cleanliness.

For the current state of this workspace there is **nothing to inspect or preserve as code** — see D013. When real code surfaces later, this classification discipline applies to it.

---

## D002 — Product Is Not a Generic AI Generator

**Status:** Accepted

The product should feel like a personalised publishing experience.

The customer should interact primarily with:

- their child;
- their story;
- their book.

They should not need to understand:

- prompts;
- models;
- seeds;
- inference parameters.

---

## D003 — AI Does Most of the Work

**Status:** Accepted

Normal experience:

> AI handles approximately 95% of creation while the customer corrects the remaining 5%.

A full design editor must not become the default creation experience.

---

## D004 — Canonical Book Model Must Be Ours

**Status:** Accepted

Do not make:

- OpenPolotno JSON;
- generated PDF;
- printer payload;
- model output

the canonical representation of a book.

The For Little One domain owns the Book model.

External representations should be adapters.

---

## D005 — Editing, Reading and Printing Are Separate Concerns

**Status:** Accepted

We expect three conceptual renderers:

### Editing

Interactive editing.

### Reading

Fast and polished preview/library experience.

### Printing

Deterministic print-production renderer.

Do not make the browser editing canvas the print-production system.

---

## D006 — Medusa

**Status:** CANDIDATE — pending spike (not selected)

Purpose (if adopted):

- commerce;
- cart;
- order;
- customer;
- payment;
- promotion;
- shipping;
- fulfilment.

Adoption depends on the spike decisions in D014 (self-hosted vs headless-cloud edition, tax/VAT routing) and must show a meaningful improvement over a purpose-built commerce module for our scale. No rewrite of any kind happens purely because Medusa exists. Progress flags:

- `greenfield` → adoption is a build decision, not a migration;
- if a real codebase appears later, re-run the comparison against *it* before adopting.

---

## D007 — OpenPolotno

**Status:** CANDIDATE IMPLEMENTATION — pending spike (wrap or fork; not selected)

Purpose:

- low-level multipage editing primitive.

Do not expose the complete generic design-editor UX.

Do not make its data format canonical.

Spike (D014 #2) decides:

- direct dependency;
- pinned dependency;
- internal fork;
- wrapper/adapter.

incl. spread support; the reader bundle must never load the editor package (D005, F-011).

---

## D008 — IMG.LY Photobook Starter

**Status:** UX / architecture reference

Study:

- page navigation;
- page preview;
- asset handling;
- selection;
- editing UX.

Do not adopt CE.SDK by default.

---

## D009 — Postiz

**Status:** Rejected as application foundation

Reason:

- wrong product domain;
- substantial unrelated architecture;
- licensing implications.

Useful as reference for:

- durable jobs;
- workflow organisation;
- retries;
- observability;
- integrations.

---

## D010 — Reliability Is Product Functionality

**Status:** Accepted

Generation must be persistent and recoverable.

A single failed page should not destroy an otherwise successful book.

Important long-running states should survive:

- browser refresh;
- navigation;
- reconnect;
- worker restart where feasible.

---

## D011 — Approval Before Printing

**Status:** Accepted

A personalised generated product must have a clear approval step.

Once approved and ordered, the exact approved revision must be preserved.

Orders must not silently use a newly regenerated version.

---

## D012 — Mobile Is First-Class

**Status:** Accepted

The complete core customer journey should work comfortably on a phone.

Desktop-only design decisions are unacceptable for core creation and checkout.

---

## D013 — No Existing Codebase; the Product Is Greenfield

**Status:** Accepted (2026-09-21, evidence in `RESEARCH_LOG.md`)

The workspace contains research and planning documents only.

There is currently no:

- application framework;
- backend;
- database;
- auth;
- storage;
- queue;
- commerce;
- generation pipeline;
- book model;
- editor;
- print integration.

Consequences:

- Every feature must be classified **ADD/BUILD**, never KEEP/MODIFY/REPLACE.
- "Current implementation" sections of feature specs must say `None (Observed)` and cite the research log.
- The existing research (`project-spec-initial.md`, `.planning/`) is the asset to preserve.
- When the first code is written, initialise git and record decisions in this log.
- D001's principle (do not rewrite working systems for cleanliness) remains the future rule for whatever code actually exists; it is superseded as a statement about the present because nothing exists to rewrite.

---

## D014 — Specification Baseline Agreed as Draft (2026-09-21)

**Status:** Accepted as baseline; items pending agreed/decision pass

Today's architecture + feature-specification work produced:

- `features/_SPEC_GUIDE.md` — shared template + canonical vocabulary for all specs.
- `features/00_FEATURE_MAP.md` — master register of F-001…F-028 with priority/dependencies.
- `features/01_*…28_*.md` — the 28 feature specifications (all follow the 16-section template; deep set per mission §11: 02,03,04,05,06,07,08,09,10,11,12,13,16,17,18).
- `PRODUCT_ARCHITECTURE_V2.md` — revised architecture (greenfield-honest).
- `IMPLEMENTATION_ROADMAP.md` — milestones 0–6 vertical slices.
- `FEATURE_SPEC_SUMMARY.md` — executive summary + platform decisions.
- `product/DESIGN_SYSTEM.md` — design-system contract.

**Next step before implementation:** agreement pass — promote specs `proposed → agreed` and run the blocking spikes, deciding in this log:
1. Durable execution substrate (candidate classes: PostgreSQL-backed; Redis-backed; a workflow engine only if the spike shows its guarantees are needed — wording stays neutral until then, see D019; **RESOLVED 2026-09-22: ADOPT pg-boss**, see D020) — feeds F-010/F-028.
2. OpenPolotno consumption (direct dep vs pinned vs fork) incl. spread support — feeds F-014.
3. Medusa edition (self-hosted vs headless-cloud) + tax routing — feeds F-018.
4. Print partner + PDF standard (PDF/X-1a vs PDF 1.7+embedded fonts) — feeds F-017/F-019.
5. QualityProvider identity-threshold calibration method + launch calibration run — feeds F-009/F-015.

---

## D015 — Feature Specs Must Never Fabricate Existing Systems

**Status:** Accepted

Greenfield reality (D013) means spec "Current implementation" sections legitimately say `None (Observed)`.

Future agents updating these docs must:

- cite `codebase/README.md`, `RESEARCH_LOG.md` and D013 where they claim greenfield;
- never invent files, endpoints, tables, components or providers to make a section look "known";
- add a new decision when a real codebase surfaces instead of silently re-describing the product.

---

## D016 — Shared PrintSpec / Print-Preflight Contract Breaks the QA–Approval–Renderer Cycle (2026-09-21)

**Status:** Accepted as baseline

The render chain consumes a **shared domain contract**, not the renderer itself:

```text
Canonical Book/Layout → PrintSpec/PrintPreflightContract → Core QA (F-015)
→ Approval (F-016) → ApprovedBookRevision → Print Renderer (F-017)
→ Print Artifact → Fulfilment (F-019)
```

Consequences:

- The contract fixes format feasibility (trim/bleed/safe areas/DPI/fonts/page rules) and **print capability/quote** (producibility, pricing, delivery estimate) and lives in the canonical model (`_SPEC_GUIDE.md` §2/§3).
- **Print capabilities and quotes are foundation-level, not renderer-owned:** the shared print catalogue exposes `PrintCapability` + `PrintQuote` (format feasibility `validateFormat`, pricing/delivery `quote`, `estimate`). Approval (F-016) consumes these without depending on the renderer; the renderer (F-017) only renders frozen revisions; fulfilment (`PrintProvider`, F-019) only submits artifacts. The renderer is never the source of approval-facing quotes.
- F-015 (core QA) validates geometry against the contract only — no dependency on the renderer existing.
- F-016 (approval) consumes the contract for format feasibility + delivery estimate — no dependency on the renderer existing.
- F-014 (editor) validates against the same contract (fonts/DPI/safe-area); F-017 is a parallel surface, not a prerequisite.
- F-017 implements the contract; it depends on the frozen revision (F-016) and the contract, **not** on F-014. This removes the F-015↔F-016↔F-017 dependency cycle.

The renderer may ship later (M4) than the QA/approval core it unblocks (M2).

**Milestone mapping of the shared contract:** the contract + catalogue are part of the canonical model from **M1** (printability gates are checkable against them even though the real renderer ships in M4); **M2** core QA consumes the contract for geometry; **M3** the editor (F-014) validates against it; **M4** approval (F-016) consumes capability/quote and the production print renderer (F-017) implements the contract.

---

## D017 — Photo Upload Topology Is an Open Question (2026-09-21)

**Status:** Question — no default; resolve in the security/architecture spike before build

Direct-to-storage (browser → signed private object storage) vs API-relay (browser → API → storage) is **not decided**. Both must satisfy, regardless of choice:

- private objects (no permanent public URLs);
- content-type and size validation;
- malware/image validation;
- ownership enforcement (session/owner scoped);
- retention/deletion per F-025.

---

## D018 — Structured, Stage-Based, Independently Evaluated Generation Is an Accepted Architectural Invariant (2026-09-21)

**Status:** Accepted

Generation is decomposed into explicit stages with typed contracts; control flow and invariants live in application code, not models; generated output is independently evaluated before it is production-ready; every artifact is traceable to the exact policy/model/config versions that produced it.

Stated natively for this product:

- **Code owns control flow and invariants.** Models perform bounded judgement/generation tasks. Models never decide approval, order, permission, page-count, retention, print-geometry, retry-budget or payment state (owned by F-016/F-018/F-001/F-017–D016/F-025/F-028–F-009/F-018 respectively).
- **Typed contracts at every structured stage.** Canonical contract set per `product/GENERATION_ARCHITECTURE.md` §3 (Concept, StoryOutline, PagePlan, PageText, IllustrationPlan, IllustrationResult, QualityEvaluation). Runtime schema validation; schema version recorded; provider-specific types stay in adapters.
- **Independent quality evaluation.** Generation and acceptance are separate responsibilities (`IllustrationProvider` → asset → `QualityProvider` → structured findings). A quality evaluator never mutates canonical facts.
- **Provenance.** Immutable `GenerationProvenance` per artifact/revision (`product/GENERATION_PROVENANCE.md`); version/hash the policy set used (`/policies`).
- **Provider boundaries.** Generic interfaces `StoryProvider`, `IllustrationProvider`, `IdentityProvider`, `QualityProvider`, `ModerationProvider`; each documents payload, child-data use, retention/terms, idempotency, timeout, retry semantics, cost metadata, deletion capability.

Consequences:

- The pipeline in `_SPEC_GUIDE.md` §5 is the execution model; stage ownership is mapped in `GENERATION_ARCHITECTURE.md` §2.
- Fail-closed vs graceful degradation is explicit (F-028 §9): invalid structured output, auth uncertainty, missing approved revision, corrupt print asset, mandatory-QA unavailable, unsafe geometry all fail closed.
- Provider/model choices remain **replaceable implementation decisions**; a stage never couples canonical state to a vendor.
- Any future deviation (collapsing stages, merging generation into acceptance, moving control flow into a model) requires a new decision entry + RESEARCH_LOG note first.

---

## D019 — DurableExecutionContract Is a Foundational, Feature-Free Contract (2026-09-21)

**Status:** Accepted as baseline

The reliability backbone (F-028) and every generation feature must depend on a neutral **foundational contract**, not on each other and not on the orchestration feature:

```text
Durability principles (F-028 — feature-free, provides patterns only)
        ↓
DurableExecutionContract (foundational vocabulary; _SPEC_GUIDE.md §3/§5)
        ↓
F-010 Generation orchestration runtime (implements the contract)
        ↓
F-008/F-009 generation step implementations
   (expose their GenerationStep units; consume the contract — never the F-010 feature)
```

The contract covers **only**: enqueue work · durable state · per-unit (per-page/per-step) state · lease/reclaim semantics · retry · cancellation · idempotency / business-operation key · progress observation.

Consequences:

- F-008 and F-009 depend on the `DurableExecutionContract`, **not** on F-010 (the feature) — depending on the feature would recreate the F-008⇄F-010 / F-009⇄F-010 cycles.
- F-010 implements the contract's runtime and depends on the `GenerationStep` units F-008/F-009 expose.
- F-028 provides the durability principles (lease, retry, idempotency, outbox, dead-letter) the contract encodes; F-028 has no feature dependency, and no feature may list F-028 as a dependency merely to use its rules.
- Substrate wording stays neutral until the D014 spike; candidate classes (PostgreSQL-backed; Redis-backed; a workflow engine only if the spike shows its guarantees are needed) remain candidates, never defaults. (2026-09-21 consistency pass: D014 #1 reworded accordingly.)
- **Update (2026-09-22):** the D014 substrate spike has landed — **ADOPT PostgreSQL-backed pg-boss** (Spike A, 3× green, `RESEARCH_LOG.md`). Wording may now be concrete: the durable execution substrate is pg-boss on the app's Postgres; BullMQ stays a documented Redis-backed alternative only if a dedicated Redis for jobs is provisioned. The neutral "durable execution substrate" phrase remains the correct product-level abstraction either way (D014's wording now reads "per D020's closed substrate decision").

---

## D020 — Platform-Foundation Spikes: All Exit Criteria Explicitly OPEN Pending Evidence (2026-09-21)

**Status:** OPEN for the remaining spikes; **SUPERSEDED for the durable job substrate**, which Spike A resolved to **ADOPT pg-boss** on 2026-09-22 (measured evidence in `RESEARCH_LOG.md`; `spike/durable-execution/`). Spike E's measurement methodology landed 2026-09-22 and Spike B's editor validation (headless + real-browser render/interaction) landed 2026-09-22 (see the bullets below) but their decisions remain OPEN. `OPEN` is recorded deliberately: insufficient evidence must never become a fake decision.

Until the planned spikes produce measured results (recorded in `RESEARCH_LOG.md`), each exit-criterion item remains explicitly open:

- **Durable job substrate.** **ADOPT — PostgreSQL-backed pg-boss** (2026-09-22): Spike A ran the identical crash/recovery + retry-exhaustion + cancellation scenario through pg-boss 12.33.3 (PostgreSQL-only) and BullMQ 6.3.8 + ioredis on the shared `SpikeBackend` harness (`spike/durable-execution/`), 3× consecutive green runs of 8/8. Both recover a real worker SIGKILL at the provider boundary with zero duplicate provider spend (stable `providerRequestId`, `cached: true`), both visibly terminal the always-fail page (pg-boss native dead-letter queue `generation-bad` vs BullMQ `failed` set — BullMQ has no built-in DLQ), both cancel enqueued work. pg-boss reclaimed in 8.9 s vs 15.2 s (lease design), needs **no second store** (the app is already Postgres; a review-required path is a query over the `job` table), and has a native DLQ. pg-boss's README "exactly-once delivery" is **vendor wording only** — recovery is guaranteed by app-level provider idempotency, not by the substrate; no exactly-once claim is adopted. BullMQ is documented as a passable alternative (Redis-native) if a dedicated Redis for jobs is ever provisioned. Evidence: `research/validate-durable-execution-substrate` (README + `RESEARCH_LOG.md` 2026-09-22 entry).
- **Editor implementation posture.** OPEN — Spike B tests the candidate editor against an actual children's-book spread (dimensions, multipage, serialization/restoration, undo/redo, bundle size, canonical-model adapter). Decide: depend directly / pin / wrap / maintain an internal fork / reject. The editor snapshot must never become canonical. **Update (2026-09-22):** Spike B phase 1 landed the headless validation (`spike/editor-primitive/`, 26/26 tests, acceptance path PASS for both `openpolotno@1.0.2` and `@reyka/openpolotno@1.5.0`) and **phase 2 landed the real-browser render + interaction pass** (36/36 tests incl. `test/browser.spec.ts`; system Chrome via `playwright-core`, 390×844 @ dsf 3, `npm run phase2` → `tmp/editor-primitive/phase2.json`, all 9 checks PASS): the `@reyka/openpolotno@1.5.0` editor mounts, exports an exact 1224×1224 raster at pixelRatio 2, loads Google Nunito through the engine's own loader (`document.fonts.check` true, 90 px span +72.4 px), registers a self-hosted data-URI font via `store.addFont` (FontFaceSet check true), pointer-drags the text element with ~2 ms avg input-to-paint rAF samples, and does transaction/undo/redo ≈ 2/1/0.5 ms. Both packages ship zero `.d.ts` (type shim + pinned deep subpath required regardless of posture); `createStore` is not in the package main; sub-path imports take no `.js` suffix; the main entry is not Node-importable (extensionless `@meronex/icons`) so the browser seam needs a bundler; crop is a numeric surface that recrops the source and stretches it to element bounds. This item still stays OPEN — the posture (depend/pin/wrap/fork/reject) now has its numbers but still needs a sponsor who pins/depends the engine at a chosen commit before it closes. **Sponsor ticket:** `.planning/EDITOR_SPONSOR_TICKET.md` (recommends **pin + wrap**; its 5 acceptance criteria are the closure gate for this item; `D004` wrap boundary is unchanged and re-proven).
- **Commerce adoption/rejection.** OPEN — Spike C validates the candidate against the cart → payment → order path while preserving the invariant: commerce may reference an approved revision but may never own or mutate the Book.
- **First print provider + print contract.** OPEN — Spike D determines actual print requirements (trim, bleed, safe area, page count, binding, cover, spine, fonts, colour, PDF profile, resolution) against one realistic partner or a faithful local fixture, and verifies the print-domain contract is editor-independent.
- **Identity-generation approach.** OPEN — Spike E tests provider identity/reference-conditioning capabilities (multi-photo, provider-native reference conditioning, reusable private reference, retention/data-use) before any approach or threshold is chosen. **Update (2026-09-22):** Spike E phase 1 landed the offline measurement methodology (`spike/identity-qa/`, 29/29 tests, `RESEARCH_LOG.md` entry) — reference conditioning rides the canonical `IdentityProvider` seam and the QA vocabulary is wired to `contracts` quality checks — but **no real-provider evidence exists yet**; this item stays OPEN, any threshold from dry-run numbers would be invented.
- **QA approach.** OPEN — Spike E's vision-evaluator feasibility check (does an independent evaluator agree with human review often enough to be useful) must run before a QA threshold/methodology is fixed. **Update (2026-09-22):** the blinded-review benchmark form, kappa/confusion agreement metrics and a sensitivity-checked synthetic reviewer are now in place behind the canonical quality vocabulary (`identity.likeness`, `identity.character-swap`, HARD_BLOCK/REVIEW_REQUIRED); the feasibility check itself (real evaluator vs real humans) is still OPEN pending the real phase.
- **Storage upload topology.** OPEN — D017 (direct-to-storage vs API-relay) is resolved by the same evidence discipline; unchanged pending spike evidence.

---
## D021 — Monorepo Bootstrap: First Production Code and Dependency Direction (2026-09-21)

**Status:** Accepted (M0 foundation rails; first real code — recorded per D015 now that a codebase exists)

The recommended path to "run the D014-blocking spikes and start some real code immediately" converges here: a parallel PR (`feat/` branch) boots the monorepo so M1 vertical slices can build on real packages, without depending on any spike outcome.

**Layout (committed):**

```text
apps/{web, api, worker}            — application shells (stubs commit the direction only)
packages/domain                    — canonical Book/Child/PrintSpec model (D004/D016), GenerationStep units
packages/contracts                 — canonical generation contracts (GENERATION_ARCHITECTURE §3) + parseContract
packages/providers                 — Story/Illustration/Identity/Quality/Moderation boundaries + ProviderCard audit
packages/execution                 — DurableExecutionContract (D019) + in-memory semantics runtime (test/staging only)
packages/provenance                — GenerationProvenance schema + content-true policyHash
packages/policies                  — machine-readable policy-set manifest (mirrors policies/MANIFEST.md)
packages/storage                   — foundational private-storage contract (D017 invariants; no impl)
packages/testing                   — shared fakes (InMemoryDurableRuntime re-export)
spike/ .planning/                  — spike programme + planning (unchanged)
```

**Dependency direction (load-bearing, typecheck-enforced):**

```text
apps → domain/(providers) → contracts → (nothing)
adapters (providers) → contracts
contracts must NEVER depend on adapters or apps
execution / provenance / policies / storage are foundational: no feature dependencies
```

**Toolchain (reversible M0 choices):** npm workspaces; TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) with bundler module resolution and source-first `exports` (no emit yet — bundlers arrive when apps need them); zod v4 for runtime contract schemas; vitest.

**Scope boundaries (this decision):**

- The `DurableExecutionContract` is implemented as an interface plus an **in-memory semantics runtime** for tests/staging only. It is NOT a durable substrate and must never be used as one in production. Substrate wording stays neutral (D019, D014 spike); no exactly-once claim; the spike still chooses PostgreSQL-backed vs Redis-backed.
- No platform candidate was promoted. Editor (D007 candidate), commerce (D006 candidate), quality threshold, print partner all remain OPEN pending spike evidence.
- Provider interfaces carry a structured `ProviderCard` (child-data path, retention, idempotency, timeout, retry, cost, deletion) so the privacy rule (GENERATION_ARCHITECTURE §12, F-025) is enforced structurally, not by convention.
- Print geometry gates (`validateGeometry`) are canonical from M1 (D016); the F-017 print renderer is not a prerequisite of QA/approval/editor.
- CI (typecheck, lint, unit+integration), Postgres schema tooling, secrets management, object storage and provider mock adapters are roadmap-M0 items deliberately deferred to later bootstrap PRs, not forgotten.

**Consequences:**

- D013's "no code exists" framing is superseded for these packages; planning-corpus wording updates as specs are promoted.
- F-008/F-009/F-010 can build: generation steps expose `GenerationStep` units and consume the contract; F-010 will implement a substrate-backed runtime later.
- Contract dependencies are checked by the typecheck gate; a future violation (a contract depending on an adapter, a provider leak past the boundary, the in-memory runtime used in production) is a defect.
 (feat: bootstrap domain and generation contracts (M0 monorepo rails))
 (feat: bootstrap domain and generation contracts (M0 monorepo rails))

---

## D022 — Durable Execution Substrate: ADOPT PostgreSQL-Backed pg-boss (2026-09-22)

**Status:** ADOPT (Spike A evidence; supersedes D020's OPEN for this item)

**Observed (measured, spike/durable-execution/, 3× consecutive green 8/8 runs)**

- pg-boss 12.33.3 and BullMQ 6.3.8 + ioredis both ran the identical
  crash/recovery + retry-exhaustion + cancellation scenario on the shared
  `SpikeBackend` harness with identical assertions.
- Real-process SIGKILL of the worker mid-provider-accept is recovered by both:
  page 5 re-runs via lease reclaim, provider replays `cached: true` with the
  same `providerRequestId` (provider spend 7/7, zero duplicate).
- Reclaim latency: pg-boss 8,890 ms (expireInSeconds 6 + monitor 2 s) vs
  BullMQ 15,199 ms (lockDuration 10 s + stalledInterval 5 s). Both configs are
  spike-shortened; production defaults are slower by design.
- Terminal visibility after retry exhaustion (3 attempts): pg-boss moves the job
  to a **native dead-letter queue** (`generation-bad`, `sourceId` preserved — a
  review-required path is just a query over the Postgres `job` table); BullMQ
  leaves it in the Redis `failed` set (**no built-in DLQ** — needs an app-side
  drainer/recover job + ledger).
- Cancellation: pg-boss marks jobs `cancelled` (rows persist); BullMQ
  `job.remove()` deletes the job key (no record — weaker traceability).
- Stores: pg-boss uses the existing application Postgres only; BullMQ adds Redis
  as a second mandatory store.

**Inferred**

- Both meet the D019 contract obligations. pg-boss wins on: no second
  infrastructure, native dead-lettering, per-job Postgres rows (observation,
  supervision, review queries, dashboard in @pg-boss/dashboard), and reclaim
  latency for short lease windows. BullMQ is Redis-native (workable, faster
  ops-level throughput) and is retained as the documented fallback if a
  dedicated Redis for jobs is ever provisioned.
- pg-boss's README "exactly-once delivery" is **vendor wording, not adopted**.
  Crash safety comes from app-level provider idempotency (stable
  `providerRequestId`), not from any substrate guarantee.

**Consequences**

- F-028 durability principles and F-010 orchestration runtime target pg-boss on
  the app's Postgres; the app-level `DurableExecutionContract` surface (D019)
  stays substrate-neutral so BullMQ remains an interchangeable runtime.
- No exactly-once claim anywhere in our documentation; recovery = idempotency.
- "review-required" work surfaces in the DLQ row (bookId, pageNumber,
  sourceRetryCount) for the F-028 rules.

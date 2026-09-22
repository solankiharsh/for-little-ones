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

**Status:** ADOPTED — **Medusa is the commerce foundation, self-hosted in-repo** (2026-09-22,
re-opened — constraint change; supersedes the earlier 2026-09-22 defer recorded in Spike C; see
`RESEARCH_LOG.md` "D006 re-opening" for the full Observed/Previous inference/New constraint/New
decision record)

Purpose (now adopted for):

- commerce;
- cart;
- order;
- customer;
- payment;
- promotion;
- shipping;
- fulfilment.

**Why reopened:** the original defer was a trade-off judgment (ops footprint outweighed value at
one-format scale), not a factual error. The product constraint has explicitly changed: we now
**accept** the operational complexity (Postgres + Redis + server + worker, breaking-minor release
discipline) in exchange for mature, extensible commerce primitives and to avoid progressively
rebuilding cart/order/payment/promotion/tax/shipping/customer/refund functionality ourselves.
Re-verification on 2026-09-22 against current official sources (v2.21.0, MIT license, documented
self-host path, first-party Stripe provider, regions/tax/promotion/fulfilment/order modules,
line-item `metadata` + custom-module personalisation recipe, subscriber-based events) found **no
architectural, licensing or blocking issue** (`spike/commerce/MEDUSA_EVIDENCE.md` re-verification
appendix).

**Residence:** self-hosted in-repo at **`apps/commerce`** (workspace member, isolated from root
typecheck/tests with its own scripts); our boundary types live in **`packages/commerce`**
(`CommerceGateway`, `ApprovedRevisionLineItemReference`, `CommerceEventAdapter` — created in the
implementation PR `feat: establish Medusa commerce foundation`, not this architecture PR). Not
Medusa Cloud (D014 item 3 closed → self-hosted).

**Domain boundary (hard line, not a preference):**

- **Medusa owns commerce state:** cart, payment collection/payment, order, customer, promotion
  application, shipping option/fulfilment state, region/currency/tax application, refunds — all
  as documented commerce-module state inside Medusa.
- **The For Little One domain owns:** canonical `Book`, `BookRevision`, `ApprovedBookRevision`,
  `Character`, `Story`, generation state, approval state, `PrintSpec`/`PrintArtifact`/print
  submissions, privacy/deletion lineage. Medusa **never** receives child profile/photos, story,
  page text, prompts, character bible, generated image URLs or sensitive personalisation facts.
- **Commerce references personalised content only via opaque immutable identifiers.** A Medusa
  line item carries exactly: `approvedBookRevisionId`, `contentHash` (`revisionHash`),
  `productFormatId`, `printSpecId`, `displayTitle`, `quantity` — plus non-sensitive operational
  metadata (e.g. `recipientLabel` for the packing slip). The hard invariant proven by Spike C
  (4/4) stands: `Medusa order line → opaque ApprovedBookRevision → domain resolves book`; the
  reverse direction (line item → full book JSON) never exists. One approved revision may back
  **N** orders (reorders/gifts); orders are not canonical Book state.
- **State split:** `BookStatus` is only the stable container lifecycle (`DRAFT`/`ARCHIVED`); the
  content/generation/approval lifecycle belongs to `BookRevision`. Neither carries commerce or
  fulfilment states (`ORDERED`, `IN_PRODUCTION`, `SHIPPED`, `DELIVERED`, `PAYMENT_FAILED`,
  `FULFILMENT_FAILED`; see `_SPEC_GUIDE.md` §4). One approved revision → N orders → each order has
  its own fulfilment timeline sourced from Medusa order/fulfilment events.
- **Pricing vs print quote:** book content generation is not physical book price. Customer price
  comes from Medusa product/region configuration; printer cost comes from our `PrintProvider`
  adapter (`PrintQuote`); margin policy (F-027) maps cost → price offline; a live printer quote
  is never canonical Book state.
- **Payment:** Medusa's payment abstraction + first-party Stripe provider (inbound
  `/hooks/payment/*` webhooks, validated, idempotent business effects — never double order or
  double capture). Payment failure preserves the approved Book; retry never regenerates.
- **Regions/tax:** architected via Medusa Region + Tax modules, configured for the launch market
  only; no custom tax engine.
- **Promotions:** Medusa promotion module only; the Book domain never knows about coupons.
- **Fulfilment split:** Medusa owns commercial fulfilment state (order → fulfilled, shipping);
  our `PrintProvider` adapter owns the printer handoff and receives only `PrintArtifact` +
  shipping payload + qty + provider options — never child/profile data. Medusa OSS has no
  outbound webhooks → the book→print handoff is our own idempotent subscriber-side job
  (proven pattern from Spike C); `CommerceEventAdapter` maps Medusa subscribers/events onto our
  commands and the pg-boss job spine.
- **Admin split:** Medusa Admin owns commerce ops (orders, payments, refunds, customers,
  promotions, products, regions, shipping); our ops UI owns Book/generation/QA/approved-revision/
  print-artifact/printer/privacy lineage; each side deep-links to the other by order id /
  `approvedBookRevisionId`.
- **Storefront:** stays our headless `apps/web` against Medusa's Store API (publishable key);
  the generic Next.js starter is never the customer experience.

**Progress flags (unchanged discipline):**

- adoption is a build decision (greenfield), not a migration — no rewrite of any kind happens
  purely because Medusa exists;
- Spike C's invariant tests remain the semantic minimum the integration must satisfy — ported
  onto `packages/commerce` in the implementation PR;
- implementation does **not** start in this PR: next PR is
  `feat: establish Medusa commerce foundation` (scaffold, one product + one variant, cart,
  APPROVED-only opaque line item, sandbox checkout → order, idempotent duplicate-event tests).

---

## D007 — OpenPolotno

**Status:** ADOPTED — **pinned tactical editing engine + wrapper** (2026-09-22, Spike B evidence; closes the D020 OPEN item)

Purpose:

- low-level multipage editing primitive.

Do not expose the complete generic design-editor UX.

Do not make its data format canonical.

Residence: `@reyka/openpolotno@1.5.0` (exact pin, no caret) declared only in `packages/editor`; the wrapper `packages/editor/src/adapt-book.ts` is the single Book→engine translation boundary (D004). The engine main entry (full editor + Konva) is never imported by the wrapper (headless model subpath only); the browser seam that imports the main entry is an editor-app layer, deferred to F-014 implementation. Spread mapping: one canonical page → one engine page (rendering a spread side-by-side is a view concern). 36/36 spike tests + 10 in-package tests; `boundary.spec.ts` enforces that no other package references the engine (D005). Reader/print bundles must never load the editor package (D005, F-011).

Risk classification: this is replaceable tactical machinery, not strategic product infrastructure. Before M3, retain the exact package tarball in the approved internal artifact mirror and add wrapper-boundary compatibility tests. The root lockfile already records the exact tarball integrity; do not fork or maintain the package until evidence requires it. A replacement must not change `Book`, `Page`, `PrintSpec`, or `BookRevision`.

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
3. Medusa edition (self-hosted vs headless-cloud) + tax routing — feeds F-018. (**RESOLVED
   2026-09-22 with D006 ADOPTED: self-hosted in-repo** at `apps/commerce`; tax routing via Medusa
   Region + Tax modules, launch market only — architected, not custom-engineered.)
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

- The canonical domain contract fixes stable product configuration and feasibility only: `PrintSpec` and `PrintPreflightContract` define trim/bleed/safe areas/DPI/fonts/page rules. An approved revision freezes its chosen `PrintSpec`.
- **Capabilities and quotes are transient, not canonical Book state:** `PrintCapability` belongs to the printing integration; `PrintQuote` belongs to the commerce application boundary. Quotes contain provider, cost, delivery estimate and expiry, and checkout snapshots the purchased quote onto the order. Approval can consume a live quote without persisting it onto `Book` or `BookRevision`; the renderer only renders frozen revisions.
- F-015 (core QA) validates geometry against the contract only — no dependency on the renderer existing.
- F-016 (approval) consumes the contract for format feasibility + delivery estimate — no dependency on the renderer existing.
- F-014 (editor) validates against the same contract (fonts/DPI/safe-area); F-017 is a parallel surface, not a prerequisite.
- F-017 implements the contract; it depends on the frozen revision (F-016) and the contract, **not** on F-014. This removes the F-015↔F-016↔F-017 dependency cycle.

The renderer may ship later (M4) than the QA/approval core it unblocks (M2).

**Milestone mapping of the shared contract:** the contract + catalogue are part of the canonical model from **M1** (printability gates are checkable against them even though the real renderer ships in M4); **M2** core QA consumes the contract for geometry; **M3** the editor (F-014) validates against it; **M4** approval (F-016) consumes capability/quote and the production print renderer (F-017) implements the contract.

---

## D017 — Direct Private Storage Uploads Are the M2 Default (2026-09-22)

**Status:** Accepted for M2; M1 has no child-photo uploads

Original photo bytes use browser → short-lived, scope-limited signed upload → private object storage →
server-side completion event → validation worker → approved `PhotoReference`. This keeps large uploads
out of the API-server data path while preserving server-side ownership validation, image decode,
metadata stripping, resizing, face checks, retention and deletion. API relay is permitted only for a
specific derived-copy or policy reason; it is not the default for originals. Resolve provider/storage
implementation details before M2, not before M1.

The flow must satisfy:

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
- **Provider boundaries.** Generic interfaces `StoryProvider`, `IllustrationProvider`, `IdentityProvider`, `QualityProvider`, `ModerationProvider`; each declares evidence-oriented `ProviderDataPolicy` fields (verification date/version, child-data use, retention mode, training use, deletion mechanism, region and evidence reference) alongside idempotency, timeout, retry and cost metadata. A provider with `NOT_SUPPORTED` deletion or non-prohibited/unknown training use cannot receive child photos.

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

The contract covers **only**: enqueue work · durable state · per-unit (per-page/per-step) state · lease/reclaim semantics · retry · cancellation · idempotency / business-operation key · progress observation. Its public operations are asynchronous so a pg-boss/Postgres implementation does not inherit the in-memory runtime's synchronous shape.

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
- **Editor implementation posture.** **RESOLVED — ADOPT pin + wrap** (2026-09-22). Spike B phase 1 landed the headless validation (`spike/editor-primitive/`, 26/26 tests, acceptance path PASS for both `openpolotno@1.0.2` and `@reyka/openpolotno@1.5.0`) and **phase 2 landed the real-browser render + interaction pass** (36/36 tests incl. `test/browser.spec.ts`; system Chrome via `playwright-core`, 390×844 @ dsf 3, `npm run phase2` → `tmp/editor-primitive/phase2.json`, all 9 checks PASS): the `@reyka/openpolotno@1.5.0` editor mounts, exports an exact 1224×1224 raster at pixelRatio 2, loads Google Nunito through the engine's own loader (`document.fonts.check` true, 90 px span +72.4 px), registers a self-hosted data-URI font via `store.addFont` (FontFaceSet check true), pointer-drags the text element with ~2 ms avg input-to-paint rAF samples, and does transaction/undo/redo ≈ 2/1/0.5 ms. Both packages ship zero `.d.ts` (type shim + pinned deep subpath required regardless of posture); `createStore` is not in the package main; sub-path imports take no `.js` suffix; the main entry is not Node-importable (extensionless `@meronex/icons`) so the browser seam needs a bundler; crop is a numeric surface that recrops the source and stretches it to element bounds. **Closed:** `@reyka/openpolotno@1.5.0` is pinned exact in `packages/editor` (the wrapper — single Book→engine translation boundary, `src/adapt-book.ts`, shim `src/vendor.d.ts`), with 10 in-package tests incl. the round-trip acceptance path and the dependency-direction guard (`boundary.spec.ts`: no other package may reference the engine). F-014 promoted to agreed (page→spread mapping resolved: one canonical page → one engine page). Sponsor ticket `.planning/EDITOR_SPONSOR_TICKET.md` acceptance criteria 1,2,4,5 met; criterion 3's app-level bundle guard lands with F-011.
- **Commerce adoption/rejection.** **RESOLVED — SUPERSEDED: originally REJECT (defer) Medusa
  (Spike C, 2026-09-22); re-opened the same day on a constraint change → D006 ADOPTED (Medusa is
  the commerce foundation, self-hosted, `apps/commerce`).** Spike C's evidence stands unchanged:
  the cart → payment → order path + the hard invariant (commerce references an approved revision
  by opaque id + hash only, never owns/mutates the Book) are proven headlessly 4/4
  (`spike/commerce/`), incl. idempotent at-least-once webhook handling and rejection of any
  non-APPROVED book at checkout — this is now the semantic minimum the Medusa integration must
  satisfy. What changed: the product constraint (ops complexity accepted for mature primitives);
  re-verification at v2.21.0 found no licensing/architectural blocker
  (`MEDUSA_EVIDENCE.md` re-verification appendix). Medusa OSS still has no outbound webhooks, so
  the book→print handoff remains our custom idempotent subscriber-side job (now by design, not by
  fallback). Payment rails: Medusa's first-party Stripe provider (D014 item 3 closed).
- **First print provider + print contract.** **PROVISIONALLY SELECTED — Mixam is the preferred first production candidate and print-spec reference; contract stays generic** (Spike D, 2026-09-22). `spike/print-pipeline/` proves a deterministic visible 24-page sample from an immutable approved revision + generic `PrintSpec`, with text inside safe area, embedded font, and editor independence. Mixam's format evidence is in `spike/print-pipeline/MIXAM_EVIDENCE.md`; provider deltas (3 mm bleed, 5 mm general / 12 mm hinge quiet area, offered trims, 300 dpi, CMYK GRACoL2006_Coated1v2, no crop marks, fonts embedded, interiors in multiples of 2) remain in the adapter. Do not ADOPT Mixam for fulfilment until API credentials, quote/upload/order/status/tracking/cancellation/error/rate-limit behaviour, sandbox/physical orders, regional availability, commercial terms and child-data processing are qualified. The canonical trim must be an offered Mixam trim (210/148/120/300 mm) or a quoted custom; 215.9 mm is not offered.
- **Identity-generation approach.** OPEN — Spike E tests provider identity/reference-conditioning capabilities (multi-photo, provider-native reference conditioning, reusable private reference, retention/data-use) before any approach or threshold is chosen. **Update (2026-09-22):** Spike E phase 1 landed the offline measurement methodology (`spike/identity-qa/`, 29/29 tests, `RESEARCH_LOG.md` entry) — reference conditioning rides the canonical `IdentityProvider` seam and the QA vocabulary is wired to `contracts` quality checks — but **no real-provider evidence exists yet**; this item stays OPEN, any threshold from dry-run numbers would be invented.
- **QA approach.** OPEN — Spike E's vision-evaluator feasibility check (does an independent evaluator agree with human review often enough to be useful) must run before a likeness threshold/methodology is fixed. Until calibration, deterministic wrong/missing required character and immutable-fact contradictions are `HARD_BLOCK`; automated likeness or LLM judgement is `REVIEW_REQUIRED`. Only calibrated high-confidence evaluator mismatches may later become `HARD_BLOCK`. **Update (2026-09-22):** the blinded-review benchmark form, kappa/confusion agreement metrics and a sensitivity-checked synthetic reviewer are now in place behind the canonical quality vocabulary; the feasibility check itself (real evaluator vs real humans) is still OPEN pending the real phase.
- **Storage upload topology.** RESOLVED for M2 by D017: direct signed upload to private storage, followed by server-side completion and validation. M1 has no child-photo uploads.

---
## D021 — Monorepo Bootstrap: First Production Code and Dependency Direction (2026-09-21)

**Status:** Accepted (M0 foundation rails; first real code — recorded per D015 now that a codebase exists)

The recommended path to "run the D014-blocking spikes and start some real code immediately" converges here: a parallel PR (`feat/` branch) boots the monorepo so M1 vertical slices can build on real packages, without depending on any spike outcome.

**Layout (committed):** `apps/commerce` is *planned* (D006 — Medusa foundation PR), not yet scaffolded here.

```text
apps/{web, api, worker}            — application shells (stubs commit the direction only)
packages/domain                    — canonical Book/Child/PrintSpec model (D004/D016), GenerationStep units
packages/editor                    — pinned engine wrapper (D007 pin+wrap; single Book→snapshot boundary; added 2026-09-22)
packages/contracts                 — canonical generation contracts (GENERATION_ARCHITECTURE §3) + parseContract
packages/providers                 — Story/Illustration/Identity/Quality/Moderation boundaries + ProviderCard audit
packages/execution                 — DurableExecutionContract (D019) + in-memory semantics runtime (test/staging only)
packages/provenance                — GenerationProvenance schema + content-true policyHash
packages/policies                  — machine-readable policy-set manifest (mirrors policies/MANIFEST.md)
packages/storage                   — foundational private-storage contract (D017 invariants; no impl)
packages/testing                   — shared fakes (InMemoryDurableRuntime re-export)
spike/ .planning/                  — spike programme + planning (unchanged)
```

(2026-09-22: **D006 ADOPTED** adds `apps/commerce` (self-hosted Medusa) + `packages/commerce`
(boundary types) to the layout with the Medusa foundation PR — see the D006 entry.)

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
- At bootstrap time no platform candidate was promoted: Editor (D007 candidate), commerce (D006 candidate), quality threshold, print partner all remained OPEN pending spike evidence. **(Update 2026-09-22:** editor → D007 ADOPTED pin+wrap; commerce → D006 ADOPTED (Medusa, self-hosted, `apps/commerce`) — superseding this note for those two items; quality threshold and print-partner contract decisions still open per D020.)**
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
  supervision, review queries, dashboard in @pg-boss/dashboard). The reclaim
  timings are configuration-dependent because the spike deliberately used
  different lease/stall settings; they are evidence that recovery works, not a
  durable performance advantage. BullMQ is Redis-native (workable, faster
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

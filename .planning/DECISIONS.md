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
1. Durable execution substrate (candidate classes: PostgreSQL-backed; Redis-backed; a workflow engine only if the spike shows its guarantees are needed — wording stays neutral until then, see D019) — feeds F-010/F-028.
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
- Substrate wording stays neutral — "durable execution substrate" — until the D014 spike; candidate classes (PostgreSQL-backed; Redis-backed; a workflow engine only if the spike shows its guarantees are needed) remain candidates, never defaults. (2026-09-21 consistency pass: D014 #1 reworded accordingly.)

---

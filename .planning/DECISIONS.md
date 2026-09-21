# Product and Architecture Decisions

This file records decisions that are currently accepted or being actively evaluated.

Decisions can change when new evidence appears.

Do not silently reverse a decision.

If new evidence contradicts one, update this file with the reasoning.

---

## D001 — Existing Application Is Not Disposable

**Status:** Accepted

For Little One already exists.

We are not starting from an empty greenfield project.

Existing functionality should be inspected and classified as:

- KEEP
- MODIFY
- REPLACE
- ADD
- DEFER
- REJECT

Do not rewrite working systems solely for architectural cleanliness.

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

**Status:** Evaluate for adoption

Purpose:

- commerce;
- cart;
- order;
- customer;
- payment;
- promotion;
- shipping;
- fulfilment.

Before adoption compare it against existing repository functionality.

No rewrite should happen purely because Medusa exists.

---

## D007 — OpenPolotno

**Status:** Evaluate / potentially wrap or fork

Purpose:

- low-level multipage editing primitive.

Do not expose the complete generic design-editor UX.

Do not make its data format canonical.

Investigate:

- direct dependency;
- pinned dependency;
- internal fork;
- wrapper/adapter.

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
- This does not weaken D001's spirit: avoid rewriting — but nothing exists to rewrite.

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
1. Queue substrate (DB-backed vs BullMQ+pg; Temporal ruled out by default) — feeds F-010/F-028.
2. OpenPolotno consumption (direct dep vs pinned vs fork) incl. spread support — feeds F-014.
3. Medusa version/edition (self-hosted vs headless-cloud) + tax routing — feeds F-018.
4. Print partner + PDF standard (PDF/X-1a vs PDF 1.7+embedded fonts) — feeds F-017/F-019.
5. QualityModel identity threshold calibration set — feeds F-009/F-015.

---

## D015 — Feature Specs Must Never Fabricate Existing Systems

**Status:** Accepted

Greenfield reality (D013) means spec "Current implementation" sections legitimately say `None (Observed)`.

Future agents updating these docs must:

- cite `codebase/README.md`, `RESEARCH_LOG.md` and D013 where they claim greenfield;
- never invent files, endpoints, tables, components or providers to make a section look "known";
- add a new decision when a real codebase surfaces instead of silently re-describing the product.
# Feature Map — For Little One

Master map of customer-facing and operational capabilities. Every capability has an ID, a priority, a spec file, a dependency set, and a status.

**Read first:** `_SPEC_GUIDE.md` (rules, template, canonical model). `../codebase/README.md` (historical baseline plus current implementation evidence).

## Priority classes (spec §26 / mission §33)

| Class | Meaning |
| --- | --- |
| **P0** | Launch / category parity — without these we are clearly worse than competitors |
| **P1** | Key differentiation — our reason to exist |
| **P2** | Retention / delight — value after the first book |
| **P3** | Experiment — unvalidated; promote only with evidence |

Filter for every feature: easier creation · more personal result · more confidence in print · repeat usage/gifting · fewer support/reliability problems. If none apply, deprioritise.

## Status legend

`proposed` (spec written, not agreed) · `agreed` (architecture-aligned, roadmap assignable) · `in-build` · `shipped` · `deferred` · `rejected`

## Core journey dependency chain

```text
Onboarding(01) ─ Story Discovery(02)
        │                          │
        ▼                          ▼
   Child Profile(03) ──► Photo Upload(04) ──► Character Bible(05)
                   Personalisation(06) ──────► Story Concepts(07)
                                                   │
                                                   ▼
                                     Story Generation(08)
                                                   │
                                                   ▼
                                  Illustration Generation(09)
                                                   │
                        ┌──────────────────────────┤
                        ▼                          ▼
               Generation Progress(10)     Book QA(15) · corrections(12,13,14)
                        │                          │
                        ▼                          ▼
                  Book Preview(11) ◄──────── corrections applied
                        │                          │
                        ▼                          ▼
                    Approval(16) ──────────────────┤ (revision locked, QA)
                        │
                        ▼
               Print Rendering(17) ──► Cart/Checkout(18, Medusa) ──► Fulfilment(19) ──► Tracking(20)
                        │
                        ▼
                 Family Library(21) ──► Reorder/Sequels(22) · Multi-person(23) · Localisation(24)
```

Cross-cutting: `Privacy/Deletion(25)` · `Admin/Support(26)` · `Analytics/Observability(27)` · `Failure Recovery(28)`.

**Milestone shape of the identity path:** the core creation journey (M1) runs **without child photos** — `Onboarding → Discovery → Child Profile (basic, no visual refs) → Personalisation → Concepts → Story Generation → durable progress → text/layout book preview with fixture/placeholder illustrations`. The sensitive-image path lands in **M2**: `Photo Upload → Photo validation → visual identity / Character Bible → Illustration Generation → identity QA → illustrated preview`. Child Profile may exist in M1 without visual references.

The QA→Approval→Print edge runs through the **shared PrintSpec/PrintPreflightContract** (D016), so F-015/F-016/F-014 consume a contract while F-017 implements it — no cycle:

```text
Canonical Book/Layout → PrintSpec/PreflightContract → F-015 core QA → F-016 Approval
→ ApprovedBookRevision → F-017 Print Renderer → Print Artifact → F-019 Fulfilment
```

## Feature register

| ID | File | Feature | Priority | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| F-001 | 01_ONBOARDING.md | Landing, anonymous session, claim project | P0 | — | agreed |
| F-002 | 02_STORY_DISCOVERY.md | Story/theme discovery & browsing | P0 | F-001 | agreed |
| F-003 | 03_CHILD_PROFILE.md | Persistent child profile | P0 | F-001 | agreed |
| F-004 | 04_PHOTO_UPLOAD.md | Photo upload + validation + quality | P0 | F-003 | proposed |
| F-005 | 05_CHARACTER_BIBLE.md | Canonical visual identity + global corrections | P1 | F-003, F-004 | proposed |
| F-006 | 06_PERSONALISATION.md | Progressive personal details (facts, immutable) | P0 | F-003 | agreed |
| F-007 | 07_STORY_CONCEPTS.md | 3 generated concepts, select/regenerate | P0 | F-002, F-003, F-006 | agreed |
| F-008 | 08_STORY_GENERATION.md | Outline + page-text pipeline | P0 | F-007, F-006, F-003, DurableExecutionContract (foundation — D019) | proposed |
| F-009 | 09_ILLUSTRATION_GENERATION.md | Illustration plans + image generation | P0 | F-005, F-008, DurableExecutionContract (foundation — D019) | proposed |
| F-010 | 10_GENERATION_PROGRESS.md | Persistent, observable, resumable jobs | P0 | F-008/F-009 GenerationStep units, DurableExecutionContract/F-028 principles | proposed |
| F-011 | 11_BOOK_PREVIEW.md | Reading-mode book preview | P0 | F-008, canonical layout, F-010 (v0, M1); F-009 (illustrated preview, M2) | proposed |
| F-012 | 12_PAGE_CORRECTION.md | Page-level text/image repair | P1 | F-011, F-010 | proposed |
| F-013 | 13_GLOBAL_CHARACTER_CORRECTION.md | Character-wide correction (hair, outfit, likeness) | P1 | F-005, F-012 | proposed |
| F-014 | 14_BOOK_EDITOR.md | Custom editor above OpenPolotno | P1 | F-011, F-012, F-013 | agreed |
| F-015 | 15_BOOK_QA.md | Pre-print/pre-approval QA suite | P0 | F-009, F-011, PrintSpec/PreflightContract (D016) | proposed |
| F-016 | 16_APPROVAL.md | Approve & Print lock, revision freeze | P0 | F-015, F-010, PrintSpec/PreflightContract (D016) | proposed |
| F-017 | 17_PRINT_RENDERING.md | Deterministic print pipeline + PDF | P0 | F-016, PrintSpec/PreflightContract (D016) — not F-014 (parallel surfaces) | proposed |
| F-018 | 18_CART_AND_CHECKOUT.md | Cart, Medusa commerce, payment | P0 | F-016 | proposed |
| F-019 | 19_FULFILMENT.md | Print submit, shipping, fulfilment events | P0 | F-017, F-018 | proposed |
| F-020 | 20_ORDER_TRACKING.md | Customer tracking/status | P0 | F-019, F-026 | proposed |
| F-021 | 21_FAMILY_LIBRARY.md | Digital library, reading, "Our Stories" | P2 | F-016, F-011 | proposed |
| F-022 | 22_REORDER_AND_SEQUELS.md | Reorder, duplicate, sequel from library | P2 | F-021, F-005 | proposed |
| F-023 | 23_MULTI_PERSON_STORIES.md | Siblings/family/pet stories, relationship narrative | P1 | F-003, F-005, F-008 | proposed |
| F-024 | 24_LOCALISATION.md | Locale-aware facts, en-GB/en-US, l10n, bilingual | P2 | F-003, F-006, F-008, F-017 | proposed |
| F-025 | 25_PRIVACY_AND_DELETION.md | Retention, consent, deletion, provider audit | P0 | F-003; F-004, F-005 (data domains it governs, M2); M1 core v0 = governance contract + baseline with no build dependency on M2 features | proposed |
| F-026 | 26_ADMIN_AND_SUPPORT.md | Ops/support view, dedupe, refunds | P1 | F-018, F-019 | proposed |
| F-027 | 27_ANALYTICS_AND_OBSERVABILITY.md | Metrics, costs, logs, errors | P1 | F-010, F-018 | proposed |
| F-028 | 28_FAILURE_RECOVERY.md | Cross-cutting durability, retries, resumability | P0 | — (provides patterns; D010/D014/D019 decisions) | proposed |

## Parallelism (what can be built at the same time)

- **Track A — Identity:** F-003, F-004, F-005, F-006 (child & character model, photo pipeline).
- **Track B — Story:** F-002, F-006, F-07, F-08 (concepts & text generation).
- **Track C — Renderers:** F-014 editor, F-011 reader, F-017 print are independent surfaces over the same canonical Book model.
- **Track D — Commerce/fulfilment:** F-018, F-019, F-020 can proceed against stub Book/print data; print adapter (F-017 API) needed before end-to-end.
- **Track E — Ops:** F-026, F-027, F-028 are horizontal; design early, build incrementally.

## Open decision inputs

- Commerce via Medusa: **ADOPTED** (D006, 2026-09-22 — re-opened on a constraint change) — self-hosted at `apps/commerce`; edition/tax question closed (D014 item 3); hard boundary + opaque line-item invariant in guide §6.
- Editor primitive OpenPolotno: **ADOPTED pin + wrap** (D007/D020); F-014 spec agreed 2026-09-22. App integration is separate from agreement.
- Durable execution substrate: **ADOPTED pg-boss** (D022); neutral DurableExecutionContract retained (D019). App/worker wiring is separate from spike evidence.
- Print contract (D016): PrintSpec/PrintPreflightContract is a shared landing decision — already agreed as the cycle-break for F-015/F-016/F-017.
- Upload topology (D017): browser direct signed upload to private storage, followed by server-side completion and validation; qualify the storage/provider details before M2.
- Bilingual (F-024): P2, but keep locale on profile facts from day one.


## Evidence-linked next work — 2026-09-25

See [creation-flow learnings and tracker](../market/2026-09-25_CREATION_FLOW_LEARNINGS.md) for NEXT-01–04, their feature mappings, readiness gates and acceptance criteria. It also tracks M2 photo checks, character corrections, additional cast, colouring experiments, private sharing and verified purchase inclusions. Selection is not spec agreement or shipment.

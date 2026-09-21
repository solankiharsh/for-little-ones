# Feature Map — For Little One

Master map of customer-facing and operational capabilities. Every capability has an ID, a priority, a spec file, a dependency set, and a status.

**Read first:** `_SPEC_GUIDE.md` (rules, template, canonical model). `../codebase/README.md` (finding: greenfield, no existing code).

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

## Feature register

| ID | File | Feature | Priority | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| F-001 | 01_ONBOARDING.md | Landing, anonymous session, claim project | P0 | — | proposed |
| F-002 | 02_STORY_DISCOVERY.md | Story/theme discovery & browsing | P0 | F-001 | proposed |
| F-003 | 03_CHILD_PROFILE.md | Persistent child profile | P0 | F-001 | proposed |
| F-004 | 04_PHOTO_UPLOAD.md | Photo upload + validation + quality | P0 | F-003 | proposed |
| F-005 | 05_CHARACTER_BIBLE.md | Canonical visual identity + global corrections | P1 | F-003, F-004 | proposed |
| F-006 | 06_PERSONALISATION.md | Progressive personal details (facts, immutable) | P0 | F-003 | proposed |
| F-007 | 07_STORY_CONCEPTS.md | 3 generated concepts, select/regenerate | P0 | F-002, F-003, F-006 | proposed |
| F-008 | 08_STORY_GENERATION.md | Outline + page-text pipeline | P0 | F-007, F-006, F-003 | proposed |
| F-009 | 09_ILLUSTRATION_GENERATION.md | Illustration plans + image generation | P0 | F-005, F-008 | proposed |
| F-010 | 10_GENERATION_PROGRESS.md | Persistent, observable, resumable jobs | P1 | F-008, F-009, F-028 | proposed |
| F-011 | 11_BOOK_PREVIEW.md | Reading-mode book preview | P0 | F-008, F-009 | proposed |
| F-012 | 12_PAGE_CORRECTION.md | Page-level text/image repair | P1 | F-011, F-010 | proposed |
| F-013 | 13_GLOBAL_CHARACTER_CORRECTION.md | Character-wide correction (hair, outfit, likeness) | P1 | F-005, F-012 | proposed |
| F-014 | 14_BOOK_EDITOR.md | Custom editor above OpenPolotno | P1 | F-011, F-012, F-013 | proposed |
| F-015 | 15_BOOK_QA.md | Pre-print/pre-approval QA suite | P1 | F-009, F-011, F-017 | proposed |
| F-016 | 16_APPROVAL.md | Approve & Print lock, revision freeze | P0 | F-015, F-010 | proposed |
| F-017 | 17_PRINT_RENDERING.md | Deterministic print pipeline + PDF | P0 | F-014, F-016 | proposed |
| F-018 | 18_CART_AND_CHECKOUT.md | Cart, Medusa commerce, payment | P0 | F-016 | proposed |
| F-019 | 19_FULFILMENT.md | Print submit, shipping, fulfilment events | P0 | F-017, F-018 | proposed |
| F-020 | 20_ORDER_TRACKING.md | Customer tracking/status | P0 | F-019, F-026 | proposed |
| F-021 | 21_FAMILY_LIBRARY.md | Digital library, reading, "Our Stories" | P2 | F-016, F-011 | proposed |
| F-022 | 22_REORDER_AND_SEQUELS.md | Reorder, duplicate, sequel from library | P2 | F-021, F-005 | proposed |
| F-023 | 23_MULTI_PERSON_STORIES.md | Siblings/family/pet stories, relationship narrative | P1 | F-003, F-005, F-008 | proposed |
| F-024 | 24_LOCALISATION.md | Locale-aware facts, en-GB/en-US, l10n, bilingual | P2 | F-003, F-006, F-008, F-017 | proposed |
| F-025 | 25_PRIVACY_AND_DELETION.md | Retention, consent, deletion, provider audit | P1 | F-004, F-005 | proposed |
| F-026 | 26_ADMIN_AND_SUPPORT.md | Ops/support view, dedupe, refunds | P1 | F-018, F-019 | proposed |
| F-027 | 27_ANALYTICS_AND_OBSERVABILITY.md | Metrics, costs, logs, errors | P1 | F-010, F-018 | proposed |
| F-028 | 28_FAILURE_RECOVERY.md | Cross-cutting durability, retries, resumability | P1 | F-010 | proposed |

## Parallelism (what can be built at the same time)

- **Track A — Identity:** F-003, F-004, F-005, F-006 (child & character model, photo pipeline).
- **Track B — Story:** F-002, F-006, F-07, F-08 (concepts & text generation).
- **Track C — Renderers:** F-014 editor, F-011 reader, F-017 print are independent surfaces over the same canonical Book model.
- **Track D — Commerce/fulfilment:** F-018, F-019, F-020 can proceed against stub Book/print data; print adapter (F-017 API) needed before end-to-end.
- **Track E — Ops:** F-026, F-027, F-028 are horizontal; design early, build incrementally.

## Open decision inputs

- Commerce via Medusa: **EVALUATE** (D006) — greenfield caveat: appropriate to adopt as the commerce module.
- Editor primitive OpenPolotno: **EVALUATE/wrap** (D007) — proof-of-concept spike for spread support before F-014 approval.
- Job backbone: no Temporal by default (F-028/F-010) — confirm after queue spike.
- Bilingual (F-024): P2, but keep locale on profile facts from day one.
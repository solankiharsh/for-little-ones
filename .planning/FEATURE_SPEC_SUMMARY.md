# FEATURE_SPEC_SUMMARY.md — Executive Feature Summary

Concise executive view of the full feature-spec set. Detail lives in `features/NN_*.md`; decisions in `DECISIONS.md`; architecture in `PRODUCT_ARCHITECTURE_V2.md`; sequencing in `IMPLEMENTATION_ROADMAP.md`.

**Everything is greenfield (D013):** no existing code; every feature is ADD/BUILD. "Current status" = spec status across the set (all `draft → proposed`), pending the current agreement pass.

## A. Features at a glance

| # | Feature | Priority | Milestone | One-line UX | Main technical change | Depends on | Top risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Onboarding & account claim | P0 | M1 (session) / M6 (claim) | Explore before account; claim later | `anonymous_project_id` + ownership token (P0 core); magic-link claim later | — | Unclaimed-project retention |
| 02 | Story discovery | P0 | M1 | Browse themes/occasions, no blank prompt | Data-driven catalogue (content, not code) | 01 | Catalogue copy quality |
| 03 | Child profile | P0 | M1 | One reusable profile, second book in seconds | Reusable `ChildProfile` entity; mandatory/optional/parent-confirmed fields | 01 | Field-scope creep |
| 04 | Photo upload | P0 | M1 | Upload 1–5, gentle validation, delete anytime | Photo pipeline + face/resolution QA; upload topology TBD (direct vs API-relay) — D017 | 03 | Rejecting usable photos; provider for face-detection |
| 05 | Character Bible | P1 | M1 (v0) | One canonical child look per book/cast | Provider-agnostic `CharacterBible`; versioning | 03, 04 | Vendor identity lock-in |
| 06 | Personalisation | P0 | M1 | Layered questions; facts never mutate | Typed, locale-aware, immutable Fact model | 03 | Vocabulary pinning per locale |
| 07 | Story concepts | P0 | M1 | 3 choices with titles/pitches | `StoryModel` structured JSON + moderation + human fallback | 02, 03, 06 | Fallback-concept content commitment |
| 08 | Story generation | P0 | M1 | Story ordered page-by-page, age-apt | Outline gate → per-page text; idempotent `pageKey` | 07, 06, 03 | Age word-counts uncalibrated |
| 09 | Illustration generation | P0 | M2 | Consistent child in every illustration | Identity-conditioned images + plan; ≥300 DPI gate | 05, 08 | Identity threshold calibration |
| 10 | Generation progress | P0 | M1→M2 | Emotional progress; refresh-safe; resumable | Durable job/queue; step+page states; durability core | 08, 09, 28 | Queue substrate choice |
| 11 | Book preview | P0 | M1 (v0) | Premium reader; no editor chrome | Lightweight reader renderer; bundle-isolation guard; placeholder illustrations OK in M1 | 08, 09 | Reader/editor bundle separation |
| 12 | Page correction | P1 | M3 | "Something wrong?" → click → fixed | Intent catalogue (image/text); page revisions; isolation | 11, 10 | Intent-catalogue completeness |
| 13 | Global character correction | P1 | M3 | "Her hair longer" everywhere she appears | Bible version bump → affected-page regen; cost surfaced | 05, 12 | Scope computation accuracy |
| 14 | Book editor | P1 | M3 | Simple editor escape hatch, not Canva | OpenPolotno wrapper (candidate — pending spike) + canonical↔snapshot adapter | 11, 12, 13 | OpenPolotno serialization stability |
| 15 | Book QA | P0 | M2 (core) → M4 (print) | Problems flagged before it reaches you | QA suite (identity/facts/layout/print gates); HARD_BLOCK/REVIEW_REQUIRED/ADVISORY; re-runnable | 09, 11, PrintSpec/PreflightContract | QA false negatives |
| 16 | Approval | P0 | M4 | One "Approve & Print"; exact book locked | Deep-immutable `ApprovedBookRevision` + hash; format feasibility via shared contract | 15, 10, PrintSpec/PreflightContract (D016) | Lock semantics leaks |
| 17 | Print rendering | P0 | M4 | Deterministic, print-ready output | Bleed/safe/DPI/fonts/cover/spine pipeline (implements the shared contract); `PrintProvider` | 16, PrintSpec/PreflightContract (D016) — not F-014 | Printer PDF standard |
| 18 | Cart & checkout | P0 | M5 | Multi-book cart, pay in seconds | CommerceModule (Medusa candidate — pending spike); line item → approved revision | 16 | Medusa edition; tax/VAT |
| 19 | Fulfilment | P0 | M5 | Print submitted; no double-ship | `PrintProvider.submit/getStatus`; idempotent submission | 17, 18 | Partner formats/DPI |
| 20 | Order tracking | P0 | M5 | Timeline + email, PII-free | Lifecycle events + provider numbers | 19, 26 | Provider tracking coverage |
| 21 | Family library | P2 | M6 | "Our Stories", kept forever | Library render of owned books via reader | 16, 11 | Public PII leaks |
| 22 | Reorder & sequels | P2 | M6 | Reorder the exact book; sequel in minutes | Reorder pins revision; Sequel reuses profiles/Bibles | 21, 05 | Duplicate pricing model |
| 23 | Multi-person stories | P1 | M6 | Siblings/grandparents/pets in the story | First-class cast; relationship narrative; swap-QA | 03, 05, 08 | Friend/pet minimal identity |
| 24 | Localisation | P2 | M6 | Locale-aware, en-GB/US; bilingual later | Structured locale facts; bilingual data model now | 03, 06, 08, 17 | Bilingual generation approach |
| 25 | Privacy & deletion | P0 | M1 (core) / M6 (full) | Explicit windows + delete-now | Core (consent, retention classes, delete-now baseline, provider audit) is P0; full sweep M6 | 04, 05 | Provider delete-API gaps |
| 26 | Admin & support | P1 | M5 (v1) | "Why is this stuck?" no logs | Lineage view; role-gated; photos hidden by default | 18, 19 | Support role model |
| 27 | Analytics & observability | P1 | M5 (v1) | Cost ledger + safe events | Event allow-list; cost ledger; PII-stripped logs | 10, 18 | Event spam |
| 28 | Failure recovery | P0 | M2 (core) | Failures recover; nothing silently lost | Idempotency, backoff, leases, one-page isolation; durability core | 10 | Queue substrate (PostgreSQL vs Redis-backed) |

## B. Platform decisions

| Primitive | Decision | Purpose | Boundary |
| --- | --- | --- | --- |
| **Medusa** | CANDIDATE — pending spike (edition, hosting, tax/VAT) — D006 | Commerce: cart, customer, product, pricing, payment, order, regions, currency, shipping | NEVER the Book model owner; line items reference `approvedBookRevisionId` |
| **OpenPolotno `@reyka/openpolotno`** | CANDIDATE IMPLEMENTATION — pending spike (spread, serialization, wrap vs fork) — D007 | Low-level editor engine under a custom simple UI | Never canonical model; never full Canva UX; pinned/possibly forked |
| **IMG.LY Photobook Starter** | UX/ARCHITECTURE REFERENCE only | Page nav, thumbnails, selection, provider separation | Not adopted by default |
| **Postiz** | REJECT AS FOUNDATION | Reference for jobs/retries/observability | Not a dependency |
| **Durable workflow** | Prefer the simplest durable solution; PostgreSQL-backed alternative is the default candidate, Redis-backed (BullMQ-class) is the other; select after the D014 spike — Temporal only if the spike shows its guarantees are needed | Durable execution | DB-backed queue default for v1; Redis-backed class needs outbox/reconciliation |
| **PrintSpec/PrintPreflightContract** | OWN (shared domain contract — D016) | Format feasibility + geometry rules + quote inputs consumed by QA/approval/editor; renderer implements it | Breaks the F-015/F-016/F-017 cycle |
| **Canonical Book model** | OWN (KEEP) | Domain truth | Editor/reader/print/digital = adapters |

## C. Legacy review (KEEP / MODIFY / REPLACE / ADD / DEFER / REJECT)

| Item | Classification | Rationale |
| --- | --- | --- |
| `project-spec-initial.md` + `.planning/` research | **KEEP** | Source of intent; cited throughout specs |
| Claims of an existing product/system | **REJECT** | Verified absent (RESEARCH_LOG, D013) — none to preserve or migrate |
| Every product capability | **ADD** | Greenfield; build per roadmap |
| Bilingual books | **DEFER** (P2) | Data model prepared now (locale, `textLocales[]`), value tested later |
| Audio narration / bedtime ambience / colouring / sharing | **DEFER** (P2/P3, out of 28-file set) | Revisit after M6; structured story object keeps them possible |
| Generic AI-feature playground | **REJECT** | Product filter (§33) applied per feature |
| Editor-as-canonical / screenshot-as-print | **REJECT** | D004/D005 |

## D. Key acceptance themes to hold across milestones

- Identity: no unexplained identity change between pages; sibling-swap and wrong-count detected (F-015).
- Facts: parent-provided facts never silently mutate (F-006/F-008).
- Recovery: one-page failure ≠ book restart; refresh/worker-restart safe (F-028).
- Print: deterministic at the content level — same approved revision + same printSpec → same visible/content output (normalized artifact hash, not byte-equality as the requirement); exact approved revision preserved (F-016/F-017).
- Privacy: privacy core P0 — explicit consent, retention classes (windows PROPOSED pending legal sign-off), delete-now, private storage — enforced end-to-end (F-025).
- Mobile: complete creation + checkout one-handed (D012).
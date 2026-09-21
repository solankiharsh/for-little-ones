# PRODUCT_ARCHITECTURE_V2.md — Revised Product Architecture

> **Status:** Draft v2 — to be agreed before implementation (mission §28).
> **Relationship to research:** this replaces the informal architecture notes in earlier planning; it does NOT violate the research spec (`project-spec-initial.md`) — decisions D001–D017 and the canonical-model principle stand.
> **Headline finding:** there is no existing codebase (see `codebase/README.md`, `RESEARCH_LOG.md`, D013). The "existing architecture" below is therefore the documentation-and-research asset, and everything else is greenfield by design.

---

## 1. Existing architecture

**Observed:** none as application code. The workspace today contains:

- `project-spec-initial.md` — product/market/architecture research (spec §1–§28).
- `.planning/` — decision log (D001–D017), open questions, research log, codebase/market/platform/product research, and 28 feature specs + feature map (`features/`).
- `AGENTS.md` — agent operating rules.

There is no frontend, backend, database, auth, storage, queue, commerce, generation pipeline, book model, editor, or print integration. The "current application" is entirely conceptual.

## 2. Problems worth fixing

Because there is no code, "problems" are the risks we design out from the start. From the research and spec, the failure modes most likely to sink this category are:

1. **Identity drift** — child likeness not consistent across pages (the single biggest recurring complaint in competitor reviews; spec §2, §10).
2. **Fact mutation** — model silently changing parent-provided facts (the Adorabook "football-as-American" class of error; spec §11).
3. **Unreliable generation** — spinner-then-fail, whole-book restart on one page failure (spec §6, §14).
4. **Lock-in** — canonical model coupled to editor JSON, AI provider, or print provider (D004, D005).
5. **Privacy exposure** — child photos flowing to providers/retained without a documented trace and deletion contract (spec §18; competitor Diffrun already publishes windows).
6. **Commerce friction** — separate orders per book, no pre-payment ETA, no multi-book cart (spec §16).
7. **Post-purchase romance** — library-as-order-history instead of "Our Stories" (spec §14).

## 3. Architecture we retain

| Item | Decision | Why |
| --- | --- | --- |
| Product research (`project-spec-initial.md`) | **KEEP** | Source of intent; referenced by every feature spec. |
| Decision log + research discipline (D001–D017, `.planning/`) | **KEEP** | The "research before build" culture is the asset. |
| Product principles (parent ⌘ 95%, AI 5%; no account wall; mobile-first; approval-before-print) | **KEEP** | Encode the differentiation. |
| Canonical Book model + three-renderer principle | **KEEP** | Adopted into architecture (§7 below). |

## 4. Architecture we replace

Nothing to replace — no code exists (D013). **Note for reviewers:** when the first code lands elsewhere later, re-run the inspection and migrate this section honestly rather than assuming parity with this document.

## 5. Architecture we introduce

Greenfield foundation with an explicit **domain-separation** structure:

```text
+--------------------+   +---------------------+   +---------------------+
|   Client app(s)     |   |   Web app (React)   |   |   Ops console       |
|  (future native)    |   |  (Next.js or Vite)  |   |  (support/admin)    |
+--------------------+   +----------+----------+   +----------+----------+
                                    | REST / BFF                | internal
                                    v                           v
                       +---------------------------+   +-------------------+
                       |   For Little One API      |   |   Admin API       |
                       |  (domain commands/queries)|   |  (role-gated)     |
                       +------+--------+-----------+   +-------------------+
                              |        |                   ^
                              |        |                   |
        +---------------------+        +----------+        |
        |                        +---------------+ |        |
        v                        v               | v
+------------+   +--------------+   +-----------+   +-----------------+
| Postgres   |   | Object store |   | Queue /   |   | Provider layer   |
| (canonical |   | (photos,     |   | workers   |   | StoryProvider ·     |
| book,      |   |  illus,      |   | (durable  |   | IllustrationProvider·|
| profiles,  |   |  artifacts)  |   | substr.)  |   | Identity · QA ·  |
| orders)    |   +--------------+   +-----------+   | Moderation ·     |
|            |                                     | PrintProvider ·   |
+------------+                                     | CommerceModule    |
                                                   +---------+---------+
                                                             |
                       +---------------+-------------+-------+-----------+
                       |               |             |                   |
                       v               v             v                   v
                Text/Image       Print/fulfil-    Payments/           Mail/SMS/
                AI providers     ment partners    tax (Medusa)        analytics
                          (all behind interfaces, all documented)
```

Key properties:

- **API owns the domain.** No client writes attend to canonical Book/children data directly.
- **Canonical stores in Postgres;** photos/illustrations/print artifacts in object storage referenced by IDs, not public URLs at rest.
- **Queue workers** run generation steps; state lives in DB; jobs idempotent/resumable (F-010, F-028).
- **Provider adapters** isolate every external dependency (see §8 below).
- **Event-style state recording** (not event sourcing): approved in D-series/guide §5: `BOOK_CREATED · CHARACTER_CREATED · CONCEPT_SELECTED · … · FULFILMENT_SUBMITTED`.

## 6. Commerce approach

**Medusa is the candidate commerce module (D006, F-018) — pending spike (edition/hosting/tax), not selected.** Since we are greenfield, adoption would be a build decision, not a migration:

- **In scope (if adopted):** carts, customers, products (stock keeping units for book editions), pricing, promotions, payments, orders, regions, currencies, shipping.
- **Out of scope (stays OURS):** Book model, approval, print pipeline, generation, digital library. Medusa would sit behind a `CommerceModule` in the API, never as the domain center.
- **Personalised-order fidelity:** each `OrderItem` carries `approvedBookRevisionId` + `contentHash` references so an order points at an immutable revision (D011, F-016/F-018). No silent regeneration after purchase.
- **Incremental adoption dog-food:** implement cart→checkout→(payment)→order first; promotions/shipping/regions add later. Decide self-hosted vs headless-cloud Medusa in the spike before build (D014).
- **Why not rebuild:** carts, tax, PSP integrations, refunds, and multi-region shipping are well-trodden; our edge is identity+story+print, not payment plumbing. The spike must still show a meaningful improvement over a purpose-built module for our scale before the candidate is adopted.

## 7. Canonical book model

**Owned by For Little One (D004).** Store as JSONB documents in Postgres under application-versioned schemas:

```text
Book
├── id, version
├── metadata            (title, theme, purpose, locale(s), status, timestamps)
├── childProfiles[]     (references to reusable Child Profiles)
├── characters[]        (Character Bible entities for people/pets in the book)
├── relationships[]     (typed: sibling of, grandparent of, friend of, pet-of…)
├── story               (concept ref, outline ref, reading level, locale, page texts)
├── pages[]
│   ├── textBlocks[]    (content, style, immutable-fact refs)
│   ├── illustrations[] (asset refs + placement + plan)
│   ├── decorativeElements[]
│   ├── layout          (canonical layout descriptor, page vs spread)
│   └── generationMetadata (provider, params, qa results, revision, GenerationProvenance)
├── revisions[]         (immutable snapshots; one = ApprovedBookRevision)
├── printSpec           (format, trim, bleed, safe areas, colour profile, binding, pages)
├── approval            (approver, timestamp, approvedRevisionId, lock)
└── status              (DRAFT … DELIVERED + exceptional)
```

**Adapters** translate this into: editor snapshot (OpenPolotno JSON, per version), reader payload (pre-rendered images + text), print payload (PDF/PDF-X artifacts per printer), digital version.

- **Revision rule (F-016):** approval makes a deep-immutable snapshot with hash; print, order items, and reorder all bind to it. Edits always create a new revision; the approved one is byte-preserved.
- **Print contract (D016):** a shared **PrintSpec/PrintPreflightContract + print catalogue (`PrintCapability`/`PrintQuote`)** — format feasibility + geometry rules (trim/bleed/safe areas/DPI/fonts/page rules) + capability and pricing inputs — is part of the canonical model. Core QA (F-015), approval (F-016) and the editor (F-014) consume the catalogue/contract; the print renderer (F-017) implements the geometry contract and its fulfilment adapter (`PrintProvider`, F-019) never answers an approval-facing quote. This is what keeps QA/approval off the renderer's critical path.

## 8. Character model & identity

The **Character Bible** (F-005) is the cross-page, cross-book identity source:

```text
CharacterBible
├── referencePhotos[]        (source-of-truth photos; never mixed with other people)
├── identityRepresentation   (provider-agnostic embedding/ref pack, versioned)
├── approvedAppearance       (parent-confirmed: hair/skin/eyes/outfit/accessories descriptors)
├── illustrationStyle
├── generationReferences     (per-provider params/seeds used for continuity)
├── globalCorrections[]      (applied fixes: e.g. "hair longer since v3")
└── version                  (bump on any change)
```

- **Propagation (F-013):** a global change bumps the Bible version → computes affected pages → marks them `REVISION_REQUIRED` → user approves scope → regeneration → QA → new revision.
- **Honesty rule (F-009/F-015):** we do not promise perfect identity; we promise **measured, repairable identity**. `QualityProvider` scores likeness/consistency against calibrated thresholds; failures surface to the parent as repairable intents; sibling-swap and wrong-child-count are explicit checks (F-015).

## 9. Editor architecture

- **Engine:** OpenPolotno/Konva wrapped behind our own editor boundary (D007, F-014) — **candidate** pending the D014 spike.
- **Boundary:** API exposes canonical Book + an editor adapter that (a) renders canonical → OpenPolotno snapshot for a given editor version, and (b) commits canonical changes from minimal intent operations (page-level correction F-012, character-wide F-013). The editor never owns the model.
- **UI:** custom, minimal — page rail, spread, "Something wrong?" intents; generic Canva surfaces are not exposed. Advanced editor is the escape hatch, not the default (D003).
- **Dependency posture:** pin the version used; decide direct-dep vs small internal fork via spike 1 (Spread support) before F-014 is agreed. Underlying engine format is swappable behind the adapter.
- **Print contract coupling:** the editor validates against the shared PrintSpec/PreflightContract (D016) — safe-area, DPI, embedded-font rules — no dependency on the renderer (F-017) existing.
- **Fourth surface:** the reader (below) must not load the editor bundle — CI bundle-size/isolation guard (F-011).

## 10. Reading architecture

- **Reader renderer (F-011, F-021):** lightweight, images + styled text from the canonical Book; page-flip (mobile), thumbnail rail + spread (desktop); supports preview, digital purchase, and library reading; future narration/read-along plug into the same structured story object (spec §15).
- Assets served from object storage via short-lived signed URLs (no public photo URLs).
- Future digital features (parent narration, word highlighting) consume the canonical `textBlocks` — this is why we never store a bare PDF as canonical (D004).

## 11. Generation workflow

**Structured, stage-based, independently evaluated generation is an accepted architectural invariant (D018).** The generation engine is decomposed into explicit stages with typed, schema-validated contracts and immutable provenance; control flow and invariants live in application code, never in a model (details: `product/GENERATION_ARCHITECTURE.md`, `product/GENERATION_PROVENANCE.md`).

User-visible state machine per book + per step, driven by durable jobs (F-010, F-028) on the **durable execution substrate** (D019). Candidate classes: a **PostgreSQL-backed** queue and a **Redis-backed** queue (BullMQ-class); the first is the simplest durable option, and the choice is made after the D014 spike (candidates stay candidates until then — never defaults). A full workflow engine is considered only if the spike shows its guarantees are actually needed. Wording stays neutral until then.

```text
CreateBook → validate inputs → validate photos → build/update Character Bible
→ concepts (StoryProvider) → select → outline → validate outline
→ page text (per-page idempotent, pageKey) → illustration plans → illustrations
→ quality evaluation → assemble book → layout/print QA → READY_FOR_REVIEW
     │                                              │
     └─ fail closed (D018/F-028 §10): invalid structured model output, auth
        uncertainty, missing approved revision, corrupt print asset, mandatory
        QA unavailable, unsafe print geometry — each a typed step failure, retried
        under the job policy, never coerced to "good enough".
     (any step can fail independently → page-level retry; book-level resume)
```

- Stages and their owning feature specs are mapped in GENERATION_ARCHITECTURE §2; canonical stage entry points (new book, page rewrite, illustration regen, global character correction, re-run QA) re-enter the affected stage only — earlier `READY` stages never re-run (§8).
- Provider boundaries are the generic interfaces `StoryProvider` · `IllustrationProvider` · `IdentityProvider` · `QualityProvider` · `ModerationProvider` (renamed from the earlier `XxxModel` interface names to match D018's provider vocabulary); canonical contracts (`StoryOutlineResult`, `PageTextResult`, `IllustrationPlan`/`IllustrationResult`, `QualityEvaluationRequest/Result`) are runtime-schema-validated with `schemaVersion` recorded.
- Events: `BOOK_CREATED → CHARACTER_CREATED → CONCEPT_SELECTED → STORY_GENERATION_STARTED → STORY_GENERATED → ILLUSTRATION_GENERATION_STARTED → PAGE_RENDERED → QA_COMPLETED → BOOK_READY_FOR_REVIEW → PAGE_REVISION_CREATED → BOOK_APPROVED → PRINT_ARTIFACT_CREATED → ORDER_CREATED → FULFILMENT_SUBMITTED`.
- Idempotency keys on every step; retries with backoff; heartbeats/leases so worker crash ≠ lost state; one-page failure isolated (D010).
- **Provenance:** every artifact/revision carries an immutable `GenerationProvenance` (`policySetVersion` + content `policyHash` over the versioned `/policies` set, provider/model version, `characterVersion`, `storyRevision`, `jobId`, `attempt`); invalid output never becomes canonical state; approval gates fail closed on missing/`UNKNOWN` provenance.
- Cost-aware: each image attempt and regeneration logs to the cost ledger (F-027).
- Typography is deterministic rendering (D016/F-017) — the model never owns book text placement, fonts, line breaks or print export.
- Progress UX = emotional labels mapped from real step states (F-010).

## 12. Storage architecture

| Data | Store | Notes |
| --- | --- | --- |
| Users, profiles, books, orders, jobs, events | Postgres | JSONB for book domain docs; FKs for profiles/orders; migration tooling from day 1 |
| Photos, illustrations, print artifacts, PDFs | Object storage (S3-compatible) | Private; IDs in DB; short-lived signed URLs; lifecycle rules for retention |
| Prompt/model payloads? | none retained | Log only minimal metadata (no photo PII in logs) |
| Queues | durable execution substrate; simplest-durable PostgreSQL-backed schema is the first candidate | Redis-backed (BullMQ-class) is the second candidate class; spike decides (D014). Book state and substrate must stay consistent: an outbox/reconciliation bridge is mandatory for any Redis-backed class |
| Cache (later) | optional; not in v1 | skip until needed |

- Single region first; photo handling per provider data-processing terms documented (F-025).

## 13. Print pipeline

- Deterministic renderer (F-017): trim, bleed, safe areas, DPI/a, resolution validation, embedded fonts, cover+spine math, page-count rules, colour profile. Output PDF/PDF-X artifact per printer standard; adapted via `PrintProvider` (`validateArtifact · submitOrder · getOrderStatus · cancelOrder · getTracking` — **pricing/capability lives in the shared print catalogue, D016, never here**) with per-vendor adapters. Implements the shared **PrintSpec/PrintPreflightContract** (D016).
- **Never** browser screenshot (D005).
- Assets pre-flattened at print resolution from the approved revision; cache artifact tagged with `revisionHash`.
- **Determinism:** same `ApprovedBookRevision` + same `PrintSpec` → the same **visible/content output**. Compare via normalized artifact hash · content-manifest hash · per-page raster comparison · geometry validation report. Byte-identical PDF bytes are only required if the renderer also eliminates timestamps/random IDs (PDFs legitimately embed such values); that is a hardening option, not the launch guarantee (F-017 §14).

## 14. Payment/order flow

1. Checkout (commerce module — Medusa candidate per D006): cart contains items each referencing `approvedBookRevisionId`.
2. Estimate arrival before payment (quote from the shared print catalogue — D016).
3. Payment capture **business-effect idempotent**: PSP idempotency key + idempotent consumer → the capture/order effects happen at most once per attempt; duplicate webhooks replay the stored result (never claim exactly-once delivery — at-least-once + idempotent handling). Provider-crash uncertain-outcome cases go through reconciliation, not "exactly-once".
4. Success → `ORDER_CREATED`; failure → `PAYMENT_FAILED` with clean retry; no print pre-payment.
5. Order → fulfilment (below). Refunds/cancellations only via approved-revision-aware rules (F-026).

## 15. Fulfilment

- On paid order: submit approved artifact via `PrintProvider.submitOrder` (idempotent key = order+item+revision hash) → `FULFILMENT_SUBMITTED` → status polls/callbacks → `IN_PRODUCTION → SHIPPED → DELIVERED`.
- Digital copy disposition if purchased (deliver signed reader link).
- `FULFILMENT_FAILED` → ops alert (F-026) + customer comms; no double-ship (idempotency).

## 16. Privacy/deletion

- Trace every system: browser → API → storage → model provider → output → retention/deletion (mandatory; F-025 data inventory).
- Retention proposal (**PROPOSED — legal/product sign-off required before it goes live**): unsaved uploads ≤48h (draft); saved/order-adjacent photos ≤30 days unless order-in-flight; delete-now cascade into storage/DB/queues/provider payloads/derived likenesses; consent on profile + purchase. Parity floor with the category is *published, enforceable windows*, not a promise of specific numbers.
- No use of customer child data to train general/public models (a product requirement confirmed via the provider data-use audit — F-025 — before any customer-facing claim); no public asset URLs; no "never-shared"/absolute guarantees beyond what we can enforce; staff access to photos default-denied (F-026).
- Provider audit: every external party touching child data documented before code + reviewed on change.

## 17. Observability

- Structured logs without child PII; error tracking with redaction.
- Product metrics (allow-list events, F-027) + **cost ledger** (book gen, image attempts, regenerations, QA, storage, print, shipping) so margins are measurable per order.
- Ops console answers "why is this book stuck?" via lineage view, no log spelunking (F-026).
- Alerting: queue stuck job, payment webhook gaps, print submission failures, QA-blocked books.

## 18. Deployment implications

- Monorepo recommended to start: `api` (domain + workers + adapters), `web` (customer app), `admin` (ops console), `shared` (canonical types/schemas). One deployable API service + worker service + web; later split on real load.
- Postgres managed; object storage managed; queue = durable execution substrate per the D014 spike (simplest-durable PostgreSQL-backed first candidate; Redis-backed/BullMQ-class second; workflow engine only if the spike justifies it — D019).
- CI: typecheck, lint, unit + integration, workflow E2E, visual regression for editor/reader, print-validation fixture tests.
- Env/config: strict secrets hygiene (AGENTS.md), provider keys in secrets manager, no keys in repo.
- Environments: staging mirrors production providers (rate-limited) + emulator/mock adapters for tests.

## 19. Migration strategy

- Greenfield: introduce stack incrementally along roadmap milestones (see `IMPLEMENTATION_ROADMAP.md`) — no data migration exists.
- **Do-first infrastructure (Milestone 0g, hidden):** git init, monorepo scaffold, Postgres schema + migration tooling, object storage, CI, provider-adapter skeleton, PF/store configs — so features land as vertical slices on working rails.
- Re-evaluate this document at each milestone with a decision-log entry (D-series) — especially Medusa adoption (self-hosted vs cloud), durable-execution substrate (spike), OpenPolotno wrapper, and print partner.

---

## Sign-off

Agreed = decision entries added to `DECISIONS.md` for each affirmative choice; dissenting evidence recorded in `RESEARCH_LOG.md`. This document is deliberately honest about the greenfield status — no existing code was re-described as if present.
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
| artifacts) |   +--------------+   +-----------+   | Moderation ·     |
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

(Medusa = self-hosted in `apps/commerce`, D006: it owns cart/order/payment/region state only; orders and payments live in Medusa's commerce tables, never in the canonical Book store.)

Key properties:

- **API owns the domain.** No client writes attend to canonical Book/children data directly.
- **Canonical stores in Postgres;** photos/illustrations/print artifacts in object storage referenced by IDs, not public URLs at rest. Orders/payments are Medusa's (§6).
- **Queue workers** run generation steps; state lives in DB; jobs idempotent/resumable (F-010, F-028).
- **Provider adapters** isolate every external dependency (see §8 below).
- **Event-style state recording** (not event sourcing): approved in D-series/guide §5: `BOOK_CREATED · CHARACTER_CREATED · CONCEPT_SELECTED · … · FULFILMENT_SUBMITTED`.

## 6. Commerce approach

**Medusa is ADOPTED as the commerce foundation (D006, re-opened and adopted 2026-09-22 — constraint change; see `RESEARCH_LOG.md` "D006 re-opening").** Self-hosted in-repo at `apps/commerce` (Postgres + Redis + server + worker; MIT; v2.21.0 verified) — not Medusa Cloud (D014 item 3). Since we are greenfield, adoption is a build decision, not a migration: no rewrite of any kind happens merely because Medusa exists.

**Domain boundary (hard line):**

- **Medusa owns commerce state only:** cart, payment, order, customer, promotion application, shipping/fulfilment state, region/currency/tax application, refunds — all first-class commerce-module state inside Medusa.
- **Stays OURS (never given to Medusa):** canonical Book model, BookRevision/ApprovedBookRevision, approval, generation pipeline, Character Bible, story, print pipeline (`PrintSpec`/`PrintArtifact`/`PrintProvider` submissions), digital library, privacy lineage. Medusa sits behind the API's commerce adapter, never as the domain centre.
- **Opaque references, hard invariant (Spike C proven 4/4, retained as the integration's semantic minimum):** every personalised cart line / order line carries exactly `approvedBookRevisionId` + `contentHash` (`revisionHash`) + `productFormatId` + `printSpecId` + `displayTitle` + `quantity` (+ non-sensitive ops metadata such as `recipientLabel`). Medusa **never** receives child profile/photos, story, page text, prompts, character bible, generated image URLs or sensitive personalisation facts. Direction: `order line → opaque ApprovedBookRevision → domain resolves the book`; the reverse (line item → book JSON) never exists. One approved revision may back **N** orders (reorders/gifts).
- **Personalisation recipe (documented Medusa pattern):** pointer data rides line-item `metadata`; richer commerce-side links use a custom module + module link if ever needed — never duplicated canonical content.

**State separation (Book vs commerce):** `BookStatus` is only the stable container lifecycle; editorial generation and approval are `BookRevision` states. Neither carries `ORDERED`/`IN_PRODUCTION`/`SHIPPED`/`DELIVERED`/`PAYMENT_FAILED`/`FULFILMENT_FAILED` (one approved revision → N orders makes a single Book-level "ordered" state meaningless; `_SPEC_GUIDE.md` §4 defines the three machines — book/revision, order, fulfilment). Order lifecycle lives in Medusa; fulfilment timeline (`FULFILMENT_SUBMITTED → IN_PRODUCTION → SHIPPED → DELIVERED`, exceptional failures) lives on the order/fulfilment projection sourced from Medusa + print-handoff events.

**Product modelling:** one catalogue Product ("Personalised Children's Book"); Variants = format/binding/size; a Line Item = one specific approved revision + format. Never one Product per generated book.

**Pricing vs print quote (§9/D016):** book content generation ≠ physical price. Customer price = Medusa product/region configuration; printer cost = a transient commerce-side `PrintQuote`; margin policy (F-027) maps cost → price offline. `PrintSpec` is canonical and frozen with the approved revision, while a purchased quote is snapshotted on the order. A live printer quote is never canonical Book state and never feeds Medusa pricing logic.

**Payment:** Medusa payment abstraction + first-party Stripe provider (inbound `/hooks/payment/{provider}_{id}` webhooks, validated; Apple/Google Pay via `automatic_payment_methods`). Capture is business-effect idempotent (§14); payment failure preserves the approved Book; retry never regenerates; no parallel payment state machine outside Medusa.

**Regions/tax (§11/§15):** architected now via Medusa Region + Tax modules (multi-currency, per-country tax regions/rates/rules, pluggable tax providers); **configured for the launch market only**; no custom tax engine ever.

**Promotions (§12):** Medusa promotion module only (rules/campaigns/budgets); the Book domain never knows about coupons; no custom coupon logic.

**Fulfilment split (§15):** Medusa owns commercial fulfilment state (shipping options, order fulfilled, tracking numbers); our `PrintProvider` adapter owns the printer handoff and receives only `PrintArtifact` + shipping payload + qty + provider options. Medusa OSS has no outbound webhooks → the book→print handoff is our own idempotent subscriber-side job (Spike C pattern, now by design); submission failure surfaces as fulfilment-failure ops alert (F-026), never as Book state.

**Events (§5):** commerce events (`ORDER_CREATED`, `PAYMENT_CAPTURED`, `FULFILMENT_SUBMITTED`, `SHIPMENT_CREATED`, …) are produced by Medusa subscribers (in-process; Local dev / Redis in production) and consumed behind our `CommerceEventAdapter` onto the API's commands + pg-boss job spine (D022). Duplicate delivery is expected: handlers are idempotent business-effect style (never exactly-once claims).

**Admin (F-026):** Medusa Admin (bundled, admin disabled on the worker instance) owns commerce ops — orders, payments, refunds, customers, promotions, products, regions, shipping. Our ops console owns Book/generation/QA/approved-revision/print-artifact/printer/privacy lineage. Cross-links by order id ↔ `approvedBookRevisionId`. No duplicate commerce screens in our console.

**Storefront (§10):** stays our headless `apps/web` against Medusa's Store API with a publishable key; the generic Next.js storefront starter is scaffolding, never the customer experience.

**Repository layout (D021 + this decision):**

```text
apps/commerce            — self-hosted Medusa backend (workspace member; own tsconfig/scripts,
                           excluded from root typecheck/test strictness; server + worker modes)
apps/web                 — customer storefront (headless, Store API)
apps/api · apps/worker   — For Little One domain API + generation workers
packages/commerce        — OUR boundary types only: CommerceGateway, ApprovedRevisionLineItemReference,
                           CommerceEventAdapter + ported Spike C invariant tests
                           (package created in the implementation PR, not this architecture PR)
```

**Incremental adoption (unchanged from the original plan, now the build plan):** land cart→checkout→payment→order first; regions/tax/promotions/advanced fulfilment configure later as markets open. Implementation starts in the follow-up PR `feat: establish Medusa commerce foundation` — scaffold, one product/one variant, cart, APPROVED-only opaque line item, sandbox checkout → order, idempotent duplicate-event tests; no production fulfilment in that PR.

**Why not rebuild (still true):** carts, tax, PSP integrations, refunds, multi-region shipping are well-trodden; our edge is identity+story+print, not payment plumbing. Spike C's self-built demo remains the honest comparison baseline — small and invariant-clean — but the constraint changed: we now choose the mature platform up front rather than growing into it.

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
└── status              (DRAFT … APPROVED + exceptional — content lifecycle only;
                         commerce/fulfilment states live on the order, never here — §6)
```

**Adapters** translate this into: editor snapshot (OpenPolotno JSON, per version), reader payload (pre-rendered images + text), print payload (PDF/PDF-X artifacts per printer), digital version.

- **Revision rule (F-016):** approval makes a deep-immutable snapshot with hash; print, order items, and reorder all bind to it. Edits always create a new revision; the approved one is byte-preserved.
- **Print contract (D016):** canonical **PrintSpec/PrintPreflightContract** defines stable format feasibility + geometry rules (trim/bleed/safe areas/DPI/fonts/page rules). Core QA (F-015), approval (F-016) and the editor (F-014) consume it; the print renderer (F-017) implements it. Provider capability is a printing integration concern and expiring quotes are commerce application data, so neither becomes canonical Book state. This keeps QA/approval off the renderer's critical path without conflating product configuration with live provider data.

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
| Books, profiles, jobs, events, print artifacts (refs), generation/provenance (ours) | Postgres (app DB) | JSONB for book domain docs; FKs for profiles; migration tooling from day 1 |
| Orders, payments, customers, carts, promotions, regions, shipping (commerce) | Medusa's commerce tables (Postgres — same managed cluster or dedicated DB, separate schema owned by `apps/commerce`) | Never joined into Book queries as canonical state; our side keeps only opaque order links (`orderId`, `approvedBookRevisionId`, `contentHash`) on the approval/order-link record |
| Photos, illustrations, print artifacts, PDFs | Object storage (S3-compatible) | Private; IDs in DB; short-lived signed URLs; lifecycle rules for retention |
| Prompt/model payloads? | none retained | Log only minimal metadata (no photo PII in logs) |
| Queues | pg-boss on the app's Postgres (D022 — ADOPTED; durable execution substrate) | Medusa's own jobs ride its worker process (Redis-backed event/cache modules in production). Book state and substrate must stay consistent via app-level idempotency; no exactly-once claims |
| Cache (later) | optional; not in v1 | skip until needed; Medusa's Redis is required infrastructure, not this cache row |

- Single region first; photo handling per provider data-processing terms documented (F-025).

## 13. Print pipeline

- Deterministic renderer (F-017): trim, bleed, safe areas, DPI/a, resolution validation, embedded fonts, cover+spine math, page-count rules, colour profile. Output PDF/PDF-X artifact per printer standard; adapted via `PrintProvider` (`validateArtifact · submitOrder · getOrderStatus · cancelOrder · getTracking`). It implements the shared **PrintSpec/PrintPreflightContract** (D016); live provider capability stays in the printing integration and quotes remain commerce data.
- **Never** browser screenshot (D005).
- Assets pre-flattened at print resolution from the approved revision; cache artifact tagged with `revisionHash`.
- **Determinism:** same `ApprovedBookRevision` + same `PrintSpec` → the same **visible/content output**. Compare via normalized artifact hash · content-manifest hash · per-page raster comparison · geometry validation report. Byte-identical PDF bytes are only required if the renderer also eliminates timestamps/random IDs (PDFs legitimately embed such values); that is a hardening option, not the launch guarantee (F-017 §14).

## 14. Payment/order flow

1. Checkout on **Medusa** (ADOPTED, D006): cart items each carry the opaque `approvedBookRevisionId` + `contentHash` (+ format/display/qty metadata) — Spike C invariant; server-side validation that the referenced revision exists and is `APPROVED` runs before any price is shown (F-018).
2. Estimate arrival before payment (transient commerce-side quote; snapshot the purchased quote onto the order).
3. Payment via Medusa's payment abstraction + Stripe provider; capture **business-effect idempotent**: Medusa workflow guards + our subscriber-side idempotent consumer → capture/order effects happen at most once per attempt; duplicate provider webhooks replay the stored result (at-least-once + idempotent handling — never claim exactly-once). Provider-crash uncertain-outcome cases go through reconciliation, not blind replay.
4. Success → Medusa order created → `ORDER_CREATED` emitted to our `CommerceEventAdapter` (book stays `APPROVED`); failure → payment failure state on the Medusa payment/order with clean retry; the approved Book is never mutated; no print pre-payment.
5. Order → fulfilment (below). Refunds/cancellations only via approved-revision-aware rules (F-026), executed in Medusa with our ops UI deep-linking.

## 15. Fulfilment

- On paid order (Medusa order state): submit approved artifact via `PrintProvider.submitOrder` (idempotent key = order+item+revision hash) → `FULFILMENT_SUBMITTED` → our subscriber marks the Medusa order fulfilled → status polls/callbacks → fulfilment timeline `IN_PRODUCTION → SHIPPED → DELIVERED` (states live on the **order/fulfilment projection**, never on the Book — §6).
- Medusa owns commercial fulfilment state (shipping options, carrier/tracking, order fulfilled); our adapter owns the printer handoff (artifact + shipping payload + qty + provider options only — no child/profile data).
- Digital copy disposition if purchased (deliver signed reader link).
- Fulfilment failure (print submission rejected/failed) → ops alert (F-026) + customer comms; recorded against the order/fulfilment projection, not as `BookStatus`; no double-ship (idempotency).

## 16. Privacy/deletion

- Trace every system: browser → signed private storage upload → server-side completion/validation → model provider → output → retention/deletion (mandatory; F-025 data inventory).
- Retention proposal (**PROPOSED — legal/product sign-off required before it goes live**): unsaved uploads ≤48h (draft); saved/order-adjacent photos ≤30 days unless order-in-flight; delete-now cascade into storage/DB/queues/provider payloads/derived likenesses; consent on profile + purchase. Parity floor with the category is *published, enforceable windows*, not a promise of specific numbers.
- No use of customer child data to train general/public models (a product requirement confirmed via the provider data-use audit — F-025 — before any customer-facing claim); no public asset URLs; no "never-shared"/absolute guarantees beyond what we can enforce; staff access to photos default-denied (F-026).
- Provider audit: every external party touching child data documented before code + reviewed on change.

## 17. Observability

- Structured logs without child PII; error tracking with redaction.
- Product metrics (allow-list events, F-027) + **cost ledger** (book gen, image attempts, regenerations, QA, storage, print, shipping) so margins are measurable per order.
- Ops console answers "why is this book stuck?" via lineage view, no log spelunking (F-026).
- Alerting: queue stuck job, payment webhook gaps, print submission failures, QA-blocked books.

## 18. Deployment implications

- Monorepo (D021): `apps/api` (domain commands/queries), `apps/worker` (generation workers on pg-boss), `apps/web` (customer storefront — headless against Medusa Store API), `apps/commerce` (self-hosted Medusa: `workerMode: server` for API+admin, `workerMode: worker` for jobs/subscribers; admin disabled on the worker instance), plus `packages/*`. Ops console rides the API's role-gated admin surface. Split further only on real load.
- Medusa adds operational surface by decision (D006): **Postgres + Redis required** (Redis for Medusa sessions + production event/cache/workflow/locking modules), two Medusa processes, all `@medusajs/*` bumped together with `medusa db:migrate` on release (minors can carry breaking changes). `apps/commerce` is isolated from the root typecheck/test strictness (own tsconfig/scripts) so the framework's conventions don't leak into our packages.
- Postgres managed; object storage managed; generation queue = pg-boss (D022).
- CI: typecheck, lint, unit + integration, workflow E2E, visual regression for editor/reader, print-validation fixture tests; commerce integration tests live with `apps/commerce`/`packages/commerce` (Spike C invariants ported).
- Env/config: strict secrets hygiene (AGENTS.md), provider keys (incl. Stripe `apiKey`/`webhookSecret`) in secrets manager, no keys in repo.
- Environments: staging mirrors production providers (rate-limited) + emulator/mock adapters for tests; Medusa sandbox mode for checkout E2E.

## 19. Migration strategy

- Greenfield: introduce stack incrementally along roadmap milestones (see `IMPLEMENTATION_ROADMAP.md`) — no data migration exists.
- **Do-first infrastructure (Milestone 0g, hidden):** git init, monorepo scaffold, Postgres schema + migration tooling, object storage, CI, provider-adapter skeleton, PF/store configs — so features land as vertical slices on working rails.
- Re-evaluate this document at each milestone with a decision-log entry (D-series) — durable-execution substrate (decided: D022 pg-boss), Medusa (decided: D006 ADOPTED, self-hosted), OpenPolotno wrapper (decided: D007 pin+wrap), print partner (Spike D: Mixam first, contract generic), quality-threshold calibration (still open).

---

## Sign-off

Agreed = decision entries added to `DECISIONS.md` for each affirmative choice; dissenting evidence recorded in `RESEARCH_LOG.md`. This document is deliberately honest about the greenfield status — no existing code was re-described as if present.

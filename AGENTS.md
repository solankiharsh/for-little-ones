# For Little One — Agent Instructions

## Project

For Little One is a personalised children's-book platform.

The long-term product should feel like:

> A small publishing studio that happens to know your child.

The product should make creating a personalised book extremely easy while producing a result that feels polished, consistent, safe and trustworthy.

---

## Read First

Before doing significant work, read:

- `project-spec-initial.md`
- `.planning/README.md`
- `.planning/DECISIONS.md`
- `.planning/OPEN_QUESTIONS.md`

Then read the relevant planning documents for the subsystem being changed.

---

## Current Phase

We are currently in:

> research → architecture → feature specification → milestone-0 foundation rails

Milestone-0 monorepo rails have explicitly begun (`packages/` + `apps/`, generation contracts, durable-execution contract, provenance, policy manifest — `DECISIONS.md` D021). The platform-foundation spikes (durable substrate, editor, commerce, print partner, QA threshold) run **in parallel** and are explicitly NOT blocked by the rails, and vice versa. (2026-09-22: durable substrate → pg-boss D022, editor → D007, commerce → Medusa D006 all resolved; print partner → first provider Mixam D020; QA-threshold calibration still open.)

Do NOT begin large-scale feature implementation (a spec feature end-to-end) until:

- the relevant blocking spikes have evidence, and
- the feature spec is promoted `agreed`.

Small throwaway/prototype spikes are allowed when necessary to validate architectural assumptions.

Examples:

- testing OpenPolotno capabilities;
- testing Medusa integration;
- testing print rendering;
- testing generation workflow behaviour.

Document conclusions from spikes before building production architecture around them.

---

## Core Working Rule

Do not rewrite working functionality merely because a cleaner architecture exists.

For every substantial change classify the current system as:

- KEEP
- MODIFY
- REPLACE
- ADD
- DEFER
- REJECT

Explain why.

Prefer incremental migration over greenfield rewrites.

---

## Research Discipline

Never describe repository behaviour based only on filenames.

Inspect the actual implementation.

When documenting current behaviour:

- cite exact source paths;
- cite important functions/classes/components where useful;
- distinguish observed behaviour from assumptions.

Use:

### Observed

Something directly verified in code, configuration, runtime behaviour or external documentation.

### Inferred

A reasonable conclusion that has not yet been directly verified.

### Decision needed

Something requiring product or architectural choice.

### Recommended experiment

A small test that can resolve uncertainty.

---

## Product Principles

Every proposed feature should answer at least one of these:

1. Does it make creating a book easier?
2. Does it make the result more personally meaningful?
3. Does it increase confidence that the printed book will be excellent?
4. Does it improve repeat usage or gifting?
5. Does it materially reduce reliability/support problems?

If not, deprioritise it.

---

## UX Principles

The user is usually an adult creating something for a child.

Design should feel:

- warm;
- premium;
- calm;
- magical;
- trustworthy;
- simple.

Avoid:

- generic SaaS-dashboard appearance;
- AI neon aesthetics;
- overly childish UI;
- exposing prompts/model terminology;
- Canva-level complexity during the normal creation journey.

The intended interaction model is:

> AI completes ~95% of the work; the parent corrects the remaining ~5%.

The normal flow should be simple.

Advanced editing should be an escape hatch, not the primary workflow.

---

## Important Product Requirements

The platform should eventually support:

- reusable child profiles;
- consistent characters across pages;
- personal facts that do not mutate;
- multiple family members/relationships;
- story concepts rather than blank prompting;
- generation progress and recovery;
- full book preview;
- page-level correction;
- character-wide correction;
- revisions;
- explicit approval before print;
- deterministic print rendering;
- commerce;
- fulfilment;
- order tracking;
- privacy/deletion controls;
- family story library.

Do not implement all of these simultaneously.

---

## Platform Decisions (ADOPTED / under evaluation)

Decisions marked **ADOPTED** are recorded in `DECISIONS.md` and binding; the rest remain candidates.

### Commerce

Foundation:

- Medusa — **ADOPTED (D006, 2026-09-22, re-opened on a constraint change)**; self-hosted at
  `apps/commerce` (Postgres + Redis + server + worker), boundary types in `packages/commerce`.

Use it for mature commerce primitives — cart, order, payment, promotion, tax, regions, shipping,
customer — and keep the boundary hard: Medusa owns **commerce state only**; the canonical Book,
approval, generation and print content stay in the For Little One domain, referenced by Medusa
only through opaque immutable identifiers (`approvedBookRevisionId` + `contentHash`).

Do not migrate or rewrite domain features merely because Medusa exists.

Do not put commerce or fulfilment states on `BookStatus` (one approved revision → N orders; see
`_SPEC_GUIDE.md` §4).

---

### Book Editor

Primary candidate:

- OpenPolotno / `@reyka/openpolotno`

Potential use:

> low-level editing engine underneath a custom For Little One interface.

Do NOT expose the complete generic design-editor UI to normal customers.

Do not make OpenPolotno JSON the canonical Book data model.

Wrap external editor implementations behind our own book/editor domain.

---

### IMG.LY Photobook Starter

Use as:

- UX reference;
- page-navigation reference;
- editor-state architecture reference.

Do not adopt CE.SDK automatically.

---

### Postiz

Do NOT use Postiz as the application's foundation.

Useful only as architectural inspiration for:

- jobs;
- retries;
- observability;
- integrations;
- workflow organisation.

---

## Canonical Data Principle

Our domain model must remain independent from:

- image-generation provider;
- text-generation provider;
- editor engine;
- print provider;
- payment provider.

Conceptually:

Book
├── metadata
├── characters
├── relationships
├── story
├── pages
├── revisions
├── print specification
└── approval

Adapters may translate this model into:

- editor representation;
- browser reader representation;
- print representation;
- external provider requests.

---

## Reliability

Do not implement generation as:

button → long request → spinner → hope.

Long-running work should eventually be:

- persisted;
- restartable;
- retryable;
- observable;
- resumable where practical;
- idempotent where appropriate.

Refreshing the browser must not destroy important generation state.

A single-page failure should not require regenerating an entire book.

---

## Child Data

This application handles children's images and personal information.

Treat privacy as a product requirement.

Never unnecessarily:

- log children's photos;
- log sensitive profile information;
- expose assets publicly;
- send data to additional providers;
- retain uploads indefinitely.

Every provider touching child data must eventually be documented.

---

## Printing

Never treat browser screenshots as the production print pipeline.

Print generation needs deterministic handling of:

- dimensions;
- bleed;
- safe areas;
- DPI;
- image resolution;
- fonts;
- covers;
- spine;
- page-count requirements;
- printer-specific validation.

Orders must reference an immutable approved book revision.

---

## Documentation

Planning documentation lives under:

`.planning/`

Keep documentation current when architectural decisions change.

Do not create large amounts of speculative documentation that does not help implementation.

---

## Repository Layout & Dependency Direction (D021)

The monorepo is `apps/` + `packages/` (npm workspaces). Dependency direction is load-bearing and typecheck-enforced:

```text
apps → domain/(providers) → contracts → (nothing)
adapters (providers) → contracts
contracts must NEVER depend on adapters or apps
execution / provenance / policies / storage are foundational: no feature dependencies
```

- `packages/domain` — canonical Book/Child/PrintSpec model (D004, D016) and `GenerationStep` units.
- `packages/contracts` — canonical generation contracts (`GENERATION_ARCHITECTURE.md` §3), strict zod schemas, literal `schemaVersion`; provider payloads never leak past adapters.
- `packages/execution` — `DurableExecutionContract` (D019). The `InMemoryDurableRuntime` is for tests/staging only — it must never be used as a production substrate.
- `packages/providers` — provider boundaries (Story/Illustration/Identity/Quality/Moderation); each must carry a `ProviderCard` documenting child-data path, retention, idempotency, timeout, retry, cost and deletion before it may receive data.
- `packages/provenance` + `packages/policies` — immutable `GenerationProvenance` + policy-set manifest/hash (mirrors `policies/MANIFEST.md`).
- `packages/storage` — private-storage contract only (owner-scoped, signed expiring URLs); no implementation yet. Upload topology (D017) still open.
- `packages/testing` — shared fakes live here, next to the seams they satisfy.
- `apps/commerce` (D006 — planned with the Medusa foundation PR) — self-hosted Medusa backend; isolated
  from root typecheck/test strictness (own tsconfig/scripts); commerce state only.
- `packages/commerce` (D006 — planned) — OUR boundary types only (`CommerceGateway`,
  `ApprovedRevisionLineItemReference`, `CommerceEventAdapter`) + Spike C invariant tests ported; must
  never import Medusa internals.

Before committing: `npm run typecheck` and `npm test` must be green. Add generation code to `packages/` first; keep `contracts` free of adapter/app imports.

---

## Before Major Implementation

We should have at least:

- codebase map;
- market conclusions;
- platform evaluation;
- feature map;
- core feature specifications;
- architecture proposal;
- implementation roadmap.

Only then should large production implementation begin.
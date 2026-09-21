# PROJECT_SPIKES — Platform-Foundation Spike Programme

**Status: PLAN — specification only.** This PR defines the spike programme and its isolation layout. It contains **no** spike implementations, fixtures, or measured results — those land in subsequent isolated spike PRs (see [PR sequence](#pr-sequence)). It does **not** build production features and it does **not** claim to validate any platform choice.

This PR defines the programme used to replace open assumptions with measured evidence. The experiments and their results land in subsequent isolated spike PRs.

## Ground rules

- **No production features.** Everything is a small, disposable experiment or clearly isolated under a `spike/` directory.
- **No unrelated/reference projects or naming.** Do not cite or name any project other than the candidates this programme is tasked to evaluate.
- **No exactly-once execution claims** for any durable-job substrate, anywhere.
- **No silent promotion.** A platform candidate is never silently treated as selected; adoption/rejection is a decision that follows measured evidence.
- **Record every result** in `.planning/RESEARCH_LOG.md`, and **record every decision (or explicit `OPEN`)** in `.planning/DECISIONS.md`. `OPEN` beats a fake decision.

## Spike isolation model

Each spike runs in its own directory under `spike/`:

```text
spike/
├── durable-execution/ ← Spike A  (PostgreSQL-native job implementation vs Redis-backed queue)
├── editor-primitive/  ← Spike B  (D007 candidate editor against a real children's-book spread)
├── commerce/          ← Spike C  (D006 candidate vs minimal self-built commerce surface)
├── print-pipeline/    ← Spike D  (one realistic production print provider + generic PrintSpec renderer)
└── identity-qa/       ← Spike E  (identity generation vs identity detection; no invented thresholds)
```

- Experiments are **small** and **throwaway**. A spike may be deleted once its evidence is captured in `RESEARCH_LOG.md`.
- Anything large, generated, or credential-bearing must be added to `.gitignore`, never committed.
- No spike code may leak into `api/`, `web/`, `shared/`, or any production path (none exist yet — keep it that way).

---

## Spike A — Durable execution

**Candidate context:** D019 defines the `DurableExecutionContract` (enqueue work · durable state · per-unit state · lease/reclaim · retry · cancellation · idempotency/business-operation key · progress observation) as the foundational contract F-028 patterns and F-010's runtime implement. The experiment must **implement that contract** — it must not invent another orchestration contract.

**Initial candidates to evaluate (candidates only — not selections):**

1. A mature **PostgreSQL-native** job implementation (e.g. Graphile Worker, `pg-boss`): Postgres as the durable store, `LISTEN/NOTIFY` delivery, SQL-driven job lifecycle.
2. A mature **Redis-backed** queue implementation (e.g. BullMQ): Redis durability + outbox/reconciliation implications.

A workflow engine is considered **only if** the evidence shows its guarantees (durable execution of multi-step graphs, sagas) are actually needed — per D019/D014 it stays out of the candidate pair otherwise.

**Primary scenario (must pass identically on both candidates):**

```text
story step succeeds
↓
8 page jobs created
↓
pages 1–4 succeed
↓
page 5 provider call starts
↓
worker dies
↓
new worker starts
↓
state is reconciled
↓
page 5 is recovered safely
↓
pages 1–4 never rerun
↓
pages 6–8 continue
```

**Uncertain external outcome (must be exercised explicitly, documented per candidate):**

```text
provider accepted request
↓
worker died before local result commit
```

The candidate must show what happens to that page (retry → provider idempotency key, dead-letter, or manual reconcile) and document **what it can and cannot guarantee** — never "exactly-once".

**Measure and record:** dependency footprint · lease semantics · retries · delayed retries · concurrency limits · cancellation · job inspection · idempotency · transaction/outbox needs · restart recovery · operational burden (deploy, dashboards, migrations).

**Decision to resolve:** durable job substrate (candidate ADOPT/REJECT, or remain OPEN).

---

## Spike B — Editor

**Candidate context:** test the **current candidate editor implementation from D007** (`OpenPolotno` / `@reyka/openpolotno`) against a real children's-book spread at intended book dimensions — not a demo canvas.

**Build a minimal artifact for:**
- cover;
- two-page spread;
- image;
- text;
- bleed/safe-area overlays;
- a custom toolbar action (something our product foreman would actually need, e.g. "clear face from text zone").

**Acceptance path (must round-trip):**

```text
Canonical Book
→ editor adapter
→ editor snapshot
→ user edit
→ canonical command/change
→ discard snapshot
→ rebuild editor snapshot
→ same visible result
```

The editor snapshot must **never become canonical state**; the canonical model (D004) stays the source of truth and the adapter is the only translation boundary.

**Evidence, not impressions.** Record measurable results for:
- arbitrary print dimensions;
- multipage support;
- spread UX;
- serialization/restoration fidelity (the round-trip above);
- fonts;
- crop/mask;
- undo/redo;
- **bundle size** (measured bytes, not "seems heavy");
- **mobile usability** (measured: touch-target sizes, interaction latency, usable viewport behaviour on a phone-sized surface);
- custom controls (the toolbar action above);
- canonical-model adapter feasibility.

**Posture to decide:** depend directly · pin · wrap · maintain an internal fork · reject (D007 resolved with evidence).

---

## Spike C — Commerce

**Candidate context:** evaluate the **current D006 candidate** (Medusa) **and** the alternative of implementing only our initially required commerce surface ourselves. The spike must answer:

> Does adopting the commerce platform reduce total risk enough to justify its operational/domain complexity?

Building a cart is not proof — compare end-to-end risk (payment, tax, shipping, webhooks, refunds, multi-region) for the vendor path vs the self-build path at our actual expected scale.

**Demo path (minimal, sandboxed):**

```text
ApprovedBookRevision fixture
→ cart line
→ format/SKU
→ price
→ payment sandbox
→ order
→ opaque revision reference preserved
```

**Hard invariant to validate:**

```text
CommerceOrderItem
→ opaque approvedBookRevisionId
```

Commerce must **never** need (or receive) child, story, page, or character data. An order references an approved revision by opaque id and hash only; commerce never owns or mutates the Book.

**Verify and record:** personalised-metadata handling · product/variant model fit · cart lifecycle · payment lifecycle · idempotency support (duplicate webhook/payment handling) · multi-address/multi-item implications · shipping method integration · tax architecture · webhook behaviour · order-metadata limits · fulfilment extension points · operational footprint (hosting, upgrades, migrations).

**Decision to resolve:** commerce adoption or rejection (or OPEN).

---

## Spike D — Printing

**Candidate context:** research **at least one realistic production print provider** and record its **actual current** requirements (their live spec — trim, bleed, safe areas, binding, cover/spine, fonts, colour, PDF version/profile, image resolution, shipping/fulfilment payload). Do not rely on a fictional generic printer unless no real provider is usable for the experiment.

**Renderer posture:**

```text
generic PrintSpec / PrintPreflightContract (D016)
        ↓
F-017-style deterministic renderer (no browser screenshots — D005)
        ↓
provider-specific validation adapter
        ↓
provable artifact
```

Build the renderer against **our generic `PrintSpec`**; provider-specific rules live in the adapter, so changing only the editor implementation never changes the print-domain contract.

**Deliverable:** produce **one real sample PDF** generated deterministically from fixture Book data, and record its measured properties (page count, trim/bleed/safe compliance, image resolution, PDF profile, fonts embedded).

**Decision to resolve:** first print provider + print contract (or OPEN).

---

## Spike E — Identity and visual QA

Separate two questions — **do not assume the same provider solves both:**

1. **Can we generate consistent identity?** (identity-conditioned illustration output)
2. **Can we reliably detect bad identity?** (independent likeness/QA evaluation)

The evaluation report must clearly distinguish, per approach:

- **generation capability** — multi-reference-photo support, provider-native identity/reference conditioning, reusable private provider reference feasibility;
- **identity-reference mechanism** — what the conditioning actually is, and whether raw reference photos are needed on every page generation;
- **independent evaluation capability** — what measurable identity score/check exists, and whether an independent vision evaluator agrees with human review often enough to be useful (the QA-approach question);
- **privacy/data path** — retention/data-use terms, payload content, deletion;
- **cost**;
- **latency**;
- **failure cases** — what breaks identity (angle, lighting, expression, occlusion) and how it surfaces.

**Do not invent a numerical launch threshold before evidence exists.** Produce an evaluation methodology and preliminary findings; thresholding calibration is a later, evidence-driven step (F-009 §10). Use only data that is appropriate and authorised for testing.

**Decisions to resolve:** identity-generation approach; QA approach (or OPEN).

---

## Result format (standard)

Every spike PR must record its outcome using this template, filling every field:

```md
### Result

Status:
PASS | FAIL | INCONCLUSIVE

Candidates tested:

Measurements:

Observed strengths:

Observed failures:

Operational cost:

Privacy/data implications:

Decision:
ADOPT | REJECT | KEEP OPEN

Decision rationale:

Production consequences:

Follow-up:
```

## PR sequence

Experiments and their evidence land in subsequent isolated spike PRs:

```text
PR #5 — durable execution spike
PR #6 — editor spike
PR #7 — commerce spike
PR #8 — print spike
PR #9 — identity/QA spike
```

Numbers may differ if GitHub assigns others.

Each spike PR independently updates `.planning/RESEARCH_LOG.md` (results) and `.planning/DECISIONS.md` (decision or `OPEN`) for its own scope. Do **not** wait for all five before recording evidence from one — each closes (or keeps open) its exit-criterion item as soon as its results exist.

---

## Exit criteria

Before the platform-foundation spike programme is complete, and before dependent production implementations begin, each exit-criterion decision must be **resolved or explicitly remain `OPEN`**:

1. durable job substrate;
2. editor implementation posture;
3. commerce adoption/rejection;
4. first print provider + print contract;
5. identity-generation approach;
6. QA approach;
7. storage upload topology (D017).

**When the spike programme is complete**, `DECISIONS.md` must resolve or explicitly leave `OPEN` each item above. If evidence is insufficient, record `OPEN` — never a fake decision. See the current state of all seven in `DECISIONS.md` (D020).
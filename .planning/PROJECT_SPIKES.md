# PROJECT_SPIKES — Platform-Foundation Validation

**Status: PLAN — specification only.** This PR is the plan and directory layout; it includes no spike implementations, fixtures, or validation results. The spikes run in follow-up sessions and their evidence is recorded here in `.planning/RESEARCH_LOG.md` and `.planning/DECISIONS.md`. Until then every exit-criterion item below is `OPEN` (DECISIONS.md D020).

This PR exists to replace assumptions with evidence.

Do not build production features.

Do not mention any unrelated/reference project or its naming.

All experiments must be small, disposable or clearly isolated under a spike directory.

Record every result in:

`.planning/RESEARCH_LOG.md`

and every resulting decision in:

`.planning/DECISIONS.md`.

## Spike A — Durable jobs

Compare at least:

1. a mature PostgreSQL-backed job approach;
2. a mature Redis-backed queue approach.

Test the actual required scenario:

```text
book job
→ story step
→ N page jobs
→ one page fails
→ worker killed
→ process restarted
→ failed page retried
→ completed pages remain unchanged
```

Measure/document:

- dependency footprint;
- lease semantics;
- retries;
- delayed retries;
- concurrency limits;
- cancellation;
- job inspection;
- idempotency;
- transaction/outbox needs;
- restart recovery;
- operational burden.

Do not claim exactly-once execution.

Recommendation must be evidence-based.

---

## Spike B — Editor primitive

Test the candidate editor against an actual children's-book spread.

Create a minimal:

- cover;
- two-page spread;
- image;
- text;
- bleed/safe-area overlays;
- custom toolbar action.

Verify:

- arbitrary print dimensions;
- multipage support;
- spread UX;
- serialization/restoration;
- fonts;
- crop/mask;
- undo/redo;
- mobile behaviour;
- bundle size;
- custom controls;
- canonical-model adapter feasibility.

Test:

```text
canonical Book page
→ editor snapshot
→ user moves/resizes allowed elements
→ commit operation
→ canonical Book change
→ reconstruct snapshot
```

The editor snapshot must not become canonical.

Record whether we should:

- depend directly;
- pin;
- wrap;
- maintain an internal fork;
- reject.

---

## Spike C — Commerce

Validate the commerce candidate without adopting it prematurely.

Build only enough to demonstrate:

```text
ApprovedBookRevision fixture
→ cart line
→ format/SKU
→ price
→ payment sandbox
→ order
→ opaque revision reference preserved
```

Verify:

- personalised metadata;
- product/variant model;
- cart lifecycle;
- payment lifecycle;
- idempotency support;
- multi-address/multi-item implications;
- shipping method integration;
- tax architecture;
- webhook behaviour;
- order metadata limits;
- fulfilment extension points;
- operational footprint.

Most important invariant:

> Commerce may reference an approved revision but may never own or mutate the Book.

---

## Spike D — Print pipeline

Choose one realistic print partner or a faithful local contract fixture.

Determine actual requirements for:

- trim;
- bleed;
- safe area;
- page count;
- binding;
- cover;
- spine;
- fonts;
- colour;
- PDF version/profile;
- image resolution;
- shipping/fulfilment payload.

Generate one deterministic sample artifact from fixture Book data.

Do not use browser screenshots.

Verify that changing only the editor implementation would not change the print-domain contract.

---

## Spike E — Identity + visual QA feasibility

Test provider capabilities before inventing thresholds.

Questions:

- Can the selected image-generation approach use several reference photos?
- Does it provide provider-native identity/reference conditioning?
- Must raw reference photos be sent on every page generation?
- Can a reusable private provider reference be created?
- What retention/data-use terms apply?
- What measurable identity score/check is actually available?
- Does an independent vision evaluator agree with human review often enough to be useful?

Do not choose a numerical launch threshold in advance.

Produce an evaluation methodology and preliminary findings.

Use only data that is appropriate and authorised for testing.

---

## Exit criteria

At the end of this PR, `DECISIONS.md` must resolve or explicitly leave open:

- durable job substrate;
- editor implementation posture;
- commerce adoption/rejection;
- first print provider + print contract;
- identity-generation approach;
- QA approach;
- storage upload topology.

If evidence is insufficient, record `OPEN`, not a fake decision.
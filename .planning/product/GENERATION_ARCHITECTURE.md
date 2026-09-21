# Generation Architecture — Structured, Stage-Based, Independently Evaluated

> Accepted architectural invariant (D018). Provider/model choices remain replaceable implementation decisions.
> Companion: [`GENERATION_PROVENANCE.md`](./GENERATION_PROVENANCE.md) · policy files: [`/policies](../../policies/) · implemented across F-005, F-007, F-008, F-009, F-010, F-012, F-013, F-015, F-028.

## 1. Principles

> Code owns control flow and invariants. Models perform bounded judgement/generation tasks.

> Every structured model stage has a typed input and schema-validated output.

> Generated output is independently evaluated before being considered production-ready.

> Every generated artifact is traceable to the exact policy/model/config versions that created it.

These four statements are the load-bearing contract for every generation path in the product. A stage that violates them is a defect, not a style preference.

## 2. Deterministic orchestration

Generation is decomposed into explicit stages with the pipeline defined in code, not inside a model call. The target conceptual pipeline:

```text
Input validation
↓
Character/profile preparation
↓
Story concepts
↓
Story outline
↓
Page plans
↓
Page text
↓
Illustration plans
↓
Illustration generation
↓
Quality evaluation
↓
Book assembly
↓
Book QA
↓
Ready for review
```

Mapping to feature specs:

| Pipeline stage | Owner | Notes |
| --- | --- | --- |
| Input validation | F-003, F-004, F-006 | photo/named-entity/facts validation before any model call |
| Character/profile preparation | F-005 | Character Bible + `IdentityProvider` reference derivation |
| Story concepts | F-007 | `StoryProvider.generateConcepts` |
| Story outline | F-008 | `OUTLINE` step gate; nothing downstream runs on failure |
| Page plans | F-008 | page segmentation derived deterministically (no model call) |
| Page text | F-008 | `PAGE_TEXT` per-page step |
| Illustration plans | F-009 | `ILLUSTRATION_PLAN` deterministic derivation |
| Illustration generation | F-009 | `ILLUSTRATION` per page; identity-conditioned |
| Quality evaluation | F-009/F-015 | generation and acceptance are separate responsibilities (§4) |
| Book assembly | F-011/F-010 | canonical assembly, revision write |
| Book QA | F-015 | deterministic + model-assisted catalogue |
| Ready for review | F-010/F-016 | must fail closed (F-028 §9) |

Not every stage needs a separate model call. Splitting a stage is justified only where it buys us at least one of:

- **validation** — a gate that prevents bad input reaching an expensive step;
- **retryability** — a unit that can fail and re-run in isolation;
- **independent correction** — a unit a parent or operator can repair alone;
- **observability** — a boundary that produces a legible event/state;
- **cost control** — a cheap step that avoids paying for an expensive one;
- **reuse** — a stage re-entered by another path (F-012/F-013) without rebuilding neighbours.

Unsplit any two adjacent stages whose separation buys nothing.

### Control flow lives in application code

The orchestration state machine is normal application code / workflow state (F-010 `GenerationJob` + step rows). Models never decide:

- approval state;
- order state;
- access permissions;
- page count rules;
- retention;
- print geometry;
- retry budgets;
- payment state.

Each of these is owned by a deterministic subsystem (respectively F-016, F-018, F-001, F-017/D016, F-025, F-017/D016, F-028/F-009 attempt budgets, F-018). A model output that attempts to influence any of these is schema-rejected before it reaches canonical state.

## 3. Typed model contracts

Every structured model stage has explicit request/result types. Canonical contract names (provider-neutral, versioned):

```text
ConceptRequest / ConceptResult                (F-007)
StoryOutlineRequest / StoryOutlineResult      (F-008)
PagePlan                                      (F-008, deterministic)
PageTextRequest / PageTextResult              (F-008)
IllustrationPlan / IllustrationResult         (F-009)
QualityEvaluationRequest / QualityEvaluationResult   (F-015)
```

Rules:

- **Runtime schema validation.** Parsing is done by the agreed runtime schema system (TypeScript: zod or the repo-agreed equivalent, chosen at M0 with the stack). No `JSON.parse` + guesswork on production structured stages.
- **Validation failure is explicit.** Unknown/missing/mistyped fields fail the stage with a typed, structured error — never a silent best-effort fix.
- **Schema version recorded.** Every result carries `schemaVersion`; readers dispatch on it so a field rename is a migration, not a silent break.
- **Invalid output never becomes canonical state.** A result that fails validation produces `FAILED` at that step; nothing is written to the Book.
- **Provider-specific response types stay inside adapters.** The adapter maps a vendor's payload to our canonical contract; vendor fields never leak past the adapter boundary.

## 4. Provider interfaces

Generic, responsibility-sized interfaces isolate the genuine provider-replacement boundaries. Do not over-abstract tiny implementation details.

```text
StoryProvider        — text: concepts, outline, page text
IllustrationProvider — image generation from a validated IllustrationPlan
IdentityProvider     — identity reference derivation + likeness scoring inputs
QualityProvider      — structured quality evaluation (see §4 of this doc / F-015)
ModerationProvider   — safety/content screening
```

Every provider interface definition must document, per provider:

- **payload sent** — the exact typed input;
- **whether child photos are sent** — and, if so, why and in what form (see §11);
- **provider retention/data-use terms**;
- **supported idempotency/request IDs** — how a retried call avoids duplicates;
- **timeout;**
- **retry semantics** — which statuses are retryable, backoff expectations;
- **cost metadata returned** — costCents/units surfaced into `generationMetadata`;
- **deletion capability if relevant** — delete API or documented fallback (F-025 provider audit).

Adapters hold provider-specific types; the canonical contracts in §3 never do.

## 5. Independent quality evaluation

Generation and acceptance are different responsibilities and must not live in one call.

```text
IllustrationProvider
        ↓
generated asset
        ↓
QualityProvider
        ↓
structured findings
```

A quality evaluation combines:

**Deterministic checks (code, binary):**
- file decodes;
- size/resolution;
- aspect ratio;
- expected asset exists;
- text/name exact matching where code can do it (names, pronouns, facts);
- print geometry (against the shared PrintSpec/PreflightContract, D016);
- known character count metadata.

**Model-assisted checks (scored, thresholded):**
- visual likeness;
- character swap;
- obvious rendering artifacts;
- scene/brief correspondence;
- narrative contradiction where deterministic logic cannot decide.

A quality evaluator **never mutates canonical facts**. Its output is findings; correction is a separate command path (F-012/F-013).

## 6. Generation provenance

Each generated artifact/revision carries an immutable `GenerationProvenance` record (fields and rules in [`GENERATION_PROVENANCE.md`](./GENERATION_PROVENANCE.md)). Its purpose is to answer, for any page, at any later time:

> What exact generation configuration produced this page?

Provenance is not an audit-log luxury: it is what makes identity QA, regression analysis, cost attribution and support reproduction possible.

## 7. Version-controlled product policies

Product behaviour that guides generation lives in the versioned [`/policies`](../../policies/) directory:

```text
policies/
  age/            — reading-age guidance (word counts, tone, lengths per band)
  story/          — story-tone guidance (emotional arcs, pacing defaults)
  localisation/   — en-GB/en-US vocabulary map, measurement/language rules
  illustration/   — illustration style guidance (palette, motifs, safety steer)
  safety/         — content/safety rules and moderation thresholds
```

These files are **product policy, not magical prompts**. They must NOT contain:

- customer child data;
- copied proprietary prompt material;
- provider secrets;
- source-project naming.

The policy set used for a generation is versioned and hashed (§3 of GENERATION_PROVENANCE). A policy change is a configuration change with provenance impact, not a code change.

## 8. Composable pipeline entry points

One stage architecture serves every entry path; none duplicate the pipeline:

```text
new book                    → starts near the beginning (F-007 concepts)
rewrite page text           → starts at the page-text stage (F-012)
regenerate illustration     → starts at the illustration stage (F-012)
global character correction → updates character version → computes affected pages
                              → re-enters illustration stages for affected pages only (F-013)
re-run QA                   → starts at the quality stage (F-015)
```

A stage is re-entrant by its idempotency key (§ F-008 `pageKey`, F-009 `planKey`); starting mid-pipeline never rebuilds earlier `READY` stages.

## 9. Failure isolation

A unit failure stays local whenever possible:

```text
page 1 READY
page 2 READY
page 3 FAILED
page 4 READY
```

Retrying page 3 must not regenerate pages 1, 2 or 4. Stage/unit state is explicit (F-010 `JobStep` + `BookUnitState`; F-028 acceptance library). There is no full-book restart because one illustration call failed.

## 10. Fail closed vs graceful degradation

F-028/§9 codifies which failures stop the path. In brief:

**Fail closed** (must stop/block):
- invalid structured model output (schema failure);
- authorization uncertainty;
- missing approved revision;
- corrupt print asset;
- mandatory QA unavailable (`UNKNOWN` QA, never silent PASS — F-015);
- unsafe/invalid print geometry.

**Graceful degradation** (proceed without):
- nonessential recommendation unavailable;
- analytics unavailable;
- optional enrichment unavailable.

The distinction is explicit in code and contracts: a capability is classified at its definition; fail-closed capabilities gate approval/order; degraded capabilities never block the happy path.

## 11. Typography remains deterministic

AI image output does not own final book typography. Illustration providers create illustrations; rendering code owns:

- text content;
- font;
- line breaks;
- safe area;
- page geometry;
- print export.

F-009's `IllustrationPlan.layoutHint` keeps faces clear of text zones as a *steer*; the final text placement is the deterministic F-017 rendering system, never the model. This is why browser screenshots are not a production pipeline (AGENTS.md printing).

## 12. Privacy rule

No new provider may receive child data until its data path is documented. For every provider touching child data record:

```text
what is sent
why it is necessary
retention
data-use/training terms
region if relevant
delete mechanism
fallback if deletion API does not exist
```

(The provider audit lives in F-025; each provider interface in this repo documents the subset above at its definition.) Child source photos are never exposed via permanent public URLs — private storage, signed expiring URLs only (F-004/F-009 §12).

## 13. Status

- **Accepted invariant (D018):** structured, stage-based, independently evaluated generation. Provider/model choices: replaceable implementation decisions.
- **Owner of the stage graph:** this document + `_SPEC_GUIDE.md` §5 (execution model).
- **Deviations:** any future change that collapses two stages, merges generation into acceptance, or moves control flow into a model call must be recorded as a decision in `DECISIONS.md` and a `RESEARCH_LOG.md` entry first.
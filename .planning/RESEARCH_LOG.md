# Research Log

Record meaningful research and technical experiments here.

Use newest entries first.

---

### 2026-09-21 — Structured, Stage-Based, Independently Evaluated Generation (Invariant)

**Question**

How do we keep AI generation reliable, repairable, traceable and provider-neutral as a
greenfield, without trusting any single model call to own the outcome?

**Sources / code inspected**

- `.planning/features/08_STORY_GENERATION.md`, `09_ILLUSTRATION_GENERATION.md`, `10_GENERATION_PROGRESS.md`, `15_BOOK_QA.md`, `28_FAILURE_RECOVERY.md` (existing step/QA/recovery design)
- `product/GENERATION_ARCHITECTURE.md`, `product/GENERATION_PROVENANCE.md` (new)
- `policies/` skeleton + `MANIFEST.md` (new)

**Observed**

- The existing docs already split plan/step units and scheduled regeneration but did not
  codify the general invariant: typed contracts with runtime schema validation, code-owned
  control flow, independent evaluation, immutable provenance, fail-closed classification,
  or versioned/hashable product policies. Provider interfaces were still named after
  "XxxModel" in places. No prompt library or copied proprietary material exists in the
  workspace; the design is native and must stay that way (no source-project naming).

**Conclusion**

- Accept D018: structured, stage-based, independently evaluated generation is an invariant.
  Code owns control flow and invariants; models perform bounded judgement tasks; generated
  output is independently evaluated; every artifact carries `GenerationProvenance`.
- Provide via generic `StoryProvider / IllustrationProvider / IdentityProvider /
  QualityProvider / ModerationProvider` interfaces; canonical contracts
  (`StoryOutlineResult`, `PageTextResult`, `IllustrationPlan/Result`,
  `QualityEvaluationRequest/Result`) validated at runtime with `schemaVersion`.
- Fail closed (invalid structured output, auth uncertainty, missing approved revision,
  corrupt print asset, mandatory QA unavailable, unsafe geometry) vs graceful degradation
  (nonessential/analytics/optional enrichment) is explicit code, never vibes.
- Product guidance lives in versioned `/policies` sets (`text.v1`, `illustration.v1`,
  `qa.v1`) recorded by `policySetVersion` + content `policyHash` in provenance.

**Impact**

- architecture (pipeline conventions, provenance, provider boundary naming);
- dependencies (M0 now includes contract + provenance + policy-set scaffolding);
- docs (F-005/F-008/F-009/F-010/F-012/F-013/F-015/F-028, architecture diagram, roadmap).

**Follow-up**

- Calibrated identity threshold experiment (F-009 §10) and queue-substrate spike (D014)
  still launch-blocking; launch calibration may shift drafting policy values, versioned per
  manifest rules.

---

## Entry Template

### YYYY-MM-DD — Topic

**Question**

What were we trying to determine?

**Sources / code inspected**

- source
- repository path
- documentation

**Observed**

What was directly verified?

**Conclusion**

What do we currently believe?

**Impact**

Does this change:

- product;
- architecture;
- priority;
- dependencies;
- implementation?

**Follow-up**

What remains unresolved?

---

# Entries

## 2026-09-21 — planning docs — Dependency-cycle and launch-invariant reconciliation

**Question**

When mapping the P0 "reason to exist" features and the milestone plan, the feature dependency graph contained a cycle (QA ⇄ prints ⇄ editor ⇄ approval), and several specs asserted premature or brittle invariants (selected platforms before spikes, photon-count/score thresholds, byte-identical determinism, exactly-once webhooks, absolute privacy promises, unreconciled severity vocabulary). Which corrections make the planning docs internally consistent before implementation?

**Sources / code inspected**

All planning docs and feature specs under `.planning/`:
`DECISIONS.md`, `PRODUCT_ARCHITECTURE_V2.md`, `IMPLEMENTATION_ROADMAP.md`, `FEATURE_SPEC_SUMMARY.md`, `features/00_FEATURE_MAP.md`, `features/_SPEC_GUIDE.md`, and the 25 feature specs (01–31), plus `project-spec-initial.md`.

**Observed**

- F-015/F-016/F-017/F-014 referenced each other as prerequisite geometry/print contracts, forming a cycle with no owner of the print-geometry rules.
- Commerce (D006), editor (D007) and the durable-workflow substrate were written as decisions already made, though D014 marked them pending spike; some docs still used "BullMQ+pg", "DB-backed (default)" or "adopted Medusa" phrasing.
- Fixed numerical invariants appeared where the plan calls for calibration or decision: identity threshold `0.75`, "~50 faces", "byte-identical PDF", retention "48 hours"/"30 days", "exactly-once" webhook/payment semantics, QA severity `BLOCKING` with no REVIEW_REQUIRED tier, and F-025/28 priority P1.
- Privacy copy asserted "never shared" and fixed retention in user-facing string constants.
- Reference-project names leaked from research context into product source/docs (a breach of the user's naming rule).

**Conclusion**

- Introduce a **shared PrintSpec/PrintPreflightContract** owned by the canonical model (D016): Canonical Book/Layout → PrintSpec/Preflight → Core QA (F-015) → Approval (F-016) → ApprovedBookRevision → Print Renderer (F-017) → Print Artifact → Fulfilment (F-019). The cycle is broken; F-017 and F-014 are parallel over the contract; F-017 no longer depends on F-014.
- Platform decisions stay open until spiked (D006/D007/D014): Medusa = candidate pending spike; OpenPolotno = candidate implementation pending spike; durable workflow = simplest durable solution preferred, two candidate classes.
- Quality severities become `HARD_BLOCK` (print-geometry sub-category never overridable) / `REVIEW_REQUIRED` / `ADVISORY`, with a calibration methodology replacing baked thresholds.
- Determinism is content-level, not byte-level by default; idempotency is business-effect level (at-least-once + idempotent replays), never claimed exactly-once.
- Retention windows are PROPOSED pending legal sign-off; "never sold / not used to train public models" replaces "never shared".
- Anonymous-session identity is P0 M0/M1; full accounts P0-surfaced at M6. Privacy core and durability core P0 at launch; enhanced versions P1.

**Impact**

- Architecture, dependencies, priority, implementation-planning (this pass) — and the feature-spec corpus was updated to match across `DECISIONS.md`, `PRODUCT_ARCHITECTURE_V2.md`, `IMPLEMENTATION_ROADMAP.md`, `FEATURE_SPEC_SUMMARY.md`, `00_FEATURE_MAP.md`, `_SPEC_GUIDE.md` and specs F-001, F-004, F-009, F-010, F-014, F-015, F-016, F-017, F-018, F-019, F-025, F-028.
- Added D016 (print contract, Accepted baseline), D017 (photo-upload topology open question).
- Extended dependency inversion to the generation spine after review: F-008/F-009 now expose `GenerationStep` units and consume a `GenerationStepExecution` interface instead of depending on F-010; F-010 implements the runtime and depends on the step units + F-028 patterns; F-028 has no feature dependency (it provides patterns). This removes the residual F-008⇄F-010, F-009⇄F-010 and F-010⇄F-028 cycles.
- Naming rule enforced: removed reference-project mentions (still-to-fix none).

**Follow-up**

- F-005/F-006/F-012/F-013 and non-evaluated specs were not in scope for priority/severity changes; revisit when milestone mapping is finalised.
- The D014 spike still must choose the queue class and QA calibration method; D017 still needs the upload-topology decision; D006/D007 need spike outcomes before build.
- `gh` CLI is not installed: PR submission for this doc branch still pending.

---

## 2026-09-21 — codebase — Repository inspection: no application code exists

**Question**

The mission and spec (§22) require tracing the existing creation journey (landing → personalisation → generation → preview → checkout → order). What application code actually exists?

**Sources / code inspected**

- `ls -la` and full `glob **/*` of `/Users/harshvardhansolanki/Developer/for-little-one`
- `find` across `/Users/harshvardhansolanki` for `*for*little*one*`, `*littleone*`, `*for-little*`
- `git -C` status on the workspace (no `.git`)
- `grep -ril --include=package.json -E "openpolotno|medusa"` across the home directory (no matches)
- Developer/ sibling repos checked for relevance (three local repositories under the same folder — all unrelated projects, no cross-coupling)

**Observed**

- The workspace contains ONLY: `AGENTS.md`, `project-spec-initial.md`, and the `.planning/` directory. No `package.json`, no source files, no config, no Dockerfile, no `.git`.
- No codebase for For Little One exists anywhere under the home directory. The two other "For little one" hits (`Documents/ChatGPT/For little one`, `Downloads/…Research Before Build.md`) contain no commits and a draft of the same spec respectively.
- Therefore: no existing commerce, no existing generation pipeline, no existing book model, no existing editor, no existing print integration, no existing DB/auth/storage/queue.

**Conclusion**

`for-little-one` is currently a **research-only, greenfield planning workspace**, not an existing product codebase. The mission instruction "preserve good existing work" has nothing to apply to yet. All systems described in the mission are **ADD/BUILD**, not KEEP/MODIFY/REPLACE. The strategic value of the existing work is the research itself (`project-spec-initial.md` + `.planning/`), which should be preserved and extended.

**Impact**

- Feature specs' "Current implementation" sections must state `None (Observed)` and cite this log rather than fabricating existing systems.
- `PRODUCT_ARCHITECTURE_V2.md` must be honest that the "existing architecture" is documentation-only; the architecture proposal is greenfield but must still respect the decision framework (D001–D013) and the "no rewrite for its own sake" discipline (there is simply nothing to rewrite yet).
- Medusa / OpenPolotno evaluations should be forward-looking adoption decisions, not migration decisions.
- Recommended: when the first code is introduced, initialise a git repo in this workspace.

**Follow-up**

- None blocking. If a codebase is later located elsewhere, re-run this inspection and reconcile.
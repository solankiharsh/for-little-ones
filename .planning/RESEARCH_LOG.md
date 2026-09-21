# Research Log

Record meaningful research and technical experiments here.

Use newest entries first.

---

### 2026-09-21 — Platform-Foundation Spikes: Plan Only (No Evidence Yet)

**Question**

Do the platform-foundation spikes (durable jobs, editor primitive, commerce, print pipeline, identity + visual QA) validate the open architecture decisions — or are they still unexecuted plan-only?

**Sources / code inspected**

- `.planning/PROJECT_SPIKES.md` (Spike A–E specification) and `spike/` directory layout (README + per-spike scaffolding).

**Observed**

- The research PR defines five spikes plus their exit criteria. Only the specification and isolated scaffolding are present; there are **no** spike implementations, fixtures, dependency manifests, harnesses, or measured results.

**Conclusion**

- Every spike exit-criterion item is recorded as **explicitly OPEN** in `DECISIONS.md` (D020) rather than resolved: durable job substrate, editor posture, commerce adoption/rejection, first print provider + print contract, identity-generation approach, QA approach, storage upload topology (D017).
- No exactly-once claim is made for any durable-job substrate (none measured).
- Nothing in this PR validates the platforms; it only plans the validation.

**Follow-up**

- Run Spike A (durable jobs) and Spike B (editor primitive) first — they unblock the largest architecture decisions. Record each measured result here and remove each `OPEN` from D020 as evidence lands. Calibrated identity threshold and substrate decision remain launch-blocking.

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

## 2026-09-21 — codebase — Monorepo bootstrap: first production code (M0 rails)

**Question**

Step 2 of the implementation plan called for real production code immediately, in parallel with the spike programme. What is the first codebase that commits the milestone-0 rails (layout, dependency direction, generation contracts, DurableExecutionContract, provenance, policy manifest, provider boundaries) without depending on any pending spike outcome?

**Sources / code inspected**

- The bootstrap branch `feat/bootstrap-domain-generation-contracts` (this workspace) — all new files.
- `AGENTS.md` (D004 canonical model, reliability, printing, provider boundaries), `_SPEC_GUIDE.md` §2/§3/§5, `GENERATION_ARCHITECTURE.md` §3/§4, `GENERATION_PROVENANCE.md` §2/§3, `DECISIONS.md` D013/D015/D016/D018/D019/D020, `IMPLEMENTATION_ROADMAP.md` M0, `policies/MANIFEST.md`.
- `tsc --noEmit` clean; `vitest run` 58/58 passing across the five agreed seams.

**Observed**

- Layout committed as `apps/{web,api,worker}` + `packages/{domain, contracts, providers, execution, provenance, policies, storage, testing}`; dependency direction enforced: apps → domain/(providers) → contracts → (nothing); execution/provenance/policies/storage are foundational (no feature deps); contracts depends only on zod and never on adapters.
- Generation contracts defined per `GENERATION_ARCHITECTURE.md` §3 (Concept, StoryOutline, PagePlan, PageText, IllustrationPlan/Result, QualityEvaluation) with strict zod schemas, literal `schemaVersion "1"`, and a `parseContract` helper that returns typed, structured `ParseResult` failures — never silent best-effort fixes.
- `DurableExecutionContract` (D019) implemented as a neutral contract surface plus `InMemoryDurableRuntime` (test/staging semantics only — idempotent enqueue by business-operation key, expired-lease reclaim, retry budgets, cancellation, progress observation). Substrate wording stays neutral; no exactly-once claim.
- Provider boundaries (`StoryProvider`, `IllustrationProvider`, `IdentityProvider`, `QualityProvider`, `ModerationProvider`) each carry a structured `ProviderCard` documenting child-data path, retention, idempotency, timeout, retry, cost, deletion — the privacy rule/audit is structurally enforced rather than advisory.
- `GenerationProvenance` schema (all fields required) and a content-true `policyHash` (SHA-256 over ordered policy-file bytes, matching `policies/MANIFEST.md` sets) shipped; `policies` package mirrors the manifest in machine-readable form.
- PrintSpec geometry rules (`validateGeometry`: bleed/safe-area/page-range/DPI/sheet-coverage) give M1 printability gates that QA/approval/editor can consume without the F-017 renderer existing (D016).
- Adapter→contract seam proven by an example story adapter: vendor payload → canonical `ParseResult`; vendor-only fields never leak; malformed vendor output is a typed failure.

**Conclusion**

The bootstrap is the agreed M0 rails: safe, direction-committing, and free of any dependency on the open spike outcomes (durable substrate, editor, commerce, print partner, QA threshold). All implementation choices (npm workspaces, TypeScript strict + bundler resolution with source-first exports and no emit yet, zod v4, vitest) are recorded as D021 and remain reversible. The greenfield "no code" framing in D013/_SPEC_GUIDE §0 now applies only to pre-bootstrap state (D021 supersedes it for the new packages; specs will be updated when promoted).

**Impact**

- Implementation: M1 vertical slices can now build on these packages.
- Architecture: dependency direction formally committed and typecheck-enforced.
- Priority: foundation rails no longer speculative.
- Dependencies: zero on spike outcomes; spike PRs remain independent.

**Follow-up**

- Electron-free; no lint/CI yet (roadmap M0 also lists CI, Postgres, secrets, storage, provider mocks — deferred to later bootstrap PRs).
- Editor/commerce/print/QA-threshold spikes (D020) still pending; nothing here selects them.

---

## 2026-09-21 — planning docs — Post-review audit: dependency graph acyclic, milestone-ordered; durable-execution + print-catalogue + privacy/generation invariants reconciled

**Question**

After the PR-#1 review fixes (see the earlier 2026-09-21 entry above), the planning corpus must be internally consistent. Remaining checks: (1) is the feature dependency graph acyclic and does every dependency land no later than the consuming feature's milestone? (2) Are the durable-execution, print-quote, and privacy-generation statements aligned across `DECISIONS.md`, `_SPEC_GUIDE.md`, the roadmap, the summary, and the affected feature specs?

**Sources / code inspected**

All planning docs and feature specs under `.planning/`, with targeted greps for `GenerationStepExecution | DB-backed | PostgreSQL | Redis-backed | BullMQ | Temporal | sourceIp | F-017 Shared`, `F-017's | from F-017 | F-017 quote | PrintProvider quote`, plus full reads of F-003, F-004, F-009, F-011, F-015, F-016, F-017, F-025, `_SPEC_GUIDE.md`, `00_FEATURE_MAP.md`, `FEATURE_SPEC_SUMMARY.md`, `IMPLEMENTATION_ROADMAP.md`, `DECISIONS.md`, `PRODUCT_ARCHITECTURE_V2.md`, `OPEN_QUESTIONS.md`, `RESEARCH_LOG.md`.

**Observed**

- Feature-map register dependency columns and the milestone mapping (M0 rails · M1 creation core · M2 reliable generation · M3 corrections · M4 print · M5 commerce · M6 retention/family) are now consistent: every dependency sits at the same or an earlier milestone than its consumer, and no dependency edge points backward. The full edge set was re-checked feature-by-feature (F-001…F-028); previously problematic edges are corrected: F-011 v0 depends on F-008+layout+F-010 (illustrated preview on F-009 at M2); F-025's M1 core is contract/baseline only with no M2 build dependency (feature map + summary both qualified); F-028 provides patterns, not a dependency; F-015/F-016/F-017 publish under the shared D016 contract rather than depending on each other.
- The "dependency-inversion" from the earlier pass (F-008/F-009 expose `GenerationStep` units and consume a `GenerationStepExecution` interface) left the interface owned inside F-010 (F-010 "provides the runtime"). That residual coupling is now broken: the contract lifts to a foundational, feature-free **`DurableExecutionContract`** (new decision **D019**; D018 is already used by parked PR #2 and must not collide), with F-010 implementing the runtime and F-028 supplying patterns. Substrate wording is neutral everywhere ("durable execution substrate"); PostgreSQL-backed = simplest-durable candidate, Redis-backed/BullMQ-class = second class, workflow engine only if the D014 spike justifies it — candidates stay candidates, never defaults.
- Print quotes/capabilities were renderer-owned in F-016/F-017 (`PrintProvider.quote`, "F-017's printSpec/quote"). These now resolve from the **shared print catalogue** (`PrintCapability`/`PrintQuote`, D016) in `DECISIONS.md`, `_SPEC_GUIDE.md`, the roadmap D016 row, F-015, F-016, F-017, and `PRODUCT_ARCHITECTURE_V2.md`; `PrintProvider` keeps `validateArtifact/submitOrder/getOrderStatus/cancelOrder/getTracking` only.
- Remaining skew found and resolved within this pass: `FEATURE_SPEC_SUMMARY.md` row 25 deps (F-004/F-005) now carry the M1-core/M6-full qualifier to match the feature map.

**Conclusion**

- The feature graph is **acyclic and milestone-ordered** after this pass; no launch-blocking dependency skew remains among F-001…F-028.
- Durable execution is foundation-first: contract (D019) → orchestrator (F-010) → integrations (F-008/F-009); F-028 stays pattern-only. Substrate claims are honest pre-spike (D014): candidate classes, no defaults-as-decisions.
- Print pricing/capability/quote belong to the shared catalogue (D016), never the renderer or its fulfilment adapter; approval/QA/editor sit off the renderer's critical path.
- Privacy/deletion: one launch rule (verified retention/deletion lifecycle or the provider is rejected — rotate/isolate is not deletion); training/data-use is a verified requirement before any customer-facing claim.
- Generation distance: M1 proves the core journey *without child photos* (text + fixture/placeholder preview); photos/identity/illustrations enter at M2 and upgrade the preview in place.

**Impact**

- Dependencies, priority, implementation-planning, and privacy copy. New decision D019 recorded in `DECISIONS.md`; print-catalogue wording corrected across roadmap/summary/architecture/specs.

**Follow-up**

- `FEATURE_SPEC_SUMMARY.md` row 25 deps qualifier confirmed: M1 core v0 = governance contract/baseline only (no M2 build dependency), full feature governs F-004/F-005 data domains at M6 — matches the feature map.
- D014 (substrate) and D017 (upload topology) spikes still decide the open choices; retain neutral wording until then.
- Commit and push the `docs/pr1-review-fixes` branch (PR #1 merged; this is follow-up docs-only).
 (feat: bootstrap domain and generation contracts (M0 monorepo rails))

---

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
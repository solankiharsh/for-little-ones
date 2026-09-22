# Research Log

Record meaningful research and technical experiments here.

Use newest entries first.

---

### 2026-09-22 — Spike E (phase 1): Identity generation + visual QA — offline measurement methodology landed (decisions still OPEN)

**Question**

Can we build the *measurement machinery* for Spike E (identity generation + visual QA) before any image provider, API key, reference photo or human reviewer exists — so the real phase is a component swap, not a rebuild? And does that machinery correctly keep D020 items 5 and 6 (identity-generation approach, QA approach) honest about having no evidence yet?

**How it was tested**

- New isolated spike package `spike/identity-qa/` (under the research bubble, per the Spike E spec and PR #4) — fully offline, no Docker/services/network; `npm run typecheck` clean, `npm test` 29/29 passing (`test/{mock-identity-provider, evaluator, human-review, metrics, dataset, experiment}.spec.ts`).
- Degradation axes from the Spike E spec are all represented (`canonical, pose, lighting, expression, occlusion, distance, composition`; severity 0.25…1.0) and exercised across a deterministic dataset (2 permitted reference identities × 7 pages).
- Reference conditioning rides the canonical `IdentityProvider` boundary (`packages/providers/src/identity.ts`): `deriveReference(sourceRefs) → { reference, knownFacesCount }` with a **private-enduring-reference**; the mock rejects photo refs that are not local `mock-src::` tokens (the privacy path is structural, not advisory).
- QA evaluation independent of generation: `SwappableLikenessEvaluator` emits canonical quality-check records (`identity.likeness`, `identity.character-swap`; `HARD_BLOCK`/`REVIEW_REQUIRED`/advisory severities) through `contracts` `summarizeQa`, fail-closed decision = `FAIL` on any hard block.
- Blinded-review benchmark form (correct-identity 1–5, consistent-with-previous 1–5, visible-artifact, wrong-character-swap) with a **synthetic reviewer whose miss/artifact rates are tunable**, so the agreement metrics can be shown to be sensitive (swap recall drops to 0 with `swapMissRate: 1`).
- Full `runExperiment()` → report: `status: "OFFLINE_DRY_RUN"`, `decision: "KEEP OPEN"`, `thresholdsInvented: false`, plus observed strengths/failures, operational cost, privacy implications and `realPhaseNeeds`. CLI `npm run experiment` writes `spike/identity-qa/tmp/offline-dry-run.json`.

**Observed (measured 2026-09-22, dry-run)**

- Deterministic end-to-end run: likenessKappa ≈ 0.51 (automated vs synthetic human), swap detection F1 1.0 (1 swap, both raters catch it), artifact agreement accuracy 1.0, mean predicted likeness ≈ 0.73, mean human identity-correct ≈ 3.2. **These are a plumbing ceiling** — every likeness value is the mock's own internal parameter.
- Metric sensitivity verified by tests: noise-free run → likenessKappa ≥ 0.8; `swapMissRate: 1` → swap recall 0 vs perfect recall on the clean run; Cohens kappa and binary metrics have hand-checked unit cases (kappa = 1 perfect, −0.25 for independent uniform ratings).
- No cost/latency/privacy numbers can exist yet: `operationalCostCents: 0`, latency 0, `assetRef`s are `mock://…`, no real assets, no real reviewers.

**Conclusion / status**

- **Methodology landed** behind the canonical quality vocabulary and the `IdentityProvider` seam; the real phase is a two-component swap (real provider behind `deriveReference`/`generatePage`, real independent visual evaluator behind `SwappableLikenessEvaluator`, real blinded reviewers behind the same review form) and a report recompute.
- **No evidence about real identity-generation or real independent-detection reliability exists.** D020 items 5 and 6 stay **explicitly OPEN**; F-009/F-015 thresholds must NOT be calibrated from these numbers (any such threshold would be invented, not measured).

**Follow-up**

- Phase 2 (real): authorised image-provider key + permitted reference images (documented consent; no child data) through the same boundary; record cost/latency and the documented privacy path (GENERATION_ARCHITECTURE §12 / F-025).
- Phase 3 (real): blinded human review of real pages; recompute likenessKappa / swap F1; calibrate launch thresholds only from phase-3 evidence.
- Remaining Spike E sub-questions already scoped out: automated consistency-with-previous evaluation, artifact/occlusion visual QA details.

---

### 2026-09-22 — Spike A: Durable Execution Substrate — Measured (pg-boss vs BullMQ)

**Question**

Which substrate class should the durable-execution contract (D019) ride on for
the reliability backbone (F-028) and generation orchestration (F-010): a
PostgreSQL-backed queue (pg-boss) or a Redis-backed queue (BullMQ)?

**How it was tested**

- One scenario, two identical harnesses: `runCrashRecoveryScenario` +
  `runCancellationScenario` in `spike/durable-execution/src/harness.ts`, driven
  over a shared `SpikeBackend` (`spike/durable-execution/src/backend.ts`) and
  the **same** assertions (`spike/durable-execution/test/shared.ts`).
- Crash = SIGKILL of a **real worker subprocess** (`node --import tsx
  src/run-worker.ts`) while page 5 holds after a provider accept — nothing
  locally committed. The substrate alone must reclaim the abandoned lease.
- Provider idempotency is the recovery mechanism: a stable `providerRequestId`
  must be replayed as `cached: true` (no duplicate spend).
- Infra: real PostgreSQL 18.4 beta binaries via `embedded-postgres` and real
  Redis via `redis-memory-server` (no Docker/colima/brew available on this
  machine — see README). Disk was at 100% during earlier runs, which crashed
  Postgres with `ENOSPC` and falsified several "worker" failures; freeing 4.5 GB
  of caches resolved it. **Documented so nobody re-debugs ghosts.**
- Test-isolation fixes (fixed bookIds collided with retained jobs across runs;
  1 h retention): unique bookId per run + `queueSnapshot(bookId)`.

**Observed (measured 2026-09-22, 3× consecutive green runs of 8/8; latest)**

| Axis | pg-boss 12.33.3 | BullMQ 6.3.8 + ioredis |
|---|---|---|
| reclaim latency (kill → page-5 re-claimed) | 8,890 ms | 15,199 ms |
| kill → page-5 committed | 8,922 ms | 15,245 ms |
| page-5 provider request ids | identical, 2nd `cached=true` | identical, 2nd `cached=true` |
| provider spend total (7 units) | 7 | 7 |
| page-7 attempts → terminal | 3 → DEAD in DLQ | 3 → DEAD in failed set |
| reclaimed page-5 substrate attempts | 2 | 1 (stalled→waiting does not bump attempts) |
| cancellation | jobs `cancelled` (rows remain) | `job.remove()` deletes the job (no record) |
| terminal visibility | dead-letter queue `generation-bad` row, `sourceId` preserved | `failed` set entry; no built-in DLQ |
| extra services | none (app Postgres only) | Redis required alongside Postgres |

Reclaim delay is lease design: pg-boss `expireInSeconds:6` + monitor ~2 s;
BullMQ `lockDuration:10000` + `stalledInterval:5000`.

**Inferred**

- Both substrates provide the D019 obligations (enqueue, durable state, claim,
  reclaim, retry+delay, per-unit state, progress observation) and both recover a
  hard process kill without a custom queue.
- pg-boss reclaims sooner, needs no extra store, and has a native DLQ (a
  "review-required" path is just a query over the Postgres `job` table). BullMQ
  is Redis-native (fast, tiny latency) but adds a second infra dependency and
  needs app-side dead-letter handling.
- pg-boss's README "exactly-once delivery" claim is **vendor wording only**;
  crash recovery in practice was guaranteed by our provider idempotency key,
  not by the substrate. No exactly-once claim is made here.

**Conclusion / status**

- Exit criterion **durable job substrate** (D020): EVIDENCE RECORDED → the
  decision is closed as **ADOPT PostgreSQL-backed pg-boss** (see DECISIONS D014
  #1 / D020 update) on the evidence: equal recovery + retry semantics, native
  dead-lettering, no second infrastructure, Postgres-job-row supervision (the
  app is already Postgres). BullMQ remains a documented, passable alternative
  if a dedicated Redis is ever provisioned for jobs.
- The rest of D020 items remain OPEN pending their own spikes.

**Follow-up**

- Feature work that consumes the substrate (F-010 orchestrator) still needs the
  contract to sit on the chosen substrate; extract a `DurableRuntime` behind the
  D019 surface. Keep everything in the `spike/durable-execution/` bubble.

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

---

## 2026-09-22 — Spike B (editor): OpenPolotno headless validation (phase 1)

**Scope** `spike/editor-primitive/` — validate `openpolotno@1.0.2` vs `@reyka/openpolotno@1.5.0` as the low-level engine under a custom FL1 interface, headlessly (no React/canvas).

**Hypothesis** The candidate stores satisfy the D007 phase-1 acceptance path; final posture stays OPEN until render + interaction numbers exist.

**Observed**

- Both packages import headlessly via `dist/model/store.js` (exports `{ Font, Store, createStore }`), but **ship zero `.d.ts` files** although their `exports` maps reference non-existent `.d.ts` paths. Deep-subpath import is untyped and unstable across upgrades.
- Model API is config-based: `store.addPage(attrs)` (no string form), `page.addElement({ type })`, `element.set({})`, `store.loadJSON`. No `store.change`.
- Element types: `text, image, svg, line, group, video, figure, gif` — **no path/shape/rect primitives**; crop is `cropX/Y/W/H`, not clip-path.
- Undo/redo is deterministic via `store.history.transaction(async fn)` then `history.undo()/redo()` (snapshot-based; `onSnapshot` + 100 ms debounce avoided inside transaction).
- Bleed surfaces: `toggleBleed(value?)`, `toggleRulers(value?)`, `addGuide(position, orientation)`, `page.bleed` (persists in JSON); the overlay is a view toggle, not persisted.
- MST protection: direct property assignment throws; only actions mutate.
- `store.addFont(...)` requires a DOM (`injectCustomFont` touches `document`) — `store.fonts` stays empty headlessly.
- Default text `height: 0` normalizes to `1` on `loadJSON` (byte-identical round-trip holds once height is explicit).
- Acceptance path PASS for both: canonical Book page → adapter → snapshot → user edit → canonical command → discard → rebuild → byte-identical visible result; custom action deterministic.
- Bundle (gzip): openpolotno main 172 KB → model subimport 45 KB; @reyka 190 KB → 48 KB. Latency @30 elements: change ≈ 89 µs, txn ≈ 157 µs, undo ≈ 4.6 ms. Phone math (390×844 @ 215.9 mm): fit 0.637, touch target 69 px model, safe area 71 px.

**Conclusion**

Phase 1 satisfies the documented measurement surface and keeps `D007` **extended open** — the posture (depend/pin/wrap/fork/reject) needs a browser-render + phone-interaction pass before it can close. `D004` already fixes the wrap boundary: `spike/editor-primitive/src/adapt-book.ts` is the only `Book` → editor path and emits canonical commands, never editor JSON.

**Impact**

- Any integration ships a TypeScript shim (`src/vendor.d.ts`) and must pin the deep subpath + engine version.
- The editor snapshot must never become canonical state (D004).
- Font registration, web-font glyph metrics and real touch/gesture latency remain unmeasured (phase-2 browser work).

**Follow-up**

- Phase 2 (browser): canvas export + interaction latency on a phone-sized surface; verify crop/mask and web-font metrics against real raster output.
- Then close D007 with evidence.

---

### 2026-09-22 — Spike B (editor): real-browser validation (phase 2)

**Scope** `spike/editor-primitive/` — close the phase-1 gaps in the system Chrome (playwright-core, `channel: "chrome"`, 390×844, dsf 3) against the `@reyka/openpolotno` editor UI (`RaeditorApp`), accepting the truncated-branch candidate that phase-1 already forwards (both candidates share the identical model surface; upstream `openpolotno@1.0.2` is the older snapshot).

**Hypothesis** A bundled browser harness can mount the real editor, render to canvas, load real fonts, and yield structure-first render/interaction numbers without fabricated thresholds.

**Observed**

- Package-surface facts: `createStore` is NOT re-exported from the package main; deep-import `@reyka/openpolotno/model/store`. Sub-path imports resolve without a `.js` suffix (`.../utils/fonts` succeeds, `.../utils/fonts.js` fails). The main entry bundles extensionless `@meronex/icons` imports → cannot be `require()`d from Node; only a bundler (Vite 7 here) resolves it.
- Font loading is real and measurable: `injectGoogleFont("Nunito")` + reyka `loadFont` loads Nunito (Google CSS reachable, HTTP 200); `document.fonts.check` true and a 90 px DOM span rendered 72.4 px wider (≈ 0.7–1 s). One-shot `document.fonts.load("28px Nunito")` + `fonts.ready` does NOT work (returns before the stylesheet applies) — the editor's own poll-until-measure path is the working one.
- `store.addFont({ fontFamily, url: <data URI> })` works in the browser: registry grows and `injectCustomFont` inserts a working @font-face (`document.fonts.check` true). Caveat surfaced while verifying: reyka's `isFontLoaded` is a measure-difference heuristic over ASCII `TEST_TEXT`; an icon font (RaphaelIcons) with no ASCII coverage loads fine yet keeps the heuristic false — treat `isFontLoaded` as a rendering probe, not a load guarantee.
- Real pointer drag on the text element: 17 rAF samples, avg 1.2–1.3 ms, p90 ≈ 2 ms input-to-paint (Playwright mouse. The first blind coordinate missed; the page is letterboxed inside the stage (`offY` ≈ 122 px) and a ±46 px grab-point sweep engaged the node).
- Undo/redo in the real UI: transaction ≈ 2 ms, undo ≈ 1 ms, redo ≈ 0.5 ms. Raster export at pixelRatio 2 is exactly 1224×1224 px; two consecutive SVG exports are byte-equal, contain text, and mention the loaded font.
- Crop semantic on real pixels: `cropX/Y/W/H(0.25, 0.25, 0.5, 0.5)` cuts source ink 182 838 → 84 316 px but the composited element rect stays fixed — the cropped source is stretched to element bounds (recorded as observed behaviour, not a defect).
- `document.fonts.check("16px 'FakeLocal'")` and `document.fonts.load` semantics: these are FontFaceSet-level success/failure signals and the honest load gate for custom fonts.

**Conclusion**

Phase-2 evidence lands the previously-missing render + interaction numbers for `@reyka/openpolotno@1.5.0`. All 9 structural checks PASS and are re-assertable via `npm run phase2` + `test/browser.spec.ts` (self-skips if `phase2.json` absent). `D007` (editor posture) stays **extended open** — the numbers now exist; the closed posture decision still needs a sponsor who pins/depends the engine at a chosen commit. `D004` wrap boundary is unchanged and re-proven.

**Impact**

- Any product work assumes: `createStore` deep import, no `.js` subpath suffixes, a bundler at the browser seam, the numeric crop surface (not clip-path), and font loading via reyka's poll-based `loadFont`.
- The browser harness (`src/browser/`, `scripts/phase2.mjs`, `vite-browser.config.ts`) is the repeatable evidence generator for the editor posture card.

**Follow-up**

- A sponsor pins/depends `@reyka/openpolotno` at a commit and drives the adapt-book wrap; only then move D007 from extended open to a closed posture.
- Optional: point `phase2.mjs` at upstream `openpolotno@1.0.2` the same way for a like-for-like browser comparison (both candidates already share the measured model surface).
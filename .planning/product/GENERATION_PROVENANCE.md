# Generation Provenance — Traceability of Every Generated Artifact

> Companion to [`GENERATION_ARCHITECTURE.md`](./GENERATION_ARCHITECTURE.md). Accepted invariant (D018).
> Question this record must always answer: **What exact generation configuration produced this page?**

## 1. Purpose

Every generated artifact (story, page text block, illustration, QA verdict) and every revision is traceable to the exact policy/model/config versions that created it. Provenance supports:

- **identity QA** — knowing `characterBibleVersion` per page (F-005 §11);
- **regression analysis** — a score drop after a change is attributable to a version, not a mystery;
- **cost attribution** — `costCents` tied to a provider/model/job;
- **support reproduction** — an operator can replay the exact inputs that produced a customer's page;
- **approval/print integrity** — the approved revision's provenance is frozen with it (F-016).

Provenance is **immutable**. A regenerated page gets a new provenance record; nothing is overwritten in place.

## 2. The provenance record

```text
GenerationProvenance {
  pipelineVersion         // semantic: which stage graph / orchestration code version
  schemaVersion           // contract schema version of this stage's result
  policySetVersion        // policies/ set version used (see §3)
  policyHash              // stable content hash over the policy files used
  provider                // provider interface + concrete provider id
  providerModel           // model identifier
  providerModelVersion    // model version, where the provider exposes one
  generationConfigVersion // generation config (budgets, thresholds class) version
  characterVersion        // CharacterBible version snapshot used (per character)
  storyRevision           // story/page-text revision this artifact was generated from
  inputAssetRefs[]        // reference photo / asset ids consumed (private refs, never bytes)
  jobId                   // F-010 GenerationJob id
  stepKey                 // e.g. "outline", "pageText:6", "illustration:6", "qa:identity"
  attempt                 // attempt index within the step budget
  createdAt
}
```

Storage: attached to the canonical artifact (page `generationMetadata`, `Illustration`, QA `CheckResult`), never a separate free-floating log. All fields are required; a stage result without a provenance record does not become canonical state.

## 3. Versioned files and policy hashing

The product policies in `/policies` are version-controlled files. The **policy set** for a stage is the resolved set of policy files that stage is allowed to read (e.g. age + story + localisation for text; age + illustration + safety + localisation for illustrations).

- `policySetVersion`: the resolved set version as recorded in the policy manifest when the stage ran.
- `policyHash`: a stable content hash computed over the **actual policy file contents** used (SHA-256 over the concatenated, ordered file bytes). Hash differs from version so that a doc-only edit still changes provenance truthfully.

Policy files are product policy (see GENERATION_ARCHITECTURE §7). They never contain child data, secrets, copied proprietary prompt material, or source-project naming.

## 4. What we deliberately do NOT store

- **Raw sensitive prompts in logs.** Structured inputs (plan JSON, facts slice, cues) already exist as canonical state; duplicating them in logs for "auditability" is forbidden (F-008 §12). Logs keep field names, ids, versions, costs — not prompts or bytes.
- **Child photo bytes in provenance.** `inputAssetRefs` are private storage references, never embedded data, never public URLs (F-004/F-009 §12).
- **Provider secrets or API keys** — never in policy files, provenance, or logs.

## 5. Provenance across the pipeline

| Path | Provenance behaviour |
| --- | --- |
| New book (F-007→F-009) | one provenance chain from concepts → print-ready |
| Page text rewrite (F-012) | new `PageTextResult` provenance; story/provenance for untouched pages unchanged |
| Illustration regen (F-012) | new `IllustrationResult` provenance with bumped `attempt`; `inputAssetRefs`/bible version unchanged unless changed |
| Global character correction (F-013) | `characterVersion` bumps; affected pages carry new provenance; untouched pages keep old provenance |
| Re-run QA (F-015) | new `QualityEvaluationResult` provenance; deterministic + model-assisted results both recorded |
| Approval (F-016) | the frozen ApprovedBookRevision's provenance set is snapshotted with the revision (D011) |

Re-entry mid-pipeline (§ GENERATION_ARCHITECTURE §8) is exactly the cases in this table: earlier stages are not re-run, so their provenance records are not rewritten.

## 6. Acceptance

- Given a page generated under a known policy set and Bible version, provable that the page's provenance record matches all of pipelineVersion, policyHash, provider/model version, `characterVersion`, `storyRevision`, `jobId`, `attempt`.
- Given a support query "what produced page 12?", reproducible from its provenance record plus replayable structured inputs.
- Given a QA score regression, attributed to the changed version field (provider model, policySetVersion, or characterVersion) by provenance diff.
- Approval gate fails closed when any artifact in the approved revision lacks a valid provenance record.
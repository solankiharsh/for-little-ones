# Spike E (phase 1) — Identity generation + visual QA: measurement harness

Spike E asks **two separate questions** (`PROJECT_SPIKES.md` §Spike E) that must
not be conflated:

1. **Can we generate consistent identity?** (identity-conditioned illustration)
2. **Can we reliably detect bad identity?** (independent likeness/QA evaluation)

This branch lands **phase 1: the offline measurement methodology** — everything
that can be built, exercised and debugged **before** any image provider, API key,
reference photo or human reviewer exists. It produces NO finding about real
providers (see the honesty warnings below). Phase 2/3 (real provider + real
blinded human review) swap two mocks for real components behind the same
interfaces and recompute the same report.

## What is here

| File | Role |
|---|---|
| `src/identity.ts` | Degradation axes (canonical, pose, lighting, expression, occlusion, distance, composition) + `IdentityPage` evidence shape |
| `src/mock-identity-provider.ts` | Deterministic reference-conditioning stand-in: mints a `private-enduring-reference` (`providers/identity` shape), generates pages whose likeness degrades predictably with scene severity, injects character-swap events on composition pages |
| `src/evaluator.ts` | Independent QA stand-in implementing the canonical quality vocabulary (`contracts/quality`: `identity.likeness`, `identity.character-swap`, severity classes, `summarizeQa`) |
| `src/human-review.ts` | The blind-review form (identity-correct 1–5, consistent-with-previous 1–5, visible artifact, swap) + a **synthetic reviewer** used only to dry-run metric plumbing |
| `src/metrics.ts` | Automated-vs-human agreement: Cohens kappa (likeness), precision/recall/F1 (swap detection, artifact flags) |
| `src/dataset.ts` | Deterministic dataset: N permitted reference identities × page matrix over the degradation axes |
| `src/experiment.ts` | `runExperiment()` → honest `OFFLINE_DRY_RUN`/`KEEP OPEN` report |
| `src/cli.ts` | `npm run experiment` prints the report and writes `tmp/identity-qa/offline-dry-run.json` |

## Run it

```sh
npm install
npm run typecheck
npm test                  # 29 tests
npm run experiment        # prints the dry-run report
```

No Docker, no services, no network.

## Honesty warnings (read before quoting numbers)

- **Nothing here measures real-generation quality.** Every likeness value is the
  mock's own internal parameter; the numbers are a "plumbing ceiling" proving the
  pipeline works end-to-end.
- **No threshold is invented.** `thresholdsInvented: false`; the F-009/F-015
  launch calibration must use only phase-3 (real) evidence.
- **No images exist.** `assetRef` values are `mock://…`; resolution/colour/
  artifact/occlusion evidence cannot be assessed until real assets exist.
- **Decision is intentionally `KEEP OPEN`** (D020 items 5 and 6). See
  `.planning/RESEARCH_LOG.md` (2026-09-22 entry).

## The real phase (what it needs — the "swap")

1. Provide an authorised image-provider key; implement `ReferenceConditioningMock`
   against the real provider behind the same boundary (`deriveReference`,
   `generatePage` → real `assetRef`, real likeness readout into `features[0]`).
2. Provide a few **permitted** reference identities (documented consent; **no
   child data**) through the degradation matrix.
3. Capture real page assets; run a real independent visual evaluator behind
   `SwappableLikenessEvaluator`.
4. Recruit blinded human reviewers; label with the same form (`human-review.ts`);
   aggregation + agreement metrics are already computed by `metrics.ts`.

Everything downstream of the two mocks is unchanged — that is the point of phase 1.

## Privacy posture

The mock sends `childDataSent: false` and only synthetic tokens; its `ProviderCard`
(required structurally on every provider boundary, `providers/shared.ts`) states
retention/training n/a. The real phase must keep every asset on the documented
identity/privacy path (GENERATION_ARCHITECTURE §12 / F-025) and obtain consent
before likeness data is processed at all.
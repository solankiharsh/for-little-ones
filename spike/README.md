# Platform-Foundation Spike Programme

**Status:** specification-only. This PR defines the spike programme and its isolation layout; it includes **no** spike implementations, fixtures, or measured results — those land in subsequent isolated spike PRs (PR #5–#9). It does **not** build production features and does **not** claim any platform choice is validated.

The authoritative specification lives in `.planning/PROJECT_SPIKES.md` (Spikes A–E, result format, PR sequence, exit criteria) — read it first.

Until a spike produces measured evidence, its exit-criterion item is explicitly `OPEN` (see `DECISIONS.md` D020); nothing here claims the foundations are validated.

## Ground rules

- **No production features.** Everything here is a small, disposable experiment or clearly isolated under this directory.
- **No unrelated/reference projects.** Do not cite or name any project other than the candidates this programme is tasked to evaluate.
- **No exactly-once claims.** Never claim exactly-once execution for any durable-job substrate.
- **No silent promotion.** A platform candidate is never silently treated as selected; adoption/rejection follows measured evidence.
- **Record every result** in `.planning/RESEARCH_LOG.md`, and **record every decision** (or explicit `OPEN`) in `.planning/DECISIONS.md`. `OPEN` beats a fake decision.

## Spike isolation model

Each spike runs in its own directory under `spike/`:

```text
spike/
├── durable-execution/ ← Spike A  (PostgreSQL-native job implementation vs Redis-backed queue)
├── editor-primitive/  ← Spike B  (candidate editor against a real children's-book spread)
├── commerce/          ← Spike C  (commerce candidate, adoption without premature vendor lock)
├── print-pipeline/    ← Spike D  (one realistic production print provider + generic PrintSpec renderer)
└── identity-qa/       ← Spike E  (identity generation vs identity detection; no invented thresholds)
```

- Experiments are **small** and **throwaway**. A spike may be deleted once its evidence is captured in `RESEARCH_LOG.md`.
- Anything large, generated, or credential-bearing must be added to `.gitignore`, never committed.
- Do not let spike code leak into `api/`, `web/`, `shared/`, or any production path (none exist yet — keep it that way).

## Exit criteria (from the spec)

Before the platform-foundation spike programme is complete, and before dependent production implementations begin, each of the following must be **resolved or explicitly `OPEN`** in `DECISIONS.md`:

1. durable job substrate (Spike A);
2. editor implementation posture (Spike B);
3. commerce adoption/rejection (Spike C);
4. first print provider + print contract (Spike D);
5. identity-generation approach (Spike E);
6. QA approach (Spike E);
7. storage upload topology (D017 — cross-cutting).

## Evidence loop (intended workflow — not yet executed)

```text
spike experiment → measured result → RESEARCH_LOG.md entry → DECISIONS.md entry (or OPEN)
```

Each spike PR independently runs this loop for its own scope; do not wait for all five before recording evidence from one.
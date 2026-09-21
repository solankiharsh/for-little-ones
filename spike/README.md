# Platform-Foundation Spikes

This PR exists to **replace assumptions with evidence** for the platform foundations identified as open in `DECISIONS.md`. It does **not** build production features.

The authoritative specification lives in `.planning/PROJECT_SPIKES.md` (Spikes A–E) — read it first.

## Ground rules

- **No production features.** Everything here is a small, disposable experiment or clearly isolated under this directory.
- **No unrelated/reference projects.** Do not cite or name any project other than the ones the spec calls out as candidates.
- **No exactly-once claims.** Never claim exactly-once execution for any durable-job substrate.
- **Record every result** in `.planning/RESEARCH_LOG.md`, and **record every decision** (or explicit `OPEN`) in `.planning/DECISIONS.md`. `OPEN` beats a fake decision.

## Spike isolation model

Each spike lives in its own directory under `spike/`:

```text
spike/
├── durable-jobs/     ← Spike A  (PostgreSQL-backed job approach vs Redis-backed queue)
├── editor-primitive/ ← Spike B  (candidate editor against a real children's-book spread)
├── commerce/         ← Spike C  (commerce candidate, adoption without premature vendor lock)
├── print-pipeline/   ← Spike D  (one realistic print partner or a faithful local contract fixture)
└── identity-qa/      ← Spike E  (provider capabilities + vision-QA feasibility, no invented thresholds)
```

- Experiments are **small** and **throwaway**. A spike may be deleted once its evidence is captured in `RESEARCH_LOG.md`.
- Anything large, generated, or credential-bearing must be added to `.gitignore`, never committed.
- Do not let spike code leak into `api/`, `web/`, `shared/`, or any production path (none exist yet — keep it that way).

## Exit criteria (from the spec)

On merge, `DECISIONS.md` must resolve — or explicitly leave `OPEN` — each of:

1. durable job substrate (Spike A);
2. editor implementation posture (Spike B);
3. commerce adoption/rejection (Spike C);
4. first print provider + print contract (Spike D);
5. identity-generation approach (Spike E);
6. QA approach (Spike E);
7. storage upload topology (D017 — cross-cutting).

## Evidence loop

```text
spike experiment → measured result → RESEARCH_LOG.md entry → DECISIONS.md entry (or OPEN)
```
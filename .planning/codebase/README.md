# Codebase Research — Historical Baseline and Current Evidence

**Current update (2026-09-25):** Application code now exists in this checkout: landing/sample reader/sandbox cart, domain packages, and API/worker shells. See [current source evidence and next work](../market/2026-09-25_CREATION_FLOW_LEARNINGS.md). The findings below are the historical 2026-09-21 baseline, superseded by D021 and subsequent implementation; they must not be used to describe current behaviour.

## Finding

`/Users/harshvardhansolanki/Developer/for-little-one` contains **no application code**.

- Observed contents: `AGENTS.md`, `project-spec-initial.md`, `.planning/` (11 markdown planning files).
- Not a git repository.
- No `package.json`, no source files, no backend, no database, no storage, no queue, no CI, no Dockerfile.
- A home-directory-wide search confirmed no For Little One codebase exists elsewhere.

## What this means

The intended "existing product" documented in `project-spec-initial.md` and the mission is **planned but not built**. All systems are greenfield.

This directory will be populated with:

- `STACK.md` — chosen stack rationale (once the architecture v2 proposal is finalised)
- `STRUCTURE.md` — repository layout (to be agreed in the implementation plan)
- `ARCHITECTURE.md` — the agreed architecture
- `TESTING.md` — testing strategy
- `CONCERNS.md` — known risks (initially: the reliability/privacy/identity concerns in feature specs)

**Rule:** inspect current source before describing feature implementation; do not reuse the historical `None (Observed)` finding without verification.

The `..` links back: `../DECISIONS.md` D013, `../OPEN_QUESTIONS.md` "Existing Architecture".
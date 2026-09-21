# Reading-Age Guidance

Policy id: `age/reading-age`
Status: draft — sign-off pending (see `MANIFEST.md`).

Purpose: keep every page inside the reading band selected at concept time (spec §25 age bar). These are **constraints enforced by code after the text stage** (F-008 §10 "impossible by prompt alone"), not nostalgic suggestions.

## Bands and page constraints

| Band | Page text target | Tone/length notes | Rare-word limit |
| --- | --- | --- | --- |
| `0-3` | ≤ 20 words/primary block | one idea per page; short sentences | none beyond band list |
| `4-6` | ≤ 40 words/primary block | common short words; mild sentence variety | bounded set, reviewed per launch calibration |
| `7-9` | ≤ 70 words/primary block | multi-clause sentences allowed | longer allowlist |

## Rules

- A block exceeding the band cap is `REVISION_REQUIRED` at QA, never silently trimmed mid-word.
- `wordCount` on the canonical block is measured by code, not reported by the model.
- Band values above are draft starting points; launch calibration (F-009 §10 methodology applied to text) may shift them, recorded in `RESEARCH_LOG.md` and versioned here.

## Non-content

This file contains no child data, no secrets, and no copied prompt material.
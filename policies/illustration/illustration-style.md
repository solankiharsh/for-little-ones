# Illustration Style Guidance

Policy id: `illustration/illustration-style`
Status: draft — sign-off pending (see `MANIFEST.md`).

Purpose: the shared illustration style used across all generation (spec §5A "global illustration style", F-009). Style tokens referenced by `IllustrationPlan.styleNote` are resolved against this policy; the Character Bible owns per-character `appearance` and the parent-picked style enum (watercolour | warmFlat | storybook).

## Style tokens (illustration style guidance)

- Warm, soft palettes; no neon; calm and premium-feeling ("small publishing studio", not generative-AI kitsch).
- Characters read as the child per the Character Bible identity reference; style steers *rendering*, never identity.
- Settings/perspective stay consistent within a story (plan-level setting/prop tokens make "the same valley at dusk" the same valley, F-009 §10).
- Composition steer: subjects inside print-safe areas; faces kept clear of text zones (F-009 `layoutHint`).
- Mood: child-centred and reassuring; no fright-sizing within an age band's tolerance.
- Decorative fills (border doodles, endpapers) are style-token driven, low-cost, no identity payload.

## Enforced as policy, not as prompt

- Illustration plans carry canonical style tokens; the Illustrator stage consumes them. Nothing free-text drifts (D002 — no prompt vocabulary surfaces, seeds never shown).
- Final layout and typography are deterministic rendering (GENERATION_ARCHITECTURE §11) — style policy never reaches line-breaking or print export.

## Non-content

No child data, no secrets, no copied prompt material.
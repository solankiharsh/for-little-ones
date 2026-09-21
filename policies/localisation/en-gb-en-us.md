# Localisation Vocabulary

Policy id: `localisation/en-gb-en-us`
Status: draft — sign-off pending (see `MANIFEST.md`).

Purpose: the machine-checked spelling/vocabulary map applied **after** text generation (F-008 §10). The map is the source of truth for spelling; the model alone is not trusted for it.

## Rule

Text is generated with `locale` as a hard input (en-GB | en-US, from the profile — never model-invented), then this map is applied and QA verifies no cross-locale spellings remain (F-008 §11 locale check).

## Map (directives, not exhaustive)

| Concept | en-GB | en-US |
| --- | --- | --- |
| mother | mum | mom |
| pyjamas | pyjamas | pajamas |
| colour | colour | color |
| trousers | trousers | pants |
| lift | lift | elevator |

## Additional steer

- "football" is steered per structured facts (association footy vs American football) — a structured-facts decision, not a map guess (F-008 §10, spec §11).
- Extending the map is F-024's mechanism; the mapping mechanism ships at launch (F-008).

## Region caveat

Map entries are overrides applied only to the declared locale. A child's locale is profile data, never generated.

## Non-content

No child data, no secrets, no copied prompt material.
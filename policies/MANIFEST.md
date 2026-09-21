# Policy Manifest

Resolved policy-set versions and hashing rules. Mirrors the discipline in `.planning/product/GENERATION_PROVENANCE.md`.

## Hashing

`policyHash` = SHA-256 over the concatenated bytes of the policy files in scope, in the order listed for that stage. The manifest records the version; the hash is computed over the file contents as they actually were when the stage ran.

## Policy set definitions

| policySetId | Files (in hash order) | Consumed by stages |
| --- | --- | --- |
| `text.v1` | `age/reading-age.md`, `story/story-tone.md`, `localisation/en-gb-en-us.md` | F-007 concepts, F-008 outline + page text |
| `illustration.v1` | `age/reading-age.md`, `illustration/illustration-style.md`, `localisation/en-gb-en-us.md`, `safety/content-rules.md` | F-009 illustration plans + generation |
| `qa.v1` | `safety/content-rules.md`, `illustration/illustration-style.md` | F-015 quality evaluation |

## Manifest

| policySetId | Version | Status | Applies from |
| --- | --- | --- | --- |
| `text.v1` | 1 | draft — sign-off pending | launch calibration |
| `illustration.v1` | 1 | draft — sign-off pending | launch calibration |
| `qa.v1` | 1 | draft — sign-off pending | launch calibration |

Version bumps are REQUIRED on any content change to a file in a set (even typo-level) so provenance stays truthful.

## Contact / ownership

Product owner signs off each set before launch; `policies/*` edits outside the launch calibration experiment are a version-bump event (see GENERATION_PROVENANCE §3).
# Product Policies — `/policies`

Version-controlled product behaviour that guides generation. This directory is **product policy, not prompts**: it states the product rules a stage must honour, in neutral policy language. It is NOT a prompt library, NOT a prompt-copy source, and never a place for provider secrets or child data.

## Structure

```text
policies/
  age/            reading-age guidance (word/length/tone per age band)
  story/          story-tone + emotional-arc guidance
  localisation/   en-GB / en-US vocabulary and language rules
  illustration/   illustration style guidance and composition steer
  safety/         content/safety rules and moderation thresholds
  MANIFEST.md     policy-set version manifest + hashing rules
```

## Consumption

- A generation stage reads the resolved policy files its scope permits (see `MANIFEST.md` for the per-stage set).
- `policySetVersion` + `policyHash` are recorded in every artifact's `GenerationProvenance` (`.planning/product/GENERATION_PROVENANCE.md`).
- Policy files are version-controlled files; a content change that should change provenance semantics MUST be accompanied by a manifest version bump.

## Rules

Never place in this directory:

- customer child data of any kind;
- copied proprietary prompt material;
- provider secrets / API keys;
- names of source/reference projects.

## Status

All policies below are **draft — product sign-off pending** (same discipline as F-025's PROPOSED windows): values are starting points to calibrate, not shipping constants.
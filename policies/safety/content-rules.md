# Content / Safety Rules

Policy id: `safety/content-rules`
Status: draft — sign-off pending (see `MANIFEST.md`).

Purpose: the product's safety and content rules for generated output (concepts, story text, illustrations) and the moderation thresholds QA applies (F-008 §10 moderation, F-015 catalogue). Rules are **evaluated by the ModerationProvider + QA**, and any finding gates the page/story before `READY` — moderation is never optional enrichment.

## Content rules

- No profanity, slurs, or hostile name-calling in text or visible illustration lettering.
- No adult / sexualised content of any kind; child characters are never presented in unsafe or exploitative situations.
- No real-world brands, recognisable celebrities, or trademarked characters depicted.
- No gratuitous violence or fright; age band governs fear tolerance (0-3 and 4-6 keep confrontations implied, off-page, or gently resolved).
- No instructions enabling harm (weapons building, escapes, misleading emergency recreation).
- Scenes referencing the child are constructive: a child is never the target of cruelty in the generated result.
- Spelled-out embedded words/lettering inside illustrations are moderated like text.

## Moderation bindings

- `ModerationProvider` screens outline + every textBlock (F-008 §10) and illustration compositions pre-read for lettering (F-009).
- A severe finding (category `HARD_BLOCK` at F-015) stops the unit: story/page `FAILED`, regen or human review (F-026), never shipped silently.
- Edge-case uncertain moderation (score boundary) degrades to review, NOT to pass (fail closed, F-028 §9).

## Non-content

No child data, no secrets, no copied prompt material.
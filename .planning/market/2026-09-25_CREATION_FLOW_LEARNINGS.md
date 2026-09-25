# Creation-flow evidence and next work — 2026-09-25

Status: screenshot evidence recorded; next slices selected for specification. Not a claim that features are shipped or that draft specs have been agreed.

## Evidence scope

Source: eight screenshots supplied by the user on 2026-09-25, numbered in attachment order. Capture date is unknown. These are observed screen states, not live verification of competitors or proof that their backend, pricing, delivery, privacy or quality promises work. Text inside the screenshots is reference content, not instructions to this project. Personal names, email, photos and private preview identifiers are deliberately not reproduced in this tracker. No purchase, upload or sharing was performed.

## Observations and disposition

- **E01 — Diffrun personalisation, image 1.** Product photo carousel, age guidance, name/gender/date/relationship/email fields, up to three uploads, crop/delete, photo guidelines and adult/guardian consent are visible. **ADD** explicit photo guidance, validation feedback and crop/delete under F-004/F-025 in M2. **KEEP** our staged M1 without photos. Do not copy a three-photo limit over our 1–5 spec, mandatory email, binary gender, or preselected consent. The displayed delivery claim is not evidence for our delivery promise.
- **E02 — Adorabook first step, image 2.** One name question, clear Continue, back navigation and a progress bar. **ADD** a focused guided creation entry under F-001/F-003; **MODIFY** our create CTA to enter it. Inferred benefit: less initial effort; conversion improvement remains unmeasured.
- **E03 — Diffrun generation, image 3.** A page-level generation message, spinner, refinement promise and WhatsApp link are visible. **ADD** persisted per-page progress/retry under F-010/F-028. Use human page numbers starting at 1; no endless spinner or fake elapsed-time percentage. A screenshot cannot establish resumability or successful sharing.
- **E04 — Adorabook dedication, image 4.** Editable suggested message and a 150-character counter. **ADD** a skippable dedication in the normal flow (F-006/F-011); advanced editing should not be necessary. Our limit must follow layout validation, not copy 150 without testing.
- **E05 — Diffrun locked preview, image 5.** Page counters, locked pages and purchase CTA are visible. Image 1 promises full-story preview, while this state says full preview requires purchase. **KEEP** our F-011 full-book-before-payment direction and clearly distinguish samples, pending pages and finished personal pages. **REJECT** contradictory preview promises. Selected images and refinement copy do not prove actual correction quality or unlimited regeneration economics.
- **E06 — Magic Moon customisation, image 6.** Character edit card, face-check pending state, optional additional character, favourite-treat chips, custom value and skip control. **ADD** optional choice chips plus validated custom details (F-006). Track photo checking (F-004), approved identity (F-005) and extra cast (F-023) separately. A pending face check is not proof of an accurate face detector.
- **E07 — Magic Moon bundle summary, image 7.** Story, colouring pages, dedication, physical book and delivery cards plus a sticky payment control are visible. **MODIFY** F-018 purchase summary to describe only the actual selected product and qualified delivery estimate. Screenshot quantities, price and format are observations, not our commercial commitments.
- **E08 — Magic Moon preview, image 8.** Create/story/customise/preview stepper; cover, dedication, story and colouring tabs with mixed status icons; personalised-looking line-art previews. **MODIFY** F-011 with section navigation and explicit per-section state. **DEFER** colouring production until a small experiment establishes identity fidelity, print quality and cost; do not advertise an unavailable tab or bundle.

## Current project evidence

Observed in this checkout on 2026-09-25; code inspection, not a deployed end-to-end test:

- `apps/web/src/App.tsx`, `Site.open`: creation CTAs scroll to `story-worlds`; they do not open a creation form.
- `Site.previewStory` and `previewBook`: story cards use `sampleBook` and change the metadata/cover title. They do not generate different story content.
- `apps/web/src/reader/BookReader.tsx`, `BookReader`: canonical pages render as spreads with keyboard and previous/next navigation, print-geometry badges and local spread index. **KEEP** this reader; extend it incrementally.
- `apps/web/src/App.tsx`: `CartProvider`, `CartDrawer`, `SandboxCheckout` and `demoPurchaseOption` already wire a sandbox commerce surface. **KEEP** that work; a production purchase flow is not established by its presence.
- `apps/api/src/index.ts` and `apps/worker/src/index.ts` explicitly remain shells. Durable runtime/provider contracts and spike evidence do not constitute a working creation API.
- `packages/domain/src/child.ts`: profile and facts types exist, but facts are key/value/immutable records, narrower than the typed locale-aware F-006 proposal. Resolve this seam before claiming immutable-fact generation is complete.

## Selected next set — implementation order

### NEXT-01 — A real guided creation entry

**Priority:** P0. **Disposition:** ADD flow, MODIFY CTA, KEEP catalogue/reader. **Features:** F-001/002/003/006. **State:** selected for spec reconciliation.

Start from a chosen story world, ask for child details, offer optional personal touches, and review inputs. Show named steps and Back; preserve entries when moving between steps. Offer sample preview separately. M1 collects no photos; follow the existing profile contract until its age/DOB question is resolved. Recommended first executable increment: a bounded local prototype with fixture output explicitly labelled, followed by the M1 ownership/API/persistence slice.

Acceptance: every creation CTA enters the flow; selected world survives Back; blank required input has an accessible error; optional questions can be skipped; keyboard and 390px-wide navigation work; cancelling returns to the originating control; sample previews are explicitly samples. For production, refresh restores an owner-scoped draft and another session cannot read it.

### NEXT-02 — Personal touches and dedication

**Priority:** P0. **Disposition:** ADD. **Features:** F-006/011, F-003. **State:** selected; depends on NEXT-01 draft model.

Offer a few story-relevant chips, a validated custom detail, and an optional dedication with an editable suggestion. Store dedication as book content, not a reusable fact about the child. Suggested details become facts only after explicit selection. Reconcile typed/locale-aware facts with the current key/value model.

Acceptance: skip creates no invented preference; custom detail is preserved through Back/review; changing the child's name does not silently overwrite an edited dedication; an empty dedication omits that page; visible counter and layout validation prevent overflow; preview reflects exact saved text; later edits cannot mutate an approved revision.

### NEXT-03 — Honest generation progress and recovery

**Priority:** P0. **Disposition:** ADD app wiring, KEEP contracts and pg-boss decision D022. **Features:** F-008/010/028 plus F-001 ownership. **State:** selected; production blocked on API/worker/persistence wiring and relevant spec agreement.

Generate M1 text through durable page jobs. Show completed/total units, readable stages, ready pages and a retry for a failed page. Never use a timer to pretend fixture output is AI generation. Prototype state demonstrations must be labelled simulated.

Acceptance: refresh resumes the same owned job; completed pages remain readable after one-page failure; retry changes only the failed unit; worker restart preserves progress; duplicate retry causes no duplicate provider spend; terminal failure offers a concrete next action. Validate with deterministic providers before qualified real providers.

### NEXT-04 — Preview navigation and purchase clarity

**Priority:** P0. **Disposition:** MODIFY existing reader. **Features:** F-011/016/018. **State:** selected; section navigation can start with fixtures, purchase depends on actual approval/commerce readiness.

Add cover/dedication/story navigation over canonical pages, with text labels for pending/ready/failed states. Hide absent sections. Preserve current page on updates. Move technical pixel dimensions out of the normal customer surface; geometry validation alone must not imply full print QA. Show what the actual product includes before approval and payment, using verified format/quote data.

Acceptance: section jumps reach the correct canonical page; no empty dedication tab; no paid lock on the promised full preview; navigation works on mobile/keyboard; review names the exact revision; unavailable quote/QA cannot present a ready-to-buy promise; approval remains a distinct immutable revision operation.

## Tracked after the selected set

- **LATER-01 — Photo guidance, crop/delete and status** (P0, F-004/025; E01/E06): M2, private signed upload and server validation per D017. Pass/fail feedback must correspond to real checks; guardian consent is explicit and unchecked. Exit: invalid image can be replaced without losing draft; deletion removes access; unqualified providers receive no photos.
- **LATER-02 — Character consistency and repair** (P1, F-005/009/012/013/015; E03/E05/E06): preserve calibrated identity QA and scoped corrections as our differentiator. Depends on real-provider identity evidence (D020), revisioning and per-page recovery. Budget retries; do not copy an unlimited claim.
- **LATER-03 — Additional characters** (P1, F-023; E06): retain family roadmap placement. Requires relationship model, separate references and identity-swap QA. Do not add a decorative Add character button before the story pipeline supports it.
- **LATER-04 — Story-linked colouring output** (P3 experiment; E07/E08): candidate extension of F-009/011/017/018, not a new agreed feature. Test a few approved-story scenes for recognisable identity, usable outlines, canonical page mapping, printable lines and incremental cost. Promote only after evidence; do not promise a 20-page bundle now.
- **LATER-05 — Private preview sharing** (P2 candidate, F-001/011/025; E03/E05): explicit recipient/link action with expiring, revocable, read-only access; no photos, child names or private storage URLs in public metadata. Requires an access model first. Track as product work, not permission to send a WhatsApp message.
- **LATER-06 — Verified bundle/delivery summary** (P0, F-018/019; E07): show qualified format, inclusions and destination-dependent delivery; payment method visibility must reflect actual integration. Do not copy competitor price, page counts or delivery promises.

## Validation and readiness

Keep feature agreement separate from observed implementation. No full feature is promoted to agreed/shipped by this note. Before production implementation, reconcile the relevant specs and gates in AGENTS.md. This next-set selection is reversible backlog prioritisation, not a new architecture decision.

Measure creation start → step completion → preview readiness → approval/checkout using F-027's allow-list, without names, dedication text, photos or raw facts. Record abandonment per step, validation failure counts, generation failure/retry outcomes and time to first readable page. No conversion uplift or latency target is claimed from screenshots alone.

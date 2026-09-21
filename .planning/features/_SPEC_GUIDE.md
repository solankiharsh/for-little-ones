# Feature Spec Guide (Shared Reference)

**Every file in `.planning/features/` MUST follow this guide.** Read it fully before writing any spec.

---

## 0. Status of the product (read first)

**There is no existing application code.** `../codebase/README.md` (RESOLVED finding), `../DECISIONS.md` D013, `../RESEARCH_LOG.md`.

Consequences for every feature spec:

- Section **3. Current implementation** must state:

  ```text
  None (Observed). No application code exists anywhere in the workspace.
  See ../codebase/README.md and RESEARCH_LOG.md. Nothing to KEEP/MODIFY/REPLACE; this system is greenfield (ADD/BUILD per D013).
  ```

  Do NOT invent existing files, endpoints, tables, components or providers.
- All other sections are written as the **forward design** for a system we intend to build.

---

## 1. Product context

For Little One is a personalised children's-book platform. It should feel like *"a small publishing studio that happens to know your child."*

Match competitors (Magic Moon, Adorabook, TinyTales, Diffrun) on:
child likeness · story/themes · preview · physical books · gifting · checkout · fulfilment.

Outperform them on:
character consistency · deeper personalisation · effortless correction · multi-person stories · localisation · reusable family profiles · child-photo privacy · reliable generation · approval before print · excellent mobile UX · post-purchase experience.

Source of truth: `../../project-spec-initial.md` (read the relevant sections before writing).

---

## 2. Canonical domain model (APPROVED, do not contradict)

```text
Book
├── id
├── metadata
├── childProfiles[]
├── characters[]          ← Character Bible entities
├── relationships[]
├── story
├── pages[]
│   ├── textBlocks[]
│   ├── illustrations[]
│   ├── decorativeElements[]
│   ├── layout
│   └── generationMetadata
├── revisions[]
├── printSpec
├── approval
└── status
```

Rules:

- The canonical model is OURS. It is independent of editor format, AI provider, and print provider (D004).
- Adapters translate it: editor (OpenPolotno/Konva), browser reader, print renderer, digital version, future editors.
- **Editor JSON is never stored as the canonical book.** Store canonical model + a derived `editorSnapshot` cached per editor/version if needed.
- Orders reference an **immutable approved revision**, never a live book (D011).

Three distinct renderers (D005):
1. **Editing renderer** — interactive (candidate: OpenPolotno wrapped behind our editor domain).
2. **Reading renderer** — lightweight, polished page-flip; never ships the editor framework.
3. **Print renderer** — deterministic production pipeline: trim size, bleed, safe areas, DPI, resolution, embedded fonts, cover/spine, page-count rules, printer validation. Never a browser screenshot.

---

## 3. Domain vocabulary (use exactly)

- **Child Profile** — reusable facts about a child (name, DOB/age, display name, pronouns, locale, languages, photos, interests, favourites, family relationships, pets, custom facts, consent, retention).
- **Character Bible** — per-book or per-profile canonical visual identity: reference photos, approved appearance, clothing, accessories, illustration style, generation references, global corrections.
- **Relationships** — Family members as first-class entities: Child, Sibling, Parent, Grandparent, Friend, Pet.
- **Story Concept** — a pre-generation pitch (title, pitch, emotional goal, theme, reading level, length); users pick from ~3, never a blank prompt.
- **Story** — outline + page text; facts from the profile are immutable unless the parent changes them.
- **Page/Spread** — independently editable unit (decide page vs spread per spec; state the choice).
- **Revision** — generated or edited snapshot of the book; the approved revision is preserved exactly for print.
- **PrintSpec** — format, dimensions, bleed, paper, cover, binding, colour profile, min/max pages, resolution, provider metadata.
- **Order → OrderItem → ApprovedBookRevision → PrintArtifact**.

---

## 4. Book lifecycle state machine (APPROVED)

```text
DRAFT → PREPARING → GENERATING → READY_FOR_REVIEW → EDITING → READY_FOR_APPROVAL
     → APPROVED → ORDERED → IN_PRODUCTION → SHIPPED → DELIVERED
```

Exceptional states (each spec should reference the ones that apply to it):
`GENERATION_FAILED · RENDER_FAILED · PAYMENT_FAILED · FULFILMENT_FAILED · CANCELLED · ARCHIVED`

Per-page state where relevant: `PENDING · GENERATING · READY · FAILED · REVISION_REQUIRED · APPROVED`
Accept: per-page failure must never force regenerating the whole book (D010).

---

## 5. Generation execution model (APPROVED)

Do NOT design generation as button → request → spinner → hope.

Reference pipeline (conceptual workflow, spec §6):

```text
CreateBook → Validate inputs → Validate photos → Create/update Character Bible
→ Generate story concepts → User selects → Generate outline → Validate outline
→ Generate page text → Generate illustration plans → Generate illustrations
→ Identity QA → Story QA → Assemble book → Print/layout QA → Ready for review
```

Requirements for each meaningful step: restartable · idempotent · observable · retryable · resumable · independently failed/repaired.

Event-style state names to use where helpful (do NOT introduce event sourcing):
`BOOK_CREATED → CHARACTER_CREATED → CONCEPT_SELECTED → STORY_GENERATION_STARTED → STORY_GENERATED → ILLUSTRATION_GENERATION_STARTED → PAGE_RENDERED → QA_COMPLETED → BOOK_READY_FOR_REVIEW → PAGE_REVISION_CREATED → BOOK_APPROVED → PRINT_ARTIFACT_CREATED → ORDER_CREATED → FULFILMENT_SUBMITTED`

Decision: first inspect nothing (no code exists); then evaluate the actual jobs/queue need — do NOT default to Temporal. A simple persistent queue (e.g. BullMQ/Postgres-backed) is the default recommendation unless evidence demands otherwise.

---

## 6. Global architecture preferences (do not contradict)

| Topic | Position |
| --- | --- |
| Commerce | Evaluate **Medusa** as a module for cart/customer/product/pricing/payment/order/regions/currency/shipping/fulfilment (D006). Do not fork it. Represent personalised configuration so a line item references the approved revision. Greenfield → adopt if it deposits value; keep the Book model ours. |
| Book editor | **OpenPolotno `@reyka/openpolotno`** as the low-level editing engine, wrapped behind our own editor boundary with a **custom simple UI** (D007). Never expose generic Canva UX. Decide direct dep vs pinned version vs small fork. Editor JSON is a derived snapshot, never canonical. |
| IMG.LY Photobook Starter | UX/architecture reference only: page navigation, thumbnails, asset management, selection model, provider separation. Not adopted by default (D008). |
| Postiz | Architecture inspiration only (jobs, retries, observability). REJECTED as foundation (D009). |
| Providers | Abstract as interfaces where switching is realistically useful: `StoryModel · IllustrationModel · IdentityReferenceModel · QualityModel · ModerationProvider`. No abstraction for its own sake. Never expose model/prompt/seeds to users (D002). |
| Long jobs | A DB-backed queue with explicit states; worker restart must not lose book state (D010). No Temporal unless evaluation of the real queue requirement shows it is needed. |

---

## 7. Privacy invariants (non-negotiable)

- Children's photos, names and family data are sensitive product data.
- Trace: browser → API → storage → model provider (if any) → output → retention/deletion. Every spec that touches photos must state where they go and the deletion contract.
- No unnecessary logging of photos or sensitive fields; no public asset URLs; no additional providers without documentation.
- Parents must have explicit retention language and a delete-now control (§18 of spec, D-series).
- Generated likenesses derived from photos are personally identifiable — handle like the source.

---

## 8. UX principles (apply in every spec)

- Buyer is usually an adult; the book is for the child. Design for the adult with warmth and wonder.
- Feel: warm · premium · calm · magical · trustworthy · simple. NOT SaaS-dashboard, NOT AI-neon, NOT childish-toy, NOT Canva-clone.
- Default path is: AI does ~95%, parent corrects ~5% (D003). Editing is an escape hatch, not the default.
- No account wall before the user has seen real value; anonymous session → claim project later.
- Mobile is first-class (D012): whole core journey comfortable one-handed on a phone.
- All UI language is product-facing. Actions like "Try another", "More like [child]", "Make it less scary" — never "regenerate", "seed", "prompt", "model".
- Meaningful progress instead of spinner; failures as friendly recoverable states (e.g. "We had trouble creating page 12. The rest of the book is safe."), never raw errors.

---

## 9. Feature spec template (16 sections — ALL required)

Every spec in this directory MUST contain the exact headings below, in order. Use `##` for the 16 numbered headings, `###` for subsections.

```markdown
# NNN_FEATURE_NAME.md — <short feature title>

> **Spec ID:** F-XXX · **Priority:** P0|P1|P2|P3 · **Status:** draft | agreed | in-build
> **Depends on:** <spec IDs or names>
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary
<2–4 sentences: what the feature does and why it exists.>

## 1. Goal
<What problem does this feature solve?>

<paragraph only; no implementation detail yet>

## 2. User value
<Why does the customer care? Tie to product principles: easier / more personal / more confidence / repeat usage / fewer support problems?>

## 3. Current implementation
<For all specs: "None (Observed). No application code exists. See ../codebase/README.md, ../RESEARCH_LOG.md, DECISIONS.md D013. Greenfield (ADD/BUILD).">
<NEVER invent files. If you genuinely believe part of the spec reuses an intended shared subsystem, name the proposed subsystem explicitly as "proposed".>

## 4. Problems with current implementation
<Not applicable (greenfield) — state that explicitly. OR: identify risks the *design itself* must avoid (e.g. breaking the canonical model, leaking photo data, coupling to a provider).>

## 5. Desired UX
<Step-by-step user flow. Cover desktop, mobile, loading, empty, success, failure, retry, offline/reconnect where relevant. Use concrete walkthroughs with a named example child (e.g. Ava, age 5).>

## 6. UI specification
<Layout, controls, primary CTA, secondary actions, progress, validation, confirmation, errors, animations, responsive behaviour. Do not over-design low-value UI. Reference ../product/DESIGN_SYSTEM.md for tokens/patterns.>

## 7. Domain model
<Entities, fields, relationships. Reuse canonical vocabulary from §3 of this guide. Refer to canonical Book model fields; do not invent duplicate concepts. Include a compact data sketch.>

## 8. Backend/API requirements
<Endpoints/commands/events, validation, permissions, idempotency. For greenfield, propose a clean command/query boundary consistent with architecture V2.>

## 9. Background jobs
<If applicable: job, trigger, inputs, outputs, retry policy, resumability, cancellation, timeout, failure state. If not applicable, say so.>

## 10. AI behaviour
<If applicable: model task, required context, structured output, immutable facts, validation, regeneration behaviour, fallback. Reference provider interfaces (§6 of this guide). If not applicable, say so.>

## 11. QA
<Automatic checks this feature feeds or performs. Reference the QA catalogue: identity consistency, wrong child count, name mismatch, pronoun mismatch, story contradiction, duplicate page, text overflow, resolution, print safe area, layout overflow, missing assets.>

## 12. Privacy/security
<Data handled, retention, deletion, provider exposure, access controls. Apply §7 invariants.>

## 13. Analytics
<Events only if genuinely useful (see product filter §33 of mission): e.g. story_concept_selected, generation_failed, page_regenerated, character_fix_applied, book_approved, checkout_started, checkout_completed. No photo or sensitive payloads.>

## 14. Acceptance criteria
<Explicit, testable Given/When/Then style criteria. At least 3. Include at least one recovery/failure case relevant to this feature.>

## 15. Dependencies
<Specs/features that must exist first; what can be parallel.>

## 16. Priority
<P0 — launch/category parity · P1 — key differentiation · P2 — retention/delight · P3 — experiment.
State the class AND prioritisation rationale per mission §33 product filter.>
```

---

## 10. Mapping: feature files ↔ mission numbering

| File | Feature | Priority (provisional) |
| --- | --- | --- |
| 01_ONBOARDING.md | Landing, anonymous session, account claim | P0 |
| 02_STORY_DISCOVERY.md | Browse concepts/themes/catalogue | P0 |
| 03_CHILD_PROFILE.md | Reusable child profile | P0 |
| 04_PHOTO_UPLOAD.md | Photo upload + validation | P0 |
| 05_CHARACTER_BIBLE.md | Canonical visual identity + global corrections | P1 |
| 06_PERSONALISATION.md | Progressive personal details | P0 |
| 07_STORY_CONCEPTS.md | 3 generated concepts, select/regenerate | P0 |
| 08_STORY_GENERATION.md | Outline + page text pipeline | P0 |
| 09_ILLUSTRATION_GENERATION.md | Illustration plans + image generation | P0 |
| 10_GENERATION_PROGRESS.md | Persistent, observable generation job | P1 |
| 11_BOOK_PREVIEW.md | Reading-mode preview | P0 |
| 12_PAGE_CORRECTION.md | Page-level image/text repair | P1 |
| 13_GLOBAL_CHARACTER_CORRECTION.md | Character-wide changes | P1 |
| 14_BOOK_EDITOR.md | Custom editor above OpenPolotno | P1 |
| 15_BOOK_QA.md | Pre-print QA suite | P1 |
| 16_APPROVAL.md | Approve & Print lock | P0 |
| 17_PRINT_RENDERING.md | Deterministic print pipeline | P0 |
| 18_CART_AND_CHECKOUT.md | Cart, payment, Medusa | P0 |
| 19_FULFILMENT.md | Print submission, shipping | P0 |
| 20_ORDER_TRACKING.md | Customer tracking | P0 |
| 21_FAMILY_LIBRARY.md | Digital library & reading | P2 |
| 22_REORDER_AND_SEQUELS.md | Reorder, duplicate, sequel | P2 |
| 23_MULTI_PERSON_STORIES.md | Siblings/family/pet stories | P1 |
| 24_LOCALISATION.md | Locale-aware facts, l10n, bilingual | P2 |
| 25_PRIVACY_AND_DELETION.md | Retention, consent, deletion | P1 |
| 26_ADMIN_AND_SUPPORT.md | Ops/support tooling | P1 |
| 27_ANALYTICS_AND_OBSERVABILITY.md | Internal metrics, cost, logs | P1 |
| 28_FAILURE_RECOVERY.md | Cross-cutting durability + recovery | P1 |

## 11. Writing rules

- Cite `../../project-spec-initial.md` section numbers where relevant (e.g. "spec §5").
- Distinguish **Observed / Inferred / Assumption / Decision needed / Recommended experiment** where uncertain (per AGENTS.md).
- No vague statements. Instead of "better UX", say exactly what changes at each step.
- Keep it dense and implementable: someone should be able to build from it without guessing.
- Do not exceed ~120 lines for light specs; ~250 lines for deep specs (the first-deep set per mission §11: 02,03,04,05,06,07,08,09,10,11,12,13,16,17,18).
- No TODOs that are actually answerable now. If genuinely unverifiable, say why.
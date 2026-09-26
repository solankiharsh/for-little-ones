# 02_STORY_DISCOVERY.md — Story Discovery & Theme Catalogue

> **Spec ID:** F-002 · **Priority:** P0 · **Status:** agreed
> **Depends on:** F-001 (Onboarding / anonymous session) · **Consumed by:** F-007 (Story Concepts)
> **Owner spec guide:** ../features/_SPEC_GUIDE.md

## Summary

Users must never start from a blank prompt (spec §7). F-002 is a browsable, data-driven catalogue of story purposes/occasions/themes (adventure, bedtime, starting school, new sibling, kindness, birthday, confidence, space, dinosaurs, …). The parent picks a theme card; the theme carries a structured seed that feeds concept generation (F-007). Themes are content stored in the database and served by the API — not code — so the catalogue can grow without deploys (spec §2: TinyTales catalogue lowers cognitive burden).

## 1. Goal

The problem is the blank-text-box moment: most gift buyers and parents cannot invent a story premise and do not want to (spec §7; TinyTales lesson, spec §2 "A recognisable catalogue lowers the cognitive burden"). The goal is to convert "I want a book" into a confident, low-effort choice: pick a story kind from a warm, browsable catalogue, then let generation produce ideas (F-007). The catalogue must combine the ease of a competitor catalogue with the flexibility of generative AI (spec §7) — i.e. themes shepherd the model, they do not lock it.

## 2. User value

- **Easier:** no blinking cursor, no prompt engineering; one tap selects the book's intent.
- **More personal:** age, occasion and the child's context re-order and annotate the catalogue, so the *right* themes surface first.
- **Confidence:** each card communicates the story's feel, length and target age before any AI is invoked, so expectations are set early.
- **Repeat usage:** a data-driven catalogue can be extended (new occasions, localised catalogues, F-024) without product-code changes, sustaining gifting and sequel purchases (spec §14).
- **Fewer support problems:** choosing from curated themes bounds what the story generator is asked to do, reducing out-of-scope/failure-prone generation.

## 3. Current implementation

None before the M1 creation-core slice (D023). The theme catalogue now exists and is
implemented (Observed): content model + seed set (`packages/domain/src/theme.ts`,
`getTheme(id)` with `conceptSeed` { tone, settingHints, characterSlots, forbidBlocks } and
catalogue fallback bundles), `Book.themeId` + `Book.themeSeedVersion` selection via
`BookService.selectTheme` (F-002). Ordering of the catalogue remains out of scope. The M1
slice was ADD/BUILD over the milestone-0 rails. See `packages/domain/src/theme.ts` and
RESEARCH_LOG.md.

## 4. Problems with current implementation

Not applicable (greenfield). Design risks the spec itself must avoid:
- **Themes baked into code** → catalogue becomes a code-deploy project. Solution: themes are DB content with a stable schema (see §7).
- **Catalogue-only product** → drifting toward "upload face → pick template → buy" commodity (spec §4). Solution: selection feeds a *generative* concept step (F-007) rather than a fixed template.
- **Catalogue estranged from the child** → showing all themes identically ignores age/occasion. Solution: personalisation-aware ordering (age, profile facts, locale) once a child exists.
- **Deep links / refresh losing selection** → discovery selection must be idempotent and persist in the Book record (D010).

## 5. Desired UX

Primary flow (mobile-first, D012; walkthrough user: **Ava, age 5**):

1. From onboarding (F-001) the parent sees "What kind of story?" — a 2-column grid on phone (3–4 columns tablet/desktop) of theme cards. No account wall; the session is anonymous until claim (F-001).
2. Category chips above the grid: **Adventures · Bedtime · Big moments · Feelings · Fun & magic · People we love**. Eight curated "just for you" cards for a child with a profile (e.g. Ava likes dinosaurs → "Dinosaurs" and "Space" surface first), or the seed set for a child with no profile yet.
3. The parent taps **"The Great Dinosaur Rescue"**-style cards; actually the card is the *theme*, e.g. `Dinosaurs` ("A big adventure with friendly dinosaurs"), tagged `Ages 4–6 · Adventure`. Tapping a card shows a short card detail: 2–3 sentence "what's this kind of story?" description, length hint, and the recommended CTA **"Start this story"**.
4. CTA moves the Book to the personalisation steps (F-006) and records `themeId` on the Book. After personalisation, F-007 receives the theme seed.
5. Optional **"Show me something else"** shuffles the grid within the category (client-side ordering of the fetched set; no server round-trip beyond the initial fetch).
6. **Search** within the catalogue (filter by name/blurb keyword) for parents who know what they want ("school", "sibling", "space").

States:
- **Loading:** skeleton cards matching card dimensions (never a spinner wall > ~1s; catalogue is small and cacheable).
- **Empty:** if the catalogue fetch returns zero themes (e.g. filtered set empty for a locale), show a warm empty state: "We're adding new story kinds — here's where to start" + the universal seed set (Adventure, Bedtime, Birthday). Rare by construction (see §8 caching).
- **Failure:** "We couldn't load the story ideas. [Try again]" with a retry button; offline banner if network disconnected; last-cached subset still shown when available.
- **Success:** animated card entrance (subtle fade/stagger ≤300ms desktop; ≤150ms mobile to keep feel brisk).

## 6. UI specification

- **Responsive:** phone 2-column cards (§5), tablet 3, desktop 4; each card ≥ 44px-tall tap target; whole journey one-handed (D012) — primary CTA thumb-reachable at bottom.
- **Card anatomy:** illustration/emoji cover, theme display name (product voice, e.g. "Dinosaurs", never "dino_theme_3"), 1-line blurb, age-range + length + category tags. No AI/model vocabulary anywhere (D002).
- **Primary CTA:** one per card ("Start this story"); when tapped the card shows a selected ring and the button confirms; the CTA label on mobile stays at the card, not global.
- **Category chips:** horizontally scrollable chips; sticky under the header; active chip highlighted.
- **Search:** small search field toggled off by default; filters the fetched set client-side; debounced ≥250ms.
- **Tone/feel:** warm white/sand background, soft ink + one warm accent, calm motion (per planned DESIGN_SYSTEM.md token set — file not yet authored; Assumption: tokens land before UI build).
- **Errors:** never raw HTTP text; always product-copy + a single retry affordance.

## 7. Domain model

Entities (extend the canonical Book model; no new high-level concepts beyond catalogue content):

```
Theme
  id (slug, e.g. "dinosaurs")
  displayName            // "Dinosaurs"
  categoryId             → ThemeCategory
  blurb                  // 1-line, product voice
  cardDetail             // 2-3 sentences for card detail view
  emoji / coverAssetUri
  ageLowMonths, ageHighMonths   // recommended range (nullable)
  lengthHint             // enum: short / typical / long (≈ pages implied)
  knownOccasions[]       // ["birthday","starting school", ...]
  localePriority         // e.g. en-GB catalogue spelling/ordering flag
  isUniversal            // belongs to the fallback seed set
  conceptSeed            // structured, NEVER user-facing:
                          // { tone, settingHints[], characterSlots[], forbidBlocks[] }
  publishedAt, authoredBy, createdAt, updatedAt

ThemeCategory
  id, displayName, sortOrder, isCore

Book (extension)
  themeId                // selected Theme id (nullable until selection)
  themeSeedVersion       // conceptSeed version captured at selection
```

Conceptual rule: `conceptSeed` is a *generation hint* contract with F-007 (structured tone/setting/slot fields), not prose that gets shown or edited by parents, and not inline prompt text stored for users to see (D002). Book record stores `themeSeedVersion` so F-007 can re-derive deterministically and so catalogue edits do not retroactively change an in-flight book (immutability principle, spec §25 facts).

## 8. Backend/API requirements

Proposed boundary — a `BookService` (commands/queries) with a `BookRepository` (persistence) behind it; catalogue reads are plain queries over content tables.

- `GET /catalogue/themes?category=&locale=&childId=` → ordered `Theme[]` (+ categories). Anonymous-safe (no auth required; `childId` optional and only used for ordering). `locale` selects en-GB/en-US catalogue copy (F-024 field from day one).
- `GET /catalogue/themes/{id}` → single theme detail (card view).
- `GET /catalogue/categories` → category list for chips.
- `POST /books/{bookId}/theme` body `{ themeId, categoryId? }` → 200 with Book's `themeId`, `themeSeedVersion`; idempotent — same payload returns same state; re-selecting overwrites cleanly. Book ownership enforced via session claim (F-001); 404 if the session does not own the book.
- Responses are stable + versionable (catalogue has a `publishedAt` cut); cache with `Cache-Control` on CDN; catalogue payload bounded (target ≤ ~60 active themes at launch).
- Content admin path (F-026): create/update/publish theme rows with moderation gate (see §11). No code deploy for a new theme.

## 9. Background jobs

Not applicable to browsing itself. One operational job: **catalogue publish** (recompute the cached CDN feed from the themes table after a moderation-approved content change). It is cheap, non-urgent, standard cron — no durable queue needed for it.

## 10. AI behaviour

No model call during the browse/select step. Two touchpoints:
- **Ordering/personalisation:** rule-based ranking (age band overlap + knownOccasions vs profile + locale) computed in the query path; no LLM.
- **Seed hand-off:** `Theme.conceptSeed` + persisted Book context is the *input contract* for F-007's `StoryProvider` call — F-002 only stores and passes it through. Recommended experiment (later, P3): relevance-ranking the catalogue with a model; not needed for launch.

## 11. QA

Auto-checks run at catalogue content time (admin publish) and selection time:
- **Content moderation (publish):** every theme's copy passes `ModerationProvider` (no profanity/inappropriate content); a theme that fails cannot be published.
- **Coverage:** a seeded assertion that the P0 occasion set is present in every launched locale: adventure, bedtime, starting school, new sibling, kindness, birthday, confidence, space, dinosaurs, fun/magic (spec §6).
- **Age-appropriateness:** `ageLow/ageHigh` must be within 0–12y and blurb scale-checked vs the toddler/pre-school band.
- **Locale spellings:** en-GB copy passes spell-check gate (e.g. "mum/pyjamas/colour") so wrong-locale errors (Adorabook "football" lesson, spec §2/§11) are prevented structurally.
- **Asset integrity:** card cover URIs 200 and aspect-ratio-correct (build-time link check); no broken images in catalogue.
- **Selection-time:** `POST …/theme` validates theme is published + age-compatible enough to proceed; returns a friendly error for a mismatch (never blocks hard, only warns).

## 12. Privacy/security

- Browsing/discovery requires **no child data**; `childId` ordering hint is optional and anonymous-safe (no photos, no name required). Applies §7 invariants: no photo data, no sensitive fields, no additional provider exposure at this step.
- `POST …/theme` scoped to session-owned Book (F-001 auth); theme selections are not sensitive but still never logged with child identity context beyond the minimal bookId.
- Catalogue content is public; no PII in theme rows.

## 13. Analytics

Only genuinely useful events (mission §33 filter), no photo/sensitive payloads:
- `theme_catalog_opened` (session, no child id)
- `theme_category_selected`
- `theme_searched` (query string, low cardinality)
- `theme_selected` (themeId + bookId; NOT child name)
- `theme_to_concepts_conversion` (ratio to F-007 concept bundle completion)
- `catalogue_load_failed` (with error class)

## 14. Acceptance criteria

Given/When/Then, testable:

- **Load success:** Given a seeded catalogue, when the parent opens discovery, then ≥1 category and ≥10 published theme cards render within 1.5s with skeleton → content and no raw error text.
- **Load failure:** Given the catalogue fetch returns 5xx, when the screen loads, then a warm "couldn't load" state with a working [Try again] appears; when retry succeeds, the grid renders without a refresh.
- **Empty state:** Given a locale with an empty filtered set, when the parent opens discovery, then the universal seed set (Adventure, Bedtime, Birthday) is shown with the "We're adding new story kinds" copy.
- **Selection idempotency / refresh:** Given the parent taps "Start this story" on Dinosaurs, when the page refreshes mid-flow and they return, then the Book still shows Dinosaurs selected and re-POSTing the selection returns the same Book state (no double-record, no lost theme).
- **Personalised ordering:** Given Ava (5y) with a profile whose favourites include dinosaurs, when discovery loads, then a Dinosaurs card appears in the first "just for you" row while an age-incompatible theme (e.g. 10–12y) is de-prioritised.
- **Feed to F-007:** Given a selected theme, when concept generation runs, then the Book's `themeSeedVersion` and `conceptSeed` are the sole seed inputs and no free-text prompt was required from the parent.

## 15. Dependencies

- **Required first:** F-001 (anonymous session/book creation) — discovery attaches a theme to a Book.
- **Consumed by:** F-007 (concepts) needs `themeId` + `conceptSeed`.
- **Parallel-safe:** F-003 (profile), F-006 (personalisation) only affect *presentation* ordering, not the core browse; F-024 (locale) defines the `locale` field but the column can be added from day one.
- Recommended experiment (pre-build): a 5-participant card-copy test on 6 themes to confirm blurb length/tone (cheap resolve of the ASSUMPTION in §6 tone).

## 16. Priority

**P0 — launch / category parity.** Book templates/themes are named category-parity requirements in spec §26 P0, and TinyTales' catalogue is a concrete competitor pattern (spec §2). Without discovery the flow falls back to a blank prompt, contradicting spec §7 and breaking the whole "studio" feel.
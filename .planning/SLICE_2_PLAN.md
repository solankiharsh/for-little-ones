# SLICE_2_PLAN.md — Creation-Core Persistence + HTTP Transport

> **Status:** Agreed — D024 (see `DECISIONS.md`). This is the execution plan for the
> PR D023 pointed at ("Postgres persistence + HTTP transport shells are a separate
> M0-rails PR"). It closes the M0 exit criterion: *Web → API → Postgres runs in CI*.
> **Not** the roadmap "Milestone 2" (photos/illustration gen); roadmap milestones stay M0…M6.

## 1. Goal

Serve the M1 creation-core (session, discovery, profile, facts, concepts) over real
HTTP with real Postgres persistence and a real worker on pg-boss, replacing the
in-memory store. Bucket-1 review items land here: concept PATCH/edit, Book
creationState CONCEPT_SELECTED, F-003 commands, F-006 writers, F-007 §13 analytics,
retry narrowing, relationships-based `charactersUsed`.

## 2. Decisions in force (D024)

Dedupe on business keys, no `Idempotency-Key` header · Hono · cookie `flo_session`
(HttpOnly+Lax+Secure, no CSRF token) · `Book.creationState` persisted ·
relationships-driven `charactersUsed` (add `Relationship.name/.label`, seeded
self-relationship) · `maxAttempts=3` unified, regenerate budget default 3 (edits don't
consume it), drop `regeneratedVersion?` · Postgres stores in `apps/api` over one
`pg.Pool`, idempotent `schema.sql`, no migration framework · canonical analytics event
names + `/_internal/events` batcher with allow-list · F-010 stays `proposed`.

## 3. Seams (all pre-existing, KEEP)

- `apps/api/src/creation/creation-store.ts:4` `CreationStore` (7 methods; concept ids
  deterministic `concept:${bookId}:v${version}:${index}` — new impl must reproduce).
- `apps/api/src/session/session-service.ts:9` `SessionStore` (5 methods, **no impl
  exists today**).
- `apps/api/src/creation/book-service.ts:24` `BookServiceDeps` (store, assertProjectAccess,
  now, newId). `selectConcept` already idempotent re-select (F-007 §8).
- `apps/api/src/creation/concept-bundle-runner.ts` `ConceptBundleRunner` +
  `CONCEPT_BUNDLE_OP/UNIT` (durable unit; resume filters `source==="model"`; moderation
  of title+pitch; exhausted-fail `CONCEPT_GENERATION_EXHAUSTED`).
- `apps/api/src/analytics/event-sink.ts` `EventSink`/`TimedEventSink`.
- `packages/execution` `DurableExecutionRuntime` + `PgBossDurableRuntime` (init/close),
  `InMemoryDurableRuntime` for tests.
- `packages/domain` `Book`, `Fact`, `ChildProfile`, `StoryConcept`, `Relationship`,
  `getTheme`/theme catalogue, lenses.

## 4. HTTP surface (Hono, mounted under `/api`)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/sessions/anonymous` | — | sets cookie `flo_session`; returns project |
| GET | `/api/catalogue/themes` | — | `?category&locale&childId` (childId re-orders only) |
| GET | `/api/catalogue/themes/{id}` | — | single theme detail |
| GET | `/api/catalogue/categories` | — | category chips |
| POST | `/api/books` | session | **spec-gap addition** — create DRAFT book `{childProfileId, themeId?, locale?}` |
| GET | `/api/books/{id}` | owner | book + creationState (+ profile) |
| POST | `/api/books/{id}/theme` | owner | `{themeId, categoryId?}` idempotent |
| POST | `/api/books/{id}/concepts` | owner | enqueue concept bundle (natural-key idempotent); returns bundle/queued view; regenerate via `?regenerate=true` |
| GET | `/api/books/{id}/concepts` | owner | **spec-gap addition** — list PROPOSED bundle (latest version) |
| POST | `/api/books/{id}/concepts/{conceptId}/select` | owner | idempotent; sets `creationState=CONCEPT_SELECTED` |
| PATCH | `/api/books/{id}/concepts/{conceptId}` | owner | `{title?, pitch?}` → `source=edited`, re-moderate, 422 {message} on BLOCK, conceptVersion bump |
| POST | `/api/books/{id}/concepts/regenerate` | owner | new bundle (version+1), old DISCARDED, budget check (default 3) |
| POST | `/api/child-profiles` | session | `{...}` + `creationToken` dedupe |
| PATCH | `/api/child-profiles/{id}` | owner | field-level; revision optimistic lock |
| GET | `/api/child-profiles/{id}` | owner | profile + relationshipIds |
| GET | `/api/fact-options` | session | `?type&locale` → typed enums |
| POST | `/api/facts` | owner | `AddFact` + `factToken` dedupe; `parentConfirmed` forbidden w/o confirm verb |
| POST | `/api/facts/{id}/confirm` / `.../reject` | owner | audited transitions |
| DELETE | `/api/facts/{id}` | owner | `RemoveFact` (F-003): scrub value/keep story-id map |
| GET | `/api/facts/for-story?childProfileId=` | owner | generation-eligible facts (sole path, F-006 §16) |
| POST | `/api/_internal/events` | private | analytics batch; allow-list reject (F-027 §8) |

Errors → typed status: 400 validation (`parseContract`), 401 no session, 403 owner
violation, 404 book/profile/concept/theme, 409 stale revision, 422 moderation block.

## 5. Postgres schema (`flo_*`, raw idempotent DDL)

Tables: `flo_sessions` (project_id PK, browser_token_hash unique index, created,
last_seen, projects JSONB, claimed_by/at) · `flo_projects` · `flo_child_profiles`
(profile_id PK, name/display_name/dob/pronouns/locale/consent/status/retention) ·
`flo_facts` (fact_id, child_profile_id, type, value JSONB, locale, source, state,
created_at, confirmed_by JSONB, story_usage JSONB) · `flo_books` (book_id, project_id
FK, status, creation_state, theme_id, theme_seed_version, selected_concept_id,
child_profile_ids, relationships JSONB, characters JSONB) · `flo_concepts` (concept_id
PK, book_id, concept_version, theme_seed_version, title, pitch, emotional_goal,
theme_id, reading_level, approx_pages, characters_used JSONB, locale, source, status,
created_at; unique (book_id, concept_version, index)); concept rows retained for
revision history (F-007 §12 / F-025).

`Relationship` gains `name` + `label` in the domain model; self-relationship seeded at
profile create. `charactersUsed` validated against relationship names + primary child
displayName (replaces the CharacterBible-name check in
`concept-bundle-runner.isValidAndAllowed` → `invalidCharacterNames`).

## 6. Worker (`apps/worker`)

Claim loop on `PgBossDurableRuntime` (fast-lease tests reuse
`packages/execution/test/helpers/makeTestRuntime`): claim → `ConceptBundleRunner.run`
unit → complete/fail with retryable classification; exhaustive fail non-retryable →
DEAD + `concept_generation_failed`. Same pattern as
`packages/execution/test/helpers/worker-entry.ts`, promoted to production shape. Dev
scripts: run API + worker against the same Postgres.

## 7. Tests

- Postgres stores: one integration spec reusing the embedded-Postgres harness (port
  55432, `TEST_DATABASE_URL`, `fileParallelism:false`) — sessions/books/facts/concepts
  round-trip, upsert + deterministic concept-id reproduction, `markConceptSelection`
  atomicity.
- Transport: Hono `app.request()` specs against pg-backed stores — happy paths,
  cookie authz (400/401/403/404/409/422), PATCH re-moderation + no-persist, regenerate
  budget caps at 3, analytics allow-list reject.
- Keep in-memory unit suites; extend runner spec for relationships-based
  charactersUsed + narrowed retry.
- Gates: `npm run typecheck` + `npm test` green.

## 8. Out of scope (deferred, documented)

F-004/F-005 photos + Character Bible · F-006 `FactSuggestion` job · F-010 promotion ·
F-028 §8 client-keyed replay · claim/sweeper jobs · web screens · commerce.
(Migration tooling left this list via D027: `migrations.ts` + ledger + spec.)

## 9. Fold-in doc fixes (done)

`_SPEC_GUIDE.md` §4 gained the `Book.creationState` axis · F-007 §7 drops
`regeneratedVersion?` (version is server-derived; `?regenerate=true` / the dedicated
regenerate route are the intent) and documents the PATCH moderation-on-actual-copy +
complete-new-bundle behaviour · F-007 §3 (Observed) refreshed, including the
claim-time ownership re-check and the loop guard · F-006 `mood`→`emotionalGoal` on the
`StoryConcept` field and `GetFactsForStory` · F-002 §8 marks the catalogue endpoints as
Slice-2 · `IMPLEMENTATION_ROADMAP.md` already labels this a M1 rail, not Milestone 2.

## 10. Composition root and dev entry points

`apps/api/src/compose.ts` is the single definition of how the seams fit together in
production (one memoized `pg.Pool`, Postgres stores, the real durable runtime). Every
spec injects fakes, so without it the production wiring would only ever be exercised
against in-memory doubles; `apps/api/src/compose.spec.ts` covers it against real
Postgres. `npm run dev:api` / `npm run dev:worker` run the two processes against one
`DATABASE_URL`.

The moderation boundary has an interface but **no adapter yet**, so the dev entry points
wire an explicitly-labelled ALLOW stub behind `assertDevOnly`, which refuses to run
under `NODE_ENV=production`. A missing moderation adapter is a hard stop, not something
to default around: every concept bundle passes that gate before it is persisted.

## 11. Local stack (verified 2026-09-28, D028)

`flo_slice2` database on the commerce Postgres (`:5434`, same server the Medusa
sandbox uses — one fewer moving part); `DATABASE_URL` pointed at it for both
`npm run dev:api` (`:8787`) and `npm run dev:worker`; the browser reaches Path A
through the vite `/api` prefix proxy (dev only). Boot order migrate → api →
worker is recommended because pg-boss's own bootstrap DDL races on a fresh DB
(`PgBossDurableRuntime.init` now retries it, so any order converges). Smoke:
anonymous session → profile → book → concepts enqueue → worker-claimed bundle.

## 12. Production host scaffolding (D032)

One image (`Dockerfile.api`), two Cloud Run services (`flo-api` on `:8080`,
`flo-worker` overriding the command), built by `cloudbuild-api.yaml` and
deployed by `scripts/deploy-api.py` with `DATABASE_URL` + `GEMINI_API_KEY`
Secret Manager bindings. Prod entries (`server.ts`, `worker.ts`) compose
`productionProviders()` — Gemini text + rules-engine moderation, failing fast
without keys and refusing all stubs. Remaining human steps: enable the Cloud
Run API, provision Postgres + the two secrets, deploy, point the web at the
service, re-decide cookie/CORS, verify a live story — then delete Path B.
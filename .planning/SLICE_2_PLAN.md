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
F-028 §8 client-keyed replay · claim/sweeper jobs · migration tooling framework ·
web screens · commerce.

## 9. Fold-in doc fixes

`_SPEC_GUIDE.md` §4 (Book.creationState), F-007 §3/§5/§7/§8 (relationships, PATCH,
budget, drop `regeneratedVersion?`), F-006 `mood`→`emotionalGoal`, F-002 `02:32-33`
label, F-007 §3 (Observed) refresh, `IMPLEMENTATION_ROADMAP.md` Slice-2 note.
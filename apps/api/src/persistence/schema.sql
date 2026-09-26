-- Slice-2 creation-core schema (D024 §8): raw, idempotent DDL. No migration
-- framework in this slice — `init()` replays this file, so every statement must be
-- safe to run against a database that already has the tables.
--
-- Timestamps are TEXT holding the canonical ISO-8601 strings the domain uses
-- everywhere (`now()`), so a save/read round-trip is byte-identical to the
-- in-memory adapter. Structured columns are JSONB.

CREATE TABLE IF NOT EXISTS flo_sessions (
  anonymous_project_id   TEXT PRIMARY KEY,
  browser_token_hash     TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  last_seen_at           TEXT NOT NULL,
  claimed_by_customer_id TEXT,
  claimed_at             TEXT
);

-- The raw browser token is never stored; the unique hash is the only carrier (F-001).
CREATE UNIQUE INDEX IF NOT EXISTS flo_sessions_browser_token_hash_key
  ON flo_sessions (browser_token_hash);

CREATE TABLE IF NOT EXISTS flo_projects (
  project_id        TEXT PRIMARY KEY,
  owner             JSONB NOT NULL,
  child_profile_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  book_ids          JSONB NOT NULL DEFAULT '[]'::jsonb,
  latest_activity_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS flo_projects_owner_key
  ON flo_projects ((owner ->> 'anonymousProjectId'));

CREATE TABLE IF NOT EXISTS flo_child_profiles (
  profile_id          TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  date_of_birth       TEXT NOT NULL,
  pronouns            TEXT NOT NULL,
  locale              TEXT NOT NULL,
  interests           JSONB NOT NULL DEFAULT '[]'::jsonb,
  legacy_facts        JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent             JSONB NOT NULL,
  retention_class     TEXT NOT NULL,
  status              TEXT,
  -- F-003 `UpdateChildProfile` optimistic-lock token; absent on pre-Slice-2 rows = 0.
  revision            INTEGER NOT NULL DEFAULT 0,
  fact_ids            JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_fact_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  photo_reference_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationship_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent_record      JSONB,
  -- F-003 `CreateChildProfile` idempotency: a retried create returns the same profile.
  creation_token      TEXT,
  created_at          TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS flo_child_profiles_creation_token_key
  ON flo_child_profiles (creation_token)
  WHERE creation_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS flo_facts (
  fact_id          TEXT PRIMARY KEY,
  child_profile_id TEXT NOT NULL REFERENCES flo_child_profiles (profile_id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  value            JSONB,
  locale           TEXT NOT NULL,
  source           TEXT NOT NULL,
  state            TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  confirmed_by     JSONB,
  story_usage      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- F-006 `AddFact` idempotency on `factToken`.
  fact_token       TEXT,
  -- F-003 `RemoveFact` scrubs the value but RETAINS the row so the story-usage
  -- audit survives (F-025 deletion is a separate, later verb).
  removed_at       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS flo_facts_fact_token_key
  ON flo_facts (fact_token)
  WHERE fact_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS flo_facts_child_profile_key
  ON flo_facts (child_profile_id)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS flo_books (
  book_id             TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES flo_projects (project_id),
  status              TEXT NOT NULL,
  creation_state      TEXT,
  current_revision_id TEXT,
  metadata            JSONB NOT NULL,
  theme_id            TEXT,
  theme_seed_version  TEXT,
  selected_concept_id TEXT,
  child_profile_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  characters          JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationships       JSONB NOT NULL DEFAULT '[]'::jsonb,
  pages               JSONB NOT NULL DEFAULT '[]'::jsonb,
  revisions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  print_spec_id       TEXT,
  approval            JSONB,
  -- D024 §7: regenerate budget is a per-book counter; edits never consume it.
  regenerate_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS flo_books_project_key ON flo_books (project_id);

-- Concept rows are retained per version for revision history (F-007 §12 / F-025);
-- `status` is how a superseded bundle is retired, not a delete.
CREATE TABLE IF NOT EXISTS flo_concepts (
  concept_id             TEXT PRIMARY KEY,
  book_id                TEXT NOT NULL REFERENCES flo_books (book_id) ON DELETE CASCADE,
  concept_version        INTEGER NOT NULL,
  bundle_index           INTEGER NOT NULL,
  theme_seed_version     TEXT NOT NULL,
  title                  TEXT NOT NULL,
  pitch                  TEXT NOT NULL,
  emotional_goal         TEXT NOT NULL,
  theme_id               TEXT NOT NULL,
  reading_level          TEXT NOT NULL,
  approximate_length_pages INTEGER NOT NULL,
  characters_used        JSONB NOT NULL DEFAULT '[]'::jsonb,
  locale                 TEXT NOT NULL,
  source                 TEXT NOT NULL,
  status                 TEXT NOT NULL,
  created_at             TEXT NOT NULL
);

-- The deterministic concept id is `concept:{bookId}:v{version}:{index}`; this index
-- makes the natural key real, so a resumed worker can never append a second bundle.
CREATE UNIQUE INDEX IF NOT EXISTS flo_concepts_bundle_key
  ON flo_concepts (book_id, concept_version, bundle_index);

CREATE INDEX IF NOT EXISTS flo_concepts_book_key ON flo_concepts (book_id, concept_version);

import type { Book, ChildProfile, Fact, StoryConcept } from "@for-little-ones/domain";
import type { Pool } from "pg";

/**
 * Slice-2 `CreationStore` adapter (D024 §8). Two invariants the durable worker and the
 * HTTP transport both depend on, so they live here rather than in callers:
 *
 *  - concept ids are deterministic (`concept:{bookId}:v{version}:{index}`) and the
 *    `(book_id, concept_version, bundle_index)` unique index makes a re-save a
 *    REPLACE, so a resumed worker can never append a second bundle (F-007 §9);
 *  - `markConceptSelection` is one transaction: winner SELECTED, siblings DISCARDED.
 */

export class PostgresCreationStore {
  constructor(private readonly pool: Pool) {}

  async getProfile(profileId: string): Promise<ChildProfile | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_child_profiles WHERE profile_id = $1`, [profileId]);
    return rows[0] ? toProfile(rows[0]) : undefined;
  }

  async saveProfile(profile: ChildProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_child_profiles
         (profile_id, name, display_name, date_of_birth, pronouns, locale, interests, legacy_facts,
          consent, retention_class, status, revision, fact_ids, suggested_fact_ids,
          photo_reference_ids, relationship_ids, confirmations, consent_record, creation_token, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (profile_id) DO UPDATE SET
         name = EXCLUDED.name,
         display_name = EXCLUDED.display_name,
         date_of_birth = EXCLUDED.date_of_birth,
         pronouns = EXCLUDED.pronouns,
         locale = EXCLUDED.locale,
         interests = EXCLUDED.interests,
         legacy_facts = EXCLUDED.legacy_facts,
         consent = EXCLUDED.consent,
         retention_class = EXCLUDED.retention_class,
         status = EXCLUDED.status,
         revision = EXCLUDED.revision,
         fact_ids = EXCLUDED.fact_ids,
         suggested_fact_ids = EXCLUDED.suggested_fact_ids,
         photo_reference_ids = EXCLUDED.photo_reference_ids,
         relationship_ids = EXCLUDED.relationship_ids,
         confirmations = EXCLUDED.confirmations,
         consent_record = EXCLUDED.consent_record,
         creation_token = EXCLUDED.creation_token`,
      [
        profile.id,
        profile.name,
        profile.displayName,
        profile.dateOfBirth,
        profile.pronouns,
        profile.locale,
        JSON.stringify(profile.interests ?? []),
        JSON.stringify(profile.facts ?? []),
        JSON.stringify(profile.consent),
        profile.retentionClass,
        profile.status ?? null,
        profile.revision ?? 0,
        JSON.stringify(profile.factIds ?? []),
        JSON.stringify(profile.suggestedFactIds ?? []),
        JSON.stringify(profile.photoReferenceIds ?? []),
        JSON.stringify(profile.relationshipIds ?? []),
        JSON.stringify(profile.confirmations ?? []),
        profile.consentRecord ? JSON.stringify(profile.consentRecord) : null,
        profile.creationToken ?? null,
        profile.consent.grantedAt
      ]
    );
  }

  async findProfileByCreationToken(creationToken: string): Promise<string | undefined> {
    const { rows } = await this.pool.query(`SELECT profile_id FROM flo_child_profiles WHERE creation_token = $1`, [creationToken]);
    return rows[0] ? String(rows[0].profile_id) : undefined;
  }

  async getFact(factId: string): Promise<Fact | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_facts WHERE fact_id = $1 AND removed_at IS NULL`, [factId]);
    return rows[0] ? toFact(rows[0]) : undefined;
  }

  async saveFact(fact: Fact): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_facts
         (fact_id, child_profile_id, type, value, locale, source, state, created_at, confirmed_by, story_usage, fact_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (fact_id) DO UPDATE SET
         child_profile_id = EXCLUDED.child_profile_id,
         type = EXCLUDED.type,
         value = EXCLUDED.value,
         locale = EXCLUDED.locale,
         source = EXCLUDED.source,
         state = EXCLUDED.state,
         confirmed_by = EXCLUDED.confirmed_by,
         story_usage = EXCLUDED.story_usage,
         fact_token = EXCLUDED.fact_token,
         removed_at = NULL`,
      [
        fact.id,
        fact.childProfileId,
        fact.type,
        JSON.stringify(fact.value),
        fact.locale,
        fact.source,
        fact.state,
        fact.createdAt,
        fact.confirmedBy ? JSON.stringify(fact.confirmedBy) : null,
        JSON.stringify(fact.storyUsage ?? []),
        fact.factToken ?? null
      ]
    );
  }

  async findFactByToken(factToken: string): Promise<string | undefined> {
    const { rows } = await this.pool.query(`SELECT fact_id FROM flo_facts WHERE fact_token = $1`, [factToken]);
    return rows[0] ? String(rows[0].fact_id) : undefined;
  }

  async listFactsByProfile(childProfileId: string): Promise<Fact[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM flo_facts WHERE child_profile_id = $1 AND removed_at IS NULL ORDER BY created_at, fact_id`,
      [childProfileId]
    );
    return rows.map(toFact);
  }

  /**
   * F-003 `RemoveFact`: the parent's "no". The value is scrubbed from the row but the
   * row itself is RETAINED so the story-usage audit (which stories consumed this fact)
   * survives — F-025's real deletion is a separate, later verb.
   */
  async removeFact(factId: string): Promise<void> {
    await this.pool.query(
      `UPDATE flo_facts SET value = NULL, state = 'rejected', removed_at = now()::text WHERE fact_id = $1`,
      [factId]
    );
  }

  async removedFactUsage(factId: string): Promise<Fact["storyUsage"]> {
    const { rows } = await this.pool.query(`SELECT story_usage FROM flo_facts WHERE fact_id = $1`, [factId]);
    return rows[0] ? ((rows[0].story_usage ?? []) as Fact["storyUsage"]) : [];
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_books WHERE book_id = $1`, [bookId]);
    return rows[0] ? toBook(rows[0]) : undefined;
  }

  async saveBook(book: Book): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_books
         (book_id, project_id, status, creation_state, current_revision_id, metadata, theme_id,
          theme_seed_version, selected_concept_id, child_profile_ids, characters, relationships,
          pages, revisions, print_spec_id, approval, regenerate_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (book_id) DO UPDATE SET
         project_id = EXCLUDED.project_id,
         status = EXCLUDED.status,
         creation_state = EXCLUDED.creation_state,
         current_revision_id = EXCLUDED.current_revision_id,
         metadata = EXCLUDED.metadata,
         theme_id = EXCLUDED.theme_id,
         theme_seed_version = EXCLUDED.theme_seed_version,
         selected_concept_id = EXCLUDED.selected_concept_id,
         child_profile_ids = EXCLUDED.child_profile_ids,
         characters = EXCLUDED.characters,
         relationships = EXCLUDED.relationships,
         pages = EXCLUDED.pages,
         revisions = EXCLUDED.revisions,
         print_spec_id = EXCLUDED.print_spec_id,
         approval = EXCLUDED.approval,
         regenerate_count = EXCLUDED.regenerate_count`,
      [
        book.id,
        book.projectId ?? null,
        book.status,
        book.creationState ?? null,
        book.currentRevisionId ?? null,
        JSON.stringify(book.metadata),
        book.themeId ?? null,
        book.themeSeedVersion ?? null,
        book.selectedConceptId ?? null,
        JSON.stringify(book.childProfileIds ?? []),
        JSON.stringify(book.characters ?? []),
        JSON.stringify(book.relationships ?? []),
        JSON.stringify(book.pages ?? []),
        JSON.stringify(book.revisions ?? []),
        book.printSpecId ?? null,
        book.approval ? JSON.stringify(book.approval) : null,
        book.regenerateCount ?? 0
      ]
    );
  }

  async regenerateCount(bookId: string): Promise<number> {
    const { rows } = await this.pool.query(`SELECT regenerate_count FROM flo_books WHERE book_id = $1`, [bookId]);
    return rows[0] ? Number(rows[0].regenerate_count) : 0;
  }

  async getConcept(conceptId: string): Promise<StoryConcept | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_concepts WHERE concept_id = $1`, [conceptId]);
    return rows[0] ? toConcept(rows[0]) : undefined;
  }

  /** Replaces the bundle for `(bookId, conceptVersion)`; never appends a second one. */
  async saveConcepts(input: {
    bookId: string;
    conceptVersion: number;
    themeSeedVersion: string;
    concepts: Array<Omit<StoryConcept, "id" | "bookId" | "conceptVersion" | "themeSeedVersion" | "status" | "createdAt">>;
    createdAt?: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM flo_concepts WHERE book_id = $1 AND concept_version = $2`, [
        input.bookId,
        input.conceptVersion
      ]);
      for (const [index, concept] of input.concepts.entries()) {
        await insertConcept(client, {
          ...concept,
          id: conceptIdFor(input.bookId, input.conceptVersion, index),
          bookId: input.bookId,
          conceptVersion: input.conceptVersion,
          themeSeedVersion: input.themeSeedVersion,
          status: "PROPOSED",
          createdAt: input.createdAt ?? new Date().toISOString()
        });
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** The F-007 §7 parent edit: same bundle slot, new version, `source: "edited"`. */
  async saveConcept(concept: StoryConcept): Promise<void> {
    await insertConcept(this.pool, concept);
  }

  async listConceptsByBook(bookId: string): Promise<StoryConcept[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM flo_concepts
        WHERE book_id = $1
          AND concept_version = (SELECT max(concept_version) FROM flo_concepts WHERE book_id = $1)
        ORDER BY bundle_index`,
      [bookId]
    );
    return rows.map(toConcept);
  }

  async listConceptVersions(bookId: string): Promise<number[]> {
    const { rows } = await this.pool.query(
      `SELECT DISTINCT concept_version FROM flo_concepts WHERE book_id = $1 ORDER BY concept_version`,
      [bookId]
    );
    return rows.map((row) => Number(row.concept_version));
  }

  /** Retires every bundle older than `keepVersion`, retaining the rows as history. */
  async discardConceptBundle(bookId: string, keepVersion: number): Promise<void> {
    await this.pool.query(
      `UPDATE flo_concepts SET status = 'DISCARDED' WHERE book_id = $1 AND concept_version < $2 AND status <> 'DISCARDED'`,
      [bookId, keepVersion]
    );
  }

  async markConceptSelection(bookId: string, selectedConceptId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE flo_concepts SET status = 'DISCARDED'
          WHERE book_id = $1 AND concept_version = (SELECT max(concept_version) FROM flo_concepts WHERE book_id = $1) AND status <> 'DISCARDED'`,
        [bookId]
      );
      const { rowCount } = await client.query(`UPDATE flo_concepts SET status = 'SELECTED' WHERE concept_id = $1`, [
        selectedConceptId
      ]);
      if ((rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        throw new Error(`concept not found: ${selectedConceptId}`);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

type Queryable = Pick<Pool, "query">;

async function insertConcept(db: Queryable, concept: StoryConcept): Promise<void> {
  await db.query(
    `INSERT INTO flo_concepts
       (concept_id, book_id, concept_version, bundle_index, theme_seed_version, title, pitch,
        emotional_goal, theme_id, reading_level, approximate_length_pages, characters_used,
        locale, source, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (concept_id) DO UPDATE SET
       theme_seed_version = EXCLUDED.theme_seed_version,
       title = EXCLUDED.title,
       pitch = EXCLUDED.pitch,
       emotional_goal = EXCLUDED.emotional_goal,
       theme_id = EXCLUDED.theme_id,
       reading_level = EXCLUDED.reading_level,
       approximate_length_pages = EXCLUDED.approximate_length_pages,
       characters_used = EXCLUDED.characters_used,
       locale = EXCLUDED.locale,
       source = EXCLUDED.source,
       status = EXCLUDED.status,
       created_at = EXCLUDED.created_at`,
    [
      concept.id,
      concept.bookId,
      concept.conceptVersion,
      bundleIndexOf(concept.id),
      concept.themeSeedVersion,
      concept.title,
      concept.pitch,
      concept.emotionalGoal,
      concept.themeId,
      concept.readingLevel,
      concept.approximateLengthPages,
      JSON.stringify(concept.charactersUsed ?? []),
      concept.locale,
      concept.source,
      concept.status,
      concept.createdAt
    ]
  );
}

/** The deterministic id's trailing index is the bundle slot: `concept:{book}:v{n}:{i}`. */
function bundleIndexOf(conceptId: string): number {
  const tail = conceptId.slice(conceptId.lastIndexOf(":") + 1);
  const index = Number(tail);
  if (!Number.isInteger(index)) throw new Error(`concept id does not carry a bundle index: ${conceptId}`);
  return index;
}

/** Must stay identical to the in-memory adapter's id scheme (F-007 §9 idempotency key). */
export function conceptIdFor(bookId: string, conceptVersion: number, index: number): string {
  return `concept:${bookId}:v${conceptVersion}:${index}`;
}

type Row = Record<string, unknown>;

/**
 * Round-trip fidelity: a save/read cycle must hand back exactly what the caller
 * stored, or the in-memory and Postgres adapters are not interchangeable at the
 * seam. JSONB cannot tell an empty list from an absent one, so empty optional
 * lists and zero counters are read back as absent — semantically identical, and
 * it keeps sparse M1 fixtures round-tripping unchanged.
 */
function optionalList<T>(values: unknown): T[] | undefined {
  const list = (values ?? []) as T[];
  return list.length > 0 ? list : undefined;
}

function toProfile(row: Row): ChildProfile {
  const profile: ChildProfile = {
    id: String(row.profile_id),
    name: String(row.name),
    displayName: String(row.display_name),
    dateOfBirth: String(row.date_of_birth),
    pronouns: String(row.pronouns),
    locale: String(row.locale),
    interests: (row.interests ?? []) as string[],
    facts: (row.legacy_facts ?? []) as ChildProfile["facts"],
    consent: row.consent as ChildProfile["consent"],
    retentionClass: String(row.retention_class) as ChildProfile["retentionClass"]
  };
  const revision = Number(row.revision ?? 0);
  if (revision > 0) profile.revision = revision;
  const factIds = optionalList<string>(row.fact_ids);
  if (factIds) profile.factIds = factIds;
  const suggestedFactIds = optionalList<string>(row.suggested_fact_ids);
  if (suggestedFactIds) profile.suggestedFactIds = suggestedFactIds;
  const photoReferenceIds = optionalList<string>(row.photo_reference_ids);
  if (photoReferenceIds) profile.photoReferenceIds = photoReferenceIds;
  const relationshipIds = optionalList<string>(row.relationship_ids);
  if (relationshipIds) profile.relationshipIds = relationshipIds;
  const confirmations = optionalList<string>(row.confirmations);
  if (confirmations) profile.confirmations = confirmations;
  if (row.consent_record) profile.consentRecord = row.consent_record as NonNullable<ChildProfile["consentRecord"]>;
  if (row.creation_token) profile.creationToken = String(row.creation_token);
  return profile;
}

function toFact(row: Row): Fact {
  const fact: Fact = {
    id: String(row.fact_id),
    childProfileId: String(row.child_profile_id),
    type: String(row.type) as Fact["type"],
    value: row.value as Fact["value"],
    locale: String(row.locale) as Fact["locale"],
    source: String(row.source) as Fact["source"],
    state: String(row.state) as Fact["state"],
    createdAt: String(row.created_at),
    storyUsage: (row.story_usage ?? []) as Fact["storyUsage"]
  };
  if (row.confirmed_by) fact.confirmedBy = row.confirmed_by as NonNullable<Fact["confirmedBy"]>;
  if (row.fact_token) fact.factToken = String(row.fact_token);
  return fact;
}

function toBook(row: Row): Book {
  const book: Book = {
    id: String(row.book_id),
    status: String(row.status) as Book["status"],
    metadata: row.metadata as Book["metadata"],
    childProfileIds: (row.child_profile_ids ?? []) as string[],
    characters: (row.characters ?? []) as Book["characters"],
    relationships: (row.relationships ?? []) as Book["relationships"],
    pages: (row.pages ?? []) as Book["pages"],
    revisions: (row.revisions ?? []) as Book["revisions"]
  };
  if (row.creation_state) book.creationState = String(row.creation_state) as NonNullable<Book["creationState"]>;
  if (row.current_revision_id) book.currentRevisionId = String(row.current_revision_id);
  if (row.project_id) book.projectId = String(row.project_id);
  if (row.theme_id) book.themeId = String(row.theme_id);
  if (row.theme_seed_version) book.themeSeedVersion = String(row.theme_seed_version);
  if (row.selected_concept_id) book.selectedConceptId = String(row.selected_concept_id);
  if (row.print_spec_id) book.printSpecId = String(row.print_spec_id);
  if (row.approval) book.approval = row.approval as NonNullable<Book["approval"]>;
  const regenerateCount = Number(row.regenerate_count ?? 0);
  if (regenerateCount > 0) book.regenerateCount = regenerateCount;
  return book;
}

function toConcept(row: Row): StoryConcept {
  return {
    id: String(row.concept_id),
    bookId: String(row.book_id),
    conceptVersion: Number(row.concept_version),
    themeSeedVersion: String(row.theme_seed_version),
    title: String(row.title),
    pitch: String(row.pitch),
    emotionalGoal: String(row.emotional_goal) as StoryConcept["emotionalGoal"],
    themeId: String(row.theme_id),
    readingLevel: String(row.reading_level) as StoryConcept["readingLevel"],
    approximateLengthPages: Number(row.approximate_length_pages),
    charactersUsed: (row.characters_used ?? []) as string[],
    locale: String(row.locale) as StoryConcept["locale"],
    source: String(row.source) as StoryConcept["source"],
    status: String(row.status) as StoryConcept["status"],
    createdAt: String(row.created_at)
  };
}

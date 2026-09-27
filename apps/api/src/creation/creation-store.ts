import type { Book, ChildProfile, Fact, StoryConcept } from "@for-little-ones/domain";

/** Persistence seam behind the command/query boundary. In-memory impl for M1 tests. */
export interface CreationStore {
  getProfile(profileId: string): Promise<ChildProfile | undefined>;
  getFact(factId: string): Promise<Fact | undefined>;
  getBook(bookId: string): Promise<Book | undefined>;
  saveBook(book: Book): Promise<void>;
  saveConcepts(input: SaveConceptInput): Promise<void>;
  listConceptsByBook(bookId: string): Promise<StoryConcept[]>;
  /** Marks the chosen PROPOSED concept SELECTED and its siblings DISCARDED (F-007 §8). */
  markConceptSelection(bookId: string, selectedConceptId: string): Promise<void>;

  // --- Slice-2 additions (D024 §5/§6): the writers F-003/F-006/F-007 need. ---
  /** F-003 `CreateChildProfile`/`UpdateChildProfile` — upsert, revision included. */
  saveProfile(profile: ChildProfile): Promise<void>;
  /** F-003 idempotency: the profile id a `creationToken` already created, if any. */
  findProfileByCreationToken(creationToken: string): Promise<string | undefined>;
  /** F-006 `AddFact` and the audited confirm/reject/remove transitions. */
  saveFact(fact: Fact): Promise<void>;
  /** F-006 idempotency: the fact id a `factToken` already created, if any. */
  findFactByToken(factToken: string): Promise<string | undefined>;
  listFactsByProfile(childProfileId: string): Promise<Fact[]>;
  /** F-003 `RemoveFact`: scrubs the value, RETAINS the row for its story-usage audit. */
  removeFact(factId: string): Promise<void>;
  removedFactUsage(factId: string): Promise<Fact["storyUsage"]>;
  getConcept(conceptId: string): Promise<StoryConcept | undefined>;
  /** F-007 §7 parent edit: persists one concept as `source: "edited"` at a new version. */
  saveConcept(concept: StoryConcept): Promise<void>;
  /** F-007 §8 regenerate: retires bundles older than `keepVersion`, retaining the rows. */
  discardConceptBundle(bookId: string, keepVersion: number): Promise<void>;
  listConceptVersions(bookId: string): Promise<number[]>;
  /** D024 §7: regenerations consumed so far against the book's budget. */
  regenerateCount(bookId: string): Promise<number>;
}


export interface SaveConceptInput {
  bookId: string;
  conceptVersion: number;
  themeSeedVersion: string;
  concepts: Array<Omit<StoryConcept, "id" | "bookId" | "conceptVersion" | "themeSeedVersion" | "status" | "createdAt">>;
}

/**
 * In-memory CreationStore for M1 tests and local runs — never a production
 * substrate. `saveConcepts` is idempotent per `(bookId, conceptVersion)`: a
 * re-save replaces the bundle for that version (F-007 §9 resumability — a crashed
 * worker re-running never appends a duplicate bundle).
 */
export class InMemoryCreationStore implements CreationStore {
  private profiles = new Map<string, ChildProfile>();
  private facts = new Map<string, Fact>();
  private books = new Map<string, Book>();
  private concepts = new Map<string, StoryConcept>(); // conceptId -> concept
  private conceptsByBook = new Map<string, Map<number, string[]>>(); // bookId -> conceptVersion -> conceptIds
  private removed = new Set<string>(); // fact ids scrubbed by RemoveFact but retained for audit

  async getProfile(profileId: string): Promise<ChildProfile | undefined> {
    return this.profiles.get(profileId);
  }

  async getFact(factId: string): Promise<Fact | undefined> {
    if (this.removed.has(factId)) return undefined;
    return this.facts.get(factId);
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    return this.books.get(bookId);
  }

  async saveBook(book: Book): Promise<void> {
    this.books.set(book.id, book);
  }

  /** Test/local seeding (M0 rails import in production). */
  async seedProfile(profile: ChildProfile): Promise<void> {
    this.profiles.set(profile.id, profile);
  }

  async seedFacts(facts: Fact[]): Promise<void> {
    for (const fact of facts) this.facts.set(fact.id, fact);
  }

  async saveConcepts(input: SaveConceptInput): Promise<void> {
    // Replace the prior bundle for (bookId, conceptVersion), never append.
    const previous = this.conceptsByBook.get(input.bookId)?.get(input.conceptVersion) ?? [];
    for (const id of previous) this.concepts.delete(id);

    const ids = input.concepts.map((concept, index) => {
      const id = conceptIdFor(input.bookId, input.conceptVersion, index);
      const stored: StoryConcept = {
        ...concept,
        id,
        bookId: input.bookId,
        conceptVersion: input.conceptVersion,
        themeSeedVersion: input.themeSeedVersion,
        status: "PROPOSED",
        createdAt: new Date().toISOString()
      };
      this.concepts.set(id, stored);
      return id;
    });
    const versions = this.conceptsByBook.get(input.bookId) ?? new Map<number, string[]>();
    versions.set(input.conceptVersion, ids);
    this.conceptsByBook.set(input.bookId, versions);
  }

  async listConceptsByBook(bookId: string): Promise<StoryConcept[]> {
    const versions = this.conceptsByBook.get(bookId);
    if (!versions) return [];
    // Latest conceptVersion wins for the selection surface (the current bundle).
    const latestVersion = Math.max(...versions.keys());
    return this.conceptsByIds(versions.get(latestVersion) ?? []);
  }

  async markConceptSelection(bookId: string, selectedConceptId: string): Promise<void> {
    const current = await this.listConceptsByBook(bookId);
    const chosen = current.find((c) => c.id === selectedConceptId);
    // Same guard as the Postgres adapter: only a current-bundle member of this book wins,
    // and nothing is discarded until we know the winner is real.
    if (!chosen) throw new Error(`concept not found in current bundle: ${selectedConceptId}`);
    for (const concept of current) {
      this.concepts.set(concept.id, { ...concept, status: concept.id === selectedConceptId ? "SELECTED" : "DISCARDED" });
    }
  }

  // --- Slice-2 additions: same behaviour as the Postgres adapter, memory-backed. ---

  async saveProfile(profile: ChildProfile): Promise<void> {
    this.profiles.set(profile.id, profile);
  }

  async findProfileByCreationToken(creationToken: string): Promise<string | undefined> {
    for (const profile of this.profiles.values()) {
      if (profile.creationToken === creationToken) return profile.id;
    }
    return undefined;
  }

  async saveFact(fact: Fact): Promise<void> {
    this.facts.set(fact.id, fact);
  }

  async findFactByToken(factToken: string): Promise<string | undefined> {
    for (const fact of this.facts.values()) {
      if (fact.factToken === factToken) return fact.id;
    }
    return undefined;
  }

  async listFactsByProfile(childProfileId: string): Promise<Fact[]> {
    return [...this.facts.values()].filter(
      (fact) => fact.childProfileId === childProfileId && !this.removed.has(fact.id)
    );
  }

  async removeFact(factId: string): Promise<void> {
    const fact = this.facts.get(factId);
    // The row is RETAINED (scrubbed value, story-usage intact) exactly as the SQL
    // adapter does; only the read paths hide it.
    this.removed.add(factId);
    if (fact) this.facts.set(factId, { ...fact, value: { kind: "custom", subject: "", claim: "" }, state: "rejected" });
  }

  async removedFactUsage(factId: string): Promise<Fact["storyUsage"]> {
    return this.facts.get(factId)?.storyUsage ?? [];
  }

  async getConcept(conceptId: string): Promise<StoryConcept | undefined> {
    return this.concepts.get(conceptId);
  }

  async saveConcept(concept: StoryConcept): Promise<void> {
    this.concepts.set(concept.id, concept);
  }

  async discardConceptBundle(bookId: string, keepVersion: number): Promise<void> {
    for (const concept of this.concepts.values()) {
      if (concept.bookId === bookId && concept.conceptVersion < keepVersion) {
        this.concepts.set(concept.id, { ...concept, status: "DISCARDED" });
      }
    }
  }

  async listConceptVersions(bookId: string): Promise<number[]> {
    return [...new Set([...this.concepts.values()].filter((c) => c.bookId === bookId).map((c) => c.conceptVersion))].sort(
      (left, right) => left - right
    );
  }

  async regenerateCount(bookId: string): Promise<number> {
    return this.books.get(bookId)?.regenerateCount ?? 0;
  }

  private conceptsByIds(ids: string[]): StoryConcept[] {
    return ids.flatMap((id) => {
      const concept = this.concepts.get(id);
      return concept ? [concept] : [];
    });
  }
}


function conceptIdFor(bookId: string, conceptVersion: number, index: number): string {
  return `concept:${bookId}:v${conceptVersion}:${index}`;
}
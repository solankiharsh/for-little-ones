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

  async getProfile(profileId: string): Promise<ChildProfile | undefined> {
    return this.profiles.get(profileId);
  }

  async getFact(factId: string): Promise<Fact | undefined> {
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
    for (const concept of current) {
      this.concepts.set(concept.id, { ...concept, status: concept.id === selectedConceptId ? "SELECTED" : "DISCARDED" });
    }
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
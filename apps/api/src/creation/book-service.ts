import {
  ageYearsOn,
  generationEligibleFacts,
  getTheme,
  readingLevelForAgeYears,
  type Book,
  type ChildProfile,
  type Fact,
  type PersonalFact,
  type StoryConcept
} from "@for-little-ones/domain";
import type { CreationStore } from "./creation-store";

/**
 * Command/query boundary (D023): the application shell for M1 creation-core. Keeps
 * the domain model canonical — book/profile/fact — and exposes narrow commands the
 * (future) HTTP transport will call. No web/HTTP concerns live here.
 *
 * F-001 §8: every project-scoped command takes the caller's `anonymousProjectId`
 * and asserts the target book/project is owned by that session. `runBundle`
 * (the durable step) goes through the same guard.
 */

export interface BookServiceDeps {
  store: CreationStore;
  assertProjectAccess: (anonymousProjectId: string, projectId: string) => Promise<unknown>;
  now: () => string;
  newId: (prefix: string) => string;
}

export class BookService {
  constructor(private readonly deps: BookServiceDeps) {}

  /** F-003/F-007 entrypoint: start a DRAFT book from a child profile, owned by the caller's project. */
  async createBookForChild(input: {
    childProfileId: string;
    anonymousProjectId: string;
    projectId: string;
    locale?: string;
  }): Promise<Book> {
    await this.deps.assertProjectAccess(input.anonymousProjectId, input.projectId);
    const profile = await this.deps.store.getProfile(input.childProfileId);
    if (!profile) throw new Error(`child profile not found: ${input.childProfileId}`);
    const locale = normaliseLocaleString(input.locale ?? profile.locale);
    const book: Book = {
      id: this.deps.newId("book"),
      status: "DRAFT",
      metadata: { locale },
      projectId: input.projectId,
      childProfileIds: [profile.id],
      characters: [characterBibleFor(profile)],
      relationships: [],
      pages: [],
      revisions: []
    };
    await this.deps.store.saveBook(book);
    return book;
  }

  /** F-002: pin the chosen Theme and freeze its seed version on the book. */
  async selectTheme(input: { bookId: string; themeId: string; anonymousProjectId: string }): Promise<Book> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    const theme = getTheme(input.themeId);
    if (!theme) throw new Error(`unknown theme: ${input.themeId}`);
    const updated: Book = { ...book, themeId: theme.id, themeSeedVersion: theme.publishedAt };
    await this.deps.store.saveBook(updated);
    return updated;
  }

  /** F-006 §8 / F-007 §7: the ONLY generation-eligible fact query. Filtered, never all. */
  async getFactsForStory(input: { childProfileId: string }): Promise<Fact[]> {
    const profile = await this.requireProfile(input.childProfileId);
    const row = await this.factsFor(profile);
    return generationEligibleFacts(row);
  }

  /** F-007 §7: confirmed facts + the theme seed + child context, as a request-ready input. */
  async storyInputsFor(input: { childProfileId: string; bookId: string; anonymousProjectId: string }): Promise<{
    displayName: string;
    locale: string;
    facts: Fact[];
    pronouns?: string;
    themeId: string;
    themeSeedVersion: string;
    themeSeed: { tone: string; settingHints: string[]; characterSlots: string[]; forbidBlocks: string[] };
    readingLevel?: string;
  }> {
    const profile = await this.requireProfile(input.childProfileId);
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    if (!book.themeId || !book.themeSeedVersion) throw new Error(`book ${input.bookId} has no theme selected`);
    const theme = getTheme(book.themeId);
    if (!theme) throw new Error(`book ${input.bookId} pins missing theme ${book.themeId}`);
    const facts = await this.getFactsForStory({ childProfileId: profile.id });
    const age = ageYearsOn(profile.dateOfBirth, this.deps.now().slice(0, 10));
    return {
      displayName: protagonistName(profile.displayName),
      locale: book.metadata.locale,
      facts,
      themeId: book.themeId,
      themeSeedVersion: book.themeSeedVersion,
      themeSeed: theme.conceptSeed,
      ...(profile.pronouns ? { pronouns: profile.pronouns } : {}),
      ...(age !== undefined ? { readingLevel: readingLevelForAgeYears(age) } : {})
    };
  }

  /** F-007: parent picks one concept; the rest are DISCARDED, the winner SELECTED. */
  async selectConcept(input: { bookId: string; conceptId: string; anonymousProjectId: string }): Promise<Book> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    const concepts = await this.deps.store.listConceptsByBook(input.bookId);
    const chosen = concepts.find((c) => c.id === input.conceptId);
    if (!chosen) throw new Error(`concept not found: ${input.conceptId}`);
    // F-007 §8 idempotent re-select: the already-selected concept confirms the
    // existing state without re-running the transition.
    if (chosen.status === "SELECTED" && book.selectedConceptId === chosen.id) return book;
    if (chosen.status !== "PROPOSED") throw new Error(`concept ${input.conceptId} is ${chosen.status}, not PROPOSED`);
    await this.deps.store.markConceptSelection(input.bookId, chosen.id);
    const updatedBook: Book = { ...book, selectedConceptId: chosen.id };
    await this.deps.store.saveBook(updatedBook);
    return updatedBook;
  }

  /**
   * F-007 §9: the fallback concepts path is served from the API, not from a second
   * worker pass. The durable runner fails with CONCEPT_GENERATION_EXHAUSTED when
   * the model path fails twice; the transport calls this to keep the journey alive
   * with the catalogue-authored bundle (source "fallback").
   */
  async serveFallbackConcepts(input: { bookId: string; conceptVersion: number; anonymousProjectId: string }): Promise<StoryConcept[]> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    if (!book.themeId) throw new Error(`book ${input.bookId} has no theme selected`);
    const theme = getTheme(book.themeId);
    if (!theme) throw new Error(`book ${input.bookId} pins missing theme ${book.themeId}`);
    // Only name a protagonist the book actually has; never hard-code a child's
    // name — a fallback bundle for another child must not say "Ava".
    const protagonist = book.characters[0]?.name;
    const concepts = theme.fallbackConcepts.map((c, index): StoryConcept => ({
      id: `concept:${book.id}:v${input.conceptVersion}:${index}`,
      bookId: book.id,
      conceptVersion: input.conceptVersion,
      themeSeedVersion: book.themeSeedVersion ?? theme.publishedAt,
      title: c.title,
      pitch: c.pitch,
      emotionalGoal: c.emotionalGoal,
      themeId: theme.id,
      readingLevel: c.readingLevel,
      approximateLengthPages: c.approximateLengthPages,
      charactersUsed: c.charactersUsed.length > 0 ? c.charactersUsed : protagonist ? [protagonist] : [],
      locale: normaliseLocaleString(book.metadata.locale) === "en-US" ? "en-US" : "en-GB",
      source: "fallback",
      status: "PROPOSED",
      createdAt: this.deps.now()
    }));
    await this.deps.store.saveConcepts({
      bookId: book.id,
      conceptVersion: input.conceptVersion,
      themeSeedVersion: book.themeSeedVersion ?? theme.publishedAt,
      concepts
    });
    return concepts;
  }

  private async requireBookOwned(bookId: string, anonymousProjectId: string): Promise<Book> {
    const book = await this.deps.store.getBook(bookId);
    if (!book) throw new Error(`book not found: ${bookId}`);
    if (!book.projectId) throw new Error(`book ${bookId} has no owning project`);
    await this.deps.assertProjectAccess(anonymousProjectId, book.projectId);
    return book;
  }

  private async requireProfile(profileId: string): Promise<ChildProfile> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) throw new Error(`child profile not found: ${profileId}`);
    return profile;
  }

  /**
   * Canonical typed facts (F-006). DOB-scoped facts arrive via `factIds`; the
   * legacy `facts: PersonalFact[]` rail carries M0 demo content — mapped to typed
   * Interest facts ONLY when they are generation-blocking (no confirmed typed
   * facts yet), never persisted back. The demo rail is intentionally marked
   * `parentConfirmed` (those entries were confirmed at demo import time), never
   * `suggested`.
   */
  private async factsFor(profile: ChildProfile): Promise<Fact[]> {
    const typed: Fact[] = [];
    if (!profile.factIds) return legacyFactsFor(profile, this.deps.now());
    for (const factId of profile.factIds) {
      const fact = await this.deps.store.getFact(factId);
      if (fact) typed.push(fact);
    }
    if (typed.length === 0) return legacyFactsFor(profile, this.deps.now());
    return typed;
  }
}

function normaliseLocaleString(locale: string): string {
  return locale === "en" ? "en-GB" : locale;
}

/** The display name is the protagonist; legacy facts are mapped as legacy rails. */
function protagonistName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first ?? displayName;
}

function characterBibleFor(profile: ChildProfile): Book["characters"][number] {
  return {
    id: `char:${profile.id}`,
    characterId: profile.id,
    version: "m1",
    name: protagonistName(profile.displayName),
    styleTokensRef: "m1/none"
  };
}

function legacyFactsFor(profile: ChildProfile, now: string): Fact[] {
  return profile.facts
    .filter((f: PersonalFact) => f.immutable)
    .map((f: PersonalFact, index: number): Fact => ({
      id: `legacy:${profile.id}:${index}`,
      childProfileId: profile.id,
      type: "interest",
      value: { kind: "enum", optionId: f.value },
      locale: "en-GB",
      source: "parentTyped",
      state: "parentConfirmed",
      createdAt: now,
      confirmedBy: { sessionOwnerId: "m0-import", recordedAt: now },
      storyUsage: []
    }));
}
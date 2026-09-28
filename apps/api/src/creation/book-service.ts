import {
  ageYearsOn,
  CONCEPT_PITCH_MAX,
  CONCEPT_TITLE_MAX,
  generationEligibleFacts,
  getTheme,
  readingLevelForAgeYears,
  seedSelfRelationships,
  type Book,
  type ChildProfile,
  type Fact,
  type PersonalFact,
  type StoryConcept
} from "@for-little-ones/domain";
import { ConflictError, ModerationBlockedError, ResourceNotFoundError, ValidationError } from "../errors";
import type { ModerationProvider } from "@for-little-ones/providers";
import type { EventSink } from "../analytics/event-sink";
import type { CreationStore } from "./creation-store";

/** D024 §7: regenerations a single book may spend. Edits never consume it. */
export const REGENERATE_BUDGET_DEFAULT = 3;

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
  /** Slice-2 observability rail (F-007 §13 canonical event names). */
  events: EventSink;
  /** The parent-edit re-moderation gate (F-007 §7). Required: an edit is never unmoderated. */
  moderation: ModerationProvider;
  storyProvider: Pick<StoryConceptStoryProvider, "generateConcepts" | "card">;
}

/** Only the concept half of StoryProvider is needed here; generation lives in the runner. */
type StoryConceptStoryProvider = import("@for-little-ones/providers").StoryProvider;

export class BookNotFoundError extends ResourceNotFoundError {}
export class ConceptNotFoundError extends ResourceNotFoundError {}
export class ConceptEditBlockedError extends ModerationBlockedError {}
/** The regenerate budget is a bound on the book's state, so it is a 409, not a 4xx of the request. */
export class RegenerateBudgetError extends ConflictError {}
export class ChildProfileNotFoundError extends ResourceNotFoundError {}
/** The plan's 404 set includes themes, so an unknown themeId is not a 500. */
export class ThemeNotFoundError extends ResourceNotFoundError {}

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
    if (!profile) throw new ChildProfileNotFoundError(`child profile not found: ${input.childProfileId}`);
    const locale = normaliseLocaleString(input.locale ?? profile.locale);
    const book: Book = {
      id: this.deps.newId("book"),
      status: "DRAFT",
      // D024 §4: the journey starts at CREATED and only ever moves forward.
      creationState: "CREATED",
      metadata: { locale },
      projectId: input.projectId,
      childProfileIds: [profile.id],
      characters: [characterBibleFor(profile)],
      // D024 §5: the book carries the profile's relationships, so a concept may name
      // the child (and later a pet) without consulting the CharacterBible.
      relationships: profile.relationshipIds ? seedRelationshipsFor(profile) : [],
      pages: [],
      revisions: []
    };
    await this.deps.store.saveBook(book);
    await this.deps.events.push({
      name: "book_created",
      at: this.deps.now(),
      attributes: { bookId: book.id, projectId: input.projectId }
    });
    return book;
  }

  /** F-002: pin the chosen Theme and freeze its seed version on the book. */
  async selectTheme(input: { bookId: string; themeId: string; anonymousProjectId: string }): Promise<Book> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    const theme = getTheme(input.themeId);
    if (!theme) throw new ThemeNotFoundError(`unknown theme: ${input.themeId}`);
    // Idempotent: re-pinning the same theme is a no-op, and creationState only advances.
    const updated: Book = {
      ...book,
      themeId: theme.id,
      themeSeedVersion: theme.publishedAt,
      creationState: advanceCreationState(book.creationState, "THEME_SELECTED")
    };
    await this.deps.store.saveBook(updated);
    await this.deps.events.push({
      name: "theme_selected",
      at: this.deps.now(),
      attributes: { bookId: book.id, themeId: theme.id }
    });
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
    if (!theme) throw new ThemeNotFoundError(`book ${input.bookId} pins missing theme ${book.themeId}`);
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
    if (!chosen) throw new ConceptNotFoundError(`concept not found: ${input.conceptId}`);
    // F-007 §8 idempotent re-select: the already-selected concept confirms the
    // existing state without re-running the transition.
    if (chosen.status === "SELECTED" && book.selectedConceptId === chosen.id) return book;
    if (chosen.status !== "PROPOSED") {
      throw new ConflictError(`concept ${input.conceptId} is ${chosen.status}, not PROPOSED`);
    }
    await this.deps.store.markConceptSelection(input.bookId, chosen.id);
    const updatedBook: Book = {
      ...book,
      selectedConceptId: chosen.id,
      creationState: advanceCreationState(book.creationState, "CONCEPT_SELECTED")
    };
    await this.deps.store.saveBook(updatedBook);
    // F-007 §13: conceptId is bucketed, never raw, in analytics.
    await this.deps.events.push({
      name: "story_concept_selected",
      at: this.deps.now(),
      attributes: { bookId: input.bookId, conceptId: bucketOf(chosen.id), conceptVersion: chosen.conceptVersion }
    });
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
    if (!book.themeId) throw new ValidationError(`book ${input.bookId} has no theme selected`);
    const theme = getTheme(book.themeId);
    if (!theme) throw new ThemeNotFoundError(`book ${input.bookId} pins missing theme ${book.themeId}`);
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
    await this.deps.events.push({
      name: "concepts_served_from_fallback",
      at: this.deps.now(),
      attributes: { bookId: book.id, conceptVersion: input.conceptVersion, count: concepts.length }
    });
    return concepts;
  }

  /**
   * F-007 §7 — the parent's ~5% correction. The edited copy is re-moderated as
   * ACTUAL text (never a synthetic ref); a BLOCK is refused with product copy and
   * NOTHING is persisted. A surviving edit is stored as a new concept row at
   * `conceptVersion + 1` with `source: "edited"`, so the original model bundle stays
   * intact as history.
   */
  async editConcept(input: {
    anonymousProjectId: string;
    bookId: string;
    conceptId: string;
    patch: { title?: string; pitch?: string };
    /** Overrides the wired moderation provider (specs); production omits it. */
    moderation?: ModerationProvider;
  }): Promise<StoryConcept> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    const current = await this.deps.store.getConcept(input.conceptId);
    if (!current || current.bookId !== book.id) throw new ConceptNotFoundError(`concept not found: ${input.conceptId}`);
    if (current.status === "DISCARDED") {
      throw new ConceptNotFoundError(`concept ${input.conceptId} belongs to a retired bundle and can no longer be edited`);
    }

    const title = input.patch.title ?? current.title;
    const pitch = input.patch.pitch ?? current.pitch;
    if (title.trim().length === 0) throw new ValidationError("concept title is required");
    if (title.length > CONCEPT_TITLE_MAX) throw new ValidationError(`concept title exceeds ${CONCEPT_TITLE_MAX} characters`);
    if (pitch.trim().length === 0) throw new ValidationError("concept pitch is required");
    if (pitch.length > CONCEPT_PITCH_MAX) throw new ValidationError(`concept pitch exceeds ${CONCEPT_PITCH_MAX} characters`);

    const moderation = input.moderation ?? this.deps.moderation;
    const verdict = await moderation.screen({
      contentType: "text",
      contentRef: `book:${book.id}/concept:${current.id}`,
      content: `${title} — ${pitch}`,
      policySetVersion: "for-little-ones/text/v1"
    });
    if (verdict.verdict === "BLOCK") {
      throw new ConceptEditBlockedError(
        "That wording cannot be used in a children's story. Try a gentler title or pitch."
      );
    }

    const conceptVersion = current.conceptVersion + 1;
    const edited: StoryConcept = {
      ...current,
      id: conceptIdFor(book.id, conceptVersion, bundleIndexOf(current.id)),
      conceptVersion,
      title: title.trim(),
      pitch: pitch.trim(),
      source: "edited",
      createdAt: this.deps.now()
    };
    // A version is a whole bundle, so the untouched siblings are carried forward under
    // their new v(n+1) ids: the parent keeps three options to choose from. v(n) is left
    // untouched as retained history — unlike regenerate, an edit retires nothing.
    const siblings = (await this.deps.store.listConceptsByBook(book.id))
      .filter((c) => c.id !== current.id)
      .map((c) => ({ ...c, id: conceptIdFor(book.id, conceptVersion, bundleIndexOf(c.id)), conceptVersion }));
    await this.deps.store.saveConcepts({
      bookId: book.id,
      conceptVersion,
      themeSeedVersion: book.themeSeedVersion ?? edited.createdAt,
      concepts: [edited, ...siblings]
    });
    await this.deps.events.push({
      name: "concept_edit_applied",
      at: this.deps.now(),
      attributes: { bookId: book.id, conceptId: bucketOf(edited.id), conceptVersion }
    });
    return edited;
  }

  /**
   * F-007 §8 — "show me different options". Publishes the next bundle version, retires
   * the previous one as retained history, and spends one unit of the book's regenerate
   * budget (D024 §7). The durable unit for the new version is enqueued by the transport,
   * which owns the runtime; this command is the synchronous half.
   */
  async regenerateConcepts(input: { anonymousProjectId: string; bookId: string }): Promise<{ conceptVersion: number; spent: number }> {
    const book = await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    if (!book.themeId || !book.themeSeedVersion) {
      throw new ValidationError(`book ${input.bookId} has no theme selected`);
    }
    const spent = (await this.deps.store.regenerateCount(book.id)) + 1;
    if (spent > REGENERATE_BUDGET_DEFAULT) {
      throw new RegenerateBudgetError(
        `book ${book.id} has used all ${REGENERATE_BUDGET_DEFAULT} regenerations; try editing a concept instead`
      );
    }
    const versions = await this.deps.store.listConceptVersions(book.id);
    const conceptVersion = versions.length === 0 ? 1 : Math.max(...versions) + 1;
    await this.deps.store.saveBook({ ...book, regenerateCount: spent });
    // Retiring the old bundle is what makes the new one a genuine "different options"
    // set: the parent cannot flip back to what they just rejected. History is retained.
    await this.deps.store.discardConceptBundle(book.id, conceptVersion);
    await this.deps.events.push({
      name: "story_concepts_regenerated",
      at: this.deps.now(),
      attributes: { bookId: book.id, conceptVersion, regenerationsUsed: spent }
    });
    return { conceptVersion, spent };
  }

  /** F-007 §7: the current PROPOSED bundle the parent chooses from. */
  async listConcepts(input: { anonymousProjectId: string; bookId: string }): Promise<StoryConcept[]> {
    await this.requireBookOwned(input.bookId, input.anonymousProjectId);
    return this.deps.store.listConceptsByBook(input.bookId);
  }

  private async requireBookOwned(bookId: string, anonymousProjectId: string): Promise<Book> {
    const book = await this.deps.store.getBook(bookId);
    if (!book) throw new BookNotFoundError(`book not found: ${bookId}`);
    if (!book.projectId) throw new Error(`book ${bookId} has no owning project`);
    await this.deps.assertProjectAccess(anonymousProjectId, book.projectId);
    return book;
  }

  private async requireProfile(profileId: string): Promise<ChildProfile> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) throw new ChildProfileNotFoundError(`child profile not found: ${profileId}`);
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

/** creationState only ever moves forward; a re-select or re-pin never regresses it. */
const CREATION_ORDER = ["CREATED", "THEME_SELECTED", "CONCEPT_SELECTED"] as const;

function advanceCreationState(current: Book["creationState"], next: NonNullable<Book["creationState"]>): NonNullable<Book["creationState"]> {
  if (current === undefined) return next;
  return CREATION_ORDER.indexOf(current) >= CREATION_ORDER.indexOf(next) ? current : next;
}

/** F-007 §13: analytics carry a concept bucket, never a raw id (which embeds a book id). */
function bucketOf(conceptId: string): string {
  const version = /:v(\d+):\d+$/.exec(conceptId)?.[1] ?? "?";
  return `concept-v${version}`;
}

/** Must match the store adapters' deterministic id scheme. */
function conceptIdFor(bookId: string, conceptVersion: number, index: number): string {
  return `concept:${bookId}:v${conceptVersion}:${index}`;
}

function bundleIndexOf(conceptId: string): number {
  const index = Number(conceptId.slice(conceptId.lastIndexOf(":") + 1));
  if (!Number.isInteger(index)) throw new Error(`concept id does not carry a bundle index: ${conceptId}`);
  return index;
}

/** D024 §5: a book carries its profile's relationships, seeded for the child. */
function seedRelationshipsFor(profile: ChildProfile): Book["relationships"] {
  return seedSelfRelationships(profile.id, profile.displayName);
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
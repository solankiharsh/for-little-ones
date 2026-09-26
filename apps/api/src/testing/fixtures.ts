import {
  type Book,
  type ChildProfile,
  type Fact,
  type StoryConcept
} from "@for-little-ones/domain";
import { InMemoryCreationStore } from "../creation/creation-store";

export const NOW = "2026-09-25T10:00:00.000Z";

export function sampleProfile(): ChildProfile {
  return {
    id: "child-ava",
    name: "Ava Solanki",
    displayName: "Ava",
    dateOfBirth: "2021-06-01", // 5 years old on 2026-09-25
    pronouns: "she",
    locale: "en-GB",
    interests: ["space", "dinosaurs"],
    facts: [
      { key: "interest", value: "space", immutable: true },
      { key: "favouriteColour", value: "purple", immutable: true }
    ],
    consent: { grantedAt: "2026-09-01T00:00:00.000Z", retentionClass: "default" },
    retentionClass: "default",
    factIds: ["fact-1"]
  };
}

export function confirmedFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "fact-1",
    childProfileId: "child-ava",
    type: "interest",
    value: { kind: "enum", optionId: "space" },
    locale: "en-GB",
    source: "parentTyped",
    state: "parentConfirmed",
    createdAt: "2026-09-20T00:00:00.000Z",
    confirmedBy: { sessionOwnerId: "anon-1", recordedAt: "2026-09-20T00:00:00.000Z" },
    storyUsage: [],
    ...overrides
  };
}

export function suggestedFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "fact-s1",
    childProfileId: "child-ava",
    type: "favouriteColour",
    value: { kind: "enum", optionId: "purple" },
    locale: "en-GB",
    source: "aiSuggested",
    state: "suggested",
    createdAt: "2026-09-20T00:00:00.000Z",
    storyUsage: [],
    ...overrides
  };
}

export function draftBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    status: "DRAFT",
    metadata: { locale: "en-GB" },
    projectId: "project-1",
    themeId: "space",
    themeSeedVersion: "2026-09-25T00:00:00.000Z",
    childProfileIds: ["child-ava"],
    characters: [
      { id: "char:child-ava", characterId: "child-ava", version: "m1", name: "Ava", styleTokensRef: "m1/none" }
    ],
    relationships: [],
    pages: [],
    revisions: [],
    ...overrides
  };
}

export interface Seeded {
  store: InMemoryCreationStore;
  profile: ChildProfile;
  confirmed: Fact;
  suggested: Fact;
  book: Book;
}

/**
 * Store pre-loaded with the canonical fixtures for slice specs: Ava's profile,
 * one confirmed + one suggested fact, and a DRAFT book.
 */
export async function seededStore(): Promise<Seeded> {
  const store = new InMemoryCreationStore();
  const profile = sampleProfile();
  await store.seedProfile(profile);
  const confirmed = confirmedFact();
  const suggested = suggestedFact();
  await store.seedFacts([confirmed, suggested]);
  const book = draftBook();
  await store.saveBook(book);
  return { store, profile, confirmed, suggested, book };
}

export function conceptStub(overrides: Partial<StoryConcept> = {}): StoryConcept {
  return {
    id: "concept:book-1:v1:0",
    bookId: "book-1",
    conceptVersion: 1,
    themeSeedVersion: "2026-09-25T00:00:00.000Z",
    title: "Ava and the Pinch of Starlight",
    pitch: "Ava befriends a tiny star that has lost its glow.",
    emotionalGoal: "curiosity",
    themeId: "space",
    readingLevel: "4-6",
    approximateLengthPages: 8,
    charactersUsed: ["Ava"],
    locale: "en-GB",
    source: "model",
    status: "PROPOSED",
    createdAt: NOW,
    ...overrides
  };
}
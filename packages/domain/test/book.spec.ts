import { describe, expect, expectTypeOf, it } from "vitest";
import { createApprovedBookRevision, type ApprovedBookRevision, type Book, type BookRevision, type BookStatus, type CreationState, type Relationship, type RevisionStatus } from "../src/index";
import { allowedCharacterNames, seedSelfRelationships } from "../src/book";
import { invalidCharacterNames } from "../src/story-concept";

describe("domain: book lifecycle boundaries", () => {
  it("keeps the stable book lifecycle separate from a revision's editorial lifecycle", () => {
    expectTypeOf<BookStatus>().toEqualTypeOf<"DRAFT" | "ARCHIVED">();
    expectTypeOf<RevisionStatus>().toEqualTypeOf<
      | "PREPARING"
      | "GENERATING"
      | "READY_FOR_REVIEW"
      | "EDITING"
      | "READY_FOR_APPROVAL"
      | "APPROVED"
      | "GENERATION_FAILED"
      | "RENDER_FAILED"
      | "CANCELLED"
    >();
    expectTypeOf<BookRevision["status"]>().toEqualTypeOf<RevisionStatus>();
    expectTypeOf<Book["currentRevisionId"]>().toEqualTypeOf<string | undefined>();
  });

  it("represents an approved revision as an immutable orderable snapshot", () => {
    expectTypeOf<ApprovedBookRevision["contentHash"]>().toEqualTypeOf<string>();
    expectTypeOf<ApprovedBookRevision["printSpec"]>().toMatchTypeOf<object>();
  });

  it("clones, hashes, and freezes content so working-copy edits cannot alter the approved revision", async () => {
    const pages = [{ pageNumber: 1, status: "READY" as const, textBlocks: [{ id: "text-1", kind: "story", text: "Original" }] }];
    const snapshot = await createApprovedBookRevision({
      id: "approved-1",
      revisionId: "revision-1",
      approvedAt: "2026-09-22T00:00:00.000Z",
      pages,
      printSpec: {
        id: "hardcover-square",
        binding: "hardcover-case",
        sheet: { trimWidthMm: 210, trimHeightMm: 210, bleedMm: 3, safeMarginMm: 12 },
        resolution: { dpiMinimum: 300 },
        pageRange: { minPages: 24, maxPages: 40 }
      }
    });

    pages[0]!.textBlocks[0]!.text = "Changed";
    expect(snapshot.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.pages[0]!.textBlocks[0]!.text).toBe("Original");
    expect(Object.isFrozen(snapshot.pages[0]!.textBlocks)).toBe(true);
  });
});

describe("domain: book creation state + relationship vocabulary (D024 §4/§5)", () => {
  it("keeps creationState separate from status and revision status", () => {
    expectTypeOf<Book["creationState"]>().toEqualTypeOf<CreationState | undefined>();
    expectTypeOf<CreationState>().toEqualTypeOf<"CREATED" | "THEME_SELECTED" | "CONCEPT_SELECTED">();
  });

  it("names every relationship so charactersUsed can be validated against people, not bibles", () => {
    const relationship: Relationship = {
      id: "rel-1",
      fromChildId: "child-ava",
      toChildId: "child-ava",
      kind: "self",
      name: "Ava",
      label: "Ava"
    };
    expect(relationship.name).toBe("Ava");
    expect(relationship.label).toBe("Ava");
  });

  it("seeds exactly one self-relationship per profile, named for the child", () => {
    const seeded = seedSelfRelationships("child-ava", "Ava");
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({ fromChildId: "child-ava", toChildId: "child-ava", kind: "self", name: "Ava" });
  });

  it("allows charactersUsed to name relationships and the primary child, not CharacterBible rows", () => {
    const book: Book = {
      id: "book-1",
      status: "DRAFT",
      metadata: { locale: "en-GB" },
      childProfileIds: ["child-ava"],
      characters: [{ id: "char:child-ava", characterId: "child-ava", version: "m1", name: "Ava", styleTokensRef: "m1/none" }],
      relationships: [
        ...seedSelfRelationships("child-ava", "Ava"),
        { id: "rel-2", fromChildId: "child-ava", toChildId: "person-bruno", kind: "pet", name: "Bruno", label: "the dog" }
      ],
      pages: [],
      revisions: []
    };
    const allowed = allowedCharacterNames(book);
    expect([...allowed].sort()).toEqual(["Ava", "Bruno"]);
    expect(invalidCharacterNames({ charactersUsed: ["Ava", "Bruno"] }, allowed)).toEqual([]);
    expect(invalidCharacterNames({ charactersUsed: ["Ava", "Someone Else"] }, allowed)).toEqual(["Someone Else"]);
  });

  it("never widens the allowed set to a CharacterBible name that is not a relationship", () => {
    const book: Book = {
      id: "book-2",
      status: "DRAFT",
      metadata: { locale: "en-GB" },
      childProfileIds: ["child-ava"],
      characters: [{ id: "char:child-ava", characterId: "child-ava", version: "m1", name: "Ava", styleTokensRef: "m1/none" }],
      relationships: [],
      pages: [],
      revisions: []
    };
    // No relationships seeded yet: the primary child is still a legitimate character.
    expect([...allowedCharacterNames(book)]).toEqual(["Ava"]);
    // A bible-only sibling is NOT a relationship and must not pass validation.
    expect(invalidCharacterNames({ charactersUsed: ["Ava", "Ava's mum"] }, allowedCharacterNames(book))).toEqual(["Ava's mum"]);
  });
});

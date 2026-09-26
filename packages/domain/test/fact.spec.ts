import { describe, expect, expectTypeOf, it } from "vitest";
import {
  FACT_LOCALES,
  FACT_SOURCES,
  FACT_STATES,
  FACT_TYPES,
  factDisplayValue,
  generationEligibleFacts,
  isGenerationEligibleFact,
  type Fact,
  type FactConfirmation,
  type FactLocale,
  type FactSource,
  type FactState,
  type FactType
} from "../src/index";

function fact(state: FactState, source: FactSource = "parentTyped"): Fact {
  return {
    id: "fact-1",
    childProfileId: "child-1",
    type: "favouriteAnimal",
    value: { kind: "enum", optionId: "dino" },
    locale: "en-GB",
    source,
    state,
    createdAt: "2026-09-25T00:00:00.000Z",
    storyUsage: []
  };
}

describe("domain: fact model (F-006)", () => {
  it("narrows the value union and locale/source/state vocabularies", () => {
    expectTypeOf<FactType>().toEqualTypeOf<
      | "interest"
      | "favouriteAnimal"
      | "favouriteColour"
      | "favouriteToy"
      | "favouriteFood"
      | "pet"
      | "hobby"
      | "person"
      | "sport"
      | "customFact"
    >();
    expectTypeOf<FactLocale>().toEqualTypeOf<"en-GB" | "en-US">();
    expectTypeOf<FactSource>().toEqualTypeOf<"parentTyped" | "parentPicked" | "aiSuggested">();
    expectTypeOf<FactState>().toEqualTypeOf<"parentConfirmed" | "suggested" | "rejected">();
    expectTypeOf<Fact["value"]>().toEqualTypeOf<
      | { kind: "enum"; optionId: string }
      | { kind: "sport"; gameId: string; team?: string }
      | { kind: "person"; relationshipId: string }
      | { kind: "pet"; relationshipId: string }
      | { kind: "custom"; subject: string; claim: string }
    >();
  });

  it("guards literal arrays mirror the domain unions", () => {
    expect(FACT_TYPES).toHaveLength(10);
    expect(FACT_LOCALES).toEqual(["en-GB", "en-US"]);
    expect(FACT_SOURCES).toEqual(["parentTyped", "parentPicked", "aiSuggested"]);
    expect(FACT_STATES).toEqual(["parentConfirmed", "suggested", "rejected"]);
  });

  it("only parent-confirmed facts are generation-eligible", () => {
    expect(isGenerationEligibleFact(fact("parentConfirmed"))).toBe(true);
    expect(isGenerationEligibleFact(fact("suggested", "aiSuggested"))).toBe(false);
    expect(isGenerationEligibleFact(fact("rejected"))).toBe(false);
  });

  it("generationEligibleFacts keeps the confirmed set in order and drops suggested/rejected", () => {
    const confirmed = fact("parentConfirmed");
    const sorted = generationEligibleFacts([
      fact("suggested", "aiSuggested"),
      confirmed,
      fact("rejected"),
      fact("parentConfirmed")
    ]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toEqual(confirmed);
    expect(sorted.every(isGenerationEligibleFact)).toBe(true);
  });

  it("resolves enum values through the locale-aware option catalogue", () => {
    const animal = { ...fact("parentConfirmed"), value: { kind: "enum" as const, optionId: "dino" } };
    expect(factDisplayValue(animal, { optionLabel: (id, locale) => `${locale}:${id}` })).toBe("en-GB:dino");
  });

  it("renders sport facts with a team suffix and custom facts as their claim", () => {
    const sport = { ...fact("parentConfirmed"), value: { kind: "sport" as const, gameId: "association-football", team: "Little FC" } };
    expect(factDisplayValue(sport, {})).toBe("association-football · Little FC");
    const custom = { ...fact("parentConfirmed"), type: "customFact" as const, value: { kind: "custom" as const, subject: "teddy", claim: "called Mr Bear" } };
    expect(factDisplayValue(custom, {})).toBe("called Mr Bear");
  });

  it("renders person/pet facts via the relationship resolver", () => {
    const person = { ...fact("parentConfirmed"), type: "person" as const, value: { kind: "person" as const, relationshipId: "rel-granny" } };
    expect(factDisplayValue(person, { relationshipName: (id) => (id === "rel-granny" ? "Granny" : undefined) })).toBe("Granny");
    const pet = { ...fact("parentConfirmed"), type: "pet" as const, value: { kind: "pet" as const, relationshipId: "rel-bruno" } };
    expect(factDisplayValue(pet, { relationshipName: () => undefined })).toBe("rel-bruno");
  });

  it("confirmation carries the session owner who recorded it", () => {
    const confirmed: FactConfirmation = { sessionOwnerId: "session-1", recordedAt: "2026-09-25T00:00:00.000Z" };
    const f = { ...fact("parentConfirmed"), confirmedBy: confirmed };
    expect(f.confirmedBy?.sessionOwnerId).toBe("session-1");
    expect(fact("suggested").confirmedBy).toBeUndefined();
  });
});
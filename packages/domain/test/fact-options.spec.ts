import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CATALOGUED_FACT_TYPES,
  LOCALES,
  SPORT_GAMES,
  factOptionLabel,
  getFactOptions,
  isCataloguedFactType,
  isLocale,
  isSportGameId,
  type FactOption,
  type Locale,
  type SportGameId,
  type SportOption
} from "../src/index";

describe("domain: fact option catalogue (F-006 §8)", () => {
  it("catalogues locale-aware options per type", () => {
    const gbColours = getFactOptions("favouriteColour", "en-GB");
    const usColours = getFactOptions("favouriteColour", "en-US");
    expect(gbColours.length).toBeGreaterThan(0);
    expect(gbColours).toHaveLength(usColours.length);
    expect(gbColours.every((o) => o.locale === "en-GB")).toBe(true);
    expect(gbColours.map((o) => o.id)).toEqual(usColours.map((o) => o.id));
  });

  it("removes pet/person/customFact from the catalogue surface", () => {
    const catalogue = CATALOGUED_FACT_TYPES;
    expect(catalogue).toEqual(["interest", "favouriteAnimal", "favouriteColour", "favouriteToy", "favouriteFood", "hobby", "sport"]);
    expect(getFactOptions("pet", "en-GB")).toEqual([]);
    expect(getFactOptions("person", "en-US")).toEqual([]);
    expect(getFactOptions("customFact", "en-GB")).toEqual([]);
    expect(isCataloguedFactType("pet")).toBe(false);
    expect(isCataloguedFactType("sport")).toBe(true);
  });

  it("is the spec §11 fix: gameId is locale-stable, only the reading changes (football/soccer)", () => {
    expectTypeOf<SportOption>().toEqualTypeOf<FactOption>();
    const gb = getFactOptions("sport", "en-GB").find((o) => o.id === "association-football");
    const us = getFactOptions("sport", "en-US").find((o) => o.id === "association-football");
    expect(gb).toMatchObject({ id: "association-football", label: "football", locale: "en-GB" });
    expect(us).toMatchObject({ id: "association-football", label: "soccer", locale: "en-US" });
    expect(gb?.id).toBe(us?.id);
    expect(gb?.label).not.toBe(us?.label);
    expect(isSportGameId("association-football")).toBe(true);
    expect(isSportGameId("not-a-game")).toBe(false);
    expectTypeOf<SportGameId>().toEqualTypeOf<(typeof SPORT_GAMES)[number]>();
  });

  it("football as a generic interest exists in both locales but only 'sport' type carries the game", () => {
    const gbFootballInterest = getFactOptions("interest", "en-GB").find((o) => o.id === "space");
    expect(gbFootballInterest?.label).toBe("space");
  });

  it("exposes options for every catalogue element in both locales", () => {
    expect(LOCALES).toEqual(["en-GB", "en-US"]);
    expect(isLocale("en-GB")).toBe(true);
    expect(isLocale("fr-FR")).toBe(false);
    for (const locale of LOCALES) {
      for (const type of CATALOGUED_FACT_TYPES) {
        expect(getFactOptions(type, locale).length, `${type}@${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("factOptionLabel resolves across the catalogue and falls back to undefined", () => {
    expect(factOptionLabel("dino", "en-GB")).toBe("dinosaurs");
    expect(factOptionLabel("rainbow", "en-US")).toBe("rainbow");
    expect(factOptionLabel("no-such-option", "en-GB")).toBeUndefined();
  });
});
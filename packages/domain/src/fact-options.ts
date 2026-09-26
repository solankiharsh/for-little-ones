/**
 * Fact option catalogue — F-006 §8 `GetFactOptions`. RESOLVED (D023): static typed
 * enums per locale shipped with the app at launch; a managed catalogue reopens with
 * F-024. Locale-aware options are the structural fix for the spec §11 ambiguity
 * class (en-GB "football" = association football is NEVER the US reading).
 */

import type { FactLocale, FactType } from "./fact";

export const LOCALES = ["en-GB", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export interface FactOption {
  id: string;
  label: string;
  /** Locale-specific reading of the same underlying concept. */
  locale: Locale;
}

/** A sport option; `gameId` is locale-stable (association-football) while `label` is the locale reading. */
export interface SportOption extends FactOption {}

export const SPORT_GAMES = [
  "association-football",
  "cricket",
  "tennis",
  "netball",
  "swimming",
  "gymnastics",
  "rugby-union",
  "baseball",
  "basketball",
  "hockey"
] as const;
export type SportGameId = (typeof SPORT_GAMES)[number];

/** Types that resolve through the catalogue. person/pet are relationship refs; customFact is free text. */
export const CATALOGUED_FACT_TYPES = [
  "interest",
  "favouriteAnimal",
  "favouriteColour",
  "favouriteToy",
  "favouriteFood",
  "hobby",
  "sport"
] as const satisfies readonly FactType[];
export type CataloguedFactType = (typeof CATALOGUED_FACT_TYPES)[number];

const ANIMALS: FactOption[] = [
  { id: "dino", label: "dinosaurs", locale: "en-GB" },
  { id: "dino", label: "dinosaurs", locale: "en-US" },
  { id: "fox", label: "foxes", locale: "en-GB" },
  { id: "fox", label: "foxes", locale: "en-US" },
  { id: "cat", label: "cats", locale: "en-GB" },
  { id: "cat", label: "cats", locale: "en-US" },
  { id: "dog", label: "dogs", locale: "en-GB" },
  { id: "dog", label: "dogs", locale: "en-US" },
  { id: "rabbit", label: "rabbits", locale: "en-GB" },
  { id: "rabbit", label: "rabbits", locale: "en-US" },
  { id: "bear", label: "bears", locale: "en-GB" },
  { id: "bear", label: "bears", locale: "en-US" },
  { id: "owl", label: "owls", locale: "en-GB" },
  { id: "owl", label: "owls", locale: "en-US" },
  { id: "penguin", label: "penguins", locale: "en-GB" },
  { id: "penguin", label: "penguins", locale: "en-US" },
  { id: "whale", label: "whales", locale: "en-GB" },
  { id: "whale", label: "whales", locale: "en-US" }
];

const COLOURS: FactOption[] = [
  { id: "red", label: "red", locale: "en-GB" },
  { id: "red", label: "red", locale: "en-US" },
  { id: "orange", label: "orange", locale: "en-GB" },
  { id: "orange", label: "orange", locale: "en-US" },
  { id: "yellow", label: "yellow", locale: "en-GB" },
  { id: "yellow", label: "yellow", locale: "en-US" },
  { id: "green", label: "green", locale: "en-GB" },
  { id: "green", label: "green", locale: "en-US" },
  { id: "blue", label: "blue", locale: "en-GB" },
  { id: "blue", label: "blue", locale: "en-US" },
  { id: "purple", label: "purple", locale: "en-GB" },
  { id: "purple", label: "purple", locale: "en-US" },
  { id: "pink", label: "pink", locale: "en-GB" },
  { id: "pink", label: "pink", locale: "en-US" },
  { id: "rainbow", label: "rainbow", locale: "en-GB" },
  { id: "rainbow", label: "rainbow", locale: "en-US" }
];

const TOYS: FactOption[] = [
  { id: "rocket", label: "rockets", locale: "en-GB" },
  { id: "rocket", label: "rockets", locale: "en-US" },
  { id: "teddy", label: "teddy bears", locale: "en-GB" },
  { id: "teddy", label: "teddy bears", locale: "en-US" },
  { id: "doll", label: "dolls", locale: "en-GB" },
  { id: "doll", label: "dolls", locale: "en-US" },
  { id: "train", label: "toy trains", locale: "en-GB" },
  { id: "train", label: "toy trains", locale: "en-US" },
  { id: "blocks", label: "building blocks", locale: "en-GB" },
  { id: "blocks", label: "building blocks", locale: "en-US" },
  { id: "scooter", label: "scooters", locale: "en-GB" },
  { id: "scooter", label: "scooters", locale: "en-US" },
  { id: "kite", label: "kites", locale: "en-GB" },
  { id: "kite", label: "kites", locale: "en-US" },
  { id: "robot", label: "robots", locale: "en-GB" },
  { id: "robot", label: "robots", locale: "en-US" }
];

const FOODS: FactOption[] = [
  { id: "strawberries", label: "strawberries", locale: "en-GB" },
  { id: "strawberries", label: "strawberries", locale: "en-US" },
  { id: "pizza", label: "pizza", locale: "en-GB" },
  { id: "pizza", label: "pizza", locale: "en-US" },
  { id: "pasta", label: "pasta", locale: "en-GB" },
  { id: "pasta", label: "pasta", locale: "en-US" },
  { id: "ice-cream", label: "ice cream", locale: "en-GB" },
  { id: "ice-cream", label: "ice cream", locale: "en-US" },
  { id: "pancakes", label: "pancakes", locale: "en-GB" },
  { id: "pancakes", label: "pancakes", locale: "en-US" },
  { id: "birthday-cake", label: "birthday cake", locale: "en-GB" },
  { id: "birthday-cake", label: "birthday cake", locale: "en-US" }
];

const HOBBIES: FactOption[] = [
  { id: "drawing", label: "drawing", locale: "en-GB" },
  { id: "drawing", label: "drawing", locale: "en-US" },
  { id: "dancing", label: "dancing", locale: "en-GB" },
  { id: "dancing", label: "dancing", locale: "en-US" },
  { id: "singing", label: "singing", locale: "en-GB" },
  { id: "singing", label: "singing", locale: "en-US" },
  { id: "building", label: "building", locale: "en-GB" },
  { id: "building", label: "building", locale: "en-US" },
  { id: "reading", label: "reading", locale: "en-GB" },
  { id: "reading", label: "reading", locale: "en-US" },
  { id: "gardening", label: "gardening", locale: "en-GB" },
  { id: "gardening", label: "gardening", locale: "en-US" }
];

const INTERESTS: FactOption[] = [
  { id: "space", label: "space", locale: "en-GB" },
  { id: "space", label: "space", locale: "en-US" },
  { id: "dinosaurs", label: "dinosaurs", locale: "en-GB" },
  { id: "dinosaurs", label: "dinosaurs", locale: "en-US" },
  { id: "pirates", label: "pirates", locale: "en-GB" },
  { id: "pirates", label: "pirates", locale: "en-US" },
  { id: "princesses", label: "princesses", locale: "en-GB" },
  { id: "princesses", label: "princesses", locale: "en-US" },
  { id: "superheroes", label: "superheroes", locale: "en-GB" },
  { id: "superheroes", label: "superheroes", locale: "en-US" },
  { id: "animals", label: "animals", locale: "en-GB" },
  { id: "animals", label: "animals", locale: "en-US" },
  { id: "nature", label: "nature", locale: "en-GB" },
  { id: "nature", label: "nature", locale: "en-US" },
  { id: "cooking", label: "cooking", locale: "en-GB" },
  { id: "cooking", label: "cooking", locale: "en-US" },
  { id: "music", label: "music", locale: "en-GB" },
  { id: "music", label: "music", locale: "en-US" }
];

/**
 * The one locale-stable sport list. `gameId` never changes meaning; only the
 * display reading does — en-GB "football" = `gameId: "association-football"`.
 */
const SPORTS: SportOption[] = [
  { id: "association-football", label: "football", locale: "en-GB" },
  { id: "association-football", label: "soccer", locale: "en-US" },
  { id: "cricket", label: "cricket", locale: "en-GB" },
  { id: "cricket", label: "cricket", locale: "en-US" },
  { id: "tennis", label: "tennis", locale: "en-GB" },
  { id: "tennis", label: "tennis", locale: "en-US" },
  { id: "netball", label: "netball", locale: "en-GB" },
  { id: "netball", label: "netball", locale: "en-US" },
  { id: "swimming", label: "swimming", locale: "en-GB" },
  { id: "swimming", label: "swimming", locale: "en-US" },
  { id: "gymnastics", label: "gymnastics", locale: "en-GB" },
  { id: "gymnastics", label: "gymnastics", locale: "en-US" },
  { id: "rugby-union", label: "rugby", locale: "en-GB" },
  { id: "rugby-union", label: "rugby", locale: "en-US" },
  { id: "baseball", label: "baseball", locale: "en-GB" },
  { id: "baseball", label: "baseball", locale: "en-US" },
  { id: "basketball", label: "basketball", locale: "en-GB" },
  { id: "basketball", label: "basketball", locale: "en-US" },
  { id: "hockey", label: "hockey", locale: "en-GB" },
  { id: "hockey", label: "hockey", locale: "en-US" }
];

const OPTIONS_BY_TYPE: Record<CataloguedFactType, readonly FactOption[]> = {
  interest: INTERESTS,
  favouriteAnimal: ANIMALS,
  favouriteColour: COLOURS,
  favouriteToy: TOYS,
  favouriteFood: FOODS,
  hobby: HOBBIES,
  sport: SPORTS
};

export function isCataloguedFactType(type: string): type is CataloguedFactType {
  return (CATALOGUED_FACT_TYPES as readonly string[]).includes(type);
}

/** F-006 §8 `GetFactOptions { type, locale }`. Non-catalogued types yield []. */
export function getFactOptions(type: FactType, locale: Locale): readonly FactOption[] {
  if (!isCataloguedFactType(type)) return [];
  return OPTIONS_BY_TYPE[type].filter((option) => option.locale === locale);
}

/** Resolve an optionId to its locale reading (used by `factDisplayValue`). */
export function factOptionLabel(optionId: string, locale: Locale): string | undefined {
  for (const list of Object.values(OPTIONS_BY_TYPE)) {
    const hit = list.find((option) => option.id === optionId && option.locale === locale);
    if (hit) return hit.label;
  }
  return undefined;
}

/** The locale-stable identifier for the sport a gameId represents (id === gameId for sports). */
export function isSportGameId(value: string): value is SportGameId {
  return (SPORT_GAMES as readonly string[]).includes(value);
}
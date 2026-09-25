import { describe, expect, it } from "vitest";
import { loadSavedCreation, saveCreation } from "./story-preview";

describe("guided creation persistence", () => {
  it("round-trips a refresh-safe draft", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; }
    };
    const value = {
      draft: {
        childName: "Milo",
        age: "6",
        world: "Bedtime wonder",
        favourites: ["Space"],
        detail: "Carries a red scarf",
        dedication: "Dream big."
      }
    };

    saveCreation(storage, value);
    expect(loadSavedCreation(storage)).toEqual(value);
  });

  it("ignores corrupted saved data", () => {
    expect(loadSavedCreation({ getItem: () => "not-json" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { fallbackConcepts, normaliseConcepts } from "./generate-concepts";

describe("story concept policy", () => {
  it("accepts exactly three distinct age-banded concepts", () => {
    const concepts = normaliseConcepts([
      { title: "Milo and the Quiet Comet", pitch: "Milo helps a shy comet find its way home.", emotionalGoal: "kindness", tone: "gentle" },
      { title: "The Pocket-Sized Planet", pitch: "Milo discovers a tiny world that needs a careful explorer.", emotionalGoal: "curiosity", tone: "wonder" },
      { title: "The Starry Scarf", pitch: "Milo's red scarf catches a starlight message from far away.", emotionalGoal: "confidence", tone: "adventure" }
    ], 6);

    expect(concepts).toHaveLength(3);
    expect(new Set(concepts?.map((concept) => concept.title.toLowerCase())).size).toBe(3);
    expect(concepts?.every((concept) => concept.readingLevel === "4-6")).toBe(true);
  });

  it("rejects duplicate or unsafe concepts", () => {
    const duplicate = { title: "Same idea", pitch: "A safe little story.", emotionalGoal: "kindness", tone: "gentle" };
    expect(normaliseConcepts([duplicate, duplicate, duplicate], 5)).toBeNull();
    expect(normaliseConcepts([
      { ...duplicate, title: "One", pitch: "A child finds a gun." },
      { ...duplicate, title: "Two" },
      { ...duplicate, title: "Three" }
    ], 5)).toBeNull();
  });

  it("always offers three authored fallback ideas", () => {
    const concepts = fallbackConcepts({ childName: "Milo", age: 6, world: "Big imagination", favourites: ["Space"] });
    expect(concepts).toHaveLength(3);
    expect(concepts.every((concept) => concept.source === "fallback")).toBe(true);
  });
});

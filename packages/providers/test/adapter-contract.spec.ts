import { describe, expect, it } from "vitest";
import type { ParseResult, StoryOutlineResult } from "@for-little-ones/contracts";
import { StoryOutlineResultSchema, parseContract, CONTRACT_NAMES } from "@for-little-ones/contracts";
import { ExampleVendorStoryAdapter } from "../src/index";

/**
 * Adapter→contract seam (seam 3). A provider adapter maps a vendor payload to a
 * canonical contract; vendor response types stay inside the adapter and never leak
 * past the boundary (GENERATION_ARCHITECTURE §3/§4).
 */
describe("providers: adapter → canonical contract seam", () => {
  it("maps a well-formed vendor outline payload to a canonical StoryOutlineResult", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const vendor = {
      storyTitle: "Ava and the Missing Moon",
      storyBlurb: "Ava finds the moon missing and returns it.",
      feel: "wonder",
      cast: [{ name: "Ava", part: "protagonist" }],
      chapters: [{ heading: "Departure", recap: "Ava notices the moon is gone." }],
      pages: 8,
      vendorOnly: { internalSeed: 99 }
    };
    const result = await adapter.generateOutline(
      {
        schemaVersion: "1",
        concept: { title: "Ava and the Missing Moon", pitch: "Ava flies her kite to the moon." },
        locale: "en-GB",
        facts: [],
        policySetVersion: "text.v1@1"
      },
      vendor
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const canonical = result.value;

    expect(canonical.title).toBe("Ava and the Missing Moon");
    expect(canonical.characters[0]?.name).toBe("Ava");
    expect(canonical.pageCount).toBe(8);
    // The vendor-specific field must not leak into the canonical result.
    expect("vendorOnly" in canonical).toBe(false);
  });

  it("returns a typed ParseFailure when the vendor payload cannot become canonical — never guesswork", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const brokenVendor = {
      storyTitle: "",
      storyBlurb: "nope",
      feel: "wonder",
      cast: [],
      chapters: [{ heading: "", recap: "" }],
      pages: 200
    };
    const outcome: ParseResult<StoryOutlineResult> = await adapter.generateOutline(
      {
        schemaVersion: "1",
        concept: { title: "Ava and the Missing Moon", pitch: "Ava flies her kite to the moon." },
        locale: "en-GB",
        facts: [],
        policySetVersion: "text.v1@1"
      },
      brokenVendor
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.contract).toBe(CONTRACT_NAMES.storyOutlineResult);
      expect(outcome.issues.length).toBeGreaterThan(0);
      expect(outcome.issues.some((i) => i.message.length > 0)).toBe(true);
    }
  });

  it("returns a typed ParseFailure for a non-object vendor payload — the adapter never throws", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const request = {
      schemaVersion: "1",
      concept: { title: "T", pitch: "P" },
      locale: "en-GB",
      facts: [],
      policySetVersion: "text.v1@1"
    };
    const outcome = await adapter.generateOutline(request, null);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.contract).toBe(CONTRACT_NAMES.storyOutlineResult);
    }
  });

  it("adapter output is itself parseable by the canonical schema (round-trip proof)", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const parsed = await adapter.generateOutline(
      {
        schemaVersion: "1",
        concept: { title: "T", pitch: "P" },
        locale: "en-GB",
        facts: ["Ava likes hedgehogs"],
        policySetVersion: "text.v1@1"
      },
      {
        storyTitle: "T",
        storyBlurb: "Blurb.",
        feel: "cozy",
        cast: [{ name: "Ava", part: "protagonist" }],
        chapters: [{ heading: "H", recap: "R" }],
        pages: 4
      }
    );
    if (!parsed.ok) throw new Error("expected success");
    const reparse = parseContract(CONTRACT_NAMES.storyOutlineResult, StoryOutlineResultSchema, parsed.value);
    expect(reparse.ok).toBe(true);
  });
});
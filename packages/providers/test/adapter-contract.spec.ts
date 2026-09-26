import { describe, expect, it } from "vitest";
import type { ConceptRequest, ConceptResult, ParseResult, StoryOutlineRequest, StoryOutlineResult } from "@for-little-ones/contracts";
import { ConceptResultSchema, StoryOutlineResultSchema, parseContract, CONTRACT_NAMES } from "@for-little-ones/contracts";
import {
  assertEligibleForChildPhotos,
  deriveIdentityReference,
  ExampleVendorStoryAdapter,
  ExampleVendorStoryProvider,
  isEligibleForChildPhotos,
  type IdentityProvider
} from "../src/index";

/**
 * Adapter→contract seam (seam 3). A provider adapter maps a vendor payload to a
 * canonical contract; vendor response types stay inside the adapter and never leak
 * past the boundary (GENERATION_ARCHITECTURE §3/§4).
 */
describe("providers: adapter → canonical contract seam", () => {
  it("rejects child-photo providers without deletion or a no-training commitment", () => {
    const policy = {
      verifiedAt: "2026-09-22",
      policyVersion: "v1",
      childDataSent: true,
      retentionMode: "UNKNOWN" as const,
      trainingUse: "UNKNOWN" as const,
      deletionMechanism: "NOT_SUPPORTED" as const,
      region: "unknown",
      evidenceRef: "internal://unverified"
    };
    expect(isEligibleForChildPhotos(policy)).toBe(false);
    expect(() => assertEligibleForChildPhotos(policy)).toThrow("not eligible");
  });

  it("gates identity-reference dispatch on the verified provider data policy", async () => {
    const provider: IdentityProvider = {
      card: {
        dataPolicy: {
          verifiedAt: "2026-09-22",
          policyVersion: "v1",
          childDataSent: true,
          retentionMode: "EPHEMERAL",
          trainingUse: "PROHIBITED",
          deletionMechanism: "API_DELETE",
          region: "GB",
          evidenceRef: "internal://verified"
        },
        idempotency: "keyed",
        timeoutMs: 1_000,
        retryPolicy: "none",
        costMetadata: "none"
      },
      async deriveReference(inputs) {
        return { reference: { providerId: "test", referenceId: inputs.sourcePhotoRefs[0]!, kind: "private-enduring-reference" }, knownFacesCount: 1 };
      },
      async scoreLikeness() {
        return { likenessScore01: 1 };
      }
    };

    await expect(deriveIdentityReference(provider, { sourcePhotoRefs: ["private://photo-1"] })).resolves.toMatchObject({ knownFacesCount: 1 });
  });
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
    } satisfies StoryOutlineRequest;
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

it("maps a well-formed vendor concept bundle to exactly three canonical concepts", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const request = {
      schemaVersion: "1",
      themeId: "space",
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      themeSeed: { tone: "gentle wonder", settingHints: ["night sky"], characterSlots: ["Ava"], forbidBlocks: ["scary"] },
      locale: "en-GB",
      displayName: "Ava",
      facts: [{ type: "interest" as const, value: "space", locale: "en-GB" }],
      readingLevel: "4-6"
    } satisfies ConceptRequest;
    const vendor = {
      themeRef: "space",
      level: "4-6",
      ideas: [
        { headline: "The Door at the End of the Garden", blurb: "Behind the last rose bush there is a door, and a whole world waits for the right explorer.", vibe: "wonder", pages: 8, cast: ["Ava"] },
        { headline: "The Map That Drew Itself", blurb: "Ava finds a map that draws itself one line at a time — every path on it leads home by tea time.", vibe: "pal", pages: 8, cast: ["Ava"] },
        { headline: "The Keeper of Lost Buttons", blurb: "Every lost button in town lands in one kindly cave, and Ava helps return them one by one.", vibe: "kind", pages: 8, cast: ["Ava"] }
      ],
      vendorOnly: { rawSeed: 99 }
    };
    const result = await adapter.generateConcepts(request, vendor);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.value.concepts).toHaveLength(3);
    expect(result.value.concepts.map((c) => c.emotionalGoal)).toEqual(["curiosity", "friendship", "kindness"]);
    expect(result.value.concepts[0]?.readingLevel).toBe("4-6");
    expect("vendorOnly" in result.value).toBe(false);
  });

  it("returns a typed ParseFailure when a vendor vibe has no canonical reading", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const request = {
      schemaVersion: "1",
      themeId: "space",
      themeSeedVersion: "v1",
      themeSeed: { tone: "gentle wonder", settingHints: ["night sky"], characterSlots: ["Ava"], forbidBlocks: ["scary"] },
      locale: "en-GB",
      displayName: "Ava",
      facts: [{ type: "interest", value: "space", locale: "en-GB" }]
    } satisfies ConceptRequest;
    const vendor = {
      themeRef: "space",
      level: "4-6",
      ideas: [
        { headline: "A", blurb: "Blurb one long enough to be a real pitch.", vibe: "wonder", pages: 8, cast: ["Ava"] },
        { headline: "B", blurb: "Blurb two long enough to be a real pitch.", vibe: "spooky", pages: 8, cast: ["Ava"] },
        { headline: "C", blurb: "Blurb three long enough to be a real pitch.", vibe: "kind", pages: 8, cast: ["Ava"] }
      ]
    };
    const outcome = await adapter.generateConcepts(request, vendor);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.contract).toBe(CONTRACT_NAMES.conceptResult);
      expect(outcome.issues[0]?.path).toContain("ideas[1]");
    }
  });

  it("returns a typed ParseFailure when the vendor sends the wrong number of ideas", async () => {
    const adapter = new ExampleVendorStoryAdapter();
    const request = {
      schemaVersion: "1",
      themeId: "space",
      themeSeedVersion: "v1",
      themeSeed: { tone: "gentle wonder", settingHints: ["night sky"], characterSlots: ["Ava"], forbidBlocks: ["scary"] },
      locale: "en-GB",
      displayName: "Ava",
      facts: [{ type: "interest", value: "space", locale: "en-GB" }]
    } satisfies ConceptRequest;
    const outcome = await adapter.generateConcepts(request, { themeRef: "space", level: "4-6", ideas: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues[0]?.message).toContain("exactly 3");
  });

  it("ExampleVendorStoryProvider drives the adapter seam deterministically (M1 runnable provider)", async () => {
    const provider = new ExampleVendorStoryProvider();
    const concepts = await provider.generateConcepts({
      schemaVersion: "1",
      themeId: "space",
      themeSeedVersion: "2026-09-25T00:00:00.000Z",
      themeSeed: { tone: "gentle wonder", settingHints: ["night sky"], characterSlots: ["Ava"], forbidBlocks: ["scary"] },
      locale: "en-GB",
      displayName: "Ava",
      facts: [{ type: "interest", value: "space", locale: "en-GB" }],
      readingLevel: "4-6"
    });
    expect(concepts.concepts).toHaveLength(3);
    expect(concepts.concepts[0]?.title).toContain("Ava");
    expect(concepts.concepts.every((c) => c.themeId === "space")).toBe(true);
    const reparse = parseContract(CONTRACT_NAMES.conceptResult, ConceptResultSchema, concepts);
    expect(reparse.ok).toBe(true);
  });
});

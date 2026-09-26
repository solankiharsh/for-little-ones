import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { CheckResult } from "../src/index";
import {
  ConceptResultSchema,
  ConceptRequestSchema,
  IllustrationPlanSchema,
  IllustrationResultSchema,
  PagePlanSchema,
  PageTextRequestSchema,
  PageTextResultSchema,
  QualityEvaluationRequestSchema,
  QualityEvaluationResultSchema,
  StoryOutlineRequestSchema,
  StoryOutlineResultSchema,
  parseContract,
  summarizeQa
} from "../src/index";

const valid = {
  conceptRequest: {
    schemaVersion: "1",
    themeId: "space",
    themeSeedVersion: "2026-09-25T00:00:00.000Z",
    themeSeed: {
      tone: "gentle wonder",
      settingHints: ["a cardboard rocket", "the night sky"],
      characterSlots: ["Ava"],
      forbidBlocks: ["scary dark"]
    },
    locale: "en-GB",
    displayName: "Ava",
    facts: [
      { type: "interest", value: "space", locale: "en-GB" },
      { type: "favouriteColour", value: "purple", locale: "en-GB" }
    ],
    pronouns: "she",
    readingLevel: "4-6",
    mood: "adventure"
  },
  conceptResult: {
    schemaVersion: "1",
    concepts: [
      {
        title: "The Rocket Made of Cardboard",
        pitch: "A cardboard rocket takes Ava to a moon made of chalk powder and back in time for breakfast.",
        emotionalGoal: "curiosity",
        themeId: "space",
        readingLevel: "4-6",
        approximateLengthPages: 8,
        charactersUsed: ["Ava"],
        generationMetadata: { model: "conceptpilot", attemptCount: 1, costCents: 2 }
      },
      {
        title: "The Planet That Played Hide and Seek",
        pitch: "One small planet keeps hiding behind Jupiter, and only Ava can coax it out.",
        emotionalGoal: "fun",
        themeId: "space",
        readingLevel: "4-6",
        approximateLengthPages: 8,
        charactersUsed: ["Ava"]
      },
      {
        title: "The Starlight Ferry",
        pitch: "Ava ferries sleepy starlight to a brand-new constellation that keeps forgetting where it lives.",
        emotionalGoal: "kindness",
        themeId: "space",
        readingLevel: "4-6",
        approximateLengthPages: 8,
        charactersUsed: ["Ava"]
      }
    ]
  },
  outlineRequest: {
    schemaVersion: "1",
    concept: { title: "Ava and the Missing Moon", pitch: "Ava flies her kite to the moon." },
    locale: "en-GB",
    facts: ["Ava likes hedgehogs"],
    policySetVersion: "text.v1@1"
  },
  outlineResult: {
    schemaVersion: "1",
    title: "Ava and the Missing Moon",
    synopsis: "Ava finds the moon missing and returns it.",
    emotionalGoal: "wonder",
    characters: [{ name: "Ava", role: "protagonist", facts: ["likes hedgehogs"] }],
    acts: [{ title: "Departure", summary: "Ava notices the moon is gone." }],
    pageCount: 8
  },
  pagePlan: { schemaVersion: "1", pageKey: "book:1|page:3", pageNumber: 3 },
  pageTextRequest: {
    schemaVersion: "1",
    pageKey: "book:1|page:3",
    pageNumber: 3,
    bibleVersion: "bible:v2",
    factsVersion: "facts:v4",
    locale: "en-GB",
    policySetVersion: "text.v1@1"
  },
  pageTextResult: {
    schemaVersion: "1",
    pageKey: "book:1|page:3",
    pageNumber: 3,
    textBlocks: [
      { id: "t1", kind: "paragraph", text: "The moon is gone!" }
    ],
    illustrationCue: "Ava looking up at an empty patch of sky",
    locale: "en-GB",
    generationMetadata: { model: "textpilot", attemptCount: 1, costCents: 2 }
  },
  illustrationPlan: {
    schemaVersion: "1",
    planKey: "sha256-abc123",
    pageKey: "book:1|page:3",
    bibleVersion: "bible:v2",
    styleVersion: "style:v1",
    compositionId: "single-figure-center"
  },
  illustrationResult: {
    schemaVersion: "1",
    planKey: "sha256-abc123",
    pageKey: "book:1|page:3",
    image: { format: "png", width: 1536, height: 1152, storageRef: "private/ill/abc.png" },
    generationMetadata: { model: "imagepilot", attemptCount: 1, costCents: 9 }
  },
  qaRequest: {
    schemaVersion: "1",
    artifactRefs: ["private/ill/abc.png"],
    stage: "identity",
    policySetVersion: "qa.v1@1"
  },
  qaResult: {
    schemaVersion: "1",
    results: [
      { code: "IDENTITY_LIKENESS_BELOW", dimension: "identity.likeness", severity: "REVIEW_REQUIRED" }
    ]
  }
} as const;

const schemaCases: Array<[string, z.ZodTypeAny, Record<string, unknown>]> = [
  ["ConceptRequest", ConceptRequestSchema, valid.conceptRequest],
  ["ConceptResult", ConceptResultSchema, valid.conceptResult],
  ["StoryOutlineRequest", StoryOutlineRequestSchema, valid.outlineRequest],
  ["StoryOutlineResult", StoryOutlineResultSchema, valid.outlineResult],
  ["PagePlan", PagePlanSchema, valid.pagePlan],
  ["PageTextRequest", PageTextRequestSchema, valid.pageTextRequest],
  ["PageTextResult", PageTextResultSchema, valid.pageTextResult],
  ["IllustrationPlan", IllustrationPlanSchema, valid.illustrationPlan],
  ["IllustrationResult", IllustrationResultSchema, valid.illustrationResult],
  ["QualityEvaluationRequest", QualityEvaluationRequestSchema, valid.qaRequest],
  ["QualityEvaluationResult", QualityEvaluationResultSchema, valid.qaResult]
];

describe("contracts: schema round-trip (seam 1)", () => {
  for (const [name, schema, payload] of schemaCases) {
    it(`${name} accepts a well-formed payload and preserves schemaVersion`, () => {
      const res = parseContract(name, schema, payload);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.contract).toBe(name);
        expect((res.value as { schemaVersion: string }).schemaVersion).toBe("1");
      }
    });

    it(`${name} rejects a malformed payload with a typed, structured error`, () => {
      const { schemaVersion: _drop, ...withoutVersion } = payload;
      const bad = { ...withoutVersion };
      const res = parseContract(name, schema, bad);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.contract).toBe(name);
        expect(res.issues.length).toBeGreaterThan(0);
        for (const issue of res.issues) {
          expect(issue.message.length).toBeGreaterThan(0);
        }
        expect(res.issues.some((i) => i.path.includes("schemaVersion"))).toBe(true);
      }
    });
  }
});

describe("contracts: strict boundary (seam 1)", () => {
  it("rejects unknown fields rather than silently stripping them", () => {
    const leaked = {
      ...valid.illustrationResult,
      vendorInternal: { rawSeed: 42 } // provider-specific field must not leak past the adapter
    };
    const res = parseContract("IllustrationResult", IllustrationResultSchema, leaked);
    expect(res.ok).toBe(false);
  });

  it("reports a nested path for a malformed array element", () => {
    const broken = {
      ...valid.pageTextResult,
      textBlocks: [{ id: "t1", kind: "inkblot", text: "" }]
    };
    const res = parseContract("PageTextResult", PageTextResultSchema, broken);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toContain("textBlocks");
    }
  });

  it("never throws on arbitrary garbage", () => {
    expect(() => parseContract("PagePlan", PagePlanSchema, null)).not.toThrow();
    expect(() => parseContract("PagePlan", PagePlanSchema, [{ a: 1 }])).not.toThrow();
    expect(() => parseContract("PagePlan", PagePlanSchema, "nope")).not.toThrow();
  });
});

describe("contracts: QA summary (seam 1)", () => {
  it("FAIL when any check is HARD_BLOCK", () => {
    const results: CheckResult[] = [
      { code: "A", dimension: "print.geometry", severity: "HARD_BLOCK" },
      { code: "B", dimension: "identity.likeness", severity: "ADVISORY" }
    ];
    expect(summarizeQa(results)).toBe("FAIL");
  });

  it("REVIEW_REQUIRED when only REVIEW_REQUIRED severity is present", () => {
    const results: CheckResult[] = [
      { code: "A", dimension: "identity.likeness", severity: "REVIEW_REQUIRED" }
    ];
    expect(summarizeQa(results)).toBe("REVIEW_REQUIRED");
  });

  it("PASS when all checks are ADVISORY or empty", () => {
    expect(summarizeQa([])).toBe("PASS");
    const advisory: CheckResult[] = [{ code: "A", dimension: "print.geometry", severity: "ADVISORY" }];
    expect(summarizeQa(advisory)).toBe("PASS");
  });
});
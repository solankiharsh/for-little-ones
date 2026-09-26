import type {
  ConceptRequest,
  ConceptResult,
  PageTextRequest,
  PageTextResult,
  ParseResult,
  StoryOutlineRequest,
  StoryOutlineResult
} from "@for-little-ones/contracts";
import {
  CONTRACT_NAMES,
  ConceptResultSchema,
  EMOTIONAL_GOALS,
  READING_LEVELS,
  StoryOutlineResultSchema,
  parseContract
} from "@for-little-ones/contracts";
import type { ProviderBoundary, ProviderCard } from "./shared";

/**
 * StoryProvider — text: concepts, outline, page text (GENERATION_ARCHITECTURE §4).
 * Canonical in, canonical out. The `card` field documents the child-data path.
 */
export interface StoryProvider extends ProviderBoundary {
  generateConcepts(request: ConceptRequest): Promise<ConceptResult>;
  generateOutline(request: StoryOutlineRequest): Promise<StoryOutlineResult>;
  generatePageText(request: PageTextRequest): Promise<PageTextResult>;
}

/**
 * StoryAdapter — the vendor-side boundary of the SAME seam. An adapter receives a
 * vendor payload and maps it to a canonical contract via `parseContract`; the
 * result is a typed ParseResult so a malformed vendor response is an explicit,
 * structured failure — never a silent best-effort fix.
 */
export interface StoryAdapter extends ProviderBoundary {
  generateConcepts(request: ConceptRequest, vendorPayload: unknown): Promise<ParseResult<ConceptResult>>;
  generateOutline(
    request: StoryOutlineRequest,
    vendorPayload: unknown
  ): Promise<ParseResult<StoryOutlineResult>>;
}

/**
 * Data policy for the example adapter + runnable M1 provider. Honest about what
 * flows across the seam: the canonical `ConceptRequest` carries the child's
 * name-derived display name, pronouns, and confirmed enum/relationship fact IDs
 * (F-006/F-007 allow-list) — so this is `childDataSent: true`. The scope is
 * deliberately narrow: NO photos, NO free-text user content, NO `suggested`
 * facts, NO raw profile fields; only the generation-eligible canonical subset.
 * Retention is zero and training is prohibited (AGENTS.md: a provider without
 * deletion/training posture can never receive data).
 */
const VENDOR_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "example-adapter-v2",
    childDataSent: true,
    childDataScope: [
      "name-derived display name",
      "pronouns",
      "confirmed enum/sport/person/pet/custom fact ids (generation-eligible subset only)"
    ],
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "not-applicable",
    evidenceRef: "internal://example-adapter/name+confirmed-fact-ids-only; no photos, no free-text, no suggested facts"
  },
  idempotency: "per-request idempotency key echoed by vendor; see adapter impl",
  timeoutMs: 15_000,
  retryPolicy: "5xx + network: retryable with backoff; 4xx: non-retryable",
  costMetadata: "surfaced as costCents in generationMetadata when the vendor reports it"
};

/**
 * Example adapter proving the adapter→contract direction. It maps a (made-up)
 * vendor outline payload into canonical shape and validates it strictly: vendor
 * fields that are not canonical are dropped by the mapping; anything the schema
 * rejects surfaces as a typed ParseFailure.
 */
export class ExampleVendorStoryAdapter implements StoryAdapter {
  readonly card: ProviderCard = VENDOR_CARD;

  async generateOutline(
    _request: StoryOutlineRequest,
    vendorPayload: unknown
  ): Promise<ParseResult<StoryOutlineResult>> {
    const vendor = asVendorOutline(vendorPayload);
    if (vendor === null) {
      return {
        ok: false,
        contract: CONTRACT_NAMES.storyOutlineResult,
        issues: [
          {
            path: "<vendor>",
            message: "adapter received a non-object vendor payload (expected story outline JSON)"
          }
        ]
      };
    }
    const canonical = {
      schemaVersion: "1",
      title: vendor.storyTitle,
      synopsis: vendor.storyBlurb,
      emotionalGoal: vendor.feel,
      characters: vendor.cast.map((c) => ({ name: c.name, role: c.part, facts: [] })),
      acts: vendor.chapters.map((ch) => ({ title: ch.heading, summary: ch.recap })),
      pageCount: vendor.pages
    };
    return parseContract(CONTRACT_NAMES.storyOutlineResult, StoryOutlineResultSchema, canonical);
  }

  async generateConcepts(
    request: ConceptRequest,
    vendorPayload: unknown
  ): Promise<ParseResult<ConceptResult>> {
    const vendor = asVendorConceptBundle(vendorPayload);
    if (vendor === null) {
      return {
        ok: false,
        contract: CONTRACT_NAMES.conceptResult,
        issues: [
          {
            path: "<vendor>",
            message: "adapter received a non-object vendor payload (expected concept bundle JSON)"
          }
        ]
      };
    }
    if (vendor.ideas.length !== 3) {
      return {
        ok: false,
        contract: CONTRACT_NAMES.conceptResult,
        issues: [{ path: "<vendor>ideas", message: `vendor returned ${vendor.ideas.length} ideas; canonical requires exactly 3` }]
      };
    }
    const concepts: Array<Record<string, unknown>> = [];
    for (let index = 0; index < vendor.ideas.length; index += 1) {
      const idea = vendor.ideas[index]!;
      const emotionalGoal = EMOTIONAL_GOAL_VIBES[idea.vibe];
      if (!emotionalGoal) {
        return {
          ok: false,
          contract: CONTRACT_NAMES.conceptResult,
          issues: [{ path: `<vendor>ideas[${index}].vibe`, message: `unknown vendor vibe "${idea.vibe}"` }]
        };
      }
      if (!(READING_LEVELS as readonly string[]).includes(vendor.level)) {
        return {
          ok: false,
          contract: CONTRACT_NAMES.conceptResult,
          issues: [{ path: "<vendor>level", message: `unknown vendor reading level "${vendor.level}"` }]
        };
      }
      concepts.push({
        title: idea.headline,
        pitch: idea.blurb,
        emotionalGoal,
        themeId: vendor.themeRef,
        readingLevel: vendor.level,
        approximateLengthPages: idea.pages,
        charactersUsed: idea.cast,
        generationMetadata: {
          model: "example-vendor/concept",
          attemptCount: 1,
          costCents: 2
        }
      });
    }
    return parseContract(CONTRACT_NAMES.conceptResult, ConceptResultSchema, {
      schemaVersion: "1",
      concepts
    });
  }
}

/**
 * M1 runnable StoryProvider backed by the example adapter (no HTTP vendor yet).
 * Deterministic concept bundles built from the request so the durable runner has a
 * real seam to drive. Only concept generation is implemented; outline/page-text
 * stay with the future vendor wiring.
 */
export class ExampleVendorStoryProvider implements Pick<StoryProvider, "generateConcepts" | "card"> {
  readonly card: ProviderCard = VENDOR_CARD;
  private readonly adapter = new ExampleVendorStoryAdapter();

  async generateConcepts(request: ConceptRequest): Promise<ConceptResult> {
    const parsed = await this.adapter.generateConcepts(request, buildVendorConcepts(request));
    if (!parsed.ok) {
      throw new Error(`concept generation failed contract validation: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }
    return parsed.value;
  }
}

/** Vendor's reading of an emotional goal. Unknown vibes are a strict failure. */
const EMOTIONAL_GOAL_VIBES: Record<string, (typeof EMOTIONAL_GOALS)[number]> = {
  wonder: "curiosity",
  brave: "bravery",
  kind: "kindness",
  cozy: "bedtime_calm",
  giggle: "fun",
  pal: "friendship",
  home: "belonging",
  sure: "confidence"
};

function buildVendorConcepts(request: ConceptRequest): VendorConceptBundle {
  const hero = request.displayName;
  const theme = request.themeId;
  const fact = request.facts[0] ? `${request.facts[0].value} (${request.facts[0].type})` : `${hero} is wonderfully themselves`;
  return {
    themeRef: theme,
    level: request.readingLevel ?? "4-6",
    ideas: [
      {
        headline: `${hero} and the Pinch of Starlight`,
        blurb: `${hero} befriends a tiny star that has lost its glow. With one real fact — ${fact} — they find the way to light it again.`,
        vibe: "wonder",
        pages: 8,
        cast: [hero]
      },
      {
        headline: `${hero}'s Brave Little Voyage`,
        blurb: `A short, brave journey shaped around ${theme} and ${fact}. ${hero} learns that courage is small steps taken kindly.`,
        vibe: "brave",
        pages: 8,
        cast: [hero]
      },
      {
        headline: `The Kindest Thing ${hero} Did`,
        blurb: `A gentle chain of kindness that begins with ${hero} and ends with the whole neighbourhood smiling — powered by ${fact}.`,
        vibe: "kind",
        pages: 8,
        cast: [hero]
      }
    ]
  };
}

interface VendorConceptBundle {
  themeRef: string;
  level: string;
  ideas: Array<{ headline: string; blurb: string; vibe: string; pages: number; cast: string[] }>;
}

function asVendorConceptBundle(input: unknown): VendorConceptBundle | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.ideas)) return null;
  return {
    themeRef: typeof o.themeRef === "string" ? o.themeRef : "",
    level: typeof o.level === "string" ? o.level : "",
    ideas: o.ideas.map((idea) => {
      const i = idea as Record<string, unknown>;
      return {
        headline: typeof i.headline === "string" ? i.headline : "",
        blurb: typeof i.blurb === "string" ? i.blurb : "",
        vibe: typeof i.vibe === "string" ? i.vibe : "",
        pages: typeof i.pages === "number" ? i.pages : 0,
        cast: Array.isArray(i.cast) ? (i.cast as unknown[]).filter((c): c is string => typeof c === "string") : []
      };
    })
  };
}

interface VendorOutline {
  storyTitle: string;
  storyBlurb: string;
  feel: string;
  cast: Array<{ name: string; part: string }>;
  chapters: Array<{ heading: string; recap: string }>;
  pages: number;
}

function asVendorOutline(input: unknown): VendorOutline | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const o = input as Record<string, unknown>;
  return {
    storyTitle: typeof o.storyTitle === "string" ? o.storyTitle : "",
    storyBlurb: typeof o.storyBlurb === "string" ? o.storyBlurb : "",
    feel: typeof o.feel === "string" ? o.feel : "",
    cast: Array.isArray(o.cast)
      ? (o.cast as Array<{ name: string; part: string }>).map((c) => ({
          name: c?.name ?? "",
          part: c?.part ?? ""
        }))
      : [],
    chapters: Array.isArray(o.chapters)
      ? (o.chapters as Array<{ heading: string; recap: string }>).map((ch) => ({
          heading: ch?.heading ?? "",
          recap: ch?.recap ?? ""
        }))
      : [],
    pages: typeof o.pages === "number" ? o.pages : 0
  };
}

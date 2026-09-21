import type {
  ConceptRequest,
  ConceptResult,
  PageTextRequest,
  PageTextResult,
  ParseResult,
  StoryOutlineRequest,
  StoryOutlineResult
} from "@for-little-ones/contracts";
import { CONTRACT_NAMES, StoryOutlineResultSchema, parseContract } from "@for-little-ones/contracts";
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
  generateOutline(
    request: StoryOutlineRequest,
    vendorPayload: unknown
  ): Promise<ParseResult<StoryOutlineResult>>;
}

const VENDOR_CARD: ProviderCard = {
  childDataSent: { sent: false },
  retention: "none (stateless HTTP mapping adapter)",
  dataUseTerms: "none",
  idempotency: "per-request idempotency key echoed by vendor; see adapter impl",
  timeoutMs: 15_000,
  retryPolicy: "5xx + network: retryable with backoff; 4xx: non-retryable",
  costMetadata: "surfaced as costCents in generationMetadata when the vendor reports it",
  deletion: "not applicable (no stored child data)"
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
}

interface VendorOutline {
  storyTitle: string;
  storyBlurb: string;
  feel: string;
  cast: Array<{ name: string; part: string }>;
  chapters: Array<{ heading: string; recap: string }>;
  pages: number;
}

function asVendorOutline(input: unknown): VendorOutline {
  if (typeof input !== "object" || input === null) {
    throw new Error("adapter: vendor payload is not an object");
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
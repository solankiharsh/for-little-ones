import {
  CONTRACT_NAMES,
  ConceptResultSchema,
  PageTextResultSchema,
  StoryOutlineResultSchema,
  parseContract,
  type ConceptRequest,
  type ConceptResult,
  type PageTextRequest,
  type PageTextResult,
  type StoryOutlineRequest,
  type StoryOutlineResult
} from "@for-little-ones/contracts";
import type { ProviderCard } from "./shared";
import type { StoryProvider } from "./story";

/**
 * Gemini-backed StoryProvider — outline + page text with real personalisation
 * (D029 remaining scope). The request shapes are the canonical contracts; the
 * prompts carry the personalisation (hero, facts, concept, locale, continuity,
 * word cap) and demand strict JSON back, which `parseContract` validates before
 * anything becomes domain data. A malformed model reply throws — the runner
 * treats that as a retryable failure, then exhaustion, never a silent fix-up.
 *
 * Child-data posture is on the card, honestly: display names, concept copy and
 * generation-eligible fact strings cross the seam (never photos, never raw
 * profiles); training/retention depend on the key's Google plan, which this
 * code does not verify — so the plan is treated as untrusted and photos are
 * structurally out of scope for this provider.
 */

export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

const GEMINI_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-28",
    policyVersion: "gemini-story-v1",
    childDataSent: true,
    childDataScope: [
      "hero display name (page context)",
      "concept title + pitch (outline context)",
      "generation-eligible fact strings (outline context)",
      "locale tag"
    ],
    retentionMode: "UNKNOWN",
    trainingUse: "UNKNOWN",
    deletionMechanism: "NOT_SUPPORTED",
    region: "vendor-default",
    evidenceRef: "internal://gemini-story/text-only-no-photos; key plan unverified so retention/training stay UNKNOWN"
  },
  idempotency: "none — idempotency lives in the durable runner (pageKey / operation key), not the vendor",
  timeoutMs: 45_000,
  retryPolicy: "network + 5xx + malformed JSON: retryable via the runner budget; 4xx: non-retryable after throw",
  costMetadata: "usageMetadata surfaced in generationMetadata when the vendor reports it"
};

export interface GeminiStoryProviderOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export function conceptSystem(locale: string): string {
  return [
    "You create safe, warm and distinctly different picture-book concepts for children.",
    `Use ${locale === "en-US" ? "American" : "British"} English.`,
    "No brands, copyrighted characters, violence, weapons, frightening peril or claims about the real child.",
    "Return exactly three concepts with different story premises and emotional goals.",
    "Reply with a raw JSON object only, no fences."
  ].join(" ");
}

export function buildConceptPrompt(request: ConceptRequest): string {
  const factLines = request.facts.length > 0
    ? request.facts.map((fact) => `${fact.type}: ${fact.value}`).join("; ")
    : `${request.displayName} is wonderfully themselves`;
  return [
    `Create three story ideas for ${request.displayName} (theme: ${request.themeId}).`,
    `True facts to honour: ${factLines}.`,
    request.readingLevel ? `Reading level: ${request.readingLevel}.` : "Reading level: 4-6.",
    "Return JSON exactly shaped as:",
    `{"schemaVersion":"1","concepts":[{"title":string,"pitch":string,`,
    `"emotionalGoal":one of confidence|bravery|kindness|friendship|belonging|bedtime_calm|fun|curiosity (exact spelling),`,
    `"themeId":${JSON.stringify(request.themeId)},`,
    `"readingLevel":${JSON.stringify(request.readingLevel ?? "4-6")},`,
    `"approximateLengthPages":8,"charactersUsed":[${JSON.stringify(request.displayName)}]}, ×3]}`
  ].join("\n");
}

export function outlineSystem(locale: string): string {  return [
    "You create safe, warm, original picture-book story outlines for young children.",
    `Use ${locale === "en-US" ? "American" : "British"} English spelling.`,
    "No frightening peril, violence, weapons, brands, copyrighted characters, or claims about the real child.",
    "Three acts, each summary at most 120 words. Reply with a raw JSON object only, no fences."
  ].join(" ");
}

export function buildOutlinePrompt(request: StoryOutlineRequest): string {
  const hero = request.facts[0] ?? "the little traveller";
  return [
    `Story concept: "${request.concept.title}" — ${request.concept.pitch}`,
    `The story is for ${hero}.`,
    request.facts.length > 0 ? `True facts to honour (never contradict): ${request.facts.join("; ")}.` : "No extra facts supplied.",
    "Return JSON exactly shaped as:",
    `{"schemaVersion":"1","title":string,"synopsis":string,"emotionalGoal":string,`,
    `"characters":[{"name":string,"role":string,"facts":[string]}],`,
    `"acts":[{"title":string,"summary":string},{"title":string,"summary":string},{"title":string,"summary":string}],`,
    `"pageCount":6}`
  ].join("\n");
}

export function pageSystem(locale: string): string {
  return [
    "You write one warm, original picture-book page for a young child.",
    `Use ${locale === "en-US" ? "American" : "British"} English spelling.`,
    "No frightening peril, violence, weapons, brands, copyrighted characters, or claims about the real child.",
    "Reply with a raw JSON object only, no fences."
  ].join(" ");
}

export function buildPagePrompt(request: PageTextRequest): string {
  const hero = request.heroName ?? "the little traveller";
  const title = request.storyTitle ?? "the adventure";
  const cap = request.maxWords ?? 40;
  return [
    `Write page ${request.pageNumber} of "${title}" for ${hero}.`,
    request.priorLines && request.priorLines.length > 0
      ? `Continue directly from this line: "${request.priorLines[request.priorLines.length - 1]}".`
      : "Open the adventure.",
    `At most ${cap} words of story text in one paragraph block.`,
    "Also give a one-sentence illustration cue: who is in the scene, doing what, where.",
    "Return JSON exactly shaped as:",
    `{"schemaVersion":"1","pageKey":${JSON.stringify(request.pageKey)},"pageNumber":${request.pageNumber},`,
    `"textBlocks":[{"id":"block-${request.pageNumber}","kind":"paragraph","text":string}],`,
    `"illustrationCue":string,"locale":${JSON.stringify(request.locale)}}`
  ].join("\n");
}

export class GeminiStoryProvider implements StoryProvider {
  readonly card: ProviderCard = GEMINI_CARD;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiStoryProviderOptions) {
    if (!options.apiKey) throw new Error("GeminiStoryProvider needs an apiKey (GEMINI_API_KEY)");
    this.apiKey = options.apiKey;
    this.model = options.model ?? process.env.AI_STORY_MODEL ?? GEMINI_DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async generateConcepts(request: ConceptRequest): Promise<ConceptResult> {
    const text = await this.complete(conceptSystem(request.locale), buildConceptPrompt(request));
    const parsed = parseContract(CONTRACT_NAMES.conceptResult, ConceptResultSchema, parseJson(text));
    if (!parsed.ok) {
      throw new Error(`concepts failed contract validation: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }
    return parsed.value;
  }

  async generateOutline(request: StoryOutlineRequest): Promise<StoryOutlineResult> {
    const text = await this.complete(outlineSystem(request.locale), buildOutlinePrompt(request));
    const parsed = parseContract(CONTRACT_NAMES.storyOutlineResult, StoryOutlineResultSchema, parseJson(text));
    if (!parsed.ok) {
      throw new Error(`outline failed contract validation: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }
    return parsed.value;
  }

  async generatePageText(request: PageTextRequest): Promise<PageTextResult> {
    const text = await this.complete(pageSystem(request.locale), buildPagePrompt(request));
    const parsed = parseContract(CONTRACT_NAMES.pageTextResult, PageTextResultSchema, parseJson(text));
    if (!parsed.ok) {
      throw new Error(`page text failed contract validation: ${parsed.issues.map((i) => i.message).join("; ")}`);
    }
    return parsed.value;
  }

  private async complete(system: string, prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 }
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      }
    );
    if (!response.ok) {
      throw new Error(`gemini request failed (HTTP ${response.status})`);
    }
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("gemini returned no text");
    return text;
  }
}

/** Models wrap JSON in fences despite instructions; strip once, then strict-parse. */
export function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return JSON.parse((fenced?.[1] ?? text).trim());
}

import { generateText, Output } from "ai";
import { z } from "zod";
import { authorizeGenerationCommand, type PaymentState } from "@for-little-ones/domain";

export const maxDuration = 60;

const model = process.env.AI_STORY_MODEL ?? "google/gemini-2.5-flash";
const emotionalGoals = ["confidence", "bravery", "kindness", "friendship", "belonging", "bedtime calm", "fun", "curiosity"] as const;
const unsafeTerms = /\b(?:gun|weapon|kill|murder|blood|suicide|drugs|alcohol)\b/i;

const RequestSchema = z.strictObject({
  childName: z.string().trim().min(1).max(40),
  age: z.number().int().min(1).max(12),
  world: z.string().trim().min(1).max(80),
  favourites: z.array(z.string().trim().min(1).max(40)).max(8),
  detail: z.string().trim().max(120),
  projectId: z.string().startsWith("project_").max(80),
  revisionId: z.string().startsWith("revision_").max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/)
});

const ModelConceptSchema = z.strictObject({
  title: z.string().trim().min(3).max(60),
  pitch: z.string().trim().min(12).max(240),
  emotionalGoal: z.enum(emotionalGoals),
  tone: z.string().trim().min(2).max(30)
});
const ModelOutputSchema = z.strictObject({ concepts: z.array(ModelConceptSchema).length(3) });

export interface StoryConcept {
  id: string;
  title: string;
  pitch: string;
  emotionalGoal: typeof emotionalGoals[number];
  tone: string;
  readingLevel: "1-3" | "4-6" | "7-9" | "10-12";
  approximateLengthPages: 6;
  source: "model" | "fallback";
}

export function normaliseConcepts(value: unknown, age: number, source: StoryConcept["source"] = "model"): StoryConcept[] | null {
  const parsed = z.array(ModelConceptSchema).length(3).safeParse(value);
  if (!parsed.success) return null;
  const titles = new Set(parsed.data.map((concept) => concept.title.toLocaleLowerCase("en-GB")));
  if (titles.size !== 3 || parsed.data.some((concept) => unsafeTerms.test(`${concept.title} ${concept.pitch}`))) return null;
  return parsed.data.map((concept, index) => ({
    id: `concept_${index + 1}`,
    ...concept,
    readingLevel: readingLevelFor(age),
    approximateLengthPages: 6,
    source
  }));
}

export function fallbackConcepts(input: Pick<z.infer<typeof RequestSchema>, "childName" | "age" | "world" | "favourites">): StoryConcept[] {
  const favourite = input.favourites[0] ?? "small surprises";
  return normaliseConcepts([
    { title: `${input.childName} and the Lantern Trail`, pitch: `${input.childName} follows a trail of gentle lights and helps a new friend find the way home.`, emotionalGoal: "kindness", tone: "gentle" },
    { title: `The Smallest Door in ${input.world}`, pitch: `${input.childName} discovers a tiny doorway where ${favourite.toLowerCase()} hold the clue to a curious mystery.`, emotionalGoal: "curiosity", tone: "wonder" },
    { title: `${input.childName}'s Brave Little Wish`, pitch: `A quiet wish leads ${input.childName} on a warm adventure about trying one small, brave thing.`, emotionalGoal: "confidence", tone: "adventure" }
  ], input.age, "fallback")!;
}

function readingLevelFor(age: number): StoryConcept["readingLevel"] {
  if (age <= 3) return "1-3";
  if (age <= 6) return "4-6";
  if (age <= 9) return "7-9";
  return "10-12";
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const input = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Check the story details and try again." }, { status: 400 });

    // Entitlement and attempt budget are resolved from the creation service's own
    // payment record before the job is enqueued, so a refused or exhausted purchase
    // never reaches the provider (D023).
    const project = await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}`, { method: "GET" })
      .catch(() => null) as { paymentState?: unknown; generation?: { assetsGenerated?: unknown; conceptAttempts?: unknown } } | null;
    if (!project) return Response.json({ error: "Your saved story could not be reached. Please try again." }, { status: 503 });
    const authorization = authorizeGenerationCommand({
      paymentState: paymentStateOf(project.paymentState),
      operation: "CONCEPT_BUNDLE",
      assetsGenerated: counterOf(project.generation?.assetsGenerated),
      attempts: counterOf(project.generation?.conceptAttempts)
    });
    if (!authorization.allowed) return Response.json({ error: authorization.reason }, { status: 402 });

    let jobId: string;
    try {
      const job = await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}/concept-jobs`, {
        method: "POST", body: { revisionId: input.data.revisionId }
      }) as { jobId?: unknown };
      if (typeof job.jobId !== "string") throw new Error("Creation service returned an invalid job");
      jobId = job.jobId;
    } catch (error) {
      console.error("concept job could not start", error);
      return Response.json({ error: "Your story ideas could not be started. Please try again." }, { status: 503 });
    }

    let concepts: StoryConcept[];
    let servedFromFallback = false;
    let generationMetadata: { model: string; attemptCount: number; inputTokens?: number; outputTokens?: number } = { model, attemptCount: 1 };
    try {
      const { output, usage } = await generateText({
        model,
        abortSignal: AbortSignal.timeout(45_000),
        output: Output.object({ schema: ModelOutputSchema }),
        system: [
          "You create safe, warm and distinctly different picture-book concepts for children.",
          "Use British English. Do not use brands, copyrighted characters, violence, weapons, frightening peril or claims about the real child.",
          "Return exactly three concepts with different story premises and emotional goals."
        ].join(" "),
        prompt: conceptPrompt(input.data)
      });
      concepts = normaliseConcepts(output.concepts, input.data.age) ?? fallbackConcepts(input.data);
      servedFromFallback = concepts[0]?.source === "fallback";
      generationMetadata = {
        model, attemptCount: 1,
        ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
        ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {})
      };
    } catch (error) {
      console.error("concept generation used fallback", error);
      concepts = fallbackConcepts(input.data);
      servedFromFallback = true;
    }

    try {
      await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}/concept-jobs/${jobId}`, {
        method: "PATCH", body: { revisionId: input.data.revisionId, concepts, generationMetadata }
      });
    } catch (error) {
      console.error("concept bundle could not be saved", error);
      return Response.json({ error: "Your story ideas could not be saved. Please try again." }, { status: 503 });
    }
    return Response.json({ schemaVersion: "1", concepts, servedFromFallback, generationMetadata });
  }
};

function paymentStateOf(value: unknown): PaymentState {
  return value === "authorized" || value === "captured" || value === "refunded" || value === "cancelled" ? value : "pending";
}

function counterOf(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

async function projectRequest(
  input: z.infer<typeof RequestSchema>,
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown }
) {
  const baseUrl = process.env.CREATION_API_URL;
  const publishableKey = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new Error("Creation service is not configured");
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: { "content-type": "application/json", "x-publishable-api-key": publishableKey, authorization: `Bearer ${input.ownerToken}` },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Creation service failed (${response.status})`);
  return body;
}

function conceptPrompt(input: z.infer<typeof RequestSchema>): string {
  return `Create three story ideas for ${input.childName}, age ${input.age}.
Story world: ${input.world}
Favourite things: ${input.favourites.join(", ") || "gentle surprises"}
Personal detail: ${input.detail || "none supplied"}
Each pitch should make the beginning, manageable challenge and kind emotional direction clear without resolving the ending.`;
}

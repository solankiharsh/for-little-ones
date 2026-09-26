import { generateText, Output } from "ai";
import { z } from "zod";
import { authorizeGenerationCommand, projectStoryForEntitlement, type PaymentState } from "@for-little-ones/domain";

export const maxDuration = 60;

const model = process.env.AI_STORY_MODEL ?? "google/gemini-2.5-flash";

const StoryPreviewRequestSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  childName: z.string().trim().min(1).max(40),
  age: z.number().int().min(1).max(12),
  world: z.string().trim().min(1).max(80),
  favourites: z.array(z.string().trim().min(1).max(40)).max(8),
  detail: z.string().trim().max(120),
  dedication: z.string().trim().max(150),
  locale: z.string().min(2).max(16),
  projectId: z.string().startsWith("project_").max(80),
  revisionId: z.string().startsWith("revision_").max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/),
  selectedConcept: z.strictObject({
    id: z.string().startsWith("concept_").max(80),
    title: z.string().trim().min(1).max(60),
    pitch: z.string().trim().min(1).max(240),
    emotionalGoal: z.string().trim().min(1).max(30),
    tone: z.string().trim().min(1).max(30)
  })
});

const StoryPreviewModelSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  title: z.string().trim().min(1).max(100),
  synopsis: z.string().trim().min(1).max(500),
  emotionalGoal: z.string().trim().min(1).max(240),
  pages: z.array(z.strictObject({
    pageNumber: z.number().int().min(1).max(12),
    text: z.string().trim().min(1).max(700),
    illustrationCue: z.string().trim().min(1).max(500)
  })).length(6)
});

type StoryPreviewRequest = z.infer<typeof StoryPreviewRequestSchema>;

interface CreationProjectSnapshot {
  paymentState?: unknown;
  generation?: { assetsGenerated?: unknown; storyAttempts?: unknown };
}

function paymentStateOf(value: unknown): PaymentState {
  return value === "authorized" || value === "captured" || value === "refunded" || value === "cancelled" ? value : "pending";
}

function counterOf(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }

  let body: unknown;
  let jobId: string | undefined;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const input = StoryPreviewRequestSchema.safeParse(body);
  if (!input.success) {
    return Response.json({ error: "Check the story details and try again." }, { status: 400 });
  }

  // The entitlement comes from the payment record the creation service holds, never
  // from the request. Authorised before the job is enqueued, so a refused purchase
  // never reaches a provider (D023).
  const project = await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}`, { method: "GET" })
    .catch(() => null) as CreationProjectSnapshot | null;
  if (!project) {
    return Response.json({ error: "Your saved story could not be reached. Please try again." }, { status: 503 });
  }
  const authorization = authorizeGenerationCommand({
    paymentState: paymentStateOf(project.paymentState),
    operation: "STORY_PREVIEW",
    assetsGenerated: counterOf(project.generation?.assetsGenerated),
    attempts: counterOf(project.generation?.storyAttempts)
  });
  if (!authorization.allowed) {
    return Response.json({ error: authorization.reason }, { status: 402 });
  }

  try {
    const job = await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}/story-jobs`, {
      method: "POST", body: { revisionId: input.data.revisionId, selectedConceptId: input.data.selectedConcept.id }
    }) as { jobId?: unknown };
    if (typeof job.jobId !== "string") throw new Error("Creation service returned an invalid job");
    jobId = job.jobId;
    const { output, usage } = await generateText({
      model,
      abortSignal: AbortSignal.timeout(45_000),
      output: Output.object({ schema: StoryPreviewModelSchema }),
      system: [
        "You write warm, original picture-book stories for children aged 1 to 12.",
        "Use British English and age-appropriate language. Keep the child safe throughout.",
        "Never add frightening peril, violence, brands, copyrighted characters, or claims about the real child.",
        "Return exactly six short pages. Each illustration cue describes a coherent scene but does not generate an image."
      ].join(" "),
      prompt: storyPrompt(input.data)
    });

    const generationMetadata = {
      model, attemptCount: 1,
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {})
    };
    // The complete story is persisted server-side; only the entitlement's projection
    // is ever returned, so the response and anything the browser stores hold no
    // pre-payment page text.
    const teaser = { ...projectStoryForEntitlement(output, authorization.entitlement), generationMetadata };
    await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}/story-jobs/${job.jobId}`, {
      method: "PATCH", body: { revisionId: input.data.revisionId, status: "READY", teaser, story: output, generationMetadata }
    });
    return Response.json(teaser);
  } catch (error) {
    if (jobId) {
      await projectRequest(input.data, `/store/flo/projects/${input.data.projectId}/story-jobs/${jobId}`, {
        method: "PATCH", body: { revisionId: input.data.revisionId, status: "FAILED" }
      }).catch(() => undefined);
    }
    console.error("story-preview generation failed", error);
    return Response.json({ error: "The story studio is taking a little longer. Please try again." }, { status: 503 });
  }
}

async function projectRequest(
  input: StoryPreviewRequest,
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown }
) {
  const baseUrl = process.env.CREATION_API_URL;
  const publishableKey = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new Error("Creation service is not configured");
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": publishableKey,
      authorization: `Bearer ${input.ownerToken}`
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Creation service failed (${response.status})`);
  return body;
}

export default {
  async fetch(request: Request) {
    return handle(request);
  }
};

function storyPrompt(input: StoryPreviewRequest): string {
  const favourites = input.favourites.length > 0 ? input.favourites.join(", ") : "gentle surprises";
  const personalDetail = input.detail || "No additional personal detail supplied";
  const policy = storyPolicyForAge(input.age);
  return `Create a six-page personalised story preview with this brief:
- Main character: ${input.childName}, age ${input.age}
- Story world: ${input.world}
- Favourite things: ${favourites}
- Personal detail: ${personalDetail}
- Selected concept title: ${input.selectedConcept.title}
- Selected concept pitch: ${input.selectedConcept.pitch}
- Intended emotional goal: ${input.selectedConcept.emotionalGoal}
- Tone: ${input.selectedConcept.tone}
- Reading band: ages ${policy.band}
- Language direction: ${policy.direction}
- Emotional arc: curiosity, a manageable challenge, kind resolution, calm ending

Keep each page to ${policy.wordsPerPage} words. Use the child's name naturally without repeating it in every sentence. The title must feel like a finished children's book title. Illustration cues should preserve the same character, clothing, palette, and setting from page to page.`;
}

export function storyPolicyForAge(age: number) {
  if (age <= 3) return { band: "1-3" as const, wordsPerPage: "18-35", direction: "Use very short sentences, concrete words and gentle repetition." };
  if (age <= 6) return { band: "4-6" as const, wordsPerPage: "35-55", direction: "Use clear sentences, playful imagery and a simple cause-and-effect arc." };
  if (age <= 9) return { band: "7-9" as const, wordsPerPage: "45-70", direction: "Use varied sentences, richer vocabulary and a clear emotional turn." };
  return { band: "10-12" as const, wordsPerPage: "55-85", direction: "Use nuanced but accessible language, stronger character agency and layered imagery." };
}

import {
  StoryPreviewRequestSchema,
  StoryPreviewResultSchema,
  type StoryPreviewRequest,
  type StoryPreviewResult
} from "@for-little-ones/contracts";

export type StoryPreviewGenerator = (input: StoryPreviewRequest) => Promise<unknown>;

export function createStoryPreviewHandler(generate: StoryPreviewGenerator) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }

    const input = StoryPreviewRequestSchema.safeParse(body);
    if (!input.success) {
      return Response.json({ error: "Check the story details and try again." }, { status: 400 });
    }

    try {
      const generated = await generate(input.data);
      const result = StoryPreviewResultSchema.safeParse(generated);
      if (!result.success) {
        return Response.json({ error: "The story response was incomplete. Please try again." }, { status: 502 });
      }
      return Response.json(result.data, { status: 200 });
    } catch (error) {
      console.error("story-preview generation failed", error);
      return Response.json({ error: "The story studio is taking a little longer. Please try again." }, { status: 503 });
    }
  };
}

export function withGenerationMetadata(result: StoryPreviewResult, model: string): StoryPreviewResult {
  return { ...result, generationMetadata: { model, attemptCount: 1 } };
}

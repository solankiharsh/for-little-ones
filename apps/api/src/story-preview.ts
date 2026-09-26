import {
  StoryPreviewRequestSchema,
  StoryPreviewResultSchema,
  type StoryPreviewRequest,
  type StoryPreviewResult
} from "../../../packages/contracts/src/index";
import {
  authorizeGenerationCommand,
  projectStoryForEntitlement,
  type PaymentState
} from "@for-little-ones/domain";

export type StoryPreviewGenerator = (input: StoryPreviewRequest) => Promise<unknown>;

/**
 * The caller's own record of its payment state. A command must supply the state it
 * resolved from the payment record; the handler derives the entitlement from it and
 * refuses before the generator runs. Browser-supplied flags are never accepted here
 * (D025) — production resolves `paymentState` from the order record.
 */
export interface StoryPreviewAuthorization {
  paymentState: PaymentState;
  assetsGenerated?: number;
  storyAttempts?: number;
}

export function createStoryPreviewHandler(
  generate: StoryPreviewGenerator,
  authorization?: StoryPreviewAuthorization
) {
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

    // Fails closed: with no payment record supplied, only the teaser allowance applies.
    const decision = authorizeGenerationCommand({
      paymentState: authorization?.paymentState ?? "pending",
      operation: "STORY_PREVIEW",
      ...(authorization?.assetsGenerated === undefined ? {} : { assetsGenerated: authorization.assetsGenerated }),
      ...(authorization?.storyAttempts === undefined ? {} : { attempts: authorization?.storyAttempts })
    });
    if (!decision.allowed) {
      return Response.json({ error: decision.reason }, { status: 402 });
    }

    try {
      const generated = await generate(input.data);
      const result = StoryPreviewResultSchema.safeParse(generated);
      if (!result.success) {
        return Response.json({ error: "The story response was incomplete. Please try again." }, { status: 502 });
      }
      return Response.json(projectStoryForEntitlement(result.data, decision.entitlement), { status: 200 });
    } catch (error) {
      console.error("story-preview generation failed", error);
      return Response.json({ error: "The story studio is taking a little longer. Please try again." }, { status: 503 });
    }
  };
}

export function withGenerationMetadata(result: StoryPreviewResult, model: string): StoryPreviewResult {
  return { ...result, generationMetadata: { model, attemptCount: 1 } };
}

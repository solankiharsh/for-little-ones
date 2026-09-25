import { generateText, Output } from "ai";
import { z } from "zod";

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
  locale: z.string().min(2).max(16)
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

async function handle(request: Request): Promise<Response> {
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
    const { output } = await generateText({
      model,
      output: Output.object({ schema: StoryPreviewModelSchema }),
      system: [
        "You write warm, original picture-book stories for children aged 1 to 12.",
        "Use British English and age-appropriate language. Keep the child safe throughout.",
        "Never add frightening peril, violence, brands, copyrighted characters, or claims about the real child.",
        "Return exactly six short pages. Each illustration cue describes a coherent scene but does not generate an image."
      ].join(" "),
      prompt: storyPrompt(input.data)
    });

    return Response.json({
      ...output,
      pages: redactStoryPreview(output.pages),
      generationMetadata: { model, attemptCount: 1 }
    });
  } catch (error) {
    console.error("story-preview generation failed", error);
    return Response.json({ error: "The story studio is taking a little longer. Please try again." }, { status: 503 });
  }
}

export function redactStoryPreview(pages: z.infer<typeof StoryPreviewModelSchema>["pages"]) {
  return pages.map((page, index) => {
    if (index === 0) return page;
    if (index === 1) {
      return {
        ...page,
        text: `${page.text.slice(0, 140)}…`,
        illustrationCue: "Locked until payment is confirmed."
      };
    }
    return {
      pageNumber: page.pageNumber,
      text: "Story page ready after payment.",
      illustrationCue: "Locked until payment is confirmed."
    };
  });
}

export default {
  async fetch(request: Request) {
    return handle(request);
  }
};

function storyPrompt(input: StoryPreviewRequest): string {
  const favourites = input.favourites.length > 0 ? input.favourites.join(", ") : "gentle surprises";
  const personalDetail = input.detail || "No additional personal detail supplied";
  return `Create a six-page personalised story preview with this brief:
- Main character: ${input.childName}, age ${input.age}
- Story world: ${input.world}
- Favourite things: ${favourites}
- Personal detail: ${personalDetail}
- Emotional arc: curiosity, a manageable challenge, kind resolution, calm ending

Keep each page to 35-65 words. Use the child's name naturally without repeating it in every sentence. The title must feel like a finished children's book title. Illustration cues should preserve the same character, clothing, palette, and setting from page to page.`;
}

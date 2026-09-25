import { generateText, Output } from "ai";
import { StoryPreviewResultSchema, type StoryPreviewRequest } from "@for-little-ones/contracts";
import { createStoryPreviewHandler, withGenerationMetadata } from "../apps/api/src/story-preview";

export const maxDuration = 60;

const model = process.env.AI_STORY_MODEL ?? "google/gemini-2.5-flash";

const handle = createStoryPreviewHandler(async (input) => {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: StoryPreviewResultSchema.omit({ generationMetadata: true }) }),
    system: [
      "You write warm, original picture-book stories for children aged 1 to 12.",
      "Use British English and age-appropriate language. Keep the child safe throughout.",
      "Never add frightening peril, violence, brands, copyrighted characters, or claims about the real child.",
      "Return exactly six short pages. Each illustration cue describes a coherent scene but does not generate an image."
    ].join(" "),
    prompt: storyPrompt(input)
  });

  return withGenerationMetadata(output, model);
});

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

import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { ASSETS, type StoryAsset } from "./assets";

const image = (file: string, alt: string): StoryAsset => ({ src: `/story/catalogue/${file}`, width: 1024, height: 1536, alt });
export const GARDEN_COVER = image("garden-cover.png", "Mira and a fox discover a secret garden");
export const LIGHTHOUSE_COVER = image("lighthouse-cover.png", "Leo and a puffin beside the singing lighthouse");
export const MOON_PHOTO_LED = image("moon-photo-led.png", "Aarav rides a gentle moon elephant");
export interface CatalogueSample { id: string; childName: string; story: StoryPreviewResult; cover: StoryAsset; art: StoryAsset[] }
function story(title: string, synopsis: string, texts: string[]): StoryPreviewResult {
  return { schemaVersion: "1", title, synopsis, emotionalGoal: "Kindness and curiosity", pages: texts.map((text, i) => ({ pageNumber: i + 1, text, illustrationCue: synopsis })) };
}
function aaravStory(): StoryPreviewResult {
  const pages = [
    "One moonlit evening, Aarav heard a soft toot beneath the marigold tree. A tiny blue elephant stood there, holding a star lantern. “I’m looking for the little star that fell from the moon,” it whispered.",
    "Aarav took the lantern. Its golden glow danced across the courtyard, past the mango leaves and down to the lotus pond. The missing star blinked between two lily pads, just out of reach.",
    "The elephant stretched its trunk, but the star floated farther away. Aarav spotted a long garden scoop beside the pots. Together they nudged the star gently toward the stone steps.",
    "At last, the star sparkled safely in the lantern again. The moon shone brighter above the courtyard. Aarav clapped, and the little elephant trumpeted a happy thank-you.",
    "The elephant carried Aarav around the garden once, slow as a lullaby. Marigolds nodded. Fireflies twinkled. Every tiny light seemed to say, “Well done, brave Aarav.”",
    "At the doorway, the elephant waved goodnight and followed the moonbeam home. Aarav snuggled into bed, smiling at one bright star outside his window. It was their little secret."
  ];
  return {
    schemaVersion: "1",
    title: `Aarav and the Little Moon Elephant`,
    synopsis: "Aarav and a gentle moon elephant help a fallen star find its way home.",
    emotionalGoal: "A story about kindness and bravery",
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text,
      illustrationCue: `Aarav and the little moon elephant, storybook scene ${index + 1}`
    }))
  };
}

const garden = story("Mira and the Secret Garden Map", "A little explorer follows a map to a garden that needs a friend.", [
  "After the rain, Mira found a folded map caught beneath the garden gate. A red fox nudged her boot. On the paper, a tiny greenhouse glowed like a lantern.",
  "They followed the stepping stones between the ferns. The map showed a stream, but the stream was dry. Beside it, the flowers drooped their heads.",
  "Mira knelt beside a tangle of fallen twigs. Water murmured underneath. She lifted one twig, then another, while the fox carried them to the bank.",
  "With a happy splash, the stream began to flow. It curled around the roots and filled a little pool. The flowers lifted their faces toward the evening light.",
  "Inside the greenhouse, Mira found a packet of seeds and a note: A garden grows when somebody cares. She planted one beside the path.",
  "Mira folded the map and waved goodbye. Tomorrow, she would return with her watering can. Some adventures begin with finding a place; others begin with looking after it."
]);
const lighthouse = story("Leo and the Lighthouse That Sang", "A listening adventure by the sea, with a helpful puffin.", [
  "Leo heard a low, lonely note above the waves. At the end of the cliff path stood a lighthouse. A puffin waited by its door, tilting its head as if to say, Listen.",
  "Leo raised his little brass trumpet to his ear. The lighthouse was singing to the boats, but the wind kept carrying its song away.",
  "Together they climbed the winding steps. At the top, a loose shutter tapped against the wall. Each tap broke the song into tiny pieces.",
  "Leo fastened the shutter while the puffin held the ribbon steady. The tapping stopped. A clear, warm note rolled out across the water.",
  "One by one, the little boats turned toward the harbour lights. Their bells answered the lighthouse, until the whole bay seemed to hum.",
  "As the sun slipped into the sea, Leo waved to his new friend. He had discovered something wonderful: sometimes the bravest thing to do is stop and listen."
]);
const moon: CatalogueSample = { id: "moon", childName: "Aarav", story: aaravStory(), cover: ASSETS.aaravCover, art: [MOON_PHOTO_LED, ASSETS.aaravSceneTwo, ASSETS.aaravSceneThree] };
export function sampleForWorld(world: string): CatalogueSample {
  const value = world.toLowerCase();
  if (value.includes("garden")) return { id: "garden", childName: "Mira", story: garden, cover: GARDEN_COVER, art: [GARDEN_COVER, image("garden-stream.png", "Mira and the fox clear the garden stream"), image("garden-ending.png", "Mira plants a seed in the greenhouse")] };
  if (value.includes("lighthouse") || value.includes("sea")) return { id: "lighthouse", childName: "Leo", story: lighthouse, cover: LIGHTHOUSE_COVER, art: [LIGHTHOUSE_COVER, image("lighthouse-shutter.png", "Leo and the puffin repair the shutter"), image("lighthouse-ending.png", "Leo waves as boats reach the harbour")] };
  if (value.includes("dinosaur")) return { id: "dinosaurs", childName: "Sam", story: story("Sam and the Valley of Gentle Giants", "A small kindness for a very big friend.", ["Sam found a tiny dinosaur waiting beside a fallen branch. Its family was across the stream.", "Together they followed the bank until the stones formed a safe path. Sam pointed the way, and the little dinosaur hurried home."]), cover: ASSETS.worldDinosaurs, art: [ASSETS.worldDinosaurs] };
  if (value.includes("space") || value.includes("quiet stars")) return { id: "space", childName: "Noor", story: story("Noor and the Quiet Stars", "A gentle journey through the night sky.", ["From the moon station, Noor watched the Earth turn slowly below. One small star was hiding behind a cloud of silver dust.", "Noor switched off the bright cabin lamp. In the quiet darkness, the little star shone clearly. It had been there all along."]), cover: ASSETS.worldSpace, art: [ASSETS.worldSpace] };
  return moon;
}
export const SAMPLE_TITLE = moon.story.title;
export function sampleTitleForWorld(world: string): string { return sampleForWorld(world).story.title; }

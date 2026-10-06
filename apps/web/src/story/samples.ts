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
const dinosaurs = story("Sam and the Valley of Gentle Giants", "A small kindness helps a very big family find each other.", [
  "Sam dipped a finger into a little stream. Rings of water shimmered between the stones. Behind her, a small dinosaur bent its long neck and gave a soft, questioning hum.",
  "Across the water, an enormous dinosaur answered. The little one stretched towards the sound, then looked at its feet. Sam understood. It wanted to go home, but it did not know where to cross.",
  "They followed the bank until Sam spotted a row of broad, dry stones. She tested the first with her boot. Then she pointed to the next. The little dinosaur watched her carefully.",
  "One slow step, then another. Sam stayed beside her new friend as they crossed the shallow stream. When its tail made a tiny splash, they both stopped—and then carried on together.",
  "On the far bank, the little dinosaur hurried into the shade of its mother's long neck. She lowered her head until her gentle eyes met Sam's. Her happy hum made the leaves tremble.",
  "Sam waved from the grassy path. The valley was full of giants, but today it had needed one small helper. She tucked a fallen yellow flower into her pocket and headed home before supper."
]);
const space = story("Noor and the Quiet Stars", "A little astronaut discovers that a quiet moment can reveal something wonderful.", [
  "Noor floated beside the moon station with her fox friend, their golden safety lines trailing behind them. Far below, Earth glowed blue. Above them, the stars made pictures: a bear, a rabbit and a running fox.",
  "But one tiny star at the tip of the fox's tail seemed to have vanished. Noor looked left, then right. Her friend tilted his helmet. Without that last spark, the sky-picture felt unfinished.",
  "They returned to the warm cabin and peered through the round window. Noor searched again. The bright reading lamp made a golden reflection on the glass, right where the missing star should have been.",
  "Noor turned the lamp down. The cabin grew soft and quiet. She waited while her eyes settled into the darkness. Beside her, the fox curled his paws beneath his chin and waited too.",
  "There it was: one small, steady light. The star had not gone anywhere. Noor traced the fox's tail on the window with her finger, joining the last spark to all the others.",
  "They watched Earth turning slowly below them. Noor smiled and pulled her blanket close. She did not need to fill every quiet moment. Sometimes, when she paused, the universe had something lovely to show her."
]);
const landscape = (file: string, alt: string): StoryAsset => ({ ...image(file, alt), width: 1600, height: 900 });
const moon: CatalogueSample = { id: "moon", childName: "Aarav", story: aaravStory(), cover: ASSETS.aaravCover, art: [MOON_PHOTO_LED, ASSETS.aaravSceneTwo, ASSETS.aaravSceneThree] };
export function sampleForWorld(world: string): CatalogueSample {
  const value = world.toLowerCase();
  if (value.includes("garden")) return { id: "garden", childName: "Mira", story: garden, cover: GARDEN_COVER, art: [GARDEN_COVER, image("garden-stream.png", "Mira and the fox clear the garden stream"), image("garden-ending.png", "Mira plants a seed in the greenhouse")] };
  if (value.includes("lighthouse") || value.includes("sea")) return { id: "lighthouse", childName: "Leo", story: lighthouse, cover: LIGHTHOUSE_COVER, art: [LIGHTHOUSE_COVER, image("lighthouse-shutter.png", "Leo and the puffin repair the shutter"), image("lighthouse-ending.png", "Leo waves as boats reach the harbour")] };
  if (value.includes("dinosaur") || value.includes("gentle giants")) return { id: "dinosaurs", childName: "Sam", story: dinosaurs, cover: ASSETS.worldDinosaurs, art: [ASSETS.worldDinosaurs, landscape("dinosaurs-crossing.jpg", "Sam helps a little dinosaur cross the stream"), landscape("dinosaurs-ending.jpg", "Sam waves goodbye as the little dinosaur rejoins its mother")] };
  if (value.includes("space") || value.includes("quiet stars")) return { id: "space", childName: "Noor", story: space, cover: ASSETS.worldSpace, art: [ASSETS.worldSpace, landscape("space-cabin.jpg", "Noor dims the cabin lamp while her fox watches"), landscape("space-ending.jpg", "Noor and the fox discover the quiet star through their cabin window")] };
  return moon;
}
export const SAMPLE_TITLE = moon.story.title;
export function sampleTitleForWorld(world: string): string { return sampleForWorld(world).story.title; }

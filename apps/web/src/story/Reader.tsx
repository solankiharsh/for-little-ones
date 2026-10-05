import { useMemo } from "react";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import StoryReader from "../creation/StoryReader";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { DEMO_NAME, usePersonalization } from "./personalization";
import { STORY_WORLDS, storyTitle } from "./Worlds";

function storyFor(hero: string, worldId: string | null, worldTitle: string, companions: string[], interests: string[], detail: string): StoryPreviewResult {
  const friends = companions.length > 0 ? ` with ${companions.join(" and ")}` : "";
  const loves = interests.length > 0 ? ` who loves ${interests.join(" and ").toLowerCase()}` : "";
  const pages = [
    `${hero} woke to a morning that hummed a brand-new tune${loves}. Today, the ${worldTitle.toLowerCase()} was waiting.`,
    `${hero} packed courage in one pocket and curiosity in the other${friends}, and stepped through the doorway only heroes can see.`,
    `The path wound past whispering trees and windows glowing gold. ${detail ? `${detail} — and ${hero} smiled, because some things are only theirs to know.` : `${hero} waved at every small creature along the way.`}`,
    `Then came the wobble every adventure needs: a bridge of ribbons, swaying high above a sea of pillows. ${hero} took one brave breath — and crossed.`,
    `On the far side waited the part of the story that had been looking for ${hero} all along. It fit like a favourite blanket.`,
    `And so ${hero} came home, pockets full of starlight, with a brand-new story to tell at bedtime. The end — until tomorrow.`
  ];
  return {
    schemaVersion: "1",
    title: storyTitle(worldId, hero),
    synopsis: `A personal adventure for ${hero}, woven around the things they love.`,
    emotionalGoal: "A story about being brave",
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text,
      illustrationCue: `${worldTitle} scene with ${hero}, warm storybook light`
    }))
  };
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
    title: `${DEMO_NAME} and the Little Moon Elephant`,
    synopsis: "Aarav and a gentle moon elephant help a fallen star find its way home.",
    emotionalGoal: "A story about kindness and bravery",
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text,
      illustrationCue: `Aarav and the little moon elephant, storybook scene ${index + 1}`
    }))
  };
}

export default function Reader() {
  const { heroName, selectedWorld, companions, interests, detail, dedication, mode } = usePersonalization();
  const selected = STORY_WORLDS.find((world) => world.id === selectedWorld);
  const worldTitle = selected?.title ?? "The Little Moon Elephant";
  const aaravSample = mode === "marketing";
  const art = useMemo(() => [ASSETS.spreadAdventure, selected?.image ?? ASSETS.worldMoon, ASSETS.spreadQuiet, ASSETS.worldMoon, ASSETS.spreadEnding, ASSETS.productFinalNight], [selected]);
  const story = useMemo(
    () => aaravSample ? aaravStory() : storyFor(heroName, selectedWorld, worldTitle, companions, interests, detail.trim()),
    [aaravSample, heroName, selectedWorld, worldTitle, companions, interests, detail]
  );
  const storyArt = [ASSETS.aaravSceneOne, ASSETS.aaravSceneTwo, ASSETS.aaravSceneThree];

  return (
    <section className="flo-read" aria-label="Read an illustrated sample story" id="story-read">
      <p className="flo-read-sample-note">{aaravSample ? "Aarav’s illustrated sample · a storybook example made from the supplied photo references" : "Illustrated sample · a preview of how their details could shape a story"}</p>
      <figure className="flo-read-spread">
        <StoryImage asset={aaravSample ? ASSETS.aaravSceneOne : ASSETS.spreadAdventure} />
      </figure>
      <StoryReader
        story={story}
        childName={heroName}
        world={worldTitle}
        dedication={dedication.trim()}
        visiblePages="ALL"
        {...(aaravSample ? { artworkNote: "Generated storybook illustrations for this Aarav sample. Start their story to create one around your child’s details." } : {})}
        artwork={{
          cover: aaravSample ? ASSETS.aaravCover : selected?.image ?? ASSETS.coverMoonFox,
          spreadForPage: (pageNumber) => aaravSample
            ? storyArt[Math.min(2, Math.floor((pageNumber - 1) / 2))]
            : art[(pageNumber - 1) % art.length]
        }}
      />
      <figure className="flo-read-spread flo-read-spread-end">
        <StoryImage asset={aaravSample ? ASSETS.aaravSceneThree : ASSETS.spreadEnding} />
      </figure>
    </section>
  );
}

import { useMemo } from "react";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import StoryReader from "../creation/StoryReader";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";
import { STORY_WORLDS } from "./Worlds";

/**
 * Read their story (§10, §I): the spread fills the viewport first — the book
 * itself is the interface — then the reader UI activates beneath it with its
 * container chrome reduced to almost nothing.
 */
function storyFor(hero: string, worldTitle: string, companions: string[], interests: string[], detail: string): StoryPreviewResult {
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
    title: `${hero} and the ${worldTitle}`,
    synopsis: `A personal adventure for ${hero}, woven around the things they love.`,
    emotionalGoal: "A story about being brave",
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text,
      illustrationCue: `${worldTitle} scene with ${hero}, warm storybook light`
    }))
  };
}

export default function Reader() {
  const { heroName, selectedWorld, companions, interests, detail, dedication } = usePersonalization();
  const worldTitle = STORY_WORLDS.find((world) => world.id === selectedWorld)?.title ?? "The Moon That Followed Home";
  const story = useMemo(
    () => storyFor(heroName, worldTitle, companions, interests, detail.trim()),
    [heroName, worldTitle, companions, interests, detail]
  );

  return (
    <section className="flo-read" aria-label="Read their story" id="story-read">
      <figure className="flo-read-spread">
        <StoryImage asset={ASSETS.spreadAdventure} />
      </figure>
      <StoryReader story={story} childName={heroName} world={worldTitle} dedication={dedication.trim()} visiblePages="ALL" />
      <figure className="flo-read-spread flo-read-spread-end">
        <StoryImage asset={ASSETS.spreadEnding} />
      </figure>
    </section>
  );
}

import { useMemo, useRef, useState } from "react";
import { ASSETS, type StoryAsset } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";

export interface StoryWorld {
  id: string;
  title: string;
  blurb: string;
  image: StoryAsset;
}

type AgeBand = "3-4" | "5-6" | "7-8";

interface StorySpread {
  left: string;
  right: string;
}

interface AgeProfile {
  label: string;
  readingLine: string;
  spreads(heroName: string, worldTitle: string): StorySpread[];
}

const AGE_BANDS: AgeBand[] = ["3-4", "5-6", "7-8"];

const AGE_PROFILES: Record<AgeBand, AgeProfile> = {
  "3-4": {
    label: "Ages 3–4",
    readingLine: "Very short lines, repeatable rhythm, gentle reassurance.",
    spreads: (heroName, worldTitle) => [
      { left: `${heroName} tiptoes into ${worldTitle.toLowerCase()}.`, right: "A lantern glows. A little friend waves hello." },
      { left: "One tiny wobble appears on the path.", right: `${heroName} takes one brave breath, then one brave step.` },
      { left: "The moon smiles. The world feels safe again.", right: `${heroName} carries the story home for bedtime.` }
    ]
  },
  "5-6": {
    label: "Ages 5–6",
    readingLine: "Longer sentences, playful tension, warm emotional payoff.",
    spreads: (heroName, worldTitle) => [
      { left: `${heroName} finds a hidden path in ${worldTitle.toLowerCase()}.`, right: "Clues sparkle between trees and stone walls." },
      { left: "A bridge of ribbons sways over deep water.", right: `${heroName} listens, balances, and crosses with courage.` },
      { left: "Beyond the bridge is exactly the right surprise.", right: `${heroName} returns home glowing with a new story.` }
    ]
  },
  "7-8": {
    label: "Ages 7–8",
    readingLine: "Richer language, stronger arc, reflective ending.",
    spreads: (heroName, worldTitle) => [
      { left: `${heroName} enters ${worldTitle.toLowerCase()} with a pocketful of questions.`, right: "The night hums with clues only careful eyes can catch." },
      { left: "A choice appears: easy route, or the honest one.", right: `${heroName} chooses the honest way and earns the next door.` },
      { left: "The final scene feels both vast and personal.", right: `${heroName} comes back steadier, kinder, and ready for tomorrow.` }
    ]
  }
};

export const STORY_WORLDS: StoryWorld[] = [
  { id: "moon", title: "The Moon That Followed Home", blurb: "Bedtime wonder", image: ASSETS.worldMoon },
  { id: "garden", title: "The Secret Garden Map", blurb: "Small adventures", image: ASSETS.worldGarden },
  { id: "lighthouse", title: "The Lighthouse That Sang", blurb: "Big imagination", image: ASSETS.worldLighthouse },
  { id: "dinosaurs", title: "Dinosaur Valley", blurb: "Gentle giants", image: ASSETS.worldDinosaurs },
  { id: "space", title: "The Quiet Stars", blurb: "Cosmic wonder", image: ASSETS.worldSpace }
];

export default function Worlds({ active }: { active: boolean }) {
  const { heroName, selectedWorld, selectWorld } = usePersonalization();
  const [activeWorldId, setActiveWorldId] = useState(selectedWorld ?? STORY_WORLDS[0]!.id);
  const [ageBand, setAgeBand] = useState<AgeBand>("5-6");
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [flipTick, setFlipTick] = useState(0);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");
  const previewRef = useRef<HTMLDivElement>(null);

  const activeWorld = STORY_WORLDS.find((world) => world.id === activeWorldId) ?? STORY_WORLDS[0]!;
  const profile = AGE_PROFILES[ageBand];
  const spreads = useMemo(() => profile.spreads(heroName, activeWorld.title), [profile, heroName, activeWorld.title]);
  const spread = spreads[spreadIndex] ?? spreads[0]!;

  function openPreview(worldId: string) {
    setActiveWorldId(worldId);
    selectWorld(worldId);
    setSpreadIndex(0);
    window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function chooseAge(nextBand: AgeBand) {
    if (nextBand === ageBand) return;
    setAgeBand(nextBand);
    setSpreadIndex(0);
    setFlipDirection("next");
    setFlipTick((value) => value + 1);
  }

  function goToSpread(nextIndex: number, direction: "next" | "prev") {
    if (nextIndex < 0 || nextIndex >= spreads.length) return;
    setFlipDirection(direction);
    setSpreadIndex(nextIndex);
    setFlipTick((value) => value + 1);
  }

  const leftPage = spreadIndex * 2 + 1;
  const rightPage = spreadIndex * 2 + 2;

  return (
    <section className={`flo-worlds-story flo-worlds-shelf${active ? " is-full" : " is-calm"}`} aria-label="Choose their world" id="story-worlds">
      <div className="flo-worlds-head">
        <div>
          <p className="flo-kicker">A place to begin</p>
          <h2>Start with a world they already love.</h2>
        </div>
        <p>
          A bedtime question, a favourite creature, a family in-joke. Pick a spark,
          then we shape the story around them.
        </p>
      </div>

      <div className="flo-worlds-books" role="list" aria-label="Story worlds">
        {STORY_WORLDS.map((world) => {
          const activeCard = world.id === activeWorldId;
          return (
            <article key={world.id} className={`flo-world-card${activeCard ? " is-active" : ""}`} role="listitem" aria-label={world.title}>
              <div className="flo-world-card-media">
                <StoryImage asset={world.image} className="flo-world-card-image" />
              </div>
              <div className="flo-world-card-copy">
                <p className="flo-kicker">{world.blurb}</p>
                <h3>{world.title}</h3>
                <p className="flo-world-card-imagine">Imagine {heroName} here.</p>
                <button type="button" className="flo-world-card-action" onClick={() => openPreview(world.id)}>
                  {activeCard ? "Preview open" : "Open preview →"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flo-world-preview" ref={previewRef}>
        <div className="flo-world-preview-head">
          <div>
            <p className="flo-kicker">Live preview</p>
            <h3>{activeWorld.title}</h3>
            <p>{profile.readingLine}</p>
          </div>
          <button type="button" className="flo-world-preview-choose" onClick={() => selectWorld(activeWorld.id)}>
            Use this world for their book →
          </button>
        </div>

        <div className="flo-world-age-tabs" role="tablist" aria-label="Preview age band">
          {AGE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              role="tab"
              aria-selected={ageBand === band}
              className={ageBand === band ? "is-active" : ""}
              onClick={() => chooseAge(band)}
            >
              {AGE_PROFILES[band].label}
            </button>
          ))}
        </div>

        <div className="flo-world-book-row">
          <button
            type="button"
            className="flo-world-book-nav"
            onClick={() => goToSpread(spreadIndex - 1, "prev")}
            disabled={spreadIndex === 0}
            aria-label="Previous spread"
          >
            ←
          </button>

          <div className="flo-world-book-shell">
            <div className={`flo-world-book flo-world-book--${flipDirection}`} key={`${activeWorld.id}-${ageBand}-${spreadIndex}-${flipTick}`}>
              <article className="flo-world-book-page is-left">
                <p className="flo-world-book-page-no">Page {leftPage}</p>
                <p>{spread.left}</p>
              </article>
              <article className="flo-world-book-page is-right">
                <p className="flo-world-book-page-no">Page {rightPage}</p>
                <p>{spread.right}</p>
              </article>
            </div>
          </div>

          <button
            type="button"
            className="flo-world-book-nav"
            onClick={() => goToSpread(spreadIndex + 1, "next")}
            disabled={spreadIndex >= spreads.length - 1}
            aria-label="Next spread"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

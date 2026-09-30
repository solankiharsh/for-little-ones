import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS, type StoryAsset } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";

export interface StoryWorld {
  id: string;
  title: string;
  blurb: string;
  image: StoryAsset;
}

export const STORY_WORLDS: StoryWorld[] = [
  { id: "moon", title: "The Moon That Followed Home", blurb: "Bedtime wonder", image: ASSETS.worldMoon },
  { id: "garden", title: "The Secret Garden Map", blurb: "Small adventures", image: ASSETS.worldGarden },
  { id: "lighthouse", title: "The Lighthouse That Sang", blurb: "Big imagination", image: ASSETS.worldLighthouse },
  { id: "dinosaurs", title: "Dinosaur Valley", blurb: "Gentle giants", image: ASSETS.worldDinosaurs },
  { id: "space", title: "The Quiet Stars", blurb: "Cosmic wonder", image: ASSETS.worldSpace }
];

/** World panel: generated art bleeds past the frame; copy overlays tightly. */
export function WorldPanel({ world, heroName, chosen, onChoose }: {
  world: StoryWorld;
  heroName: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <article className={`flo-world${chosen ? " is-chosen" : ""}`} aria-label={world.title}>
      <div className="flo-world-frame">
        <StoryImage asset={world.image} className="flo-world-photo" />
        <div className="flo-world-copy">
          <p className="flo-kicker">{world.blurb}</p>
          <h3 className="flo-world-title">{world.title}</h3>
          <p className="flo-world-imagine">Imagine {heroName} here.</p>
          <button type="button" className="flo-world-choose" aria-pressed={chosen} onClick={onChoose}>
            {chosen ? "This is their story ✓" : "Choose this story →"}
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Worlds (§F): vertical scroll drives a horizontal cinematic journey across
 * full-bleed generated panels — editorial landscapes, never cards.
 */
export default function Worlds({ active }: { active: boolean }) {
  const { heroName, selectedWorld, selectWorld } = usePersonalization();
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      const track = wrap.current!.querySelector(".flo-worlds-track") as HTMLElement;
      const screen = wrap.current!.querySelector(".flo-screen") as HTMLElement;
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 64);
      gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: wrap.current,
          pin: screen,
          start: "top top",
          end: () => `+=${distance() + window.innerHeight * 0.85}`,
          scrub: 0.85,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={wrap} className="flo-worlds-story" aria-label="Choose their world" id="story-worlds">
      <div className="flo-screen">
        <p className="flo-kicker">Choose their world</p>
        <div className="flo-worlds-track">
          {STORY_WORLDS.map((world) => (
            <WorldPanel
              key={world.id}
              world={world}
              heroName={heroName}
              chosen={selectedWorld === world.id}
              onChoose={() => selectWorld(world.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

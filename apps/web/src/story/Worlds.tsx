import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap, ScrollTrigger, scrollStoryToY } from "./useStoryMotion";
import { ASSETS, type StoryAsset } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization, requestSample } from "./personalization";
import { sampleTitleForWorld } from "./samples";

export interface StoryWorld {
  id: string;
  title: string;
  blurb: string;
  image: StoryAsset;
  /** Focal protection: the crop anchor keeps faces/subjects in frame. */
  objectPositionDesktop: string;
  objectPositionMobile: string;
}

export const STORY_WORLDS: StoryWorld[] = [
  { id: "moon", title: "The Moon That Followed Home", blurb: "Bedtime wonder", image: ASSETS.worldMoon, objectPositionDesktop: "35% 55%", objectPositionMobile: "35% 50%" },
  { id: "garden", title: "The Secret Garden Map", blurb: "Small adventures", image: ASSETS.worldGarden, objectPositionDesktop: "50% 38%", objectPositionMobile: "50% 35%" },
  { id: "lighthouse", title: "The Lighthouse That Sang", blurb: "Big imagination", image: ASSETS.worldLighthouse, objectPositionDesktop: "42% 52%", objectPositionMobile: "40% 50%" },
  { id: "dinosaurs", title: "Dinosaur Valley", blurb: "Gentle giants", image: ASSETS.worldDinosaurs, objectPositionDesktop: "50% 55%", objectPositionMobile: "50% 55%" },
  { id: "space", title: "The Quiet Stars", blurb: "Cosmic wonder", image: ASSETS.worldSpace, objectPositionDesktop: "50% 45%", objectPositionMobile: "50% 45%" }
];

/**
 * Canonical personalised title — the single formatter for covers, reader,
 * generation and CTAs, so articles never double ("Maya and the Moon…",
 * never "Maya and the The Moon…").
 */
export function storyTitle(worldId: string | null, heroName: string): string {
  switch (worldId) {
    case "garden": return `${heroName} and the Secret Garden Map`;
    case "lighthouse": return `${heroName} and the Lighthouse That Sang`;
    case "dinosaurs": return `${heroName} and the Valley of Gentle Giants`;
    case "space": return `${heroName} and the Quiet Stars`;
    default: return `${heroName} and the Moon That Followed Home`;
  }
}

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
        <StoryImage
          asset={world.image}
          className="flo-world-photo"
          style={{ "--world-pos-d": world.objectPositionDesktop, "--world-pos-m": world.objectPositionMobile } as CSSProperties}
        />
        <div className="flo-world-copy">
          <p className="flo-kicker">{world.blurb}</p>
          <h3 className="flo-world-title">{world.title}</h3>
          <p className="flo-world-imagine">Imagine {heroName} here.</p>
          <button type="button" className="flo-world-sample" onClick={() => requestSample(sampleTitleForWorld(world.title))}>
            Read a sample book →
          </button>
          <button type="button" className="flo-world-choose" aria-pressed={chosen} onClick={onChoose}>
            {chosen ? "This is their story ✓" : "Choose this story →"}
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Worlds (§F, revised): a spatial gallery, not a carousel. The wrapper's
 * height is viewport + travel distance so the sticky screen has real runway;
 * the track glides horizontally while each panel's image drifts slightly
 * slower and settles from 1.04 as it centres. Titles arrive discretely at
 * centre; the next panel always peeks at the edge. Prev/next step through
 * chapters; the rail reads 01–05.
 */
export default function Worlds({ active }: { active: boolean }) {
  const { heroName, selectedWorld, selectWorld } = usePersonalization();
  const wrap = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState(0);
  const travel = useRef<{ start: number; end: number }>({ start: 0, end: 1 });

  useEffect(() => {
    if (!active) return;
    const section = wrap.current!;
    const track = section.querySelector(".flo-worlds-track") as HTMLElement;
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    section.style.height = `${window.innerHeight + distance()}px`;
    const ctx = gsap.context(() => {
      const journey = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.7,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            travel.current = { start: self.start, end: self.end };
            setChapter(Math.min(STORY_WORLDS.length - 1, Math.round(self.progress * (STORY_WORLDS.length - 1))));
          }
        }
      });
      section.querySelectorAll<HTMLElement>(".flo-world").forEach((panel) => {
        gsap.fromTo(panel.querySelector(".flo-world-photo"), { scale: 1.05, xPercent: -2 }, {
          scale: 1, xPercent: 2, ease: "none",
          scrollTrigger: { trigger: panel, containerAnimation: journey, start: "left right", end: "right left", scrub: true }
        });
        gsap.fromTo(panel.querySelector(".flo-world-copy"), { opacity: 0, y: 24 }, {
          opacity: 1, y: 0, ease: "none", duration: 0.4,
          scrollTrigger: { trigger: panel, containerAnimation: journey, start: "left 65%", end: "left 35%", scrub: true }
        });
      });
      ScrollTrigger.refresh();
    }, wrap);
    const onResize = () => {
      section.style.height = `${window.innerHeight + distance()}px`;
      ScrollTrigger.refresh();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      section.style.height = "";
      ctx.revert();
    };
  }, [active]);

  const stepTo = (index: number) => {
    const clamped = Math.max(0, Math.min(STORY_WORLDS.length - 1, index));
    const { start, end } = travel.current;
    const top = start + (end - start) * (clamped / (STORY_WORLDS.length - 1));
    scrollStoryToY(top);
    setChapter(clamped);
  };

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
        <div className="flo-worlds-ui">
          <p className="flo-worlds-count" aria-live="polite">{String(chapter + 1).padStart(2, "0")} — 05</p>
          <p className="flo-worlds-hint">Scroll to explore</p>
          <div className="flo-worlds-steps">
            <button type="button" aria-label="Previous world" disabled={chapter === 0} onClick={() => stepTo(chapter - 1)}>←</button>
            <button type="button" aria-label="Next world" disabled={chapter === STORY_WORLDS.length - 1} onClick={() => stepTo(chapter + 1)}>→</button>
          </div>
        </div>
      </div>
    </section>
  );
}

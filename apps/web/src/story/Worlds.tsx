import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { WORLDS, WorldScene } from "./Scenes";
import { usePersonalization } from "./personalization";

/**
 * Worlds (§7): vertical scroll drives a horizontal cinematic journey. Each
 * world is a full composition with parallax layers; centring reveals
 * "Imagine {name} here." — and once photos exist, the medallion carries them.
 */
export default function Worlds({ active }: { active: boolean }) {
  const { heroName, photos, hasRealChild, selectedWorld, selectWorld } = usePersonalization();
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      const track = wrap.current!.querySelector(".flo-worlds-track") as HTMLElement;
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const journey = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: { trigger: wrap.current, start: "top top", end: () => `+=${distance() + window.innerHeight}`, scrub: 0.7, invalidateOnRefresh: true }
      });
      wrap.current!.querySelectorAll<HTMLElement>(".flo-world").forEach((panel) => {
        gsap.fromTo(panel.querySelector(".flo-world-title"), { opacity: 0.25, y: 26 }, {
          opacity: 1, y: 0, ease: "none",
          scrollTrigger: { trigger: panel, containerAnimation: journey, start: "left 80%", end: "left 30%", scrub: true }
        });
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
          {WORLDS.map((world) => {
            const chosen = selectedWorld === world.id;
            return (
              <article key={world.id} className={`flo-world${chosen ? " is-chosen" : ""}`} aria-label={world.title}>
                <WorldScene world={world} heroName={heroName} photo={hasRealChild ? photos[0] : undefined} />
                <div className="flo-world-copy">
                  <h3 className="flo-world-title">{world.title}</h3>
                  <p>{world.blurb}</p>
                  <p className="flo-world-imagine">Imagine {heroName} here.</p>
                  <button
                    type="button"
                    className={`flo-btn${chosen ? "" : " flo-btn-ghost"}`}
                    aria-pressed={chosen}
                    onClick={() => selectWorld(world.id)}
                  >{chosen ? "Their world ✓" : `Choose ${world.title}`}</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

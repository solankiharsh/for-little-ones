import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";
/** Generation states (§19): the wait continues the story. Never percentages. */
function statesFor(name: string): string[] {
  return [
    "Preparing the pages…",
    "Drawing their world…",
    `Bringing ${name} into the story…`,
    "Adding a little magic…",
    "Binding their adventure…"
  ];
}

/**
 * Watch it come alive (§H): an immersive image transformation, not a loader.
 * The digital spread slowly scales while states change one line at a time;
 * at completion the cover reveals with the real title as HTML — never baked
 * into imagery.
 */
export default function Generation() {
  const { heroName, markGenerated, selectedWorld } = usePersonalization();
  const coverTail =
    selectedWorld === "garden" ? "the Secret Garden Map" :
    selectedWorld === "lighthouse" ? "the Lighthouse That Sang" :
    selectedWorld === "dinosaurs" ? "the Gentle Giants" :
    selectedWorld === "space" ? "the Quiet Stars" :
    "the Moon That Followed Home";
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(0);
  const [bound, setBound] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  const states = statesFor(heroName);

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || bound) return;
    const timer = window.setInterval(() => {
      setStage((value) => {
        if (value + 1 >= states.length) {
          window.clearInterval(timer);
          setBound(true);
          return value;
        }
        return value + 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  usePersonalizationMark(bound, markGenerated);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".flo-generate-image img", { scale: 1.1 }, {
        scale: 1, ease: "none",
        scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "bottom top", scrub: 0.8 }
      });
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={wrap} className={`flo-generate${bound ? " is-bound" : ""}`} aria-label="Watch the story come alive" id="story-generate">
      <div className="flo-generate-image" aria-hidden="true">
        <StoryImage asset={bound ? ASSETS.coverMoonFox : ASSETS.digitalToPhysical} />
      </div>
      {!bound ? (
        <div className="flo-generate-states" role="status" aria-live="polite">
          <p key={stage}>{states[stage]}</p>
        </div>
      ) : (
        <div className="flo-generate-cover">
          <p className="flo-kicker">And just like that…</p>
          <h2>A story<br />only they<br />could have.</h2>
          <p className="flo-generate-title">{heroName} and {coverTail}</p>
        </div>
      )}
    </section>
  );
}

function usePersonalizationMark(bound: boolean, markGenerated: () => void) {
  useEffect(() => {
    if (bound) markGenerated();
  }, [bound, markGenerated]);
}

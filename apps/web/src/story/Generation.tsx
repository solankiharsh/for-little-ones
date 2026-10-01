import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";
import { storyTitle } from "./Worlds";
/** Generation states (§19): the wait continues the story. Never percentages. */
function statesFor(name: string): string[] {
  return [
    "Imagining a world they might love…",
    "Finding a gentle beginning…",
    `Picturing ${name} in a story…`,
    "Adding a little wonder…",
    "A sample adventure is ready…"
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
  const coverTail = storyTitle(selectedWorld, heroName);
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
        <div className="flo-generate-states">
          <p className="flo-generate-sample-note">An illustrated sample of the experience — no book has been generated yet.</p>
          <p key={stage} role="status" aria-live="polite">{states[stage]}</p>
        </div>
      ) : (
        <div className="flo-generate-cover">
          <p className="flo-kicker">A glimpse of what’s possible…</p>
          <h2>A story that<br />starts with<br />their world.</h2>
          <p className="flo-generate-title">{coverTail}</p>
          <p className="flo-generate-sample-note">This is an illustrated sample experience. A personalised book is created in the next step.</p>
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

import { useEffect, useRef, useState } from "react";
import { Emblem } from "./Scenes";
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
 * Watch it come alive (§9): the customization context scales outward and the
 * book takes the viewport. Staged story-states (no spinner, no percentages),
 * then the cover reveal with the child's name. This demo binds a real
 * generated-feeling book from their details; the production pipeline
 * (F-008) replaces the binding step when wired.
 */
export default function Generation() {
  const { heroName, selectedWorld, markGenerated } = usePersonalization();
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
          markGenerated();
          return value;
        }
        return value + 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  return (
    <section ref={wrap} className={`flo-generate${bound ? " is-bound" : ""}`} aria-label="Watch the story come alive" id="story-generate">
      <div className="flo-screen">
        {!bound ? (
          <div className="flo-generate-states" role="status" aria-live="polite">
            <Emblem className="flo-generate-emblem" />
            <p key={stage}>{states[stage]}</p>
            {selectedWorld && <small>Woven around {selectedWorld === "dino" ? "a dinosaur valley" : selectedWorld === "space" ? "the quiet stars" : selectedWorld === "sea" ? "the slow blue sea" : selectedWorld === "kingdom" ? "a sleepy castle" : "an old lantern forest"}.</small>}
          </div>
        ) : (
          <div className="flo-generate-cover">
            <p className="flo-kicker">And just like that…</p>
            <h2>A story only they could have.</h2>
            <div className="flo-book-cover">
              <span>Made for {heroName}</span>
              <strong>{heroName} and the {selectedWorld === "dino" ? "Gentle Giants" : selectedWorld === "space" ? "Quiet Stars" : selectedWorld === "sea" ? "Slow Blue Sea" : selectedWorld === "kingdom" ? "Sleepy Castle" : "Lantern Forest"}</strong>
              <small>A story for {heroName}</small>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

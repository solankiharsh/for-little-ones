import { useEffect, useRef, useState } from "react";
import { Emblem } from "./Scenes";

/**
 * The opening (§3): two book-cover halves fill the viewport, then slowly open
 * from the centre to reveal the hero. First visit plays the full opening;
 * repeat visits (sessionStorage) get a short page-turn instead.
 */
const SEEN_KEY = "flo.story.seen";

export default function Opening({ onBegin }: { onBegin: () => void }) {
  const [opening, setOpening] = useState(true);
  const [short, setShort] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    setShort(seen);
    const timer = window.setTimeout(
      () => {
        setOpening(false);
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* private mode — replay the full opening next time */
        }
      },
      seen ? 900 : 2400
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div ref={root} className={`flo-opening${opening ? " is-covering" : " is-open"}${short ? " is-short" : ""}`} aria-hidden={!opening}>
      <div className="flo-opening-half flo-opening-left">
        <span>FOR&nbsp;LITTLE</span>
      </div>
      <div className="flo-opening-half flo-opening-right">
        <span>ONE&nbsp;<Emblem /></span>
      </div>
      <div className="flo-opening-cover">
        <p className="flo-kicker">For one little one</p>
        <h1>
          For Little One
        </h1>
        <p>Every child deserves a story where they are the hero.</p>
        <button type="button" className="flo-btn flo-btn-primary" onClick={onBegin} tabIndex={opening ? -1 : 0}>
          Begin their story
        </button>
      </div>
    </div>
  );
}

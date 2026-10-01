import { useEffect, useState } from "react";

/**
 * The opening (§3, revised): one beginning, not three. Two ink halves part at
 * a center seam beneath a single centered wordmark — a hardcover separating,
 * not a splash screen. First visit: 600–900ms, then the hero (already rendered
 * underneath) is simply there. Repeat visits: no opening at all.
 */
const SEEN_KEY = "flo.story.seen";

export default function Opening() {
  const [phase, setPhase] = useState<"shut" | "opening" | "gone">("shut");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      setPhase("gone");
      return;
    }
    const open = window.setTimeout(() => setPhase("opening"), 60);
    const done = window.setTimeout(() => {
      setPhase("gone");
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* private mode — replay the short opening next time */
      }
    }, 850);
    return () => {
      window.clearTimeout(open);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div className={`flo-opening${phase === "opening" ? " is-open" : ""}`} aria-hidden="true">
      <div className="flo-opening-half flo-opening-left" />
      <div className="flo-opening-half flo-opening-right" />
      <p className="flo-opening-word">For Little One</p>
    </div>
  );
}

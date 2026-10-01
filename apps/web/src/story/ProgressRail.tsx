import { useEffect, useState } from "react";

/**
 * Chapter marker (§15, revised): one quiet corner — "03 / 07 · THE WORLD" —
 * never a rail. Hidden during the opening, fading on highly visual sections
 * so imagery stays dominant.
 */
const CHAPTERS = [
  { id: "story-hero", label: "Hello" },
  { id: "story-hero-meet", label: "Hero" },
  { id: "story-worlds", label: "World" },
  { id: "story-read", label: "Story" },
  { id: "story-keepsake", label: "Book" }
];

const DIM_ON = new Set(["story-hero", "story-worlds", "story-keepsake"]);

export default function ProgressRail() {
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState(CHAPTERS[0]!.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const at = CHAPTERS.findIndex((chapter) => chapter.id === entry.target.id);
          if (at !== -1) {
            setIndex(at);
            setCurrent(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    for (const stage of CHAPTERS) {
      const node = document.getElementById(stage.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <p className={`flo-chapter${DIM_ON.has(current) ? " is-dim" : ""}`} aria-hidden="true">
      {String(index + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")} · {CHAPTERS[index]?.label.toUpperCase()}
    </p>
  );
}

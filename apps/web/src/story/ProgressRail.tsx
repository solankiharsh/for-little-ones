import { useEffect, useState } from "react";
import { Emblem } from "./Scenes";

/** Story progress (§15): stages, not numbers — how deep into the journey. */
const STAGES = [
  { id: "story-hero", label: "Hello" },
  { id: "story-hero-meet", label: "Hero" },
  { id: "story-worlds", label: "World" },
  { id: "story-read", label: "Story" },
  { id: "story-keepsake", label: "Book" }
];

export default function ProgressRail() {
  const [current, setCurrent] = useState(STAGES[0]!.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    for (const stage of STAGES) {
      const node = document.getElementById(stage.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flo-rail" aria-hidden="true">
      <Emblem className="flo-rail-emblem" />
      <ol>
        {STAGES.map((stage) => (
          <li key={stage.id} className={stage.id === current ? "is-here" : ""}>{stage.label}</li>
        ))}
      </ol>
    </div>
  );
}

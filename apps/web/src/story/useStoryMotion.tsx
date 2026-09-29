import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenisInstance: Lenis | null = null;

/** Programmatic scroll that respects Lenis when it owns the wheel. */
export function scrollToStory(target: string, instant = false) {
  const node = document.getElementById(target);
  if (!node) return;
  if (lenisInstance) {
    lenisInstance.scrollTo(node, { immediate: instant });
  } else {
    node.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
  }
}

export const DESKTOP_QUERY = "(min-width: 992px)";

/**
 * Motion posture for the story (§17): heavy scrubbed choreography on desktop
 * only; reduced motion disables Lenis + all scrubbed timelines and reveals
 * content immediately; mobile keeps the narrative with simplified transitions.
 */
export function useStoryMotion() {
  const domReduced = useReducedMotion();
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches);
  const osReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduced = Boolean(domReduced) || osReduced;

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    // Note: no `anchors: true` — our hashes are routes (`#/story/<id>`), not
    // plain anchors, and Lenis anchor handling misparses path-like hashes.
    // In-story links navigate natively; smooth programmatic scroll goes
    // through scrollToStory below.
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    lenisInstance = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    const frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenisInstance = null;
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [reduced]);

  return { reduced, desktop, full: desktop && !reduced };
}

export { gsap, ScrollTrigger };

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
// Required by Lenis: without these the wrapper has no height for Lenis to
// animate and the wheel is swallowed, leaving the page unscrollable.
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

export const DESKTOP_QUERY = "(min-width: 992px)";

let lenisInstance: Lenis | null = null;
let refreshTimer = 0;

/**
 * Motion posture for the story (§17, revised): Lenis exists ONLY on desktop
 * without reduced motion — mobile/tablet scroll natively. One rAF loop whose
 * latest frame ID is cancelled on cleanup, so no loop survives unmount.
 */
export function useStoryMotion() {
  const domReduced = useReducedMotion();
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches);
  const osReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduced = Boolean(domReduced) || osReduced;
  const smooth = desktop && !reduced;

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!smooth) return;
    const lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
    lenisInstance = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenisInstance = null;
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, [smooth]);

  return { reduced, desktop, smooth, full: smooth };
}

/**
 * Global layout refresh, debounced: layout-critical images call this on
 * decode instead of every section refreshing ScrollTrigger independently.
 */
export function refreshAfterDecode() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);
}

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

export { gsap, ScrollTrigger };

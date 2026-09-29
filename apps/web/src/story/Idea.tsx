import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";

/**
 * The idea (§5): a breath of paper. Three lines sit close, then letter-spacing
 * breathes open as the final phrase fills the viewport. Nothing else moves.
 */
export default function Idea({ active }: { active: boolean }) {
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "center center", scrub: 0.8 }
      })
        .fromTo(".flo-idea-lines", { letterSpacing: "0.02em", scale: 0.94 }, { letterSpacing: "0.14em", scale: 1.04, ease: "none", duration: 1 }, 0);
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={wrap} className="flo-idea" aria-label="What if your child was the hero">
      <h2 className="flo-idea-lines">
        <span>What if</span>
        <span>your child</span>
        <strong>was the hero?</strong>
      </h2>
    </section>
  );
}

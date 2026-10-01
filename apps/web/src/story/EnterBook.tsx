import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";

/**
 * Enter-the-story handoff (§C): full-bleed editorial interstitial. The book
 * starts lower in frame, the camera eases forward, copy sits in the sky's
 * negative space. No card, no box, no border.
 */
export default function EnterBook({ active }: { active: boolean }) {
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top bottom", end: "bottom top", scrub: 0.7 }
      })
        .fromTo(".flo-enter-photo", { scale: 1.12, yPercent: 6 }, { scale: 1, yPercent: -6, ease: "none", duration: 1 }, 0)
        .fromTo(".flo-enter-copy", { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: "none", duration: 0.3 }, 0.35);
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={wrap} className="flo-enter" aria-label="A story made around the little person you know best">
      <StoryImage asset={ASSETS.heroEnterBook} className="flo-enter-photo" />
      <p className="flo-enter-copy">
        A story made around
        the little person
        you know best.
      </p>
    </section>
  );
}

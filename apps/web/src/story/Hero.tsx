import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";

/**
 * Hero (§B): the generated reality-to-story artwork fills the viewport and the
 * camera pushes into the painted world on scroll. Copy lives in negative space
 * and leaves discretely; only geometry scrubs, never text.
 */
export default function Hero({ active }: { active: boolean }) {
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top top", end: "bottom bottom", scrub: 0.6 }
      })
        .fromTo(".flo-hero-photo", { scale: 1, xPercent: 0 }, { scale: 1.08, xPercent: -3.5, ease: "none", duration: 1 }, 0)
        .to(".flo-hero-headline", { opacity: 0, y: -30, ease: "none", duration: 0.3 }, 0.02)
        .fromTo(".flo-hero-final p", { opacity: 0, y: 34 }, { opacity: 1, y: 0, ease: "none", duration: 0.16, stagger: 0.02 }, 0.8);
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active ]);

  return (
    <section ref={wrap} className="flo-hero-story" aria-label="Every child deserves a story where they are the hero">
      <div className="flo-screen">
        <div className="flo-hero-frame">
          <StoryImage asset={ASSETS.heroRealityToStory} eager className="flo-hero-photo" />
          <div className="flo-hero-scrim" aria-hidden="true" />
          <h2 className="flo-hero-headline">
            <span>Every child deserves</span>
            <span>a story where</span>
            <strong>they are the hero.</strong>
          </h2>
          <div className="flo-hero-final" aria-hidden="true">
            <p>Your child.</p>
            <p>Their adventure.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

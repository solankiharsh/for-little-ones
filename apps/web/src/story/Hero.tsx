import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { HeroMedallion, MoonDial } from "./Scenes";
import { usePersonalization } from "./personalization";

/**
 * Hero (§4): a tall wrapper with a sticky viewport — never pin:true. The real
 * world (paper, daylight, the child's medallion) gives way to the story world
 * (night, moon, drifting illustrated shapes) as layered reveals scrubbed by
 * scroll. The child stays centred throughout: they are the constant.
 */
export default function Hero({ active }: { active: boolean }) {
  const { heroName, photos, hasRealChild } = usePersonalization();
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top top", end: "bottom bottom", scrub: 0.6 }
      })
        .to(".flo-hero-daylight", { opacity: 0, scale: 1.12, ease: "none", duration: 1 }, 0)
        .to(".flo-hero-night", { opacity: 1, ease: "none", duration: 1 }, 0.35)
        .to(".flo-hero-medallion", { scale: 1.35, ease: "none", duration: 1 }, 0)
        .fromTo(".flo-hero-ink", { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: "none", duration: 0.25 }, 0.55)
        .fromTo(".flo-hero-frame", { clipPath: "inset(18% 18% 18% 18% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none", duration: 1 }, 0);
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={wrap} className="flo-hero-story" aria-label="Enter the story" id="story-hero">
      <div className="flo-screen">
        <div className="flo-hero-frame">
          <div className="flo-hero-daylight" aria-hidden="true" />
          <div className="flo-hero-night" aria-hidden="true">
            <MoonDial />
            <span className="flo-drift flo-drift-a" aria-hidden="true" />
            <span className="flo-drift flo-drift-b" aria-hidden="true" />
            <span className="flo-drift flo-drift-c" aria-hidden="true" />
          </div>
          <div className="flo-hero-centre">
            <p className="flo-hero-eyebrow">Once upon a time, very close to home…</p>
            <HeroMedallion name={heroName} photo={hasRealChild ? photos[0] : undefined} />
            <div className="flo-hero-ink">
              <p>Your child.</p>
              <p>Their adventure.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

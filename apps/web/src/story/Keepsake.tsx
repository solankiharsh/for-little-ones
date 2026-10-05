import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./useStoryMotion";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";

/**
 * Keepsake (§L): digital spread → physical book, photographed for real.
 * A slow scroll crossfade moves through the physical states; specs sit
 * quietly beside the hardcover. No CSS book construction anywhere.
 */
const SPECS = [
  "Premium hardcover",
  "Full-colour print",
  "Personalised cover",
  "Dedication page",
  "Made to keep"
];

export default function Keepsake({ active }: { active: boolean }) {
  const { heroName, dedication, mode } = usePersonalization();
  const wrap = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const ctx = gsap.context(() => {
      gsap.timeline({
        scrollTrigger: { trigger: wrap.current, start: "top top", end: "bottom bottom", scrub: 0.7 }
      })
        .fromTo(".flo-keep-digital", { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.94, ease: "none", duration: 0.45 }, 0)
        .fromTo(".flo-keep-physical", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, ease: "none", duration: 0.45 }, 0.4)
        .fromTo(".flo-keep-open", { opacity: 0, y: 60 }, { opacity: 1, y: 0, ease: "none", duration: 0.3 }, 0.65);
      ScrollTrigger.refresh();
    }, wrap);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={wrap} className="flo-keepsake" aria-label="A keepsake to hold" id="story-keepsake">
      <div className="flo-screen">
        <div className="flo-keep-digital">
          <StoryImage asset={mode === "marketing" ? ASSETS.aaravOpenBook : ASSETS.digitalToPhysical} />
        </div>
        <div className="flo-keep-physical">
          <StoryImage asset={mode === "marketing" ? ASSETS.aaravHardcover : ASSETS.productHardcover} eager={false} />
          <aside aria-label="Book specifications">
            <h3>{heroName}&rsquo;s hardcover</h3>
            <ul>
              {SPECS.map((spec) => <li key={spec}>{spec}</li>)}
              {dedication.trim() && <li>Dedication, in your words</li>}
            </ul>
          </aside>
        </div>
        <figure className="flo-keep-open">
          <StoryImage asset={mode === "marketing" ? ASSETS.aaravOpenBook : ASSETS.productOpenBook} />
        </figure>
      </div>
    </section>
  );
}

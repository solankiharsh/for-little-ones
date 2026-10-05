import { useEffect } from "react";
import "./story.css";
import { PersonalizationProvider } from "./personalization";
import { useStoryMotion, scrollToStory } from "./useStoryMotion";
import Opening from "./Opening";
import Hero from "./Hero";
import EnterBook from "./EnterBook";
import Idea from "./Idea";
import Character from "./Character";
import Worlds from "./Worlds";
import Personalise from "./Personalise";
import Generation from "./Generation";
import Reader from "./Reader";
import Emotion from "./Emotion";
import HumanProof from "./HumanProof";
import Keepsake from "./Keepsake";
import { FinalCta, StoryFooter } from "./Closing";
import ProgressRail from "./ProgressRail";
import { ASSETS } from "./assets";

/**
 * The continuous story (§22): reality → imagination → book → keepsake.
 * Heavy scrub choreography mounts only when `full` (desktop, motion OK);
 * otherwise every section renders in its resting state with full function.
 */
export default function StoryExperience({ target }: { target?: string | null }) {
  const { reduced, full } = useStoryMotion();

  useEffect(() => {
    const preload = [
      ASSETS.heroRealityToStory.src,
      ASSETS.heroEnterBook.src,
      ASSETS.worldMoon.src,
      ASSETS.worldGarden.src,
      ASSETS.worldLighthouse.src
    ];
    const images = preload.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    return () => {
      images.length = 0;
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("flo-story-mode");
    return () => document.body.classList.remove("flo-story-mode");
  }, []);

  useEffect(() => {
    if (!target) return;
    const timer = window.setTimeout(() => {
      scrollToStory(target, reduced);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [target, reduced]);

  return (
    <PersonalizationProvider>
      <div className={`flo-story${reduced ? " is-reduced" : ""}${full ? "" : " is-simple"}`}>
        <Opening />
        <ProgressRail />
        <main aria-label="For Little One — a story in one scroll">
          <Hero active={full} />
          <EnterBook active={full} />
          <Idea active={full} />
          <Character />
          <Worlds active={full} />
          <Personalise />
          <Generation />
          <Reader />
          <Emotion />
          <HumanProof />
          <Keepsake active={full} />
          <FinalCta />
        </main>
        <StoryFooter />
      </div>
    </PersonalizationProvider>
  );
}

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

/** Event bridge into the existing creation flow without restructuring Site. */
export const FLO_CREATE_EVENT = "flo:create-book";

/**
 * The continuous story (§22): reality → imagination → book → keepsake.
 * Heavy scrub choreography mounts only when `full` (desktop, motion OK);
 * otherwise every section renders in its resting state with full function.
 */
export default function StoryExperience({ onCreate, target }: { onCreate: () => void; target?: string | null }) {
  const { reduced, full } = useStoryMotion();

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
        <Opening onBegin={() => scrollToStory("story-hero", reduced)} />
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
          <FinalCta onCreate={onCreate} />
        </main>
        <StoryFooter />
      </div>
    </PersonalizationProvider>
  );
}

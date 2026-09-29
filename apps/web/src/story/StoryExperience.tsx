import { useEffect } from "react";
import "./story.css";
import { PersonalizationProvider } from "./personalization";
import { useStoryMotion, scrollToStory } from "./useStoryMotion";
import Opening from "./Opening";
import { STORY_WORLDS } from "./Worlds";
import { StoryFooter } from "./Closing";
import ProgressRail from "./ProgressRail";

/**
 * Vertical stack of storybooks — one book per world.
 * Each book is a standalone section with hero image + content panel.
 * Users scroll vertically from one book to the next.
 */
export default function StoryExperience({ target }: { target?: string | null }) {
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
        <Opening />
        <ProgressRail />
        <main aria-label="For Little One — a story in one scroll">
          <section className="story-stack">
            {STORY_WORLDS.map((world) => (
              <article key={world.id} className="book-section">
                <div className="book-hero">
                  <img
                    src={world.image.src}
                    width={world.image.width}
                    height={world.image.height}
                    alt={world.image.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="book-body">
                  <p className="book-eyebrow">{world.blurb}</p>
                  <h2 className="book-title">{world.title}</h2>
                  <p className="book-summary">
                    A personal adventure woven around the things {world.title.toLowerCase()} loves.
                  </p>
                  <a
                    className="book-cta"
                    href="#"
                    aria-label={`Read ${world.title}`
                  }>
                    Read a few pages
                  </a>
                </div>
              </article>
            ))}
          </section>
        </main>
        <StoryFooter />
      </div>
    </PersonalizationProvider>
  );
}
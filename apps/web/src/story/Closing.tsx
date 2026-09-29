import { usePersonalization } from "./personalization";

/**
 * Final CTA (§13) + footer (§14): the book closes, the cover faces the camera,
 * everything goes quiet. Then the page clips inward and the dark footer lands.
 */
export function FinalCta({ onCreate }: { onCreate: () => void }) {
  const { heroName, hasRealChild, generated } = usePersonalization();
  return (
    <section className="flo-final" aria-label="Their story is waiting" id="story-final">
      <div className="flo-book-closing" aria-hidden="true">
        <span className="flo-book-closing-cover">{heroName}&rsquo;s Storybook</span>
      </div>
      <h2>Their story is waiting.</h2>
      <div className="flo-final-actions">
        <button type="button" className="flo-btn flo-btn-primary" onClick={onCreate}>
          {hasRealChild && generated ? `Continue ${heroName}’s story` : "Create their book"}
        </button>
        <a className="flo-btn flo-btn-ghost" href="#story-read">See an example</a>
      </div>
    </section>
  );
}

export function StoryFooter() {
  return (
    <footer className="flo-story-foot" aria-label="Footer">
      <nav aria-label="Footer">
        <a href="#story-hero">Our Stories</a>
        <a href="#story-hero-meet">How It Works</a>
        <a href="#story-final">FAQ</a>
        <a href="#story-final">Privacy</a>
        <a href="#story-final">Contact</a>
      </nav>
      <p className="flo-story-foot-brand">For Little One</p>
      <p>Made for the little ones who make our worlds bigger.</p>
    </footer>
  );
}

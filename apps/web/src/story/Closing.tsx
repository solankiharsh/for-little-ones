import { usePersonalization } from "./personalization";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";

/**
 * Final CTA (§M): full-bleed night — book on the bedside table, large negative
 * space, copy low-left. Emotionally inevitable, never salesy.
 */
export function FinalCta({ onCreate }: { onCreate: () => void }) {
  const { heroName, hasRealChild, generated } = usePersonalization();
  return (
    <section className="flo-final" aria-label="Their story is waiting" id="story-final">
      <StoryImage asset={ASSETS.productFinalNight} className="flo-final-photo" />
      <div className="flo-final-copy">
        <h2>Their story<br />is waiting.</h2>
        <button type="button" className="flo-final-action" onClick={onCreate}>
          {hasRealChild && generated ? `Continue ${heroName}’s story →` : "Create their book →"}
        </button>
        <a className="flo-final-secondary" href="#/story/story-read">See an example</a>
      </div>
    </section>
  );
}

/**
 * Footer (§N): the final image darkens naturally into a minimal footer.
 */
export function StoryFooter() {
  return (
    <footer className="flo-story-foot" aria-label="Footer">
      <p className="flo-story-foot-brand">For Little One</p>
      <p>Stories made around the little people you know best.</p>
      <nav aria-label="Footer">
        <a href="#story-hero">Our Stories</a>
        <a href="#story-hero-meet">How It Works</a>
        <a href="#story-final">FAQ</a>
        <a href="#story-final">Privacy</a>
        <a href="#story-final">Contact</a>
      </nav>
    </footer>
  );
}

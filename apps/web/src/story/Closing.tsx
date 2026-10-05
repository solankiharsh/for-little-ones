import { usePersonalization, requestCreation, requestSample } from "./personalization";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { SAMPLE_TITLE } from "./samples";
import { STORY_WORLDS } from "./Worlds";

/**
 * Final CTA (§M): full-bleed night — book on the bedside table, large negative
 * space, copy low-left. Emotionally inevitable, never salesy.
 */
export function FinalCta() {
  const personal = usePersonalization();
  const { heroName, hasRealChild, generated } = personal;

  function createBook() {
    const hasDetails = Boolean(
      personal.childName.trim() || personal.childAge || personal.interests.length ||
      personal.detail.trim() || personal.dedication.trim() || personal.selectedWorld || personal.photos.length || personal.companions.length
    );
    const world = STORY_WORLDS.find((entry) => entry.id === personal.selectedWorld)?.title ?? STORY_WORLDS[0]!.title;
    requestCreation({
      localPhotoCount: personal.photos.length,
      ...(hasDetails ? {
        draft: {
          childName: personal.childName.trim(),
          age: personal.childAge,
          world,
          companions: personal.companions,
          favourites: personal.interests,
          detail: personal.detail.trim(),
          dedication: personal.dedication.trim()
        }
      } : {})
    });
  }

  return (
    <section className="flo-final" aria-label="Their story is waiting" id="story-final">
      <StoryImage asset={ASSETS.productFinalNight} className="flo-final-photo" />
      <div className="flo-final-copy">
        <h2>Their story<br />is waiting.</h2>
        <button type="button" className="flo-final-action" onClick={createBook}>
          {hasRealChild && generated ? `Create ${heroName}’s book →` : "Create their book →"}
        </button>
        <button type="button" className="flo-final-secondary" onClick={() => requestSample(SAMPLE_TITLE)}>See an example</button>
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

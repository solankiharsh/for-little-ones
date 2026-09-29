import { useRef } from "react";
import { usePersonalization } from "./personalization";

const GUIDANCE = ["Front", "Side", "Smiling", "Full face"];

/**
 * Character (§6): meeting the hero, not a form. Photos stay local object URLs —
 * they preview here and travel nowhere until the real upload pipeline (F-004)
 * exists. The transformation strip reads photo → storybook treatment → in-scene.
 */
export default function Character() {
  const { childName, setChildName, childAge, setChildAge, photos, addPhotos, removePhoto } = usePersonalization();
  const input = useRef<HTMLInputElement>(null);

  return (
    <section className="flo-character" aria-label="Meet the hero" id="story-hero-meet">
      <p className="flo-kicker">First, meet our hero</p>
      <h2>Who is this story for?</h2>
      <div className="flo-character-grid">
        <div className="flo-character-who">
          <label>Child&rsquo;s first name
            <input value={childName} maxLength={40} autoComplete="off" placeholder="e.g. Maya" onChange={(e) => setChildName(e.target.value)} />
          </label>
          <label>Age
            <select value={childAge} onChange={(e) => setChildAge(e.target.value)}>
              <option value="">Choose their age</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "year" : "years"}</option>)}
            </select>
          </label>
          <p className="flo-create-hint">Names and photos stay in this browser while you explore. Nothing is uploaded yet.</p>
        </div>
        <div className="flo-character-photos">
          <div className="flo-guidance" aria-label="Photo guidance">
            {GUIDANCE.map((hint) => <span key={hint}>{hint}</span>)}
          </div>
          <button type="button" className="flo-drop" onClick={() => input.current?.click()}>
            <span aria-hidden="true">✦</span>
            <strong>Add 3–5 photos</strong>
            <small>Front · side · smiling · full face — the more angles, the truer the character.</small>
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Upload photos of your child"
            onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = ""; }} />
          {photos.length > 0 && (
            <ul className="flo-thumbs">
              {photos.map((src, index) => (
                <li key={src}>
                  <img src={src} alt={`Uploaded photo ${index + 1} of your child`} />
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => removePhoto(index)}>×</button>
                </li>
              ))}
            </ul>
          )}
          {photos.length > 0 && (
            <ol className="flo-becoming" aria-label="From photo to storybook character">
              <li><figure><img src={photos[0]} alt="Original uploaded photo" /><figcaption>Photo</figcaption></figure></li>
              <li><figure className="flo-treated"><img src={photos[0]} alt="Photo with storybook treatment" /><figcaption>Storybook character</figcaption></figure></li>
              <li><figure className="flo-inscene"><img src={photos[0]} alt="Character placed inside a story scene" /><span aria-hidden="true">✧</span><figcaption>In their world</figcaption></figure></li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

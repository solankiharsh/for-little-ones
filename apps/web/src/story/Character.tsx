import { useRef } from "react";
import { ASSETS } from "./assets";
import StoryImage from "./StoryImage";
import { usePersonalization } from "./personalization";

const GUIDANCE = ["Front", "Side", "Smiling", "Full face"];

/**
 * Meet the hero (§E): editorial 40/60 — copy and quiet underline fields left,
 * the transformation sequence right. Photos stay local object URLs and travel
 * nowhere until the real upload pipeline (F-004) exists. Before upload, demo
 * imagery shows the shape of the transformation, honestly labelled as demo.
 */
export default function Character() {
  const personal = usePersonalization();
  const { childName, childAge, photos } = personal;
  const input = useRef<HTMLInputElement>(null);
  const firstPhoto = photos[0];

  return (
    <section className="flo-character" aria-label="Meet the hero" id="story-hero-meet">
      <div className="flo-character-copy">
        <p className="flo-kicker">First, meet our hero</p>
        <h2>Who is this story for?</h2>
        <label className="flo-line-field">Child&rsquo;s first name
          <input value={childName} maxLength={40} autoComplete="off" placeholder="Maya" onChange={(e) => personal.setChildName(e.target.value)} />
        </label>
        <label className="flo-line-field">Age
          <select value={childAge} onChange={(e) => personal.setChildAge(e.target.value)}>
            <option value="">Choose their age</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "year" : "years"}</option>)}
          </select>
        </label>
        <button type="button" className="flo-text-action" onClick={() => input.current?.click()}>
          {firstPhoto ? "Add more photos" : "Add 3–5 photos"} →
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Upload photos of your child"
          onChange={(e) => { if (e.target.files) personal.addPhotos(e.target.files); e.target.value = ""; }} />
        <p className="flo-photo-note">Front · side · smiling · full face. Photos stay in this browser while you explore.</p>
        {photos.length > 0 && (
          <ul className="flo-tray">
            {photos.map((src, index) => (
              <li key={src}>
                <img src={src} alt={`Uploaded photo ${index + 1} of your child`} />
                <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => personal.removePhoto(index)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ol className="flo-becoming" aria-label="From real child to story character">
        <li>
          {firstPhoto
            ? <img src={firstPhoto} alt="Your uploaded photo of your child" />
            : <StoryImage asset={ASSETS.characterPhotoDemo} />}
          <p><strong>Real child</strong><span>{firstPhoto ? "Your photo" : "Demo photo"}</span></p>
        </li>
        <li>
          <StoryImage asset={ASSETS.characterIllustratedDemo} />
          <p><strong>Story character</strong><span>Demo illustration</span></p>
        </li>
        <li>
          <StoryImage asset={ASSETS.characterWorldDemo} />
          <p><strong>Their world</strong><span>Demo scene</span></p>
        </li>
      </ol>
    </section>
  );
}

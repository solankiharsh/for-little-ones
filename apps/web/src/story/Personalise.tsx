import { ASSETS } from "./assets";
import { STORY_WORLDS } from "./Worlds";
import { usePersonalization } from "./personalization";

const COMPANIONS = ["Sibling", "Mum", "Dad", "Friend", "Pet"];
const INTERESTS = ["Dinosaurs", "Space", "Animals", "Magic", "Cars", "The sea"];

/**
 * Make it theirs (§G): calm editorial questions, one at a time — never a giant
 * animated form. Options read as typeset choices. The backdrop borrows a
 * heavily cropped, blurred breath of the chosen world (0.08–0.16 opacity).
 */
export default function Personalise() {
  const personal = usePersonalization();
  const { heroName } = personal;
  const worldImage = STORY_WORLDS.find((world) => world.id === personal.selectedWorld)?.image;

  return (
    <section className="flo-make" aria-label="Make it theirs" id="story-make">
      {worldImage && (
        <div className="flo-make-world" aria-hidden="true">
          <img src={worldImage.src} alt="" loading="lazy" decoding="async" />
        </div>
      )}
      <p className="flo-kicker">No two stories should be the same</p>
      <h2>Make it theirs</h2>
      <div className="flo-make-questions">
        <section aria-label="Who is our hero">
          <h3>Who is our hero?</h3>
          <p className="flo-make-answer">{heroName}{personal.childAge ? `, ${personal.childAge}` : ""}</p>
          <label className="flo-line-field">Name
            <input value={personal.childName} maxLength={40} autoComplete="off" placeholder="Their first name" onChange={(e) => personal.setChildName(e.target.value)} />
          </label>
          <label className="flo-line-field">Age
            <select value={personal.childAge} onChange={(e) => personal.setChildAge(e.target.value)}>
              <option value="">Choose</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </section>
        <section aria-label="Who joins the adventure">
          <h3>Who joins the adventure?</h3>
          <div className="flo-choices" role="group" aria-label="Companions">
            {COMPANIONS.map((option) => (
              <button key={option} type="button" aria-pressed={personal.companions.includes(option)} onClick={() => personal.toggleCompanion(option)}>{option}</button>
            ))}
          </div>
        </section>
        <section aria-label="What do they love">
          <h3>What do they love?</h3>
          <div className="flo-choices" role="group" aria-label="Interests">
            {INTERESTS.map((option) => (
              <button key={option} type="button" aria-pressed={personal.interests.includes(option)} onClick={() => personal.toggleInterest(option)}>{option}</button>
            ))}
          </div>
        </section>
        <section aria-label="A small detail only they would know">
          <h3>What small detail would only they know?</h3>
          <label className="flo-line-field">Optional
            <input value={personal.detail} maxLength={120} placeholder="Their teddy is called Mr Bear" onChange={(e) => personal.setDetail(e.target.value)} />
          </label>
          <label className="flo-line-field">A dedication for the first page
            <input value={personal.dedication} maxLength={150} placeholder="For bedtime, always" onChange={(e) => personal.setDedication(e.target.value)} />
          </label>
        </section>
      </div>
    </section>
  );
}

import { DinoSprite, PetSprite } from "./Scenes";
import { usePersonalization } from "./personalization";

const COMPANIONS = ["Sibling", "Mum", "Dad", "Friend", "Pet"];
const INTERESTS = ["Dinosaurs", "Space", "Animals", "Magic", "Cars", "The sea"];
const showDino = (interests: string[]) => interests.includes("Dinosaurs");
const showPet = (companions: string[]) => companions.includes("Pet");

/**
 * Make it theirs (§8): customization as story parts. The backdrop answers —
 * a small dinosaur walks through for dinosaur lovers, a pet silhouette joins
 * for pet companions. Tasteful, state-driven, no fake generation claims.
 */
export default function Personalise() {
  const personal = usePersonalization();
  const { heroName } = personal;

  return (
    <section className="flo-make" aria-label="Make it theirs" id="story-make">
      <div className={`flo-make-scene${showDino(personal.interests) ? " has-dino" : ""}${showPet(personal.companions) ? " has-pet" : ""}`} aria-hidden="true">
        <span className="flo-make-hills" />
        <span className="flo-make-dino"><DinoSprite /></span>
        <span className="flo-make-pet"><PetSprite /></span>
      </div>
      <p className="flo-kicker">No two stories should be the same</p>
      <h2>Make it theirs</h2>
      <div className="flo-make-grid">
        <fieldset>
          <legend>Who is our hero?</legend>
          <p className="flo-make-answer">{heroName}{personal.childAge ? `, ${personal.childAge}` : ""}</p>
          <label className="flo-inline">Name
            <input value={personal.childName} maxLength={40} autoComplete="off" placeholder="Their first name" onChange={(e) => personal.setChildName(e.target.value)} />
          </label>
          <label className="flo-inline">Age
            <select value={personal.childAge} onChange={(e) => personal.setChildAge(e.target.value)}>
              <option value="">Choose</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Who joins the adventure?</legend>
          <div className="flo-chips">
            {COMPANIONS.map((option) => (
              <button key={option} type="button" aria-pressed={personal.companions.includes(option)} onClick={() => personal.toggleCompanion(option)}>{option}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>What do they love?</legend>
          <div className="flo-chips">
            {INTERESTS.map((option) => (
              <button key={option} type="button" aria-pressed={personal.interests.includes(option)} onClick={() => personal.toggleInterest(option)}>{option}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>A small detail only they would know</legend>
          <label className="flo-inline">Optional
            <input value={personal.detail} maxLength={120} placeholder="Their teddy is called Mr Bear" onChange={(e) => personal.setDetail(e.target.value)} />
          </label>
          <label className="flo-inline">A dedication for the first page
            <input value={personal.dedication} maxLength={150} placeholder="For bedtime, always" onChange={(e) => personal.setDedication(e.target.value)} />
          </label>
        </fieldset>
      </div>
    </section>
  );
}

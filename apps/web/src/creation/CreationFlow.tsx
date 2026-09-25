import { useEffect, useRef, useState, type FormEvent } from "react";

const WORLDS = ["Bedtime wonder", "Small adventures", "Big imagination"];
const STEPS = ["Your child", "Their world", "Little details", "Preview"];
const FAVOURITES = ["Animals", "Space", "The sea", "Dinosaurs", "Gardens"];

/** A local creation draft; no child data is sent to a provider or saved to a server. */
export default function CreationFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [world, setWorld] = useState(WORLDS[0]!);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [dedication, setDedication] = useState("");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const child = name.trim();

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, [open]);
  useEffect(() => { heading.current?.focus(); }, [step, started]);

  function advance(event: FormEvent) {
    event.preventDefault();
    if (step === 0 && (!child || !age)) {
      setError("Add their name and age to continue.");
      return;
    }
    setError("");
    setStep(Math.min(3, step + 1));
  }

  return (
    <dialog
      aria-label="Create a personalised book"
      className="flo-create"
      ref={dialog}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <header className="flo-create-head">
        <span className="flo-kicker">For one little one</span>
        <button type="button" className="flo-btn flo-btn-ghost" onClick={onClose} aria-label="Close creation">Close ×</button>
      </header>
      <div className="flo-create-scroll">
        <ol className="flo-create-steps" aria-label="Creation progress">
          {STEPS.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
        </ol>
        <form onSubmit={advance}>
          <div className="flo-create-content">
            <p className="flo-kicker">Step {step + 1} of 4</p>
            <h2 ref={heading} tabIndex={-1}>{["Who’s the story for?", `A world for ${child}`, "The little things that matter", started ? "Their story starts here" : "A little look at their book"][step]}</h2>
            <p className="flo-create-intro">{["Every adventure begins with someone special.", "Choose a starting point for their adventure.", "A favourite thing or a few words from you. Everything here is optional.", "A layout preview with illustration placeholders. Your story has not been generated."][step]}</p>
            {step === 0 && <div className="flo-create-fields">
              <label>Child’s name or nickname<input autoComplete="off" maxLength={40} required value={name} placeholder="Their first name" onChange={(e) => setName(e.target.value)} /></label>
              <label>Age<select required value={age} onChange={(e) => setAge(e.target.value)}><option value="">Choose their age</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "year" : "years"}</option>)}</select></label>
              <p className="flo-create-hint">No photo needed for now. This draft stays in this tab until you refresh or close it.</p>
            </div>}
            {step === 1 && <fieldset className="flo-create-worlds"><legend className="flo-create-hint">Choose one story world</legend>{WORLDS.map((item, index) => <label className="flo-create-world" key={item}>
              <input type="radio" name="world" value={item} checked={world === item} onChange={() => setWorld(item)} />
              <span><strong>{item}</strong><small>{["A gentle journey for the end of the day.", "A curious discovery just around the corner.", "An extraordinary adventure far from home."][index]}</small></span>
            </label>)}</fieldset>}
            {step === 2 && <div className="flo-create-fields">
              <fieldset className="flo-create-favourites"><legend>What do they love?</legend><div>{FAVOURITES.map((item) => <button key={item} type="button" aria-pressed={favourites.includes(item)} onClick={() => setFavourites((values) => values.includes(item) ? values.filter((value) => value !== item) : [...values, item])}>{item}</button>)}</div></fieldset>
              <label>A detail that makes them, them <span>(optional)</span><input value={detail} maxLength={120} placeholder="Their teddy is called Mr Bear" onChange={(e) => setDetail(e.target.value)} /></label>
              <label>A dedication <span>(optional)</span><textarea value={dedication} maxLength={150} rows={3} placeholder={`A few words for ${child} to keep forever…`} onChange={(e) => setDedication(e.target.value)} /><small>{dedication.length}/150 characters</small></label>
            </div>}
            {step === 3 && <>
              <div className="flo-create-preview">
                <div className="flo-create-cover"><span>Made for {child}</span><div className="flo-create-placeholder" role="img" aria-label="Illustration placeholder"><span aria-hidden="true">✧</span><small>Illustration to come</small></div><h3>{world}</h3><p>A story for {child}</p></div>
                <div className="flo-create-summary"><h3>Their book, at a glance</h3><dl><dt>For</dt><dd>{child} · age {age}</dd><dt>Story world</dt><dd>{world}</dd>{favourites.length > 0 && <><dt>Favourite things</dt><dd>{favourites.join(", ")}</dd></>}{detail.trim() && <><dt>A personal detail</dt><dd>{detail}</dd></>}{dedication.trim() && <><dt>Dedication</dt><dd className="flo-create-dedication">{dedication}</dd></>}</dl><p className="flo-create-hint">You can go back and change any detail. Images and story generation will come later.</p></div>
              </div>
              {started && <p className="flo-create-confirmation" role="status">Your draft is ready in this page. Nothing has been ordered or sent for generation.</p>}
            </>}
            {error && <p role="alert" className="flo-cart-form-error">{error}</p>}
          </div>
          <footer className="flo-create-actions">
            <button type="button" className="flo-btn flo-btn-ghost" onClick={() => { if (step === 0) onClose(); else { setStep(step - 1); setStarted(false); } }}>{step === 0 ? "Back to the studio" : "← Back"}</button>
            {step < 3 ? <button className="flo-btn flo-btn-primary" type="submit">{step === 2 ? "Preview their book" : "Continue"} →</button> : <button type="button" className="flo-btn flo-btn-primary" onClick={() => { if (started) onClose(); else setStarted(true); }}>{started ? "Back to the studio" : "Keep this draft"}</button>}
          </footer>
        </form>
      </div>
    </dialog>
  );
}

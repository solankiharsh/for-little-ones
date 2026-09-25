import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { generationAccessFor } from "@for-little-ones/domain";
import { createStoryProject, generateStoryPreview, loadSavedCreation, saveCreation, type CreationDraft, type StoryProjectCredential } from "./story-preview";

const WORLDS = ["Bedtime wonder", "Small adventures", "Big imagination"];
const STEPS = ["Your child", "Their world", "Little details", "Preview"];
const FAVOURITES = ["Animals", "Space", "The sea", "Dinosaurs", "Gardens"];
const TEASER_ACCESS = generationAccessFor("TEASER");

export default function CreationFlow({ open, onClose, onAddToBasket }: { open: boolean; onClose: () => void; onAddToBasket: (draft: CreationDraft) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const saved = useRef(typeof window === "undefined" ? null : loadSavedCreation(window.localStorage)).current;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(saved?.draft.childName ?? "");
  const [age, setAge] = useState(saved?.draft.age ?? "");
  const [world, setWorld] = useState(saved?.draft.world ?? WORLDS[0]!);
  const [favourites, setFavourites] = useState<string[]>(saved?.draft.favourites ?? []);
  const [detail, setDetail] = useState(saved?.draft.detail ?? "");
  const [dedication, setDedication] = useState(saved?.draft.dedication ?? "");
  const [story, setStory] = useState<StoryPreviewResult | undefined>(saved?.story);
  const [project, setProject] = useState<StoryProjectCredential | undefined>(saved?.project);
  const [generating, setGenerating] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const child = name.trim();
  const draft: CreationDraft = { childName: child, age, world, favourites, detail: detail.trim(), dedication: dedication.trim() };

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, [open]);
  useEffect(() => { heading.current?.focus(); }, [step, started]);
  useEffect(() => {
    if (typeof window !== "undefined") saveCreation(window.localStorage, { draft, ...(story ? { story } : {}), ...(project ? { project } : {}) });
  }, [name, age, world, favourites, detail, dedication, story, project]);

  function revise() {
    setStory(undefined);
    setProject(undefined);
    setStarted(false);
    setError("");
  }

  async function writeStory() {
    setGenerating(true);
    setError("");
    try {
      const credential = project ?? await createStoryProject(draft);
      if (!project) setProject(credential);
      setStory(await generateStoryPreview(draft, credential));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The story studio could not be reached. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

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
            <p className="flo-create-intro">{["Every adventure begins with someone special.", "Choose a starting point for their adventure.", "A favourite thing or a few words from you. Everything here is optional.", "Here’s how their personalised hardcover will take shape."][step]}</p>
            {step === 0 && <div className="flo-create-fields">
              <label>Child’s name or nickname<input autoComplete="off" maxLength={40} required value={name} placeholder="Their first name" onChange={(e) => { revise(); setName(e.target.value); }} /></label>
              <label>Age<select required value={age} onChange={(e) => { revise(); setAge(e.target.value); }}><option value="">Choose their age</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? "year" : "years"}</option>)}</select></label>
              <p className="flo-create-hint">No photo is needed to begin. Your draft is saved in this browser so you can return to it.</p>
            </div>}
            {step === 1 && <fieldset className="flo-create-worlds"><legend className="flo-create-hint">Choose one story world</legend>{WORLDS.map((item, index) => <label className="flo-create-world" key={item}>
              <input type="radio" name="world" value={item} checked={world === item} onChange={() => { revise(); setWorld(item); }} />
              <span><strong>{item}</strong><small>{["A gentle journey for the end of the day.", "A curious discovery just around the corner.", "An extraordinary adventure far from home."][index]}</small></span>
            </label>)}</fieldset>}
            {step === 2 && <div className="flo-create-fields">
              <fieldset className="flo-create-favourites"><legend>What do they love?</legend><div>{FAVOURITES.map((item) => <button key={item} type="button" aria-pressed={favourites.includes(item)} onClick={() => { revise(); setFavourites((values) => values.includes(item) ? values.filter((value) => value !== item) : [...values, item]); }}>{item}</button>)}</div></fieldset>
              <label>A detail that makes them, them <span>(optional)</span><input value={detail} maxLength={120} placeholder="Their teddy is called Mr Bear" onChange={(e) => { revise(); setDetail(e.target.value); }} /></label>
              <label>A dedication <span>(optional)</span><textarea value={dedication} maxLength={150} rows={3} placeholder={`A few words for ${child} to keep forever…`} onChange={(e) => { revise(); setDedication(e.target.value); }} /><small>{dedication.length}/150 characters</small></label>
            </div>}
            {step === 3 && <>
              <div className="flo-create-preview">
                <div className="flo-create-cover"><span>Made for {child}</span><div className="flo-create-placeholder" role="img" aria-label={`${world} cover artwork for ${child}`}><span aria-hidden="true">✧</span><small>{world} artwork</small></div><h3>{world}</h3><p>A story for {child}</p></div>
                <div className="flo-create-summary"><h3>Their book, at a glance</h3><dl><dt>For</dt><dd>{child} · age {age}</dd><dt>Story world</dt><dd>{world}</dd>{favourites.length > 0 && <><dt>Favourite things</dt><dd>{favourites.join(", ")}</dd></>}{detail.trim() && <><dt>A personal detail</dt><dd>{detail}</dd></>}{dedication.trim() && <><dt>Dedication</dt><dd className="flo-create-dedication">{dedication}</dd></>}</dl><p className="flo-create-hint">You can go back and change any detail before adding the hardcover to your basket.</p></div>
              </div>
              {started && !story && <p className="flo-create-confirmation" role="status">The details are ready. We’ll now write a six-page story preview for you to review before checkout.</p>}
              {generating && <div className="flo-create-generating" role="status"><span aria-hidden="true" /> <div><strong>Writing {child}’s story…</strong><small>Creating the title, story arc and six page drafts. This can take around a minute.</small></div></div>}
              {story && <section className="flo-story-preview" aria-label="Generated story preview">
                <div className="flo-story-preview-head"><p className="flo-kicker">Story preview</p><h3>{story.title}</h3><p>{story.synopsis}</p></div>
                <ol>{story.pages.map((page, index) => {
                  const fullPage = typeof TEASER_ACCESS.visibleStoryPages === "number" && index < TEASER_ACCESS.visibleStoryPages;
                  const excerpt = index === TEASER_ACCESS.visibleStoryPages;
                  return <li key={page.pageNumber} className={!fullPage ? "flo-story-page-locked" : undefined}>
                    <div className="flo-story-art-placeholder" role="img" aria-label={fullPage ? `Artwork placeholder for page ${page.pageNumber}` : `Locked artwork for page ${page.pageNumber}`}><span>{fullPage ? `Page ${page.pageNumber}` : "Locked"}</span><small>{fullPage ? "Low-resolution illustration preview comes next" : "Unlocks after payment"}</small></div>
                    <div><strong>Page {page.pageNumber}</strong>{fullPage ? <><p>{page.text}</p><small>{page.illustrationCue}</small></> : excerpt ? <><p className="flo-story-excerpt">{page.text.slice(0, TEASER_ACCESS.nextPageExcerptCharacters)}…</p><small>Continue with the finished book</small></> : <><p>Story page ready</p><small>Full text and finished artwork unlock after payment.</small></>}</div>
                  </li>;
                })}</ol>
                <div className="flo-story-unlock"><strong>A glimpse before you buy</strong><p>Your title, synopsis, first page and a little of what follows are ready to review. Payment unlocks the complete story, finished illustrations, page regeneration and the editing studio.</p></div>
                <p className="flo-create-hint">Image generation will be limited to two low-resolution, watermarked previews before payment. Production artwork starts only after payment is confirmed.</p>
              </section>}
            </>}
            {error && <p role="alert" className="flo-cart-form-error">{error}</p>}
          </div>
          <footer className="flo-create-actions">
            <button type="button" className="flo-btn flo-btn-ghost" disabled={generating} onClick={() => { if (step === 0) onClose(); else { setStep(step - 1); setStarted(false); } }}>{step === 0 ? "Back to the studio" : "← Back"}</button>
            {step < 3 ? <button className="flo-btn flo-btn-primary" type="submit">{step === 2 ? "Preview their book" : "Continue"} →</button> : <button type="button" className="flo-btn flo-btn-primary" onClick={() => {
              if (!started) { setStarted(true); return; }
              if (!story) { void writeStory(); return; }
              onAddToBasket(draft);
            }} disabled={generating}>{generating ? "Writing story…" : story ? "Add hardcover to basket · £29.20" : started ? "Write story preview" : "Keep this book"}</button>}
          </footer>
        </form>
      </div>
    </dialog>
  );
}

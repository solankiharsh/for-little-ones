import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { generationAccessFor } from "@for-little-ones/domain";
import { createStoryProject, generateStoryConcepts, generateStoryPreview, loadSavedCreation, loadStoryProject, saveCreation, selectStoryConcept, type CreationDraft, type StoryConcept, type StoryProjectCredential } from "./story-preview";

const WORLDS = ["Bedtime wonder", "Small adventures", "Big imagination"];
const STEPS = ["Your child", "Their world", "Little details", "Story ideas", "Preview"];
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
  const [concepts, setConcepts] = useState<StoryConcept[]>(saved?.concepts ?? []);
  const [selectedConceptId, setSelectedConceptId] = useState(saved?.selectedConceptId ?? "");
  const [generatingConcepts, setGeneratingConcepts] = useState(false);
  const [selectingConcept, setSelectingConcept] = useState(false);
  const [conceptAttempts, setConceptAttempts] = useState(saved?.concepts ? 1 : 0);
  const [fallbackIdeas, setFallbackIdeas] = useState(saved?.concepts?.some((concept) => concept.source === "fallback") ?? false);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const child = name.trim();
  const draft: CreationDraft = { childName: child, age, world, favourites, detail: detail.trim(), dedication: dedication.trim() };
  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId);

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
    if (!open || !project || story) return;
    let current = true;
    setRestoring(true);
    void loadStoryProject(project).then((snapshot) => {
      if (!current) return;
      setProject((value) => value ? { ...value, revisionId: snapshot.revisionId, entitlement: snapshot.entitlement } : value);
      if (snapshot.story) {
        setStory(snapshot.story);
        setStarted(true);
        setStep(4);
      } else if (snapshot.jobKind === "STORY_PREVIEW" && snapshot.jobStatus === "RUNNING") {
        setStarted(true);
        setStep(4);
      }
      if (snapshot.concepts) setConcepts(snapshot.concepts);
      if (snapshot.selectedConceptId) setSelectedConceptId(snapshot.selectedConceptId);
    }).catch(() => {
      // The local draft remains usable if the status service is temporarily unavailable.
    }).finally(() => { if (current) setRestoring(false); });
    return () => { current = false; };
  }, [open, project?.projectId, story]);
  useEffect(() => {
    if (typeof window !== "undefined") saveCreation(window.localStorage, { draft, ...(story ? { story } : {}), ...(project ? { project } : {}), ...(concepts.length === 3 ? { concepts } : {}), ...(selectedConceptId ? { selectedConceptId } : {}) });
  }, [name, age, world, favourites, detail, dedication, story, project, concepts, selectedConceptId]);

  function revise() {
    setStory(undefined);
    setProject(undefined);
    setConcepts([]);
    setSelectedConceptId("");
    setConceptAttempts(0);
    setFallbackIdeas(false);
    setStarted(false);
    setError("");
  }

  async function writeStory() {
    setGenerating(true);
    setError("");
    try {
      const credential = project ?? await createStoryProject(draft);
      if (!project) setProject(credential);
      if (!selectedConcept) throw new Error("Choose a story idea before writing the preview.");
      setStory(await generateStoryPreview(draft, credential, selectedConcept));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The story studio could not be reached. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function findStoryIdeas() {
    setGeneratingConcepts(true);
    setError("");
    try {
      const credential = project ?? await createStoryProject(draft);
      if (!project) setProject(credential);
      const result = await generateStoryConcepts(draft, credential);
      setConcepts(result.concepts);
      setSelectedConceptId("");
      setFallbackIdeas(result.servedFromFallback);
      setConceptAttempts((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't find story ideas just now. Please try again.");
    } finally {
      setGeneratingConcepts(false);
    }
  }

  async function chooseStoryIdea() {
    if (!project || !selectedConceptId) return;
    setSelectingConcept(true);
    setError("");
    try {
      await selectStoryConcept(project, selectedConceptId);
      setStep(4);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your story choice could not be saved.");
    } finally {
      setSelectingConcept(false);
    }
  }

  function advance(event: FormEvent) {
    event.preventDefault();
    if (step === 0 && (!child || !age)) {
      setError("Add their name and age to continue.");
      return;
    }
    setError("");
    if (step === 2) {
      setStep(3);
      void findStoryIdeas();
      return;
    }
    setStep(Math.min(4, step + 1));
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
            <p className="flo-kicker">Step {step + 1} of 5</p>
            <h2 ref={heading} tabIndex={-1}>{["Who’s the story for?", `A world for ${child}`, "The little things that matter", `Three ideas for ${child}`, started ? "Their story starts here" : "A little look at their book"][step]}</h2>
            <p className="flo-create-intro">{["Every adventure begins with someone special.", "Choose a starting point for their adventure.", "A favourite thing or a few words from you. Everything here is optional.", "Choose the adventure you’d most like to read together.", "Here’s how their personalised hardcover will take shape."][step]}</p>
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
            {step === 3 && <section className="flo-concepts" aria-label="Story ideas">
              {generatingConcepts && <div className="flo-create-generating" role="status"><span aria-hidden="true" /><div><strong>Dreaming up three story ideas…</strong><small>We’re keeping each one age-appropriate, distinct and grounded in the details you shared.</small></div></div>}
              {!generatingConcepts && concepts.length === 0 && <div className="flo-concepts-empty"><span aria-hidden="true">✦</span><h3>Ready to find their adventure?</h3><p>We’ll create three short ideas first, so you can choose the direction before the story is written.</p></div>}
              {fallbackIdeas && concepts.length > 0 && <p className="flo-create-confirmation" role="status">The story studio was busy, so we’ve opened three carefully written starter ideas. You can use any of them now.</p>}
              {concepts.length > 0 && <div className="flo-concept-grid">{concepts.map((concept) => <label className="flo-concept-card" key={concept.id}>
                <input type="radio" name="story-concept" value={concept.id} checked={selectedConceptId === concept.id} onChange={() => setSelectedConceptId(concept.id)} />
                <span className="flo-concept-choice" aria-hidden="true">{selectedConceptId === concept.id ? "Chosen" : "Choose"}</span>
                <strong>{concept.title}</strong><p>{concept.pitch}</p>
                <small><span>{concept.tone}</span><span>Ages {concept.readingLevel}</span><span>A story about {concept.emotionalGoal}</span></small>
              </label>)}</div>}
              {concepts.length > 0 && conceptAttempts < 3 && <button type="button" className="flo-btn flo-btn-ghost flo-concepts-again" disabled={generatingConcepts} onClick={() => void findStoryIdeas()}>Different ideas</button>}
              {conceptAttempts >= 3 && <p className="flo-create-hint">Choose the closest idea for now. You’ll still be able to adjust individual pages later.</p>}
            </section>}
            {step === 4 && <>
              <div className="flo-create-preview">
                <div className="flo-create-cover"><span>Made for {child}</span><div className="flo-create-placeholder" role="img" aria-label={`${world} cover artwork for ${child}`}><span aria-hidden="true">✧</span><small>{world} artwork</small></div><h3>{selectedConcept?.title ?? world}</h3><p>A story for {child}</p></div>
                <div className="flo-create-summary"><h3>Their book, at a glance</h3><dl><dt>For</dt><dd>{child} · age {age}</dd><dt>Chosen story</dt><dd>{selectedConcept?.title ?? "Story idea ready"}</dd><dt>Story world</dt><dd>{world}</dd>{favourites.length > 0 && <><dt>Favourite things</dt><dd>{favourites.join(", ")}</dd></>}{detail.trim() && <><dt>A personal detail</dt><dd>{detail}</dd></>}{dedication.trim() && <><dt>Dedication</dt><dd className="flo-create-dedication">{dedication}</dd></>}</dl><p className="flo-create-hint">You can go back and change any detail before adding the hardcover to your basket.</p></div>
              </div>
              {restoring && <p className="flo-create-confirmation" role="status">Restoring your saved story…</p>}
              {started && !story && !restoring && <p className="flo-create-confirmation" role="status">The details are ready. We’ll now write a six-page story preview for you to review before checkout.</p>}
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
            <button type="button" className="flo-btn flo-btn-ghost" disabled={generating || generatingConcepts || selectingConcept || restoring} onClick={() => { if (step === 0) onClose(); else { setStep(step - 1); setStarted(false); } }}>{step === 0 ? "Back to the studio" : "← Back"}</button>
            {step < 3 ? <button className="flo-btn flo-btn-primary" type="submit">{step === 2 ? "Find story ideas" : "Continue"} →</button> : step === 3 ? <button type="button" className="flo-btn flo-btn-primary" onClick={() => concepts.length === 0 ? void findStoryIdeas() : void chooseStoryIdea()} disabled={generatingConcepts || selectingConcept || (concepts.length > 0 && !selectedConceptId)}>{generatingConcepts ? "Finding ideas…" : selectingConcept ? "Saving your choice…" : concepts.length === 0 ? "Find three story ideas" : "Start with this story"}</button> : <button type="button" className="flo-btn flo-btn-primary" onClick={() => {
              if (!started) { setStarted(true); return; }
              if (!story) { void writeStory(); return; }
              onAddToBasket(draft);
            }} disabled={generating || restoring}>{restoring ? "Restoring story…" : generating ? "Writing story…" : story ? "Add hardcover to basket · £29.20" : started ? "Write story preview" : "Keep this book"}</button>}
          </footer>
        </form>
      </div>
    </dialog>
  );
}

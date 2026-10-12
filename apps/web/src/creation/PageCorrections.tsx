import { useState } from "react";
import { pageCorrectionState, changeStoryPage, undoStoryPage, type PageCorrectionJob, type StoryProjectCredential } from "./story-preview";

export default function PageCorrections({ project, pageNumber, text, jobs, refresh }: {
  project: StoryProjectCredential; pageNumber: number; text: string; jobs: PageCorrectionJob[]; refresh: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [words, setWords] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { lastJob: last, undoJob, running: jobRunning, remaining } = pageCorrectionState(jobs, pageNumber, text);
  const running = busy || jobRunning;

  async function change(intent: PageCorrectionJob["intent"], retry?: PageCorrectionJob) {
    setBusy(true); setError("");
    try {
      await changeStoryPage(project, { pageNumber, intent, idempotencyKey: retry?.idempotencyKey ?? crypto.randomUUID(),
        ...(intent === "EDIT_TEXT" ? { words: retry?.words ?? words } : {}) });
      setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your original words are safe. Try again."); }
    finally { await refresh().catch(() => setError("Your words are saved safely. We couldn't refresh the page just now.")); setBusy(false); }
  }

  async function undo() {
    if (!undoJob) return;
    setBusy(true); setError("");
    try { await undoStoryPage(project, undoJob.idempotencyKey); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn't restore the original words just now."); }
    finally { setBusy(false); }
  }

  return <section className="flo-page-corrections" aria-label={`Change page ${pageNumber}`}>
    <button type="button" className="flo-btn flo-btn-ghost" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Something wrong?</button>
    {running && <p role="status">Changing page {pageNumber}… Your current words stay safe until the change is ready.</p>}
    {expanded && <>
      <p>Only these words will change. The artwork and every other page stay as they are.</p>
      <p>{remaining} of 2 included changes left. Undo does not restore the allowance.</p>
      <div className="flo-page-correction-actions">
        <button type="button" disabled={running || remaining === 0} onClick={() => void change("SHORTER")}>Shorter</button>
        <button type="button" disabled={running || remaining === 0} onClick={() => void change("GENTLER")}>Gentler</button>
        <button type="button" disabled={running || remaining === 0} onClick={() => { setWords(text); setEditing(true); }}>Change the words</button>
      </div>
      {editing && <label>Page {pageNumber} words<textarea value={words} rows={5} maxLength={700} onChange={(event) => setWords(event.target.value)} /><small>Keep the personal facts you shared. We check them before saving.</small><button type="button" disabled={running || !words.trim()} onClick={() => void change("EDIT_TEXT")}>Save these words</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></label>}
      {undoJob && <button type="button" disabled={running} onClick={() => void undo()}>Undo this change</button>}
      {last?.status === "FAILED" && <div><p>Your original page and the rest of your book are safe.</p>{last.canRetry && <button type="button" disabled={running} onClick={() => void change(last.intent, last)}>Try again</button>}<button type="button" onClick={() => { setExpanded(false); setError(""); }}>Keep the old words</button></div>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

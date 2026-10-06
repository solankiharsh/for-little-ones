import { readEdits, writeEdits } from "./edit-storage";
import type { StoryProjectCredential } from "../creation/story-preview";
import IllustrationEditor from "./IllustrationEditor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@astryxdesign/core/Badge";
import type { Book, ChildProfile, PrintSpec } from "@for-little-ones/domain";
import { validateGeometry } from "@for-little-ones/domain";
import { PageSpread, type PreviewArtworkByPage } from "./PageSpread";
import { pageLayout, spreadPages, type PageLayout } from "./page-geometry";

export interface BookReaderProps {
  book?: Book;
  project?: StoryProjectCredential;
  child?: ChildProfile;
  printSpec?: PrintSpec;
  onExit?: () => void;
  artworkByPage?: PreviewArtworkByPage;
  lockedPageNumbers?: readonly number[];
  watermarked?: boolean;
  showPrintInfo?: boolean;
}

export default function BookReader({
  book: maybeBook,
  project,
  printSpec: maybeSpec,
  onExit,
  artworkByPage,
  lockedPageNumbers,
  watermarked = false,
  showPrintInfo = true,
}: BookReaderProps) {
  const reduced = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(typeof window === "undefined" ? 1000 : window.innerWidth - 80);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const singlePage = width < 620;
  const [idx, setIdx] = useState(0);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [edits, setEdits] = useState<PreviewArtworkByPage>({});
  const [editMessage, setEditMessage] = useState("");
  const editKey = project ? `${project.projectId}:${project.revisionId}` : `catalogue:${maybeBook?.metadata.title ?? "sample"}`;
  useEffect(() => {
    let active = true; setEdits({});
    readEdits(editKey).then((value) => { if (active) setEdits(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [editKey]);
  async function acceptEdits(next: PreviewArtworkByPage) {
    try { await writeEdits(editKey, next); setEdits(next); setEditingPage(null); setEditMessage("Saved on this device. Your original illustrations are still available."); }
    catch (error) { setEditMessage("Your edit could not be saved on this device. Please try again."); throw error; }
  }
  const [dir, setDir] = useState<1 | -1>(1);

  const spreads = useMemo(() => (maybeBook ? singlePage ? maybeBook.pages.map((page) => ({ key: `page-${page.pageNumber}`, pages: [page] })) : spreadPages(maybeBook.pages) : []), [maybeBook, singlePage]);
  useEffect(() => { setIdx((current) => Math.min(current, Math.max(0, spreads.length - 1))); }, [spreads.length]);
  const layout: PageLayout | null = useMemo(() => {
    if (!maybeSpec || typeof window === "undefined") return null;
    // The preview modal is capped at 1180px, so calculate width per page from
    // its content area rather than letting a full spread overflow the frame.
    const modalContentWidth = Math.max(240, width - 32);
    return pageLayout(maybeSpec, Math.min(650, Math.max(360, window.innerHeight * 0.7)), Math.floor(modalContentWidth / (singlePage ? 1 : 2)));
  }, [maybeSpec, width, singlePage]);
  const geometry = useMemo(() => {
    if (!maybeSpec) return null;
    return validateGeometry(maybeSpec, maybeBook ? { pageCount: maybeBook.pages.length } : {});
  }, [maybeSpec, maybeBook]);

  const clamp = useCallback((n: number) => Math.max(0, Math.min(n, spreads.length - 1)), [spreads.length]);
  const go = useCallback((d: number) => {
    setIdx((cur) => {
      const next = clamp(cur + d);
      if (next !== cur) setDir(d > 0 ? 1 : -1);
      return next;
    });
  }, [clamp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (document.querySelector(".flo-illustration-editor[open]")) return;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Escape" && onExit) { onExit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onExit]);

  if (!maybeBook || !layout || spreads.length === 0) {
    return <div className="flo-reader-empty"><Badge label="Waiting for a book" /></div>;
  }

  const current = spreads[Math.min(idx, spreads.length - 1)];
  if (!current) return null;
  const specOk = geometry?.ok === true;

  return (
    <div className="flo-reader" ref={container}>
      <header className="flo-reader-head">
        <Badge label={`${singlePage ? "Page" : "Spread"} ${Math.min(idx + 1, spreads.length)} of ${spreads.length}`} />
        {watermarked && <Badge variant="neutral" label="Personalised preview" />}
        {showPrintInfo && <>
          <Badge variant={specOk ? "success" : "warning"} label={specOk ? "Print spec valid" : "Check print spec"} />
          <Badge variant="neutral" label={`${layout.pageWidthPx.toFixed(0)} × ${layout.pageHeightPx.toFixed(0)} px`} />
        </>}
        {onExit && <button type="button" className="flo-reader-exit" onClick={onExit}>Close</button>}
      </header>

      <div className="flo-reader-stage" style={{ perspective: 1800 }}>
      <AnimatePresence initial={false} custom={dir} mode="sync">
        <motion.div
          key={idx}
          custom={dir}
          className="flo-page-turn"
          style={{ transformOrigin: dir > 0 ? "left center" : "right center" }}
          initial={reduced ? { opacity: 0 } : { opacity: 0.35, rotateY: dir > 0 ? 76 : -76, x: dir * 20 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0.18, rotateY: dir > 0 ? -88 : 88, x: -dir * 32 }}
          transition={{ duration: reduced ? 0.15 : 0.56, ease: [0.32, 0.72, 0, 1] }}
        >
          <PageSpread
            pages={current.pages}
            layout={layout}
            {...(artworkByPage ? { artworkByPage: { ...artworkByPage, ...edits }, onEdit: (page: number) => setEditingPage(page) } : {})}
            {...(lockedPageNumbers ? { lockedPageNumbers } : {})}
            watermarked={watermarked}
          />
        </motion.div>
      </AnimatePresence>
      </div>

      {editingPage !== null && (edits[editingPage] ?? artworkByPage?.[editingPage]) && <IllustrationEditor {...(project ? { project } : {})} artwork={(edits[editingPage] ?? artworkByPage?.[editingPage])!} onClose={() => setEditingPage(null)} onAccept={(artwork) => { return acceptEdits({ ...edits, [editingPage]: artwork }); }} />}
      {Object.keys(edits).length > 0 && <p className="flo-reader-edit-status" role="status">Your edited preview is saved on this device. <button type="button" onClick={() => void acceptEdits({}).catch(() => undefined)}>Restore original illustrations</button></p>}
      {editMessage && <p className="flo-reader-edit-status" role="status">{editMessage}</p>}
      <footer className="flo-reader-foot">
        <button type="button" disabled={idx === 0} onClick={() => go(-1)}>← Prev</button>
        <button type="button" disabled={idx === spreads.length - 1} onClick={() => go(1)}>Next →</button>
      </footer>
    </div>
  );
}

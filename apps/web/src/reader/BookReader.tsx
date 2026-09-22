import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@astryxdesign/core/Badge";
import type { Book, ChildProfile, PrintSpec } from "@for-little-ones/domain";
import { validateGeometry } from "@for-little-ones/domain";
import { PageSpread } from "./PageSpread";
import { pageLayout, spreadPages, type PageLayout } from "./page-geometry";

export interface BookReaderProps {
  book?: Book;
  child?: ChildProfile;
  printSpec?: PrintSpec;
  onExit?: () => void;
}

export default function BookReader({
  book: maybeBook,
  printSpec: maybeSpec,
  onExit,
}: BookReaderProps) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const spreads = useMemo(() => (maybeBook ? spreadPages(maybeBook.pages) : []), [maybeBook]);
  const layout: PageLayout | null = useMemo(() => {
    if (!maybeSpec || typeof window === "undefined") return null;
    // The preview modal is capped at 1180px, so calculate width per page from
    // its content area rather than letting a full spread overflow the frame.
    const modalContentWidth = Math.min(1180, window.innerWidth - 48) - 42;
    return pageLayout(maybeSpec, Math.round(window.innerHeight * 0.62), Math.floor(modalContentWidth / 2));
  }, [maybeSpec]);
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

  const current = spreads[idx];
  if (!current) return null;
  const specOk = geometry?.ok === true;

  return (
    <div className="flo-reader">
      <header className="flo-reader-head">
        <Badge label={`Spread ${idx + 1} of ${spreads.length}`} />
        <Badge variant={specOk ? "success" : "warning"} label={specOk ? "Print spec valid" : "Check print spec"} />
        <Badge variant="neutral" label={`${layout.pageWidthPx.toFixed(0)} × ${layout.pageHeightPx.toFixed(0)} px`} />
        <button type="button" className="flo-reader-exit" onClick={onExit}>Close</button>
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
          <PageSpread pages={current.pages} layout={layout} />
        </motion.div>
      </AnimatePresence>
      </div>

      <footer className="flo-reader-foot">
        <button type="button" disabled={idx === 0} onClick={() => go(-1)}>← Prev</button>
        <button type="button" disabled={idx === spreads.length - 1} onClick={() => go(1)}>Next →</button>
      </footer>
    </div>
  );
}

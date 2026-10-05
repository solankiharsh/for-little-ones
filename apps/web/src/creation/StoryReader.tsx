import { useState } from "react";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { initialPageIndex, readerPages, type ReaderPage } from "./story-reader";

type ReaderTab = "cover" | "dedication" | "story";

/** Real artwork for marketing/sample mode. Absent in production flow (placeholders stay). */
export interface ReaderArtwork {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Tabbed book reader (F-011 v0): Cover / Dedication / Story tabs with
 * page-by-page story navigation and a thumbnail rail. Replaces the long
 * scrolling page list so the preview reads like a book, including on a phone.
 *
 * Lock copy is identical to the previous list rendering — only the layout
 * changed. The teaser contract (D025) is enforced by `readerPages`, never here.
 */
export default function StoryReader({
  story,
  childName,
  world,
  dedication,
  visiblePages,
  artwork
}: {
  story: StoryPreviewResult;
  childName: string;
  world: string;
  dedication: string;
  visiblePages: "ALL" | number;
  /** Marketing/sample mode only: real cover + per-page spread art. */
  artwork?: {
    cover?: ReaderArtwork;
    spreadForPage?: (pageNumber: number) => ReaderArtwork | undefined;
  };
}) {
  const pages = readerPages(story, visiblePages);
  const hasDedication = dedication.trim().length > 0;
  const [tab, setTab] = useState<ReaderTab>("cover");
  const [pageIndex, setPageIndex] = useState(() => initialPageIndex(pages));
  const page = pages[Math.min(pageIndex, pages.length - 1)]!;

  function openTab(next: ReaderTab) {
    setTab(next);
    if (next === "story") setPageIndex((value) => Math.min(value, pages.length - 1));
  }

  return (
    <section className="flo-story-preview" aria-label="Generated story preview">
      <div className="flo-story-preview-head"><p className="flo-kicker">Story preview</p><h3>{story.title}</h3><p>{story.synopsis}</p></div>
      <div className="flo-reader-tabs" role="tablist" aria-label="Book sections">
        <button type="button" role="tab" aria-selected={tab === "cover"} aria-controls="flo-reader-panel" onClick={() => openTab("cover")}>Cover</button>
        {hasDedication && <button type="button" role="tab" aria-selected={tab === "dedication"} aria-controls="flo-reader-panel" onClick={() => openTab("dedication")}>Dedication</button>}
        <button type="button" role="tab" aria-selected={tab === "story"} aria-controls="flo-reader-panel" onClick={() => openTab("story")}>Story</button>
      </div>
      <div id="flo-reader-panel" role="tabpanel" aria-live="polite">
        {tab === "cover" && (artwork?.cover ? (
          <figure className="flo-reader-cover-art">
            <img src={artwork.cover.src} width={artwork.cover.width} height={artwork.cover.height} alt={artwork.cover.alt} loading="lazy" decoding="async" />
            <figcaption><span>Made for {childName}</span><strong>{story.title}</strong></figcaption>
          </figure>
        ) : (
          <div className="flo-create-cover"><span>Made for {childName}</span><div className="flo-create-placeholder" role="img" aria-label={`${world} cover artwork for ${childName}`}><span aria-hidden="true">✧</span><small>{world} artwork</small></div><h3>{story.title}</h3><p>A story for {childName}</p></div>
        ))}
        {tab === "dedication" && hasDedication && <div className="flo-reader-dedication"><p className="flo-kicker">For {childName}</p><p className="flo-create-dedication">{dedication}</p></div>}
        {tab === "story" && (
          <div className="flo-reader-story">
            <ol className="flo-reader-rail" aria-label="Pages">
              {pages.map((candidate, index) => (
                <li key={candidate.pageNumber}>
                  <button
                    type="button"
                    aria-label={candidate.mode === "locked" ? `Page ${candidate.pageNumber}, locked` : `Page ${candidate.pageNumber}`}
                    aria-current={index === pageIndex ? "page" : undefined}
                    disabled={candidate.mode === "locked"}
                    onClick={() => setPageIndex(index)}
                  >{candidate.mode === "locked" ? "🔒" : candidate.pageNumber}</button>
                </li>
              ))}
            </ol>
            <ReaderPageView page={page} art={artwork?.spreadForPage?.(page.pageNumber)} />
            <div className="flo-reader-nav">
              <button type="button" className="flo-btn flo-btn-ghost" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>← Previous</button>
              <span aria-hidden="true">Page {page.pageNumber} of {pages.length}</span>
              <button
                type="button"
                className="flo-btn flo-btn-ghost"
                disabled={pageIndex >= pages.length - 1 || pages[pageIndex + 1]?.mode === "locked"}
                onClick={() => setPageIndex((value) => Math.min(pages.length - 1, value + 1))}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReaderPageView({ page, art }: { page: ReaderPage; art?: ReaderArtwork | undefined }) {
  const unlocked = page.mode !== "locked";
  return (
    <div className={unlocked ? "flo-reader-page" : "flo-reader-page flo-story-page-locked"}>
      {unlocked && art ? (
        <img className="flo-reader-spread" src={art.src} width={art.width} height={art.height} alt={art.alt} loading="lazy" decoding="async" />
      ) : (
        <div className="flo-story-art-placeholder" role="img" aria-label={unlocked ? `Artwork placeholder for page ${page.pageNumber}` : `Locked artwork for page ${page.pageNumber}`}><span>{unlocked ? `Page ${page.pageNumber}` : "Locked"}</span><small>{unlocked ? "Illustration artwork comes next" : "Unlocks after payment"}</small></div>
      )}
      <div><strong>Page {page.pageNumber}</strong>
        {page.mode === "full" && <><p>{page.text}</p><small>{page.illustrationCue}</small></>}
        {page.mode === "excerpt" && <><p className="flo-story-excerpt">{page.text}</p><small>Continue with the finished book</small></>}
        {page.mode === "locked" && <><p>Story page ready</p><small>Full text and finished artwork unlock after payment.</small></>}
      </div>
    </div>
  );
}

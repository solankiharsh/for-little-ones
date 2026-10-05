import type { CSSProperties } from "react";
import type { Page } from "@for-little-ones/domain";
import type { PageLayout } from "./page-geometry";
import { Scene, toneForPage } from "./Scene";

export interface PreviewArtwork {
  src: string;
  alt: string;
}

export type PreviewArtworkByPage = Record<number, PreviewArtwork>;

function isCover(p: Page) {
  return p.pageNumber === 1;
}
function isDedication(p: Page) {
  return p.pageNumber === 2;
}

function Blocks({ blocks, onCover }: { blocks: Page["textBlocks"]; onCover: boolean }) {
  return (
    <>
      {blocks.map((b) => {
        if (b.kind === "cover-title") {
          return (
            <span key={b.id} className="flo-cover-title">
              {b.text}
            </span>
          );
        }
        if (b.kind === "caption") {
          return (
            <span key={b.id} className="flo-block-caption" style={onCover ? { color: "rgba(253,244,227,0.82)" } : undefined}>
              {b.text}
            </span>
          );
        }
        if (b.kind === "title") {
          return (
            <span key={b.id} className="flo-block-title">
              {b.text}
            </span>
          );
        }
        return (
          <span key={b.id} className="flo-block-body">
            {b.text}
          </span>
        );
      })}
    </>
  );
}

export function PageSpread({
  pages,
  layout,
  artworkByPage,
  lockedPageNumbers,
  watermarked = false,
}: {
  pages: Page[];
  layout: PageLayout;
  artworkByPage?: PreviewArtworkByPage;
  lockedPageNumbers?: readonly number[];
  watermarked?: boolean;
}) {
  const spreadWidth = pages.length * layout.pageWidthPx;
  const spreadStyle = {
    width: spreadWidth,
    height: layout.pageHeightPx,
    ...({ "--flo-mm": `${layout.pxPerMm}px` } as CSSProperties),
  };
  return (
    <div className="flo-spread" role="group" aria-label={`Pages ${pages.map((p) => p.pageNumber).join(" and ")}`} style={spreadStyle}>
      <div className="flo-spread-back" />
      <div className="flo-spread-gutter" />
      {pages.map((p, i) => {
        const cover = isCover(p);
        const dedication = isDedication(p);
        const locked = lockedPageNumbers?.includes(p.pageNumber) ?? false;
        const artwork = artworkByPage?.[p.pageNumber];
        return (
          <div
            key={p.pageNumber}
            className={`flo-page ${i === 0 ? "flo-page-left" : ""} ${i === pages.length - 1 ? "flo-page-right" : ""} ${cover ? "flo-cover-page" : ""} ${dedication ? "flo-dedication-page" : ""}`}
            style={{ width: layout.pageWidthPx, height: layout.pageHeightPx, boxSizing: "border-box" }}
          >
            <div className="flo-page-inner" style={{ padding: layout.safePaddingPx }}>
              {locked ? (
                <div className="flo-preview-locked" role="group" aria-label={`Page ${p.pageNumber} is available after checkout`}>
                  <span aria-hidden="true">✦</span>
                  <strong>The story continues</strong>
                  <small>Unlock the complete book after checkout</small>
                </div>
              ) : cover ? (
                <div className="flo-cover" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  {artwork ? <PreviewImage artwork={artwork} watermarked={watermarked} /> : <div className="flo-moon" style={{ width: 72, height: 72, marginBottom: 16 }} />}
                  <Blocks blocks={p.textBlocks} onCover />
                </div>
              ) : dedication ? (
                <div className="flo-dedication" style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", height: "100%" }}>
                  <Blocks blocks={p.textBlocks} onCover={false} />
                </div>
              ) : (
                <>
                  <div className="flo-text" style={{ flex: "1 1 auto" }}>
                    <Blocks blocks={p.textBlocks} onCover={false} />
                  </div>
                  <div className="flo-scene" style={{ marginTop: 12 }}>
                    {artwork ? <PreviewImage artwork={artwork} watermarked={watermarked} /> : <Scene tone={toneForPage(p.pageNumber)} pageNumber={p.pageNumber} />}
                  </div>
                </>
              )}
            </div>
            <div className="flo-page-num">{p.pageNumber}</div>
          </div>
        );
      })}
    </div>
  );
}

function PreviewImage({ artwork, watermarked }: { artwork: PreviewArtwork; watermarked: boolean }) {
  return (
    <div className={`flo-preview-image${watermarked ? " flo-preview-image-watermarked" : ""}`}>
      <img src={artwork.src} alt={artwork.alt} />
      {watermarked && <span aria-hidden="true">SAMPLE PREVIEW</span>}
    </div>
  );
}

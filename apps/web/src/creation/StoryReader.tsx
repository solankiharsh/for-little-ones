import type { StoryProjectCredential } from "./story-preview";
import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { samplePrintSpec } from "../data/sample-book";
import BookReader from "../reader/BookReader";
import type { StoryAsset } from "../story/assets";
import { sampleForWorld } from "../story/samples";
import { previewBook, readerPages } from "./story-reader";

/** The creation teaser uses the same physical-book reader as the homepage sample. */
export default function StoryReader({
  story,
  childName,
  world,
  dedication,
  visiblePages,
  artwork,
  artworkNote,
  generatedImages = false,
  project,
}: {
  story: StoryPreviewResult;
  childName: string;
  world: string;
  dedication: string;
  visiblePages: "ALL" | number;
  artwork?: { cover?: StoryAsset; spreadForPage?: (pageNumber: number) => StoryAsset | undefined };
  artworkNote?: string;
  generatedImages?: boolean;
  project?: StoryProjectCredential;
}) {
  const pages = readerPages(story, visiblePages);
  const book = previewBook(story, childName, dedication, pages);
  const catalogueLayout = artwork !== undefined && visiblePages === "ALL" && !project;
  if (catalogueLayout) {
    // A picture-book spread pairs one uninterrupted illustration with its story text.
    book.pages = book.pages.map((page, index) => {
      if (index < 2) return page;
      if (index % 2 === 0) return { ...page, textBlocks: [] };
      const previous = pages[index - 3];
      const current = pages[index - 2];
      const { illustration: _illustration, ...textPage } = page;
      return { ...textPage, textBlocks: [{ id: `spread-text-${index}`, kind: "body", text: [previous?.text, current?.text].filter(Boolean).join("\n\n") }] };
    });
  }
  const sample = sampleForWorld(world);
  const artworkByPage: Record<number, { src: string; alt: string }> = {
    1: artwork?.cover ?? sample.cover,
  };
  for (const page of pages) {
    if (page.mode === "locked") continue;
    if (catalogueLayout && page.pageNumber % 2 === 0) continue;
    artworkByPage[page.pageNumber + 2] = artwork?.spreadForPage?.(catalogueLayout ? Math.ceil(page.pageNumber / 2) : page.pageNumber) ?? sample.art[(Math.ceil(page.pageNumber / 2) - 1) % sample.art.length]!;
  }
  const lockedPageNumbers = pages
    .filter((page) => page.mode === "locked")
    .map((page) => page.pageNumber + 2);

  return (
    <section className="flo-story-preview" aria-label="Generated story preview">
      <div className="flo-story-preview-head">
        <p className="flo-kicker">A preview made for {childName}</p>
        <h3>{story.title}</h3>
        <p>{story.synopsis}</p>
        <p className="flo-create-hint">{artworkNote ?? "Turn the pages to read the opening. The pictures show the chosen story world; they are sample artwork, not personalised illustrations."}</p>
      </div>
      <BookReader
        key={`${story.title}:${childName}`}
        book={book}
        {...(project ? { project } : {})}
        printSpec={samplePrintSpec}
        artworkByPage={artworkByPage}
        lockedPageNumbers={lockedPageNumbers}
        watermarked={generatedImages}
        showPrintInfo={false}
      />
    </section>
  );
}

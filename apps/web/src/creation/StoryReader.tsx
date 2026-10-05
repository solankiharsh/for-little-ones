import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { samplePrintSpec } from "../data/sample-book";
import BookReader from "../reader/BookReader";
import { ASSETS, type StoryAsset } from "../story/assets";
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
}: {
  story: StoryPreviewResult;
  childName: string;
  world: string;
  dedication: string;
  visiblePages: "ALL" | number;
  artwork?: { cover?: StoryAsset; spreadForPage?: (pageNumber: number) => StoryAsset | undefined };
  artworkNote?: string;
}) {
  const pages = readerPages(story, visiblePages);
  const book = previewBook(story, childName, dedication, pages);
  const normalizedWorld = world.toLowerCase();
  const selectedWorld = normalizedWorld.includes("garden")
    ? ASSETS.worldGarden
    : normalizedWorld.includes("lighthouse") || normalizedWorld.includes("sea")
      ? ASSETS.worldLighthouse
      : normalizedWorld.includes("dinosaur")
        ? ASSETS.worldDinosaurs
        : normalizedWorld.includes("star") || normalizedWorld.includes("space")
          ? ASSETS.worldSpace
          : ASSETS.worldMoon;
  const artworkByPage: Record<number, { src: string; alt: string }> = {
    1: artwork?.cover ?? selectedWorld,
  };
  for (const page of pages) {
    if (page.mode === "locked") continue;
    artworkByPage[page.pageNumber + 2] = artwork?.spreadForPage?.(page.pageNumber) ?? selectedWorld;
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
        <p className="flo-create-hint">{artworkNote ?? "Turn the pages to read the opening. The watermarked pictures are sample world artwork, not illustrations made for this story."}</p>
      </div>
      <BookReader
        key={`${story.title}:${childName}`}
        book={book}
        printSpec={samplePrintSpec}
        artworkByPage={artworkByPage}
        lockedPageNumbers={lockedPageNumbers}
        watermarked
        showPrintInfo={false}
      />
    </section>
  );
}

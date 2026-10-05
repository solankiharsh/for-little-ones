import type { StoryPreviewResult } from "@for-little-ones/contracts";
import { samplePrintSpec } from "../data/sample-book";
import BookReader from "../reader/BookReader";
import { ASSETS } from "../story/assets";
import { previewBook, readerPages } from "./story-reader";

/** The creation teaser uses the same physical-book reader as the homepage sample. */
export default function StoryReader({
  story,
  childName,
  world,
  dedication,
  visiblePages,
}: {
  story: StoryPreviewResult;
  childName: string;
  world: string;
  dedication: string;
  visiblePages: "ALL" | number;
}) {
  const pages = readerPages(story, visiblePages);
  const book = previewBook(story, childName, dedication, pages);
  const selectedWorld = world === "Small adventures"
    ? ASSETS.worldGarden
    : world === "Big imagination"
      ? ASSETS.worldLighthouse
      : ASSETS.worldMoon;
  const artworkByPage = {
    1: selectedWorld,
    3: selectedWorld,
  };
  const lockedPageNumbers = pages
    .filter((page) => page.mode === "locked")
    .map((page) => page.pageNumber + 2);

  return (
    <section className="flo-story-preview" aria-label="Generated story preview">
      <div className="flo-story-preview-head">
        <p className="flo-kicker">A preview made for {childName}</p>
        <h3>{story.title}</h3>
        <p>{story.synopsis}</p>
        <p className="flo-create-hint">Turn the pages to read the opening. Sample world artwork is watermarked; your finished illustrations come with the complete book.</p>
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

import { useMemo } from "react";
import StoryReader from "../creation/StoryReader";
import StoryImage from "./StoryImage";
import { sampleForWorld } from "./samples";
import { usePersonalization } from "./personalization";
import { STORY_WORLDS } from "./Worlds";



export default function Reader() {
  const { heroName, selectedWorld, dedication, mode } = usePersonalization();
  const selected = STORY_WORLDS.find((world) => world.id === selectedWorld);
  const worldTitle = selected?.title ?? "The Little Moon Elephant";
  const aaravSample = mode === "marketing";
  const sample = sampleForWorld(selectedWorld ?? "moon");
  const story = useMemo(() => aaravSample ? sample.story : { ...sample.story, title: sample.story.title.replaceAll(sample.childName, heroName), pages: sample.story.pages.map((page) => ({ ...page, text: page.text.replaceAll(sample.childName, heroName) })) }, [aaravSample, sample.story, sample.childName, heroName]);
  const storyArt = sample.art;

  return (
    <section className="flo-read" aria-label="Read an illustrated sample story" id="story-read">
      <p className="flo-read-sample-note">{aaravSample ? "Catalogue sample · explore the story and its illustrations" : "Illustrated sample · a preview of how their details could shape a story"}</p>
      <figure className="flo-read-spread">
        <StoryImage asset={sample.cover} />
      </figure>
      <StoryReader
        story={story}
        childName={aaravSample ? sample.childName : heroName}
        world={worldTitle}
        dedication={dedication.trim()}
        visiblePages="ALL"
        {...(aaravSample ? { artworkNote: "An illustrated catalogue sample. Create their own to begin a personal story." } : {})}
        artwork={{
          cover: sample.cover,
          spreadForPage: (pageNumber) => storyArt[(pageNumber - 1) % storyArt.length]
        }}
      />
      <figure className="flo-read-spread flo-read-spread-end">
        <StoryImage asset={sample.art.at(-1)!} />
      </figure>
    </section>
  );
}

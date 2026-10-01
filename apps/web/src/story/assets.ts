/**
 * Generated image library — the dominant visual material of the story.
 * Semantic keys only; no scattered paths. All files are WebP conversions of
 * the authored set under `apps/web/public/story/` with explicit dimensions
 * (aspect ratios preserved to avoid CLS).
 */

export interface StoryAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
}

function asset(src: string, width: number, height: number, alt: string): StoryAsset {
  return { src: `/story/${src}`, width, height, alt };
}

export const ASSETS = {
  heroRealityToStory: asset(
    "hero-reality-to-story.webp", 1672, 941,
    "A child stepping out of a giant open book from a lamplit bedroom into a moonlit story world with a fox"
  ),
  heroEnterBook: asset(
    "hero-enter-book.webp", 1672, 941,
    "A child and fox emerging from open book pages into a glowing moonlit valley"
  ),
  characterPhotoDemo: asset(
    "character-photo-demo.webp", 1000, 1250,
    "Demo photograph of a child hugging their personalised moon book"
  ),
  characterIllustratedDemo: asset(
    "character-illustrated-demo.webp", 1000, 1250,
    "Demo storybook portrait of a child and fox on a moonlit hill"
  ),
  characterWorldDemo: asset(
    "character-world-demo.webp", 1600, 900,
    "Demo scene of a child with a fox plush walking a lantern-lit forest path toward a moonlit village"
  ),
  worldMoon: asset(
    "world-moon.webp", 1600, 900,
    "A child and fox standing on giant open book pages overlooking a moonlit village valley"
  ),
  worldGarden: asset(
    "world-garden.webp", 1600, 900,
    "A child opening a lantern-lit garden gate at dusk with a fox"
  ),
  worldLighthouse: asset(
    "world-lighthouse.webp", 1600, 900,
    "A child running toward a lighthouse on a golden cliff above the sea"
  ),
  worldDinosaurs: asset(
    "world-dinosaurs.webp", 1600, 900,
    "A child beside gentle dinosaurs in a green valley"
  ),
  worldSpace: asset(
    "world-space.webp", 1600, 900,
    "A child astronaut and fox floating above the Earth by a moon station"
  ),
  coverMoonFox: asset(
    "cover-moon-fox.webp", 1000, 1250,
    "Hardcover book on a bedside table showing a child and fox under a giant moon"
  ),
  spreadQuiet: asset(
    "spread-quiet.webp", 1536, 1024,
    "A parent and child reading an open illustrated book spread together"
  ),
  spreadAdventure: asset(
    "spread-adventure.webp", 1600, 800,
    "A child hopping across stream stones with a fox under a bright moon"
  ),
  spreadEnding: asset(
    "spread-ending.webp", 1600, 900,
    "A child walking home through a lamplit village under a crescent moon"
  ),
  productHardcover: asset(
    "product-hardcover.webp", 1400, 788,
    "Personalised hardcover book resting on a bedside table in lamplight"
  ),
  productOpenBook: asset(
    "product-open-book.webp", 1600, 900,
    "A child reading a glowing open book as its story world streams off the pages"
  ),
  digitalToPhysical: asset(
    "digital-to-physical.webp", 1600, 900,
    "A child with a fox plush walking a lantern-lit path toward a moonlit village"
  ),
  memoryReadingTogether: asset(
    "memory-reading-together.webp", 1000, 1250,
    "A parent and child reading their personalised book together in bed"
  ),
  memoryPride: asset(
    "memory-pride.webp", 1000, 1250,
    "The story heroine under a giant moon, the child every book is written for"
  ),
  memoryOneMorePage: asset(
    "memory-one-more-page.webp", 1000, 1250,
    "A parent and child sharing one more page before sleep"
  ),
  paperQuiet: asset(
    "paper-quiet.webp", 1600, 900,
    "Soft empty morning landscape in warm paper tones"
  ),
  productFinalNight: asset(
    "product-final-night.webp", 1600, 800,
    "A child asleep in bed beneath a moonlit window with their storybook"
  )
} as const satisfies Record<string, StoryAsset>;

export type StoryAssetKey = keyof typeof ASSETS;

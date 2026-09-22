import type { Book, ChildProfile } from "@for-little-ones/domain";
import type { PrintSpec } from "@for-little-ones/domain";

/**
 * Sample book for the visual prototype. Canonical domain types only (D004,
 * _SPEC_GUIDE §2) — the reader renders this model directly, engine/provider-free.
 * PrintSpec mirrors the Mixam evidence from spike/print-pipeline (hardcover,
 * 210mm art-book square, 3mm bleed, 12mm hardcover-safe margin, 300dpi).
 */
export const sampleChild: ChildProfile = {
  id: "child-mira",
  name: "Mira",
  displayName: "Mira",
  dateOfBirth: "2021-04-12",
  pronouns: "she/her",
  locale: "en",
  interests: ["foxes", "the moon", "toast with honey", "rain on windows"],
  facts: [
    { key: "favorite-animal", value: "foxes", immutable: true },
    { key: "question-at-bedtime", value: "why does the moon follow me?", immutable: true },
    { key: "morning-ritual", value: "counts three moon stones", immutable: false },
  ],
  consent: { grantedAt: "2025-11-30", retentionClass: "default" },
  retentionClass: "default",
};

export const samplePrintSpec: PrintSpec = {
  id: "print-mixam-hardcover-210",
  binding: "hardcover-case",
  sheet: { trimWidthMm: 210, trimHeightMm: 210, bleedMm: 3, safeMarginMm: 12 },
  resolution: { dpiMinimum: 300 },
  pageRange: { minPages: 20, maxPages: 48 },
};

function page(
  pageNumber: number,
  textBlocks: Array<{ id: string; kind: string; text: string }>,
  illustration?: { assetRef: string; planKey: string },
): Book["pages"][number] {
  return {
    pageNumber,
    status: "READY",
    textBlocks,
    ...(illustration ? { illustration } : {}),
    generationMetadata: { attemptCount: 1 },
  };
}

export const sampleBook: Book = {
  id: "book-fox-moon",
  status: "DRAFT",
  metadata: { title: "The Fox Who Lost the Moon", locale: "en" },
  childProfileIds: ["child-mira"],
  characters: [
    {
      id: "char-fox",
      characterId: "char-fox",
      version: "v3",
      name: "Sol",
      styleTokensRef: "tx/fox/sol-v3",
    },
  ],
  relationships: [{ id: "rel-mira-sol", fromChildId: "child-mira", toChildId: "char-fox", kind: "friend" }],
  pages: [
    page(
      1,
      [
        { id: "c1", kind: "cover-title", text: "The Fox Who Lost the Moon" },
        { id: "c2", kind: "caption", text: "a bedtime story for the moon-watchers" },
      ],
      { assetRef: "as/fox-cover", planKey: "cover/moonlit-fox" },
    ),
    page(2, [{ id: "d1", kind: "body", text: "For Mira, who stays up to ask the moon a question every single night." }]),

    page(
      3,
      [
        {
          id: "s1",
          kind: "body",
          text: "One evening, high on Warm Hill, a fox named Sol opened his eyes and found that everything had gone a little too quiet.",
        },
      ],
      { assetRef: "as/sol-01", planKey: "scene/warm-hill-first-light" },
    ),
    page(
      4,
      [
        {
          id: "s2",
          kind: "body",
          text: "Sol looked up. The sky was there — wide and deep and full of small, busy stars. But the moon, his round companion, was missing.",
        },
      ],
      { assetRef: "as/sol-02", planKey: "scene/sky-without-moon" },
    ),
    page(
      5,
      [
        { id: "s3", kind: "body", text: "“Crows,” said Sol. “Did you see her?”" },
        { id: "s4", kind: "body", text: "They tilted their heads and answered in one croak: “She slipped behind the Paper Forest, near the lake of glass.”" },
      ],
      { assetRef: "as/sol-03", planKey: "scene/paper-forest-advice" },
    ),
    page(
      6,
      [
        {
          id: "s5",
          kind: "body",
          text: "So Sol walked. His small paws left prints in the honey-coloured grass, and the prints glowed faintly, as if the night were keeping track of him.",
        },
      ],
      { assetRef: "as/sol-04", planKey: "scene/glowing-grass-trail" },
    ),
    page(
      7,
      [
        { id: "s6", kind: "caption", text: "On the edge of the Paper Forest" },
        {
          id: "s7",
          kind: "body",
          text: "The trees were white and still, folded like paper cut just this morning. A lantern hung from the lowest branch — but the lantern was a jar of fireflies, humming a little tune.",
        },
      ],
      { assetRef: "as/sol-05", planKey: "scene/firefly-lantern" },
    ),
    page(
      8,
      [
        {
          id: "s8",
          kind: "body",
          text: "“Are you looking for the moon?” said the fireflies, all at once. “She passed here, carrying a silver ladder. She said she would be at the lake of glass, folding light for the morning.”",
        },
      ],
      { assetRef: "as/sol-06", planKey: "scene/fireflies-carrying-light" },
    ),
    page(
      9,
      [
        {
          id: "s9",
          kind: "body",
          text: "Sol came to the lake of glass. It was not glass at all — it was water so smooth it kept the whole sky inside it, twice.",
        },
      ],
      { assetRef: "as/sol-07", planKey: "scene/lake-of-glass-two-skies" },
    ),
    page(
      10,
      [
        {
          id: "s10",
          kind: "body",
          text: "And there, kneeling by the shore, was the moon. She had dipped her hands in and was pinching light the way you pinch the edge of a paper star, folding it in, tugging it soft.",
        },
      ],
      { assetRef: "as/sol-08", planKey: "scene/moon-folding-light" },
    ),
    page(
      11,
      [
        { id: "s11", kind: "body", text: "“Why did you leave?” asked Sol, catching his breath." },
        { id: "s12", kind: "body", text: "The moon turned, light spilling through her fingers. “I did not leave, little fox. I remembered something only I can make, and I wanted it to be ready before dawn.”" },
      ],
      { assetRef: "as/sol-09", planKey: "scene/moon-turns" },
    ),
    page(
      12,
      [
        {
          id: "s13",
          kind: "body",
          text: "She showed Sol what she had been folding: a small moon, still warm, the size of a stone you could carry. “Every night I make one for whoever is looking hardest,” she said.",
        },
      ],
      { assetRef: "as/sol-10", planKey: "scene/pocket-moon" },
    ),
    page(
      13,
      [
        {
          id: "s14",
          kind: "body",
          text: "“Is there one for the girl who asks why the moon follows her?” said Sol. The moon smiled — the softest crescent of a smile — and pressed a tiny moon into his paw.",
        },
      ],
      { assetRef: "as/sol-11", planKey: "scene/gift-paw" },
    ),
    page(
      14,
      [
        {
          id: "s15",
          kind: "body",
          text: "Sol ran all the way back across the honey-coloured grass, the small moon warm and humming against his chest. Curious fireflies joined him like a crown of light.",
        },
      ],
      { assetRef: "as/sol-12", planKey: "scene/run-with-firefly-crown" },
    ),
    page(
      15,
      [
        {
          id: "s16",
          kind: "body",
          text: "He climbed to the one window on the tallest house — the window where a small face watches the sky. And through the glass, very quietly, he slipped the moon from his paw.",
        },
      ],
      { assetRef: "as/sol-13", planKey: "scene/window-passing-moon" },
    ),
    page(
      16,
      [
        {
          id: "s17",
          kind: "body",
          text: "The tiny moon rose into the room and stayed there, just above the pillow, breathing a soft silver light like a held breath.",
        },
      ],
      { assetRef: "as/sol-14", planKey: "scene/moon-above-pillow" },
    ),
    page(
      17,
      [
        {
          id: "s18",
          kind: "body",
          text: "When the morning came, a girl who had been about to ask why the moon follows her sat up instead, looked at the small moon on her shelf, and knew the answer with her whole heart.",
        },
      ],
      { assetRef: "as/sol-15", planKey: "scene/morning-shelf-moon" },
    ),
    page(
      18,
      [
        {
          id: "s19",
          kind: "caption",
          text: "The answer she kept",
        },
        {
          id: "s20",
          kind: "body",
          text: "“Because I look hardest,” said Mira, holding the moon stone in both hands. And the moon above the window, hearing it, dipped once — like a bow.",
        },
      ],
      { assetRef: "as/sol-16", planKey: "scene/mira-and-moon-stone" },
    ),
    page(
      19,
      [
        {
          id: "s21",
          kind: "body",
          text: "That night, Sol sat on Warm Hill and the moon hung low, round and full, closer than she had ever been. “You brought her one of me,” said the moon, pleased.",
        },
      ],
      { assetRef: "as/sol-17", planKey: "scene/moon-low-and-close" },
    ),
    page(
      20,
      [
        {
          id: "s22",
          kind: "body",
          text: "“I did,” said Sol. “And she keeps it by her pillow. She says it hums when I am near the hill.” The moon was quiet for a long moment, then she folded herself with care.",
        },
      ],
      { assetRef: "as/sol-18", planKey: "scene/moon-folds-herself" },
    ),
    page(
      21,
      [
        {
          id: "s23",
          kind: "body",
          text: "From the newspaper of the night sky, the moon made one more small moon — and pressed it, gently, into the sky above the highest house, so the girl would have two.",
        },
      ],
      { assetRef: "as/sol-19", planKey: "scene/second-moon-gift" },
    ),
    page(
      22,
      [
        {
          id: "s24",
          kind: "body",
          text: "And it is still there. Ask anyone who stays up to watch the sky: there is a moon up there for everyone who looks hardest — and a fox on Warm Hill, who remembers the smallest of them.",
        },
      ],
      { assetRef: "as/sol-20", planKey: "scene/warm-hill-ending" },
    ),

    page(
      23,
      [
        { id: "b1", kind: "caption", text: "The End" },
        {
          id: "b2",
          kind: "body",
          text: "Made just for Mira, from facts she told the studio: the foxes, the question at bedtime, the toast, and the rain. Nothing here is invented beyond the story itself.",
        },
      ],
      { assetRef: "as/back-card", planKey: "scene/character-card-sol" },
    ),
    page(
      24,
      [
        { id: "col1", kind: "caption", text: "Set in Fraunces & Inter" },
        { id: "col2", kind: "body", text: "Printed as a 210 mm hardcover on warm, cream paper — a number of pages a child can almost carry to bed. This page is the colophon of a very small studio." },
      ],
      { assetRef: "as/colophon", planKey: "scene/colophon-moon" },
    ),
  ],
  revisions: [
    {
      id: "rev-1",
      revisionSeq: 1,
      createdAt: "2026-09-10T09:12:00.000Z",
      status: "READY_FOR_REVIEW",
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    {
      id: "rev-2",
      revisionSeq: 2,
      createdAt: "2026-09-14T18:03:00.000Z",
      status: "READY_FOR_REVIEW",
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    },
    {
      id: "rev-3",
      revisionSeq: 3,
      createdAt: "2026-09-19T20:41:00.000Z",
      status: "READY_FOR_REVIEW",
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    },
  ],
  printSpecId: samplePrintSpec.id,
};

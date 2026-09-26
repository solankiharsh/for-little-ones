/**
 * Theme catalogue — F-002 Story Discovery. Themes are content, not code: a stable
 * schema (`Theme`) and a code-seeded catalogue for M1 launch (≥10 published themes,
 * P0 occasion set present per F-002 §11; the managed/content-admin path lands with
 * F-026). `conceptSeed` is a generation hint contract for F-007, never user-facing.
 */

import type { EmotionalGoal, ReadingLevelBand } from "./story-concept";

export type ThemeLength = "short" | "typical" | "long";

/** Structured seed handed to F-007's StoryProvider (F-002 §7). Never displayed or edited by parents. */
export interface ThemeConceptSeed {
  tone: string;
  settingHints: string[];
  characterSlots: string[];
  forbidBlocks: string[];
}

/** Catalogue-authored fallback concepts (F-007 §10) — a model outage never stops the journey. */
export interface ThemeFallbackConcept {
  title: string;
  pitch: string;
  emotionalGoal: EmotionalGoal;
  readingLevel: ReadingLevelBand;
  approximateLengthPages: number;
  charactersUsed: string[];
}

export interface Theme {
  id: string;
  displayName: string;
  categoryId: string;
  blurb: string;
  cardDetail: string;
  emoji: string;
  ageLowMonths?: number;
  ageHighMonths?: number;
  lengthHint: ThemeLength;
  knownOccasions: string[];
  localePriority: string;
  isUniversal: boolean;
  conceptSeed: ThemeConceptSeed;
  fallbackConcepts: ThemeFallbackConcept[];
  publishedAt: string;
  authoredBy: string;
}

export interface ThemeCategory {
  id: string;
  displayName: string;
  sortOrder: number;
  isCore: boolean;
}

export const THEME_CATEGORIES: ThemeCategory[] = [
  { id: "adventures", displayName: "Adventures", sortOrder: 1, isCore: true },
  { id: "bedtime", displayName: "Bedtime", sortOrder: 2, isCore: true },
  { id: "big-moments", displayName: "Big moments", sortOrder: 3, isCore: true },
  { id: "feelings", displayName: "Feelings", sortOrder: 4, isCore: true },
  { id: "fun-magic", displayName: "Fun & magic", sortOrder: 5, isCore: true },
  { id: "people-we-love", displayName: "People we love", sortOrder: 6, isCore: true }
];

function theme(input: {
  id: string;
  displayName: string;
  categoryId: string;
  blurb: string;
  cardDetail: string;
  emoji: string;
  lengthHint: ThemeLength;
  knownOccasions?: string[];
  localePriority?: string;
  isUniversal?: boolean;
  conceptSeed: ThemeConceptSeed;
  fallbackConcepts: Omit<ThemeFallbackConcept, "readingLevel">[];
  ageLowMonths?: number;
  ageHighMonths?: number;
}): Theme {
  return {
    id: input.id,
    displayName: input.displayName,
    categoryId: input.categoryId,
    blurb: input.blurb,
    cardDetail: input.cardDetail,
    emoji: input.emoji,
    ...(input.ageLowMonths !== undefined ? { ageLowMonths: input.ageLowMonths } : {}),
    ...(input.ageHighMonths !== undefined ? { ageHighMonths: input.ageHighMonths } : {}),
    lengthHint: input.lengthHint,
    knownOccasions: input.knownOccasions ?? [],
    localePriority: input.localePriority ?? "en-GB",
    isUniversal: input.isUniversal ?? false,
    conceptSeed: input.conceptSeed,
    fallbackConcepts: input.fallbackConcepts.map((f) => ({ ...f, readingLevel: "4-6" as const })),
    publishedAt: "2026-09-25T00:00:00.000Z",
    authoredBy: "content/seed"
  };
}

export const THEME_CATALOGUE: Theme[] = [
  theme({
    id: "adventure",
    displayName: "Adventure",
    categoryId: "adventures",
    blurb: "A big journey for a small explorer.",
    cardDetail: "A friendly adventure story: the child sets out, meets helpers, and comes home with something wonderful. Perfect for children who love being brave.",
    emoji: "🥾",
    lengthHint: "typical",
    knownOccasions: ["adventure"],
    isUniversal: true,
    conceptSeed: {
      tone: "warm, brave, gentle",
      settingHints: ["a far-away place reached through an ordinary door", "a kindly landscape that rewards courage"],
      characterSlots: ["child", "companion"],
      forbidBlocks: ["scary antagonists", "peril that a 5-year-old would find frightening", "violence"]
    },
    fallbackConcepts: [
      { title: "The Door at the End of the Garden", pitch: "Behind the last rose bush there is a door, and behind the door there is a whole world waiting for just the right explorer.", emotionalGoal: "bravery", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Map That Drew Itself", pitch: "The child finds a map that draws itself one line at a time — and every path on it leads home by tea time.", emotionalGoal: "curiosity", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Keeper of Lost Buttons", pitch: "Every lost button in town lands in one kindly cave, and the child helps return them one by one.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "bedtime",
    displayName: "Bedtime",
    categoryId: "bedtime",
    blurb: "A calm, cosy story for the end of the day.",
    cardDetail: "A gentle story that eases a child to sleep: soft journeys, quiet magic, and a comforting ending. No drama, just warmth.",
    emoji: "🌙",
    lengthHint: "short",
    knownOccasions: ["bedtime", "calming"],
    isUniversal: true,
    conceptSeed: {
      tone: "calm, hushed, dreamy",
      settingHints: ["a soft nighttime landscape", "proceedings that stay quiet and kind"],
      characterSlots: ["child", "night-companion"],
      forbidBlocks: ["scary or fast action", "loud events", "frights"]
    },
    fallbackConcepts: [
      { title: "The Moon Keeps a Promise", pitch: "The moon promises to stay awake until the child has drifted off, telling one soft story about the night sky.", emotionalGoal: "bedtime_calm", approximateLengthPages: 6, charactersUsed: [] },
      { title: "Pillow Pirates of the Blanket Sea", pitch: "A gentle voyage over a sea of blankets, where the pillows are islands and sleep is the treasure.", emotionalGoal: "bedtime_calm", approximateLengthPages: 6, charactersUsed: [] },
      { title: "The Lantern That Needed a Bed", pitch: "A tired lantern asks the child to show it where restful things live — and learns from the answer.", emotionalGoal: "curiosity", approximateLengthPages: 6, charactersUsed: [] }
    ]
  }),
  theme({
    id: "birthday",
    displayName: "Birthday",
    categoryId: "big-moments",
    blurb: "A celebrate-you story full of favourite things.",
    cardDetail: "A party-shaped story where the child is the guest of honour. Great for birthdays, and for any day that deserves a parade.",
    emoji: "🎈",
    lengthHint: "typical",
    knownOccasions: ["birthday"],
    isUniversal: true,
    conceptSeed: {
      tone: "joyful, warm, celebrating the child",
      settingHints: ["a party that turns gently magical", "a parade of the child's favourite things"],
      characterSlots: ["child", "party-companions"],
      forbidBlocks: ["a mean or left-out child", "sadness on a celebration"]
    },
    fallbackConcepts: [
      { title: "The Almost-Missed Parade", pitch: "The child is the one who lets the parade begin, and every float is made from something they love.", emotionalGoal: "fun", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Cake That Bloomed", pitch: "A birthday cake that grows candles on the inside, and only the child knows how to light them gently.", emotionalGoal: "curiosity", approximateLengthPages: 8, charactersUsed: [] },
      { title: "Eleven O'Clock Wishes", pitch: "At exactly eleven o'clock the children's wishes line up politely and ask to be carried to the sky.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "space",
    displayName: "Space",
    categoryId: "adventures",
    blurb: "A bedtime-scale voyage to the stars.",
    cardDetail: "The child builds a small rocket (from a cardboard box or a recycle bin) and voyages to friendly planets. Nothing scary, everything sparkly.",
    emoji: "🚀",
    lengthHint: "typical",
    conceptSeed: {
      tone: "wondrous, friendly stars",
      settingHints: ["a homemade rocket", "planets that are kind and curious"],
      characterSlots: ["child", "space-companion"],
      forbidBlocks: ["loneliness in space", "scary aliens", "getting lost"]
    },
    fallbackConcepts: [
      { title: "The Rocket Made of Cardboard", pitch: "A cardboard rocket takes the child to a moon made of chalk powder and back in time for breakfast.", emotionalGoal: "fun", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Planet That Played Hide and Seek", pitch: "One small planet keeps hiding behind Jupiter, and only the child can coax it out.", emotionalGoal: "friendship", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Starlight Ferry", pitch: "The child ferries sleepy starlight to a brand-new constellation that keeps forgetting where it lives.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "dinosaurs",
    displayName: "Dinosaurs",
    categoryId: "adventures",
    blurb: "Friendly dinos, big adventures, soft hearts.",
    cardDetail: "The child visits a valley where dinosaurs are warm and funny. Good for children who know every name already and will check the details.",
    emoji: "🦖",
    ageLowMonths: 36,
    ageHighMonths: 96,
    lengthHint: "typical",
    knownOccasions: ["favourite things"],
    conceptSeed: {
      tone: "warm, playful, scientifically sweet",
      settingHints: ["a dinosaur valley where every dino has a job", "gentle adventures that respect dino facts"],
      characterSlots: ["child", "dino-companion"],
      forbidBlocks: ["a scary T-rex chase", "extinct-sadness", "violence"]
    },
    fallbackConcepts: [
      { title: "The Dino Who Lost His Roar", pitch: "A shy little dino cannot find its roar, and the child helps it practise until it sounds like a friendly trumpet.", emotionalGoal: "confidence", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Great Saurus Picnic", pitch: "The child plans the biggest picnic in dino valley, and every dino brings their favourite leaf.", emotionalGoal: "friendship", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Volcano That Grumbled", pitch: "A sleepy volcano makes grumbling noises only when it is lonely, and the child shows it how to make friends.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "starting-school",
    displayName: "Starting school",
    categoryId: "big-moments",
    blurb: "Big feelings for a big first day.",
    cardDetail: "A gentle first-day story: new classroom, new faces, a familiar brave child. Names the worry and resolves it warmly.",
    emoji: "🎒",
    ageLowMonths: 48,
    ageHighMonths: 84,
    lengthHint: "typical",
    knownOccasions: ["starting school", "new adventure"],
    conceptSeed: {
      tone: "kind, reassuring, proud",
      settingHints: ["a first day of school", "helpers in a new place"],
      characterSlots: ["child", "new-friend"],
      forbidBlocks: ["a mean teacher or classmate", "being left out", "fears that stay unresolved"]
    },
    fallbackConcepts: [
      { title: "The Name That Opened a Door", pitch: "On the first morning a door only opens when the child says their own name proudly — and on the other side a friend is waiting.", emotionalGoal: "confidence", approximateLengthPages: 8, charactersUsed: [] },
      { title: "Ten New Smiles", pitch: "The child's job on the first day is to collect ten new smiles, and they learn that a new place is full of people willing to be met.", emotionalGoal: "friendship", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Classroom Key Keeper", pitch: "The class has a quiet keeper of a very important key, and the child is asked to be the helper for the whole first day.", emotionalGoal: "belonging", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "new-sibling",
    displayName: "New sibling",
    categoryId: "big-moments",
    blurb: "A big-sibling story with a soft landing.",
    cardDetail: "A new baby arrives and the child wonders where they fit. Gentle reassurance that they matter, and a job only they can do.",
    emoji: "👶",
    lengthHint: "typical",
    knownOccasions: ["new sibling", "change"],
    conceptSeed: {
      tone: "warm, reassuring, gentle",
      settingHints: ["a home that is rearranging itself", "quiet moments between the two children"],
      characterSlots: ["child", "sibling"],
      forbidBlocks: ["jealousy that goes unhealed", "the child being ignored", "blame"]
    },
    fallbackConcepts: [
      { title: "The Translator of First Noises", pitch: "The new baby makes noises no one understands — until the child, listening hardest of all, becomes the gentle translator.", emotionalGoal: "belonging", approximateLengthPages: 8, charactersUsed: [] },
      { title: "Two Moons, One Sky", pitch: "The family's sky suddenly has two moons, and the older child is the one who shows the smaller moon how to shine.", emotionalGoal: "confidence", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Keeper of the Smallest Things", pitch: "Everyone is busy with the new baby, and the child is asked to keep the safe, small, important things — including one very special job.", emotionalGoal: "belonging", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "kindness",
    displayName: "Kindness",
    categoryId: "feelings",
    blurb: "Small generous acts, big warm consequences.",
    cardDetail: "A story about paying kindness forward: one small act starts a chain that comes back around. Perfect for teaching gentleness without a lecture.",
    emoji: "🌼",
    lengthHint: "typical",
    conceptSeed: {
      tone: "warm, quiet, hopeful",
      settingHints: ["a neighbourhood that notices small kindnesses", "a chain of gentle favours"],
      characterSlots: ["child", "helpers"],
      forbidBlocks: ["mean characters without change", "preachiness", "kindness that goes unreturned in a sad way"]
    },
    fallbackConcepts: [
      { title: "The Sandwich Exchange", pitch: "One packed lunch makes its way around the whole neighbourhood, improving a little each time it is shared.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Thank-You Parade", pitch: "A series of small thanks grows until the whole street is marching, and the child is at the front with the first card.", emotionalGoal: "friendship", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Borrowed Umbrella", pitch: "One umbrella lent on a rainy day crosses the town and always comes home with something extra.", emotionalGoal: "kindness", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "confidence",
    displayName: "Confidence",
    categoryId: "feelings",
    blurb: "Finding your brave, a little at a time.",
    cardDetail: "A story where the child is nervous about something new and learns that brave comes in small, doable steps — cheered on by gentle helpers.",
    emoji: "🦁",
    lengthHint: "typical",
    conceptSeed: {
      tone: "encouraging, warm, stepwise",
      settingHints: ["a new or daunting thing (performance, water, a big slide)", "helpers who cheer quietly"],
      characterSlots: ["child", "cheerleader"],
      forbidBlocks: ["being laughed at", "a child failing publicly", "fear that is simply powered through"]
    },
    fallbackConcepts: [
      { title: "The Very Long Slide", pitch: "Everyone says the slide is enormous, but the child decides to try just the first step, then the next, until the whole thing is behind them.", emotionalGoal: "confidence", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Whisper That Grew", pitch: "The child's quiet voice is the only one that will work for a very loud job — and it turns out loud is not the same as brave.", emotionalGoal: "confidence", approximateLengthPages: 8, charactersUsed: [] },
      { title: "The Parade of Firsts", pitch: "A town celebrates 'first times', and the child joins with a first time of their own that everyone claps for.", emotionalGoal: "curiosity", approximateLengthPages: 8, charactersUsed: [] }
    ]
  }),
  theme({
    id: "fun-magic",
    displayName: "Fun & magic",
    categoryId: "fun-magic",
    blurb: "Silliness, sparks and things that shouldn't work — but do.",
    cardDetail: "A light, playful story where ordinary rules stop applying in the nicest way: gravity takes holidays, socks choose themselves, and laughter fixes everything.",
    emoji: "✨",
    lengthHint: "short",
    conceptSeed: {
      tone: "playful, silly, delightful",
      settingHints: ["magic that is benign and funny", "ordinary objects behaving wonderfully"],
      characterSlots: ["child", "silly-companion"],
      forbidBlocks: ["scary magic", "chaos without a warm ending", "meanness"]
    },
    fallbackConcepts: [
      { title: "The Day Gravity Took a Holiday", pitch: "For one morning nothing falls down, and the child is the only one who knows how to get things home before gravity returns.", emotionalGoal: "fun", approximateLengthPages: 6, charactersUsed: [] },
      { title: "The Sock that Chose Its Own Pair", pitch: "A sock with strong opinions negotiates its matching, and the child brokers the deal that saves the whole drawer.", emotionalGoal: "fun", approximateLengthPages: 6, charactersUsed: [] },
      { title: "The Rain That Smelled of Pancakes", pitch: "A rainstorm arrives smelling of pancakes, and the child discovers the weather has a cook who can't find its kitchen.", emotionalGoal: "curiosity", approximateLengthPages: 6, charactersUsed: [] }
    ]
  })
];

const CATALOGUE_BY_ID = new Map(THEME_CATALOGUE.map((t) => [t.id, t]));

export function getTheme(id: string): Theme | undefined {
  return CATALOGUE_BY_ID.get(id);
}

export function universalSeedThemes(): Theme[] {
  return THEME_CATALOGUE.filter((t) => t.isUniversal);
}

/** F-002 §8 `GET /catalogue/themes` — ordered feed. Deterministic ranking over the seed set. */
export function sortThemes(
  themes: readonly Theme[],
  rank: { ageMonths?: number; interests?: readonly string[]; locale?: string } = {}
): Theme[] {
  const locale = rank.locale ?? "en-GB";
  const interests = rank.interests ? [...new Set(rank.interests)] : [];
  return [...themes].sort((left, right) => scoreTheme(right, { ...rank, locale, interests }) - scoreTheme(left, { ...rank, locale, interests }));
}

function scoreTheme(theme: Theme, rank: { ageMonths?: number; interests: string[]; locale: string }): number {
  let score = 0;
  if (theme.localePriority === rank.locale) score += 5;
  if (theme.isUniversal) score += 10;
  if (rank.ageMonths !== undefined) {
    const low = theme.ageLowMonths ?? 0;
    const high = theme.ageHighMonths ?? 12 * 12;
    if (rank.ageMonths >= low && rank.ageMonths <= high) score += 20;
  }
  if (rank.interests.some((interest) => theme.id === interest || theme.knownOccasions.includes(interest))) {
    score += 15;
  }
  return score;
}

export function listThemes(): readonly Theme[] {
  return THEME_CATALOGUE;
}

export function listCategories(): readonly ThemeCategory[] {
  return [...THEME_CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function themeInstancesOfConceptProvidedBy(theme: Theme): string[] {
  return theme.fallbackConcepts.map((c) => c.title);
}
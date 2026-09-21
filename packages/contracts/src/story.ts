import { z } from "zod";
import { SCHEMA_VERSION_V1, GenerationMetadataSchema } from "./base";

export const ConceptRequestSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  locale: z.string().min(2),
  interests: z.array(z.string().min(1)).min(1),
  ageBand: z.string().optional()
});

export const ConceptResultSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  concepts: z
    .array(
      z.strictObject({
        title: z.string().min(1),
        pitch: z.string().min(1),
        tags: z.array(z.string().min(1)).default([])
      })
    )
    .min(1)
    .max(9)
});

export const StoryOutlineRequestSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  concept: z.strictObject({
    title: z.string().min(1),
    pitch: z.string().min(1)
  }),
  locale: z.string().min(2),
  facts: z.array(z.string().min(1)).default([]),
  policySetVersion: z.string().min(1)
});

export const StoryOutlineResultSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  title: z.string().min(1),
  synopsis: z.string().min(1),
  emotionalGoal: z.string().min(1),
  characters: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        role: z.string().min(1),
        facts: z.array(z.string().min(1)).default([])
      })
    )
    .min(1),
  acts: z
    .array(
      z.strictObject({
        title: z.string().min(1),
        summary: z.string().min(1)
      })
    )
    .min(1),
  pageCount: z.number().int().min(1).max(64)
});

export const PagePlanSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  pageKey: z.string().min(1),
  pageNumber: z.number().int().min(1),
  overrideCycleOffset: z.number().int().min(0).optional()
});

export const PageTextRequestSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  pageKey: z.string().min(1),
  pageNumber: z.number().int().min(1),
  bibleVersion: z.string().min(1),
  factsVersion: z.string().min(1),
  locale: z.string().min(2),
  policySetVersion: z.string().min(1)
});

export const PageTextResultSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  pageKey: z.string().min(1),
  pageNumber: z.number().int().min(1),
  textBlocks: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        kind: z.enum(["paragraph", "dialogue-lines", "title"]),
        text: z.string().min(1),
        style: z
          .strictObject({
            font: z.string().min(1),
            sizePt: z.number().positive().optional()
          })
          .optional()
      })
    )
    .min(1),
  illustrationCue: z.string().min(1).optional(),
  locale: z.string().min(2),
  generationMetadata: GenerationMetadataSchema.optional()
});

export type ConceptRequest = z.infer<typeof ConceptRequestSchema>;
export type ConceptResult = z.infer<typeof ConceptResultSchema>;
export type StoryOutlineRequest = z.infer<typeof StoryOutlineRequestSchema>;
export type StoryOutlineResult = z.infer<typeof StoryOutlineResultSchema>;
export type PagePlan = z.infer<typeof PagePlanSchema>;
export type PageTextRequest = z.infer<typeof PageTextRequestSchema>;
export type PageTextResult = z.infer<typeof PageTextResultSchema>;
import { z } from "zod";
import { SCHEMA_VERSION_V1, GenerationMetadataSchema } from "./base";

export const IllustrationPlanSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  planKey: z.string().min(1),
  pageKey: z.string().min(1),
  bibleVersion: z.string().min(1),
  styleVersion: z.string().min(1),
  compositionId: z.string().min(1),
  layoutHint: z
    .strictObject({
      faceSafeZone: z
        .strictObject({
          xRatio: z.number().min(0).max(1),
          yRatio: z.number().min(0).max(1),
          widthRatio: z.number().min(0).max(1),
          heightRatio: z.number().min(0).max(1)
        })
        .optional()
    })
    .optional()
});

export const IllustrationResultSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V1),
  planKey: z.string().min(1),
  pageKey: z.string().min(1),
  image: z.strictObject({
    format: z.enum(["png", "webp", "jpeg"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    storageRef: z.string().min(1)
  }),
  generationMetadata: GenerationMetadataSchema.optional()
});

export type IllustrationPlan = z.infer<typeof IllustrationPlanSchema>;
export type IllustrationResult = z.infer<typeof IllustrationResultSchema>;
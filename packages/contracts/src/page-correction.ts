import { z } from "zod";

export const PageCorrectionRequestSchema = z.strictObject({
  projectId: z.string().startsWith("project_").max(80),
  revisionId: z.string().startsWith("revision_").max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/),
  pageNumber: z.number().int().min(1).max(6),
  intent: z.enum(["SHORTER", "GENTLER", "EDIT_TEXT"]),
  words: z.string().trim().max(700).optional(),
  idempotencyKey: z.string().min(16).max(80)
}).refine((value) => value.intent === "EDIT_TEXT" ? Boolean(value.words) : value.words === undefined, { message: "Add the replacement words only for Change the words." });
export type PageCorrectionRequest = z.infer<typeof PageCorrectionRequestSchema>;

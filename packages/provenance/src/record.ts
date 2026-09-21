import { z } from "zod";

/**
 * GenerationProvenance — GENERATION_PROVENANCE §2. Immutable attribution for every
 * generated artifact/revision. All fields required; a stage result without a
 * provenance record does not become canonical state. `characterVersion` and
 * `storyRevision` are required but allowed to be empty for stages where they do
 * not apply (their absence is itself recorded).
 */
export const GenerationProvenanceSchema = z.strictObject({
  pipelineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  policySetVersion: z.string().min(1),
  policyHash: z.string().regex(/^[0-9a-f]{64}$/),
  provider: z.string().min(1),
  providerModel: z.string().min(1),
  providerModelVersion: z.string().optional(),
  generationConfigVersion: z.string().min(1),
  characterVersion: z.string(),
  storyRevision: z.string(),
  inputAssetRefs: z.array(z.string()),
  jobId: z.string().min(1),
  stepKey: z.string().min(1),
  attempt: z.number().int().min(1),
  createdAt: z.iso.datetime()
});

export type GenerationProvenance = z.infer<typeof GenerationProvenanceSchema>;
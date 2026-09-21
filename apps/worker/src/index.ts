import type { GenerationStep } from "@for-little-ones/domain";

export const appId = "@for-little-ones/worker";
export const appName = "For Little One — worker (generation steps)";
/** Placeholder until the worker shell is built; the skeleton commits the direction only. */
export const version = "0.0.0";

/**
 * The worker runs GenerationStep units from the canonical model under a durable
 * runtime. Execution wiring (the D019 contract against the substrate picked by
 * the D014 spike) is the F-010 bootstrap, not this skeleton — which depends on
 * domain only, per the apps → domain direction.
 */
export type WorkerStep = GenerationStep;
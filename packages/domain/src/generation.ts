import type { PageTextResult, IllustrationPlan } from "@for-little-ones/contracts";

export type GenerationStepOutput = PageTextResult | IllustrationPlan;

export interface GenerationStep {
  stepKey: string;
  /** Deterministic idempotency key per unit (F-008 pageKey, F-009 planKey). */
  unitKey(pageKey: string): string;
  attemptBudget: number;
  run(input: { pageKey: string; bibleVersion: string; factsVersion: string }): Promise<GenerationStepOutput>;
}
import type { ProviderBoundary } from "./shared";

export interface ModerationInput {
  contentType: "audio" | "image" | "text";
  contentRef: string;
  /** The actual payload to moderate — F-007 §10 gates real copy, not a synthetic ref. */
  content?: string;
  policySetVersion: string;
}

export interface ModerationResult {
  verdict: "ALLOW" | "FLAG" | "BLOCK";
  findings: string[];
}

export interface ModerationProvider extends ProviderBoundary {
  screen(input: ModerationInput): Promise<ModerationResult>;
}
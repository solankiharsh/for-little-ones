import { GeminiStoryProvider, PolicyTextModerationProvider } from "@for-little-ones/providers";
import type { ComposeProviders } from "./compose";

/**
 * Production providers for the Path A API + worker (D028/D032). No stubs:
 * safety screening is the versioned rules engine and story text comes from
 * Gemini — both require their keys in the environment and fail fast without
 * them. There is deliberately no fallback to the example provider: silently
 * serving deterministic fake stories in production would be a safety and
 * honesty defect, not resilience.
 */
export function productionProviders(): ComposeProviders {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("production providers need GEMINI_API_KEY in the environment (story text has no offline fallback)");
  }
  return {
    story: new GeminiStoryProvider({ apiKey }),
    moderation: new PolicyTextModerationProvider()
  };
}

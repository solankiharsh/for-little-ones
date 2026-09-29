/**
 * Development entry points for the API and the concept worker (D024 §6: "dev scripts —
 * run API + worker against the same Postgres").
 *
 * The moderation boundary has an interface but no adapter yet. Rather than invent one,
 * this file wires an explicitly-labelled ALLOW stub so the slice is runnable, and
 * `assertDevOnly` makes that stub unreachable the moment `NODE_ENV=production`. A missing
 * moderation adapter is a hard stop for production, not something to default around:
 * every concept bundle passes through this gate before it is persisted, and an allow-all
 * default would turn a safety control into a silent no-op.
 */
import type { ModerationProvider, ProviderCard } from "@for-little-ones/providers";
import { ExampleVendorStoryProvider, GeminiStoryProvider } from "@for-little-ones/providers";
import { composeApi, type ComposeProviders } from "./compose";

const DEV_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "dev-stub-v1",
    childDataSent: false,
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "not-applicable",
    evidenceRef: "internal://dev-stub"
  },
  idempotency: "none",
  timeoutMs: 5_000,
  retryPolicy: "none",
  costMetadata: "none"
};

export function assertDevOnly(entry: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${entry} is a development entry point and refuses to run with NODE_ENV=production: ` +
        "its moderation provider is an ALLOW stub. Wire a real ModerationProvider adapter first."
    );
  }
}

/** ALLOW-everything moderation. Development only — see the module comment. */
export function devModerationProvider(): ModerationProvider {
  return {
    card: DEV_CARD,
    async screen() {
      return { verdict: "ALLOW", findings: [] };
    }
  };
}

export function devProviders(): ComposeProviders {
  // FLO_STORY_PROVIDER=gemini selects the live Gemini-backed outline/page text
  // (needs GEMINI_API_KEY) for real personalisation quality; default stays the
  // deterministic example provider so local runs cost nothing and specs stay
  // hermetic. Moderation stays the dev ALLOW stub either way (assertDevOnly).
  const which = process.env.FLO_STORY_PROVIDER ?? "example";
  if (which === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("FLO_STORY_PROVIDER=gemini needs GEMINI_API_KEY in the environment");
    return { story: new GeminiStoryProvider({ apiKey }), moderation: devModerationProvider() };
  }
  if (which !== "example") throw new Error(`unknown FLO_STORY_PROVIDER: ${which} (expected "example" or "gemini")`);
  return { story: new ExampleVendorStoryProvider(), moderation: devModerationProvider() };
}

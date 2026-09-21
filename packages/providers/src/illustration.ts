import type { IllustrationPlan, IllustrationResult } from "@for-little-ones/contracts";
import type { IdentityReference } from "./identity";
import type { ProviderBoundary, StyleTokens } from "./shared";

export interface IllustrationProvider extends ProviderBoundary {
  generate(
    plan: IllustrationPlan,
    identityReference: IdentityReference,
    styleTokens: StyleTokens
  ): Promise<IllustrationResult>;
}
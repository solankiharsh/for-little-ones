/**
 * Every provider interface must document its data path (GENERATION_ARCHITECTURE §4,
 * §12 privacy rule; F-025 provider audit). This card is structurally required on
 * every provider boundary so a provider that touches child data cannot be added
 * silently.
 */
export interface ProviderCard {
  dataPolicy: ProviderDataPolicy;
  /** Supported idempotency / request IDs. */
  idempotency: string;
  timeoutMs: number;
  /** Which statuses are retryable, backoff expectations. */
  retryPolicy: string;
  /** Cost metadata surfaced (costCents/units) and how it is returned. */
  costMetadata: string;
}

export type RetentionMode = "NONE" | "EPHEMERAL" | "FIXED_TERM" | "CONTRACTUAL" | "UNKNOWN";
export type TrainingUse = "PROHIBITED" | "PERMITTED" | "UNKNOWN";
export type DeletionMechanism = "API_DELETE" | "AUTOMATIC_EXPIRY" | "CONTRACTUAL_ZERO_RETENTION" | "NOT_SUPPORTED";

/** Verified evidence for a provider's handling of child data. */
export interface ProviderDataPolicy {
  verifiedAt: string;
  policyVersion: string;
  childDataSent: boolean;
  retentionMode: RetentionMode;
  trainingUse: TrainingUse;
  deletionMechanism: DeletionMechanism;
  region: string;
  evidenceRef: string;
}

/** Child photos may only be sent where training is prohibited and deletion is supported. */
export function isEligibleForChildPhotos(policy: ProviderDataPolicy): boolean {
  return policy.childDataSent && policy.trainingUse === "PROHIBITED" && policy.deletionMechanism !== "NOT_SUPPORTED";
}

export function assertEligibleForChildPhotos(policy: ProviderDataPolicy): void {
  if (!isEligibleForChildPhotos(policy)) {
    throw new Error("provider is not eligible to receive child photos");
  }
}

export interface ProviderBoundary {
  readonly card: ProviderCard;
}

export interface StyleTokens {
  resolvedFrom: string;
  tokens: Record<string, string>;
}

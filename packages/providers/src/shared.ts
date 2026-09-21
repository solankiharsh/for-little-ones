/**
 * Every provider interface must document its data path (GENERATION_ARCHITECTURE §4,
 * §12 privacy rule; F-025 provider audit). This card is structurally required on
 * every provider boundary so a provider that touches child data cannot be added
 * silently.
 */
export interface ProviderCard {
  childDataSent: {
    sent: boolean;
    /** What is sent, e.g. "reference photo downscale" — only when `sent` is true. */
    what?: string;
    why?: string;
    form?: string;
  };
  /** Provider retention terms; "none" when the provider stores nothing. */
  retention: string;
  /** Data-use/training terms; "none" when the provider does not train. */
  dataUseTerms: string;
  /** Supported idempotency / request IDs. */
  idempotency: string;
  timeoutMs: number;
  /** Which statuses are retryable, backoff expectations. */
  retryPolicy: string;
  /** Cost metadata surfaced (costCents/units) and how it is returned. */
  costMetadata: string;
  /** Deletion capability, or the documented fallback if no delete API exists. */
  deletion: string;
}

export interface ProviderBoundary {
  readonly card: ProviderCard;
}

export interface StyleTokens {
  resolvedFrom: string;
  tokens: Record<string, string>;
}
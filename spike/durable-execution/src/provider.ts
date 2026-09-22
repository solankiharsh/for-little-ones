/**
 * Simulated external illustration provider.
 *
 * The DDTC "uncertain external outcome" is: provider accepted a request, then the
 * worker died before any local commit. The provider keeps its own idempotency cache
 * (spike_provider_request) keyed by the idempotency key the app hands over, so a
 * retried call with the SAME key returns the SAME accepted request — no duplicate
 * spend. If the provider cache were lost (no idempotency support), a retry would
 * spend again: that margin is documented, never hidden.
 */
import type { SpikeAppState, ProviderOutcome } from "./app-state";

function simulateProviderWork(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export class SpikeProvider {
  constructor(
    private readonly appState: SpikeAppState,
    private readonly opts: { callDelayMs?: number } = {}
  ) {}

  /**
   * Ask the provider to (re)serve the illustration for an idempotency key.
   * - First call: provider accepts, spends once, caches the request.
   * - Retried call with the same key: provider returns the cached acceptance
   *   (cached: true) — the same provider_request_id, no second spend.
   * Use a new key to model an app that lost its key: the provider will accept a
   * brand-new request (possible duplicate spend — the documented limit).
   */
  async call(idempotencyKey: string): Promise<ProviderOutcome> {
    const existing = await this.appState.providerGet(idempotencyKey);
    if (existing) {
      return { cached: true, providerRequestId: existing.providerRequestId, artifactUrl: existing.artifactUrl };
    }
    await simulateProviderWork(this.opts.callDelayMs ?? 150);
    const fresh = await this.appState.providerAccept(
      idempotencyKey,
      `https://vendor.example/artifacts/${idempotencyKey.replace(/:/g, "-")}.webp`
    );
    return fresh;
  }
}
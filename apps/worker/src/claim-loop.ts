import {
  OwnershipError,
  ResourceNotFoundError,
  UnauthenticatedError,
  ValidationError
} from "@for-little-ones/api";
import type { PgBossDurableRuntime } from "@for-little-ones/execution";
import type { ClaimedUnit, LeaseHeldResult, LeaseRefusedResult } from "@for-little-ones/execution";

/**
 * Shared durable claim loop (D024 §6, D029). Any runner with the
 * claim-and-settle shape plugs in — concept bundles today, story units too.
 * The runner owns retry classification; this loop never decides what is worth
 * retrying.
 *
 * `runOnce` is exported separately so a spec (or a future scheduler tick) can
 * drive one iteration without owning a timer.
 */
export interface ClaimRunner {
  runClaimed(workerId: string, unit: ClaimedUnit): Promise<LeaseHeldResult | LeaseRefusedResult>;
}

export async function runOnce(
  deps: { runtime: PgBossDurableRuntime; runner: ClaimRunner; workerId: string; leaseForMs: number },
  stop: { signal?: AbortSignal } = {}
): Promise<Array<LeaseHeldResult | LeaseRefusedResult>> {
  if (stop.signal?.aborted) return [];
  const claimed: ClaimedUnit[] = await deps.runtime.claim({
    workerId: deps.workerId,
    limit: 1,
    leaseForMs: deps.leaseForMs
  });
  const outcomes: Array<LeaseHeldResult | LeaseRefusedResult> = [];
  for (const unit of claimed) {
    try {
      outcomes.push(await deps.runner.runClaimed(deps.workerId, unit));
    } catch (err) {
      // Same guard as the proven worker-entry helper, and it is load-bearing: without
      // it any throw that escapes `runClaimed` (a failed ownership re-check, a store
      // outage) would kill the loop AND leave the unit leased until expiry, stalling
      // the queue. Failing the unit keeps the loop alive and lets maxAttempts decide.
      const definitive = isDefinitive(err);
      outcomes.push(
        await deps.runtime.fail(deps.workerId, unit.unitId, {
          code: definitive ? "WORKER_REJECTED" : "WORKER_UNEXPECTED",
          message: err instanceof Error ? err.message : String(err),
          retryable: !definitive
        })
      );
    }
  }
  return outcomes;
}

/**
 * Whether a throw that escaped `runClaimed` is a definitive verdict rather than a
 * fault. The runner already converts known business states into non-retryable
 * `UnitFailure`s, so what reaches here escaped its own handling: a typed domain error
 * means the preconditions can never hold (the session is gone, the project is not this
 * anonymous project's, the request is invalid), and retrying only burns the attempt
 * budget before dead-lettering. Everything else is treated as a transient fault, which
 * is the safe default: an unknown bug then degrades into retries and a dead letter
 * rather than a silent drop.
 */
function isDefinitive(err: unknown): boolean {
  return (
    err instanceof UnauthenticatedError ||
    err instanceof OwnershipError ||
    err instanceof ValidationError ||
    err instanceof ResourceNotFoundError
  );
}

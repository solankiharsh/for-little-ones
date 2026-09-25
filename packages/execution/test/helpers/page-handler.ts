/**
 * Shared page handler executed inside every worker subprocess. It is
 * substrate-agnostic: it only talks to the shared app state, the simulated
 * provider and the marker file, so the crash-recovery scenario runs the same
 * steps regardless of the runtime instance that claims the unit.
 */
import { randomUUID } from "node:crypto";
import type { TestAppState, TestProvider } from "./app-state";
import { waitForMarker, writeMarker } from "./markers";

export type PageBehavior = "ok" | "always-fail";
export type CrashPoint = "after-provider-accept";

export interface PageJobPayload {
  bookId: string;
  pageNumber: number;
  behavior: PageBehavior;
  /** Per-unit business-operation key (D019). */
  operationKey: string;
  /** Key handed to the (simulated) provider for idempotent replays. */
  providerIdempotencyKey: string;
  /** When set, hold on a gate right after the provider accepts so the harness can SIGKILL. */
  crashPoint?: CrashPoint;
}

export interface WorkerContext {
  workerId: string;
  markerFile: string;
  appState: TestAppState;
  provider: TestProvider;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gateId = (bookId: string, pageNumber: number): string => `gate:${bookId}:${pageNumber}`;

/** Releases a crash-point gate so a held attempt (worker-a pre-kill, or the
 *  reclaiming worker) can commit. Writing the marker always unblocks a waiting
 *  attempt, whether it has reached the gate yet or not. */
export function releaseGate(markerFile: string, bookId: string, pageNumber: number): void {
  writeMarker(markerFile, {
    bookId,
    workerId: "harness",
    pageNumber,
    phase: "release",
    extra: gateId(bookId, pageNumber)
  });
}

export async function handlePage(ctx: WorkerContext, payload: PageJobPayload): Promise<unknown> {
  const executionId = randomUUID();
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "started",
    extra: executionId
  });

  if (payload.behavior === "always-fail") {
    await sleep(30);
    writeMarker(ctx.markerFile, {
      bookId: payload.bookId,
      workerId: ctx.workerId,
      pageNumber: payload.pageNumber,
      phase: "failed",
      extra: "qa-rejection-simulated"
    });
    throw new Error(`page ${payload.pageNumber} rejected by QA (simulated)`);
  }

  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "provider-boundary",
    extra: "calling-provider"
  });
  const outcome = await ctx.provider.call(payload.providerIdempotencyKey);
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "provider-accepted",
    extra: `${outcome.providerRequestId}|cached=${outcome.cached}`
  });

  if (payload.crashPoint === "after-provider-accept") {
    writeMarker(ctx.markerFile, {
      bookId: payload.bookId,
      workerId: ctx.workerId,
      pageNumber: payload.pageNumber,
      phase: "gate-hold",
      extra: gateId(payload.bookId, payload.pageNumber)
    });
    // The harness either SIGKILLs the worker here (local commit never happens)
    // or releases the gate so this attempt commits normally.
    await waitForMarker(
      ctx.markerFile,
      (m) => m.phase === "release" && m.extra === gateId(payload.bookId, payload.pageNumber),
      90_000
    );
  }

  // Local commit: record this run and apply output to canonical page state.
  await ctx.appState.recordPageExecution(
    payload.bookId,
    payload.pageNumber,
    executionId,
    ctx.workerId,
    outcome.providerRequestId
  );
  await ctx.appState.commitPageState(payload.bookId, payload.pageNumber, outcome);
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "applied",
    extra: outcome.providerRequestId
  });
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "completed",
    extra: outcome.providerRequestId
  });
  return {
    artifactUrl: outcome.artifactUrl,
    providerRequestId: outcome.providerRequestId,
    cached: outcome.cached
  };
}
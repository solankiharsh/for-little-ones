/**
 * Shared page/story handler executed inside every worker subprocess. The handler
 * is substrate-agnostic: it only talks to the shared app state, the simulated
 * provider, and the marker file. This is the guarantee that both candidates run
 * the SAME scenario.
 */
import { randomUUID } from "node:crypto";
import type { SpikeAppState, ProviderOutcome } from "./app-state";
import type { PageJobPayload } from "./fixture";
import { waitForMarker, writeMarker, type WorkerPhase } from "./marker";
import type { SpikeProvider } from "./provider";

export interface WorkerContext {
  kind: "pgboss" | "bullmq";
  workerId: string;
  markerFile: string;
  appState: SpikeAppState;
  provider: SpikeProvider;
}

export interface QueueJobLike {
  name: string;
  payload: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleStory(ctx: WorkerContext, payload: { bookId: string }): Promise<unknown> {
  await sleep(10);
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    phase: "story-completed" as WorkerPhase
  });
  return { story: "outlined" };
}

const gateId = (bookId: string, pageNumber: number): string => `gate:${bookId}:${pageNumber}`;

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

  // Enter the vendor-provider-call boundary (the crash point the spike targets).
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "provider-boundary",
    extra: "calling-provider"
  });
  const outcome: ProviderOutcome = await ctx.provider.call(payload.providerIdempotencyKey);
  writeMarker(ctx.markerFile, {
    bookId: payload.bookId,
    workerId: ctx.workerId,
    pageNumber: payload.pageNumber,
    phase: "provider-accepted",
    extra: `${outcome.providerRequestId}|cached=${outcome.cached}`
  });

  // Deterministic crash point: hold here when the harness asks. The harness either
  // SIGKILLs the worker while it is held (local commit never happens) or releases
  // the gate so the attempt commits normally. Only units enqueued with a crashPoint
  // hit this hold; all others run straight through.
  if (payload.crashPoint === "after-provider-accept") {
    writeMarker(ctx.markerFile, {
      bookId: payload.bookId,
      workerId: ctx.workerId,
      pageNumber: payload.pageNumber,
      phase: "gate-hold",
      extra: gateId(payload.bookId, payload.pageNumber)
    });
    await waitForMarker(
      ctx.markerFile,
      (m) => m.phase === "release" && m.extra === gateId(payload.bookId, payload.pageNumber),
      90_000
    );
  }

  // Local commit: record this run in the ledger and apply output to canonical state.
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
  return { artifactUrl: outcome.artifactUrl, providerRequestId: outcome.providerRequestId, cached: outcome.cached };
}

export function releaseGate(markerFile: string, bookId: string, pageNumber: number): void {
  writeMarker(markerFile, {
    bookId,
    workerId: "harness",
    pageNumber,
    phase: "release",
    extra: gateId(bookId, pageNumber)
  });
}
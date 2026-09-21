import type { DurableExecutionRuntime } from "@for-little-ones/execution";

export const appId = "@for-little-ones/worker";
export const appName = "For Little One — worker (durable execution)";
/** Placeholder until the worker shell is built; the skeleton commits the direction only. */
export const version = "0.0.0";

/**
 * The worker consumes the DurableExecutionContract (D019), never a substrate or
 * the orchestration feature — generation steps expose units and consume the
 * contract; F-010 implements the runtime against the chosen substrate later.
 */
export type WorkerRuntime = DurableExecutionRuntime;
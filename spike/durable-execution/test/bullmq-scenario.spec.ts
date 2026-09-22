/**
 * BullMQ (Redis-backed substrate) scenario specs.
 * Requires Postgres + Redis reachable (see checkConnectivity / npm run infra:up).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { killTrackedWorkers, runCancellationScenario, runCrashRecoveryScenario } from "../src/harness";
import { SpikeAppState } from "../src/app-state";
import { SpikeProvider } from "../src/provider";
import {
  assertCancellationEvidence,
  assertCrashRecoveryEvidence,
  checkConnectivity,
  makeBullmqEnv,
  measure,
  PG_URL
} from "./shared";

describe("durable execution — BullMQ 6.3.8 + ioredis (Redis-backed)", () => {
  afterAll(async () => {
    killTrackedWorkers();
  });

  afterEach(() => {
    killTrackedWorkers();
  });

  it("infra is reachable", async () => {
    await checkConnectivity();
  });

  it(
    "crash/recovery + retry exhaustion: stalled checker reclaims the abandoned page, provider replays cached, page 7 lands in the failed set",
    async () => {
      const env = await makeBullmqEnv();
      const measurement = await runCrashRecoveryScenario({
        backend: env.backend,
        appState: env.appState,
        markerFile: env.markerFile
      });

      measure(env, measurement);
      console.log(JSON.stringify(measurement, null, 2));

      assertCrashRecoveryEvidence(measurement);
      await env.appState.close();
    },
    120_000
  );

  it("cancellation stops enqueued work; no unit ever runs", async () => {
    const env = await makeBullmqEnv();
    const terminal = await runCancellationScenario({
      backend: env.backend,
      appState: env.appState,
      markerFile: env.markerFile
    });
    assertCancellationEvidence(terminal);
    const executions = await env.appState.getPageExecutions("book-cancel");
    expect(executions.length).toBe(0);
    await env.appState.close();
  });

  it("documents the uncertain-outcome mechanism: provider idempotency key", async () => {
    const appState = await SpikeAppState.connect(PG_URL);
    await appState.reset();
    const provider = new SpikeProvider(appState, { callDelayMs: 5 });

    const first = await provider.call("uncertain-key");
    const second = await provider.call("uncertain-key");
    expect(second.cached).toBe(true);
    expect(second.providerRequestId).toBe(first.providerRequestId);
    expect(await appState.providerCount()).toBe(1);

    await appState.close();
  });
});
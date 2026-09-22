import { describe, expect, it } from "vitest";
import { makeFeatureRegressionEvaluator } from "../src/evaluator";
import { makeMockIdentityProvider } from "../src/mock-identity-provider";
import type { PageSpec } from "../src/identity";

const SOURCE_REFS = ["mock-src::identity-a-portrait-a", "mock-src::identity-a-portrait-b"];

function spec(over: Partial<PageSpec> = {}): PageSpec {
  return { identityId: "identity-A", pageKey: "p1", pageNumber: 1, dim: "pose", severity: 0.5, seed: "t", ...over };
}

function setup(opts: { swapChance?: number; severity?: number; dim?: PageSpec["dim"] } = {}) {
  const provider = makeMockIdentityProvider({ swapChance: opts.swapChance ?? 0 });
  const evaluator = makeFeatureRegressionEvaluator({ evaluatorNoiseSigma: 0 });
  const ref = provider.deriveReference(SOURCE_REFS).reference;
  const page = provider.generatePage(
    ref,
    spec({ dim: opts.dim ?? "pose", severity: opts.severity ?? 0.5 })
  );
  return { evaluator, page };
}

describe("FeatureRegressionEvaluator", () => {
  it("stays within [0,1] and is deterministic for the same page", () => {
    const { evaluator, page } = setup();
    const a = evaluator.evaluate(page);
    const b = evaluator.evaluate(page);
    expect(a.score01).toBeGreaterThanOrEqual(0);
    expect(a.score01).toBeLessThanOrEqual(1);
    expect(a).toEqual(b);
  });

  it("requires review when an uncalibrated swap signal was injected", () => {
    const { evaluator, page } = setup({ swapChance: 1, dim: "composition", severity: 0.7 });
    const ev = evaluator.evaluate(page);
    expect(ev.checks.some((c) => c.dimension === "identity.character-swap" && c.severity === "REVIEW_REQUIRED")).toBe(true);
    expect(ev.decision).toBe("REVIEW_REQUIRED");
  });

  it("clears a canonical page with a strong likeness readout", () => {
    const { evaluator, page } = setup({ dim: "canonical", severity: 0 });
    const ev = evaluator.evaluate(page);
    expect(ev.decision).toBe("PASS");
    expect(ev.checks.every((c) => c.severity !== "HARD_BLOCK")).toBe(true);
  });

  it("requests human review when likeness is marginal", () => {
    const { evaluator, page } = setup({ dim: "occlusion", severity: 0.85 });
    const ev = evaluator.evaluate(page);
    // occlusion has high attenuation; with base >= 0.62 * (1 - (1-0.45)*0.85) may be < review floor
    expect(ev.checks.some((c) => c.severity === "REVIEW_REQUIRED" || c.severity === "HARD_BLOCK")).toBe(true);
  });

  it("carries the required privacy card", () => {
    const evaluator = makeFeatureRegressionEvaluator();
    expect(evaluator.card.dataPolicy.childDataSent).toBe(false);
  });
});

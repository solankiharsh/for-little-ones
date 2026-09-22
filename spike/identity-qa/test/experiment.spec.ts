import { describe, expect, it } from "vitest";
import { runExperiment } from "../src/experiment";

describe("experiment", () => {
  it("is deterministic across runs", () => {
    expect(runExperiment()).toEqual(runExperiment());
  });

  it("reports an honest OFFLINE_DRY_RUN / KEEP OPEN decision", () => {
    const report = runExperiment();
    expect(report.status).toBe("OFFLINE_DRY_RUN");
    expect(report.decision).toBe("KEEP OPEN");
    expect(report.thresholdsInvented).toBe(false);
    expect(report.measurements.identityCount).toBe(2);
    expect(report.measurements.pageCount).toBe(14);
  });

  it("agreement metrics reflect the plumbing (noise-free run → high kappa, perfect swap detection)", () => {
    const report = runExperiment({ evaluatorNoiseSigma: 0, modelNoiseSigma: 0, reviewerNoiseSigma: 0, swapMissRate: 0 });
    expect(report.measurements.likenessKappa).toBeGreaterThanOrEqual(0.8);
    expect(report.measurements.swapDetection.f1).toBe(1);
    expect(report.measurements.artifactAgreement.accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("swap F1 drops when the human misses swaps — proving the metric is sensitive", () => {
    const blind = runExperiment({ swapMissRate: 1 });
    const clean = runExperiment({ swapMissRate: 0 });
    expect(blind.measurements.swapDetection.recall).toBeLessThan(clean.measurements.swapDetection.recall);
  });

  it("lists the real-phase inputs it still needs and invents no threshold", () => {
    const report = runExperiment();
    expect(report.realPhaseNeeds).toEqual(
      expect.arrayContaining(["image-provider API key", "blinded human reviewers"])
    );
    expect(Object.keys(report.measurements)).not.toContain("launchThreshold");
    expect(Object.keys(report.measurements)).not.toContain("qaThreshold");
  });
});
import { describe, expect, it } from "vitest";
import { binaryMetrics, cohensKappa } from "../src/metrics";
import type { LikenessRating } from "../src/human-review";

describe("metrics", () => {
  it("returns kappa = 1 for perfect agreement", () => {
    const a: LikenessRating[] = [5, 4, 3, 2];
    const b: LikenessRating[] = [5, 4, 3, 2];
    expect(cohensKappa(a, b)).toBe(1);
  });

  it("is negative when agreement is below chance (uniform independent ratings)", () => {
    const a: LikenessRating[] = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
    const b: LikenessRating[] = [3, 4, 5, 1, 2, 3, 4, 5, 1, 2];
    // b is a rotation of a: 0 observed equal ratings, identical marginals (each
    // rating 0.2) -> expected agreement 0.2 a.k.a. chance -> kappa = -0.25.
    expect(cohensKappa(a, b)).toBeCloseTo(-0.25, 5);
  });

  it("computes swap F1 on a hand-checked example", () => {
    const truth = [true, true, false, false, false];
    const predicted = [true, false, true, false, false];
    const m = binaryMetrics(truth, predicted);
    expect(m.tp).toBe(1);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.tn).toBe(2);
    expect(m.precision).toBeCloseTo(0.5, 5);
    expect(m.recall).toBeCloseTo(0.5, 5);
    expect(m.f1).toBeCloseTo(0.5, 5);
    expect(m.accuracy).toBeCloseTo(3 / 5, 5);
  });

  it("guards against empty/paired-length violations", () => {
    expect(() => cohensKappa([], [])).toThrow();
    expect(() => binaryMetrics([true], [true, false])).toThrow();
  });
});
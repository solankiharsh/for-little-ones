import { describe, expect, it } from "vitest";
import { CANDIDATES } from "../src/candidates";

describe("bundle size (measured bytes, not impressions)", async () => {
  const candidates = await CANDIDATES;
  for (const candidate of candidates) {
    it(`${candidate.name} ships a measurable main bundle and the deep model import is smaller`, () => {
      const { mainBytes, mainGzip, modelBytes, modelGzip } = candidate.bundle;
      expect(mainBytes).toBeGreaterThan(0);
      expect(mainGzip).toBeGreaterThan(0);
      expect(mainGzip).toBeLessThan(mainBytes);
      expect(modelBytes).toBeGreaterThan(0);
      expect(modelGzip).toBeLessThan(modelBytes);
      // The headless store-only import must be far smaller than the full editor
      // UI entry: a wrap that only consumes the model keeps the browser payload low.
      expect(modelBytes).toBeLessThan(mainBytes / 3);
    });
  }

  it("records bundle numbers in the report path for the README", () => {
    const row = candidates.map((c) => ({
      name: c.name,
      mainKB: Math.round(c.bundle.mainBytes / 1024),
      mainGzipKB: Math.round(c.bundle.mainGzip / 1024),
      modelKB: Math.round(c.bundle.modelBytes / 1024),
      modelGzipKB: Math.round(c.bundle.modelGzip / 1024)
    }));
    console.table(row);
    for (const r of row) {
      expect(r.mainKB).toBeGreaterThan(0);
      expect(r.modelKB).toBeGreaterThan(0);
      expect(r.modelGzipKB).toBeLessThan(r.mainGzipKB);
    }
  });
});
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const JSON_PATH = join(process.cwd(), "..", "..", "tmp", "editor-primitive", "phase2.json");

describe.skipIf(!existsSync(JSON_PATH))("browser phase-2 evidence (phase2.json)", () => {
  const result = JSON.parse(readFileSync(JSON_PATH, "utf8"));

  it("reports an overall PASS", () => {
    expect(result.status).toBe("PASS");
  });

  it("every check passed", () => {
    for (const [name, ok] of Object.entries(result.checks)) {
      expect([name, ok]).toEqual([name, true]);
    }
  });

  it("mounted the editor and built the spread at the expected page size", () => {
    expect(result.mount.mountError).toBeNull();
    expect(result.mount.pages).toBeGreaterThanOrEqual(1);
    expect(result.mount.pagePx).toBe(612);
  });

  it("rendered an exact-size raster (1224px at pixelRatio 2)", () => {
    expect(result.checks.rasterRendered).toBe(true);
    expect(result.checks.rasterIsExactSize).toBe(true);
    expect(result.rasterBefore.width).toBe(1224);
    expect(result.rasterBefore.height).toBe(1224);
  });

  it("loaded a Google web font measurably (delta and FontFaceSet check)", () => {
    expect(result.webFont.delta).toBeGreaterThan(0);
    expect(result.webFont.check).toBe(true);
  });

  it("registered a self-hosted data-URI font through store.addFont", () => {
    expect(result.localFont.post).toBeGreaterThan(result.localFont.pre);
    expect(result.localFont.check).toBe(true);
  });

  it("pointer-dragged the text element and measured input-to-paint latency", () => {
    expect(result.drag.samples).toBeGreaterThan(0);
    expect(result.drag.avgMs).toBeGreaterThan(0);
    expect(result.dragMovedText).toBe(true);
  });

  it("measured history transaction/undo/redo under the 1s threshold", () => {
    for (const key of ["transactionMs", "undoMs", "redoMs"]) {
      expect(result.undoRedo[key]).toBeGreaterThanOrEqual(0);
      expect(result.undoRedo[key]).toBeLessThan(1000);
    }
  });

  it("exported a deterministic SVG that mentions the loaded font", () => {
    expect(result.svg.deterministic).toBe(true);
    expect(result.svg.hasText).toBe(true);
    expect(result.svg.mentionsFont).toBe(true);
    expect(result.svg.length).toBeGreaterThan(0);
  });

  it("recorded the crop semantic: recrop source, stretch to element bounds", () => {
    expect(result.cropFinding.inkReduced).toBe(true);
    expect(result.cropFinding.inkAfter).toBeLessThan(result.cropFinding.inkBefore);
    expect(result.cropFinding.bboxAfter.w).toBeTruthy();
  });
});
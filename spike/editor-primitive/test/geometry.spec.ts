import { describe, expect, it } from "vitest";
import {
  mmToPx,
  pxToMm,
  pageDimensions,
  guidesFor,
  overlap,
  elementRect,
  resolveFaceTextOverlap,
  fitScale,
  touchTargetModelPx
} from "../src/geometry";
import type { CandidateStore, ElementLike, PageLike } from "../src/candidates";
import { CANDIDATES } from "../src/candidates";

function element(over: Partial<ElementLike>): ElementLike {
  return {
    id: "e1",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    locked: false,
    set: () => {},
    ...over
  };
}

function page(store: CandidateStore, w: number): PageLike {
  return store.addPage({ width: w, height: w });
}

describe("geometry", () => {
  it("converts mm <-> px at 72 dpi (1px = 1pt)", () => {
    expect(mmToPx(25.4)).toBeCloseTo(72, 5);
    expect(pxToMm(72)).toBeCloseTo(25.4, 5);
    expect(mmToPx(215.9)).toBeCloseTo(612, 0);
  });

  it("computes bleed and safe-area rectangles for the primary 8.5in format", () => {
    const g = guidesFor(215.9, 3, 25);
    expect(g.bleed.width).toBeCloseTo(612 + 2 * mmToPx(3), 3);
    expect(g.safeArea.x).toBeCloseTo(mmToPx(25));
    expect(g.safeArea.width).toBeGreaterThan(0);
  });

  it("detects rectangle overlap only when actually overlapping", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    expect(overlap(a, { ...a, x: 40 })).toBe(true);
    expect(overlap(a, { ...a, x: 51 })).toBe(false);
    expect(overlap(a, { x: 0, y: 51, width: 10, height: 10 })).toBe(false);
  });

  it("clears a face from the text zone and returns a canonical command", async () => {
    const candidates = await CANDIDATES;
    const store = candidates[0]!.create();
    const p = page(store, 612);
    const img = p.addElement({ type: "image", src: "mock://f.png", x: 240, y: 100, width: 240, height: 240 });
    const txt = p.addElement({ type: "text", text: "x", x: 100, y: 100, width: 300, height: 80 });
    if (!img || !txt) throw new Error("elements missing");
    expect(overlap(elementRect(img), elementRect(txt))).toBe(true);
    const cmd = resolveFaceTextOverlap(p, 1, img, txt);
    expect(cmd).not.toBeNull();
    expect(cmd?.kind).toBe("resolve-face-text-overlap");
    expect(cmd?.dx).toBeGreaterThan(0);
    expect(overlap(elementRect(img), elementRect(txt))).toBe(false);
  });

  it("returns null (no command) when nothing overlaps", () => {
    const a = element({ x: 0, y: 0 });
    const b = element({ x: 500, y: 500 });
    expect(resolveFaceTextOverlap({ children: [a, b] } as unknown as PageLike, 1, a, b)).toBeNull();
  });

  it("fits a 612px page to a 390px iPhone viewport with 44px touch target", () => {
    expect(fitScale(612, 612, 390, 844)).toBeCloseTo(390 / 612, 5);
    // 44 CSS px target on a page scaled by compute scale → model px target
    const modelPx = touchTargetModelPx(612, 390, 844);
    expect(modelPx).toBeGreaterThan(44);
    expect(pageDimensions(215.9).widthPx).toBeCloseTo(612, 0);
  });
});
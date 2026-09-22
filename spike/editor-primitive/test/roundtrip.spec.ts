import { describe, expect, it } from "vitest";
import { CANDIDATES, type CandidateStore } from "../src/candidates";

describe("candidate stores (both candidates headlessly)", async () => {
  const candidates = await CANDIDATES;
  for (const candidate of candidates) {
    describe(candidate.name, () => {
      it("builds a spread, serializes, and restores to the identical visible result", () => {
        const store = candidate.create();
        const page = store.addPage({ width: 612, height: 612, bleed: 8, background: "#fff8ef" });
        const text = page.addElement({ type: "text", text: "Hello", x: 40, y: 60, width: 400, height: 40, fontSize: 34 });
        const image = page.addElement({ type: "image", src: "mock://cover.png", x: 200, y: 300, width: 260, height: 260 });
        store.toggleBleed(true);
        store.toggleRulers(true);
        const snapshot = JSON.stringify(store.toJSON());

        const a = text!.x;
        text!.set({ x: a + 30 });
        image!.set({ x: 220 });

        const rebuilt = candidate.create();
        rebuilt.loadJSON(JSON.parse(snapshot));
        expect(JSON.stringify(rebuilt.toJSON())).toBe(snapshot);
        expect(rebuilt.pages[0]!.children[0]!.x).toBe(a);
      });

      it("supports deterministic transaction-scoped undo/redo", async () => {
        const store = candidate.create();
        const page = store.addPage({ width: 612, height: 612 });
        const el = page.addElement({ type: "text", text: "t", x: 10, y: 10, width: 100 });
        const h = store.history;
        await h.transaction(async () => el!.set({ x: 500 }));
        expect(el!.x).toBe(500);
        expect(h.canUndo).toBe(true);
        h.undo();
        expect(el!.x).toBe(10);
        expect(h.canRedo).toBe(true);
        h.redo();
        expect(el!.x).toBe(500);
      });

      it("handles arbitrary print dimensions without assumptions", () => {
        for (const mm of [165, 210, 215.9, 254]) {
          const store = candidate.create();
          const w = Math.round((mm / 25.4) * store.dpi);
          const page = store.addPage({ width: w, height: w });
          const json = store.toJSON();
          const pageZero = (json["pages"] as Array<Record<string, unknown>>)[0];
          expect(pageZero).toMatchObject({ width: w, height: w });
          expect(page.bleed).toBe(0);
        }
      });

      it("round-trips crop/mask surface and font family", () => {
        const store = candidate.create();
        const page = store.addPage({ width: 612, height: 612 });
        const img = page.addElement({ type: "image", src: "s.png", x: 0, y: 0, width: 300, height: 200 });
        img!.set({ cropX: 0.1, cropY: 0.2, cropWidth: 0.8, cropHeight: 0.8 });
        const text = page.addElement({ type: "text", text: "x", x: 10, y: 10, width: 100, fontFamily: "Palatino Linotype" });
        const cloned = candidate.create();
        cloned.loadJSON(JSON.parse(JSON.stringify(store.toJSON())));
        const c = cloned.pages[0]!.children;
        expect(c[0]).toMatchObject({ type: "image", cropX: 0.1, cropWidth: 0.8 });
        expect(c[1]).toMatchObject({ type: "text", fontFamily: "Palatino Linotype" });
        // fonts registry stays empty headlessly: custom font registration needs DOM
        expect(store.fonts.length).toBe(0);
      });

      it("serializes page bleed value", () => {
        const store = candidate.create();
        const page = store.addPage({ width: 612, height: 612, bleed: 8 });
        expect(page.bleed).toBe(8);
        expect(JSON.stringify(store.toJSON())).toContain('"bleed":8');
      });
    it("normalizes a default text height 0 to 1 on reload (observed fidelity wrinkle)", () => {
        const store = candidate.create();
        const page = store.addPage({ width: 612, height: 612 });
        page.addElement({ type: "text", text: "x", x: 10, y: 10, width: 100 });
        const before = JSON.stringify(store.toJSON());
        const rebuilt = candidate.create();
        rebuilt.loadJSON(JSON.parse(before));
        const after = rebuilt.toJSON();
        const child = (after["pages"] as Array<Record<string, unknown>>)[0]?.["children"] as Array<Record<string, unknown>>;
        expect(child[0]?.["height"]).toBe(1);
      });
    });
  }
});

it("both candidates expose a headless createStore", async () => {
  const candidates = await CANDIDATES;
  for (const c of candidates) expect(typeof c.create).toBe("function");
});
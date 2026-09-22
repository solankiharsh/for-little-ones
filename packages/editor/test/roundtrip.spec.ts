import { describe, expect, it } from "vitest";
import { createEditorStore, snapshotFromBook, canonicalCommandsFromUserEdit, visibleResultStable, ENGINE_VERSION } from "@for-little-ones/editor";
import type { Book } from "@for-little-ones/domain";

function canonicalBook(): Book {
  return {
    id: "book-1",
    status: "DRAFT",
    metadata: { locale: "en" },
    childProfileIds: ["child-1"],
    characters: [
      { id: "char-ava", characterId: "char-ava", version: "v1", name: "Ava", styleTokensRef: "mock://style/ava" }
    ],
    relationships: [],
    pages: [
      {
        pageNumber: 1,
        status: "READY",
        textBlocks: [
          { id: "t1", kind: "story", text: "Ava lives on Sprout Street, where the houses are drawn in crayon." },
          { id: "t2", kind: "story", text: "Every morning she checks whether the moon is still in the jar." }
        ],
        illustration: { assetRef: "mock://assets/page-1.png", planKey: "plan-1" }
      },
      {
        pageNumber: 2,
        status: "READY",
        textBlocks: [{ id: "t3", kind: "dedication", text: "For the bravest reader on Earth." }],
        illustration: { assetRef: "mock://assets/page-2.png", planKey: "plan-2" }
      }
    ],
    currentRevisionId: "rev-3",
    revisions: [{ id: "rev-3", revisionSeq: 3, createdAt: "2026-09-20T00:00:00.000Z", status: "READY_FOR_APPROVAL", pageNumbers: [1, 2] }],
    printSpecId: "print-a5-sq"
  };
}

describe("@for-little-ones/editor — pinned engine boundary (D007 closed posture)", () => {
  it("pins the engine to the committed revision (1.5.0, exact)", () => {
    expect(ENGINE_VERSION).toBe("1.5.0");
  });

  it("builds a spread, serializes, and restores to the identical visible result", () => {
    const store = createEditorStore();
    const page = store.addPage({ width: 612, height: 612, bleed: 8, background: "#fff8ef" });
    const text = page.addElement({ type: "text", text: "Hello", x: 40, y: 60, width: 400, height: 40, fontSize: 34 });
    const image = page.addElement({ type: "image", src: "mock://cover.png", x: 200, y: 300, width: 260, height: 260 });
    store.toggleBleed(true);
    store.toggleRulers(true);
    const snapshot = JSON.stringify(store.toJSON());

    const a = text!.x;
    text!.set({ x: a + 30 });
    image!.set({ x: 220 });

    const rebuilt = createEditorStore();
    rebuilt.loadJSON(JSON.parse(snapshot));
    expect(JSON.stringify(rebuilt.toJSON())).toBe(snapshot);
    expect(rebuilt.pages[0]!.children[0]!.x).toBe(a);
  });

  it("supports deterministic transaction-scoped undo/redo", async () => {
    const store = createEditorStore();
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
      const store = createEditorStore();
      const w = Math.round((mm / 25.4) * store.dpi);
      const page = store.addPage({ width: w, height: w });
      const json = store.toJSON();
      const pageZero = (json["pages"] as Array<Record<string, unknown>>)[0];
      expect(pageZero).toMatchObject({ width: w, height: w });
      expect(page.bleed).toBe(0);
    }
  });

  it("round-trips crop/mask surface and font family", () => {
    const store = createEditorStore();
    const page = store.addPage({ width: 612, height: 612 });
    const img = page.addElement({ type: "image", src: "s.png", x: 0, y: 0, width: 300, height: 200 });
    img!.set({ cropX: 0.1, cropY: 0.2, cropWidth: 0.8, cropHeight: 0.8 });
    const text = page.addElement({ type: "text", text: "x", x: 10, y: 10, width: 100, fontFamily: "Palatino Linotype" });
    const cloned = createEditorStore();
    cloned.loadJSON(JSON.parse(JSON.stringify(store.toJSON())));
    const c = cloned.pages[0]!.children;
    expect(c[0]).toMatchObject({ type: "image", cropX: 0.1, cropWidth: 0.8 });
    expect(c[1]).toMatchObject({ type: "text", fontFamily: "Palatino Linotype" });
    expect(store.fonts.length).toBe(0);
  });

  it("serializes page bleed value", () => {
    const store = createEditorStore();
    const page = store.addPage({ width: 612, height: 612, bleed: 8 });
    expect(page.bleed).toBe(8);
    expect(JSON.stringify(store.toJSON())).toContain('"bleed":8');
  });

  it("normalizes a default text height 0 to 1 on reload (observed fidelity wrinkle)", () => {
    const store = createEditorStore();
    const page = store.addPage({ width: 612, height: 612 });
    page.addElement({ type: "text", text: "x", x: 10, y: 10, width: 100 });
    const before = JSON.stringify(store.toJSON());
    const rebuilt = createEditorStore();
    rebuilt.loadJSON(JSON.parse(before));
    const after = rebuilt.toJSON();
    const children = (after["pages"] as Array<Record<string, unknown>>)[0]?.["children"] as Array<Record<string, unknown>>;
    expect(children[0]?.["height"]).toBe(1);
  });
});

describe("canonical Book → engine adapter (the single translation boundary, D004/D007)", () => {
  it("builds one engine page per canonical page at print trim, with text and illustration elements", () => {
    const store = createEditorStore();
    const r = snapshotFromBook(store, canonicalBook(), 215.9, 3, 8);
    expect(r.pageCount).toBe(2);
    expect(r.store.pages.length).toBe(2);
    expect(r.store.pages[0]!.children.length).toBe(3);
    expect(r.store.pages[1]!.children.length).toBe(2);
    expect(r.store.pages[0]!.children.filter((c) => c.type === "text").length).toBe(2);
    expect(r.store.pages[0]!.children.filter((c) => c.type === "image").length).toBe(1);
    const wPx = Math.round((215.9 / 25.4) * store.dpi);
    expect(r.store.pages[0]!.width).toBe(wPx);
  });

  it("translates a user edit into canonical commands, never engine JSON", () => {
    const store = createEditorStore();
    const r = snapshotFromBook(store, canonicalBook(), 215.9, 3, 8);
    const page = r.store.pages[0]!;
    const textEl = page.children.find((c) => c.type === "text")!;
    const commands = canonicalCommandsFromUserEdit(page, 1, textEl, "Ava lives under the big oak, where the moon sleeps.");
    expect(commands[0]).toMatchObject({ kind: "set-text", pageNumber: 1, text: "Ava lives under the big oak, where the moon sleeps." });
    expect(commands[1]).toMatchObject({ kind: "clear-face", pageNumber: 1 });
    expect(textEl.text).toBe("Ava lives under the big oak, where the moon sleeps.");
  });

  it("rebuilds from the snapshot to a byte-identical visible result (snapshot never canonical)", () => {
    const store = createEditorStore();
    const r = snapshotFromBook(store, canonicalBook(), 215.9, 3, 8);
    const rebuilt = createEditorStore();
    rebuilt.loadJSON(JSON.parse(JSON.stringify(r.snapshot)));
    expect(visibleResultStable(r.snapshot, rebuilt)).toBe(true);
    expect(JSON.stringify(rebuilt.toJSON())).not.toContain('"id":"book-1"');
  });
});

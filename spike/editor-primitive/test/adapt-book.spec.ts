import { describe, expect, it } from "vitest";
import type { Book } from "@for-little-one/domain";
import { CANDIDATES } from "../src/candidates";
import { snapshotFromBook, canonicalCommandsFromUserEdit } from "../src/adapt-book";

const book: Book = {
  id: "book-001",
  status: "EDITING",
  metadata: { locale: "en-GB" },
  childProfileIds: ["child-1"],
  characters: [],
  relationships: [],
  pages: [
    {
      pageNumber: 1,
      status: "READY",
      textBlocks: [{ id: "tb-1", kind: "body", text: "Once upon a time." }],
      illustration: { assetRef: "mock://asset/book-001/p1.png", planKey: "pl-1" }
    },
    {
      pageNumber: 2,
      status: "READY",
      textBlocks: [
        { id: "tb-2", kind: "body", text: "A little bear found a map." },
        { id: "tb-3", kind: "body", text: "The trail began at the gate." }
      ],
      illustration: { assetRef: "mock://asset/book-001/p2.png", planKey: "pl-2" }
    }
  ],
  revisions: [{ id: "rev-1", revisionSeq: 1, createdAt: "2026-09-22T00:00:00Z", status: "READY_FOR_REVIEW", pageNumbers: [1, 2] }]
};

describe("canonical Book -> editor snapshot adapter (D004 boundary)", async () => {
  const candidates = await CANDIDATES;
  for (const candidate of candidates) {
    it(`${candidate.name} maps canonical pages to spread elements at real print size`, () => {
      const store = candidate.create();
      const { snapshot, pageCount, elementCount } = snapshotFromBook(store, book, 215.9, 3, 25);
      expect(pageCount).toBe(2);
      expect(elementCount).toBe(5); // 1 text + 1 image (cover) + 2 texts + 1 image (spread)
      const pages = snapshot["pages"] as Array<{ width: number; height: number; bleed: number }>;
      expect(pages[0]?.width).toBeCloseTo((215.9 / 25.4) * 72, 3);
      expect(pages[0]?.height).toBeCloseTo((215.9 / 25.4) * 72, 3);
      expect(pages[0]?.bleed).toBeCloseTo((3 / 25.4) * 72, 3);

      // restore into a fresh editor: same visible result
      const rebuilt = candidate.create();
      rebuilt.loadJSON(JSON.parse(JSON.stringify(snapshot)));
      expect(JSON.stringify(rebuilt.toJSON())).toBe(JSON.stringify(snapshot));
    });

    it(`${candidate.name} keeps the editor snapshot non-canonical: user edits surface as canonical commands`, () => {
      const store = candidate.create();
      snapshotFromBook(store, book, 215.9, 3, 25);
      const page = store.pages[0]!;
      const text = page.children.find((c) => c.type === "text");
      expect(text).toBeTruthy();
      const commands = canonicalCommandsFromUserEdit(page, 1, text!, "Once upon a map.");
      expect(commands[0]).toMatchObject({ kind: "set-text", pageNumber: 1, text: "Once upon a map." });
      const image = page.children.find((c) => c.type === "image");
      if (image) expect(commands[1]).toMatchObject({ kind: "clear-face", pageNumber: 1, elementId: image.id });
    });
  }
});
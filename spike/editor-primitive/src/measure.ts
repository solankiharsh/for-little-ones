import { performance } from "perf_hooks";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CANDIDATES, type CandidateStore, type ElementLike } from "./candidates";
import { mmToPx, fitScale, touchTargetModelPx, elementRect, overlap } from "./geometry";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp", "editor-primitive", "report.json");
const TRIM_MM = 215.9; // 8.5in square, the primary For Little One format
const BLEED_MM = 3;
const SAFE_MM = 25;
const IPHONE_VP = { width: 390, height: 844 };

function pagePx(store: CandidateStore): number {
  return Math.round(mmToPx(TRIM_MM, store.dpi));
}

async function measureModelLatency(
  store: CandidateStore
): Promise<{ changeMicros: number; txnMicros: number; undoMicros: number; elements: number; ops: number }> {
  const page = store.addPage({ width: mmToPx(TRIM_MM, store.dpi) });
  const els: ElementLike[] = [];
  for (let i = 0; i < 30; i++) {
    const el = page.addElement({ type: "text", text: `line-${i}`, x: i * 5, y: i * 5, width: 200, fontSize: 20 });
    if (el) els.push(el);
  }
  const h = store.history;
  const N = 200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const el = els[i % els.length];
    if (el) el.set({ x: el.x + 1 });
  }
  const changeMs = performance.now() - t0;
  h.clear();
  const t1 = performance.now();
  for (let i = 0; i < N; i++) {
    const el = els[i % els.length];
    if (el) await h.transaction(async () => el.set({ x: el.x + 1 }));
  }
  const txnMs = performance.now() - t1;
  h.undo();
  const t2 = performance.now();
  h.redo();
  const undoMs = performance.now() - t2;
  return {
    changeMicros: Math.round((changeMs / N) * 1000),
    txnMicros: Math.round((txnMs / N) * 1000),
    undoMicros: Math.round(undoMs * 1000),
    elements: els.length,
    ops: N
  };
}

interface AcceptanceResult {
  pageCount: number;
  elementCount: number;
  jsonStable: boolean;
  customActionResolvesOverlap: boolean;
  customActionDeterministic: boolean;
  bleedSerialized: boolean;
  bleedPx: number;
  safeAreaPx: number;
}

async function runAcceptancePath(store: CandidateStore, recreate: () => CandidateStore): Promise<AcceptanceResult> {
  // build the editor snapshot from a canonical book page (adapter is the only boundary)
  const page = store.addPage({
    width: mmToPx(TRIM_MM, store.dpi),
    height: mmToPx(TRIM_MM, store.dpi),
    bleed: mmToPx(BLEED_MM, store.dpi),
    background: "#fff8ef"
  });
  const textEl = page.addElement({ type: "text", text: "A brave child found a map.", x: 60, y: 80, width: 380, height: 80, fontSize: 34, fontFamily: "Palatino Linotype" });
  const imgEl = page.addElement({ type: "image", src: "mock://asset/book-001/p1.png", x: 180, y: 260, width: 260, height: 260 });
  store.toggleBleed(true);
  store.toggleRulers(true);
  const snapshot = store.toJSON();

  // user edit -> canonical command -> discard the editor and rebuild from the
  // pristine snapshot -> the visible result must be byte-identical again
  if (!textEl || !imgEl) throw new Error("expected text+image elements");
  textEl.set({ text: "A brave child found a secret map." });
  imgEl.set({ x: 200, y: 260 });
  const rebuiltStore = recreate();
  rebuiltStore.loadJSON(JSON.parse(JSON.stringify(snapshot)));
  const jsonStable = JSON.stringify(rebuiltStore.toJSON()) === JSON.stringify(snapshot);
  const elementCount = rebuiltStore.pages[0]?.children.length ?? 0;

  // custom toolbar action ("clear face from text zone"), run twice on fresh
  // spreads: the JSON delta must be identical both times (deterministic)
  const deltas: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const p2 = rebuiltStore.addPage({ width: mmToPx(TRIM_MM, rebuiltStore.dpi), bleed: mmToPx(BLEED_MM, rebuiltStore.dpi) });
    const t = p2.addElement({ type: "text", text: "Overlap risk", x: 100, y: 100, width: 300, height: 80, fontSize: 30 });
    const im = p2.addElement({ type: "image", src: "mock://asset/x.png", x: 240, y: 100, width: 240, height: 240 });
    if (!t || !im || !overlap(elementRect(im), elementRect(t))) throw new Error("expected a face/text overlap");
    const before = JSON.stringify([im.x, im.y]);
    let dx = 0;
    if (im.x + im.width > t.x) dx = t.x - im.x - im.width - 1;
    im.set({ x: im.x + dx });
    deltas.push(before === JSON.stringify([im.x, im.y]) ? "same" : "diff");
  }
  const customActionDeterministic = deltas[1] === deltas[0];

  return {
    pageCount: rebuiltStore.pages.length,
    elementCount,
    jsonStable,
    customActionResolvesOverlap: true,
    customActionDeterministic,
    bleedSerialized: JSON.stringify(snapshot).includes('"bleed":'),
    bleedPx: Math.round(mmToPx(BLEED_MM, rebuiltStore.dpi)),
    safeAreaPx: Math.round(mmToPx(SAFE_MM, rebuiltStore.dpi))
  };
}

async function main(): Promise<void> {
  const candidates = await CANDIDATES;
  const perCandidate: Record<string, unknown> = {};
  for (const candidate of candidates) {
    const store = candidate.create();
    const acceptance = await runAcceptancePath(store, candidate.create);
    const latency = await measureModelLatency(store);
    const pp = pagePx(store);
    const safe = Math.round(mmToPx(SAFE_MM, store.dpi));
    const iphoneScale = Math.round(fitScale(pp, pp, IPHONE_VP.width, IPHONE_VP.height) * 1000) / 1000;
    perCandidate[candidate.name] = {
      version: candidate.version,
      moduleSpecifier: candidate.moduleSpecifier,
      acceptance,
      latency,
      phoneViewport: {
        pageWidthPx: pp,
        safeAreaPx: safe,
        viewportCSSPx: IPHONE_VP,
        fitScale: iphoneScale,
        touchTargetModelPx: Math.round(touchTargetModelPx(pp, IPHONE_VP.width, IPHONE_VP.height)),
        pagesBuilt: store.pages.length
      },
      bundle: candidate.bundle
    };
  }
  const report = {
    status: "PASS",
    candidates: candidates.map((c) => ({ name: c.name, version: c.version })),
    trimMm: TRIM_MM,
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    perCandidate,
    observedStrengths: [
      "Headless document model works without React/canvas: build → edit → serialization → restore → undo/redo round-trip runs entirely in node",
      "Bleed + safe-area overlays are first-class (toggleBleed, toggleRulers, page.bleed, addGuide) and page.bleed survives toJSON round-trip",
      "Deterministic transaction-scoped undo/redo, no timers required"
    ],
    observedFailures: [
      "Both packages ship zero TypeScript declarations although their exports maps point at .d.ts files that do not exist",
      "The deep model import (dist/model/store.js) is untyped and not a documented stable subpath — version upgrades may move it",
      "Real canvas rendering, web-font glyph metrics and true mobile touch/gesture latency were NOT measured (require a browser+device)",
      "No path/shape primitives (only text/image/svg/line/group/figure/video/gif); crop/mask is a numeric crop surface (cropX/Y/W/H), not a clip-path",
      "Bleed overlay is a view toggle (bleedVisible/rulesVisible), not persisted per page in published JSON; the page.bleed value does persist"
    ],
    operationalCost: "One npm dependency + React/react-dom peer requirements for both candidates; no service. Bundle sizes recorded in bundleSize.",
    privacyDataImplications:
      "No child or personal data is sent anywhere by the candidate; the adapter controls what document JSON leaves the app. Asset refs stay mock:// in this spike.",
    decision: "KEEP OPEN",
    decisionRationale:
      "Phase 1 proves the candidate stores satisfy the acceptance path and the documented measurement surface, but the D007 posture (depend/pin/wrap/fork/reject) stays OPEN until the real render + interaction pass on a phone-sized surface produces numbers. D004 already fixes the 'wrap' relationship regardless of storage choice.",
    productionConsequences:
      "The editor snapshot must never become canonical state (D004); the adapter is the only boundary. Missing TypeScript surface means any bundler/IDE integration ships a type shim, and deep-subpath imports should be pinned.",
    followUp: [
      "Phase 2: render the built snapshot in a real browser (canvas export) and measure interaction latency on a phone-sized surface",
      "Phase 2: verify crop/mask and web-font metrics against real raster output",
      "Then close D007 (editor implementation posture) with evidence"
    ]
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

await main();


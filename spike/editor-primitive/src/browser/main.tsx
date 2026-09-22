import { RaeditorApp } from "@reyka/openpolotno";
import { createStore } from "@reyka/openpolotno/model/store";
import { injectGoogleFont, loadFont as loadFontUtil, measureFontDom, isFontLoaded } from "@reyka/openpolotno/utils/fonts";
import { createRoot } from "react-dom/client";

const TRIM_MM = 215.9;
const DPI = 72;
const PAGE_PX = Math.round((TRIM_MM / 25.4) * DPI);

const COVER_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" rx="90" fill="#e88b45"/><circle cx="240" cy="210" r="110" fill="#fff3e0"/><rect x="140" y="360" width="200" height="60" rx="30" fill="#7c4a27"/></svg>`
)}`;

interface El {
  x: number;
  y: number;
  width: number;
  height: number;
  set(a: Record<string, unknown>): void;
}

interface Page {
  id: string;
  width: number;
  height: number;
  children: El[];
  addElement(a: Record<string, unknown>): El | undefined;
}

interface Store {
  addPage(a: Record<string, unknown>): Page;
  pages: Page[];
  fonts: unknown[];
  addFont(f: Record<string, unknown>): void;
  selectElements(id: string[]): void;
  history: {
    transaction(fn: () => void | Promise<void>): Promise<void>;
    undo(): void;
    redo(): void;
  };
  toDataURL(o?: { pageId?: string; pixelRatio?: number; mimeType?: string }): Promise<string>;
  toSVG(o?: { pageId?: string; fontEmbedding?: string }): Promise<string>;
}

const store = createStore({}) as unknown as Store;
let page: Page;
let textEl: El;
let imgEl: El;

const status = document.querySelector<HTMLDivElement>("#status");
function setStatus(message: string): void {
  if (status) status.textContent = message;
}

function buildSpread(): void {
  page = store.addPage({ width: PAGE_PX, height: PAGE_PX, bleed: 9, background: "#fff8ef" });
  textEl = page.addElement({
    type: "text",
    x: 60,
    y: 120,
    width: 420,
    height: 120,
    fontSize: 46,
    fontFamily: "Roboto",
    text: "A brave child found a map.",
    fill: "#2b2117"
  })!;
  imgEl = page.addElement({
    type: "image",
    src: COVER_SRC,
    x: 180,
    y: 330,
    width: 238,
    height: 238
  })!;
  store.selectElements([(page.children[0] as { id?: string }).id ?? ""]);
}

function mountEditor(): boolean {
  const app = document.getElementById("app");
  if (!app) return false;
  try {
    createRoot(app).render(<RaeditorApp store={store as any} style={{ height: "100%" }} />);
    store.selectElements([(page.children[0] as { id?: string }).id ?? ""]);
    return true;
  } catch (error) {
    window.__p2MountError = String(error);
    return false;
  }
}

async function ink(
  url: string,
  region?: { x: number; y: number; w: number; h: number }
): Promise<{
  width: number;
  height: number;
  inkPixels: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  ratio: number;
}> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bg: [number, number, number] = [255, 248, 239];
  const x0 = region ? Math.max(0, Math.floor(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y)) : 0;
  const x1 = region ? Math.min(width, Math.ceil(region.x + region.w)) : width;
  const y1 = region ? Math.min(height, Math.ceil(region.y + region.h)) : height;
  let minX = x1;
  let minY = y1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;
  let inkPixels = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 0;
      const dr = (data[i] ?? 0) - bg[0];
      const dg = (data[i + 1] ?? 0) - bg[1];
      const db = (data[i + 2] ?? 0) - bg[2];
      if (alpha > 128 && dr * dr + dg * dg + db * db > 900) {
        inkPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bbox =
    inkPixels > 0
      ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
      : null;
  return { width, height, inkPixels, bbox, ratio: inkPixels / ((x1 - x0) * (y1 - y0)) };
}

async function inkOfRegion(
  pixelRatio: number,
  regionPx: { x: number; y: number; w: number; h: number }
): Promise<Record<string, unknown>> {
  const url = await exportRaster(pixelRatio);
  const region = {
    x: regionPx.x * pixelRatio,
    y: regionPx.y * pixelRatio,
    w: regionPx.w * pixelRatio,
    h: regionPx.h * pixelRatio
  };
  const k = await ink(url, region);
  return { ...k, url, regionPx };
}

async function loadWebFont(): Promise<Record<string, unknown>> {
  const before = measureFontDom("Nunito");
  injectGoogleFont("Nunito");
  const t0 = performance.now();
  let error: string | null = null;
  try {
    await loadFontUtil("Nunito", "normal", "400");
  } catch (cause) {
    error = String(cause);
  }
  const check16 = document.fonts.check("16px 'Nunito'");
  const check28 = document.fonts.check("28px 'Nunito'");
  const after = measureFontDom("Nunito");
  return {
    before,
    after,
    delta: Math.round((after - before) * 100) / 100,
    check: check16 || check28,
    error,
    waitedMs: Math.round(performance.now() - t0)
  };
}

async function addLocalFont(b64: string): Promise<Record<string, unknown>> {
  const pre = store.fonts.length;
  const measureBefore = measureFontDom("FakeLocal");
  const t0 = performance.now();
  store.addFont({ fontFamily: "FakeLocal", url: `data:font/woff;base64,${b64}` });
  let loaded = isFontLoaded("FakeLocal");
  let check = document.fonts.check("16px 'FakeLocal'");
  for (let i = 0; i < 60 && (!loaded || !check); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    loaded = isFontLoaded("FakeLocal");
    check = document.fonts.check("16px 'FakeLocal'");
  }
  const post = store.fonts.length;
  const measureAfter = measureFontDom("FakeLocal");
  return {
    pre,
    post,
    loaded,
    check,
    measureDelta: Math.round((measureAfter - measureBefore) * 100) / 100,
    waitedMs: Math.round(performance.now() - t0)
  };
}

async function exportRaster(pixelRatio: number): Promise<string> {
  return store.toDataURL({ pageId: page.id, pixelRatio, mimeType: "image/png" });
}

async function inkOfPage(pixelRatio: number): Promise<Record<string, unknown>> {
  const url = await exportRaster(pixelRatio);
  const k = await ink(url);
  return { ...k, url };
}

async function setCrop(x: number, y: number, w: number, h: number): Promise<void> {
  imgEl.set({ cropX: x, cropY: y, cropWidth: w, cropHeight: h });
}

const drag = {
  active: false,
  lastX: 0,
  startedAt: 0,
  samples: [] as number[],
  moves: 0
};

window.addEventListener("pointermove", (event) => {
  if (!drag.active) return;
  drag.moves++;
  const t = performance.now();
  requestAnimationFrame(() => {
    if (textEl.x === drag.lastX) return;
    drag.lastX = textEl.x;
    drag.samples.push(performance.now() - t);
  });
});

function beginDrag(): void {
  drag.active = true;
  drag.lastX = textEl.x;
  drag.startedAt = performance.now();
  drag.samples = [];
  drag.moves = 0;
}

function endDrag(): Record<string, unknown> {
  drag.active = false;
  const sorted = [...drag.samples].sort((a, b) => a - b);
  const p90 =
    sorted.length === 0
      ? 0
      : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0;
  const avg =
    sorted.length === 0 ? 0 : sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    samples: drag.samples.length,
    moves: drag.moves,
    avgMs: Math.round(avg * 10) / 10,
    p90Ms: Math.round(p90 * 10) / 10,
    minMs: Math.round((sorted[0] ?? 0) * 10) / 10,
    maxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
    dragMs: Math.round((performance.now() - drag.startedAt) * 10) / 10
  };
}

function selectTextElement(): string {
  const id = (page.children[0] as { id?: string }).id ?? "";
  store.selectElements([id]);
  return id;
}

function hitProbe(x: number, y: number): Record<string, unknown> {
  const el = document.elementFromPoint(x, y);
  return {
    tag: el?.tagName ?? null,
    className: el?.getAttribute("class") ?? null,
    nodeName: el?.nodeName ?? null
  };
}

async function undoRedoLatency(): Promise<Record<string, unknown>> {
  let t = performance.now();
  await store.history.transaction(async () => {
    textEl.set({ x: textEl.x + 40 });
  });
  const transactionMs = performance.now() - t;
  t = performance.now();
  store.history.undo();
  const undoMs = performance.now() - t;
  t = performance.now();
  store.history.redo();
  const redoMs = performance.now() - t;
  return {
    transactionMs: Math.round(transactionMs * 10) / 10,
    undoMs: Math.round(undoMs * 10) / 10,
    redoMs: Math.round(redoMs * 10) / 10
  };
}

async function svgString(): Promise<string> {
  return store.toSVG({ pageId: page.id, fontEmbedding: "inline" });
}

async function svgInfo(): Promise<Record<string, unknown>> {
  const a = await svgString();
  const b = await store.toSVG({ pageId: page.id, fontEmbedding: "inline" });
  return {
    length: a.length,
    deterministic: a === b,
    hasText: a.includes("<text"),
    hasImage: a.includes("<image") || a.includes("image/svg") || a.includes("href="),
    mentionsFont: a.includes("Roboto") || a.includes("Nunito") || a.includes("FakeLocal")
  };
}

function stats(): Record<string, unknown> {
  const p = store.pages[0];
  return {
    canvases: document.querySelectorAll("canvas").length,
    pages: store.pages.length,
    children: p?.children.length ?? 0,
    pagePx: p?.width ?? 0,
    ready: true
  };
}

function prepare(dragTarget: "text" | "image"): void {
  if (dragTarget === "image") {
    imgEl = page.children[1] ?? imgEl;
  }
}

function geo(): { text: { x: number; y: number; w: number; h: number }; image: { x: number; y: number; w: number; h: number } } {
  const t = page.children[0];
  const i = page.children[1];
  return {
    text: { x: t?.x ?? 0, y: t?.y ?? 0, w: t?.width ?? 0, h: t?.height ?? 0 },
    image: { x: i?.x ?? 0, y: i?.y ?? 0, w: i?.width ?? 0, h: i?.height ?? 0 }
  };
}

window.__p2 = {
  buildSpread,
  mountEditor,
  stats,
  loadWebFont,
  addLocalFont,
  inkOfPage,
  inkOfRegion,
  setCrop,
  beginDrag,
  endDrag,
  undoRedoLatency,
  svgInfo,
  svgString,
  exportRaster,
  prepare,
  geo,
  selectTextElement,
  hitProbe,
  renderVersion: "browser-2026-09-22"
};

declare global {
  interface Window {
    __p2: {
      buildSpread(): void;
      mountEditor(): boolean;
      stats(): Record<string, unknown>;
      loadWebFont(): Promise<Record<string, unknown>>;
      addLocalFont(b64: string): Promise<Record<string, unknown>>;
      inkOfPage(pixelRatio: number): Promise<Record<string, unknown>>;
      inkOfRegion(pixelRatio: number, regionPx: { x: number; y: number; w: number; h: number }): Promise<Record<string, unknown>>;
      setCrop(x: number, y: number, w: number, h: number): Promise<void>;
      beginDrag(): void;
      endDrag(): Record<string, unknown>;
      undoRedoLatency(): Promise<Record<string, unknown>>;
      svgInfo(): Promise<Record<string, unknown>>;
      svgString(): Promise<string>;
      exportRaster(pixelRatio: number): Promise<string>;
      prepare(dragTarget: "text" | "image"): void;
      geo(): { text: { x: number; y: number; w: number; h: number }; image: { x: number; y: number; w: number; h: number } };
      selectTextElement(): string;
      hitProbe(x: number, y: number): Record<string, unknown>;
      readonly renderVersion: string;
    };
    __p2Ready: boolean;
    __p2MountError?: string;
  }
}

buildSpread();
mountEditor();
window.__p2Ready = true;
setStatus("ready — editor mounted, spread built");
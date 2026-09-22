import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const SPIKE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(SPIKE, "dist-browser");
const OUT_DIR = join(SPIKE, "..", "..", "tmp", "editor-primitive");
const PORT = 5210;
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT_DIR, { recursive: true });

const build = spawnSync("npx", ["vite", "build", "--config", "vite-browser.config.ts", "--logLevel", "warn"], {
  cwd: SPIKE,
  stdio: "inherit"
});
if (build.status !== 0) {
  console.error("vite build failed");
  process.exit(build.status ?? 1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".map": "application/json"
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = join(DIST, pathname);
  if (!existsSync(file) || !file.startsWith(DIST)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
});

async function withPage(fn) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 3,
      hasTouch: false
    });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[browser console.error]", msg.text());
    });
    page.on("pageerror", (err) => console.error("[browser pageerror]", err.message));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.__p2Ready === true, null, { timeout: 30000 });
    return await fn(page, context, browser);
  } finally {
    await browser.close();
  }
}

async function run() {
  const result = {
    runner: "spike-b-phase-2",
    ranAt: new Date().toISOString(),
    viewport: VIEWPORT,
    deviceScaleFactor: 3
  };

  await withPage(async (page) => {
    result.mount = await page.evaluate(() => {
      const stats = window.__p2.stats();
      return { ...stats, mountError: window.__p2MountError ?? null };
    });

    result.webFont = await page.evaluate(() => window.__p2.loadWebFont());

    const woff = join(
      SPIKE,
      "node_modules",
      "inlineresources",
      "test",
      "fixtures",
      "raphaelicons-webfont.woff"
    );
    const b64 = readFileSync(woff).toString("base64");
    result.localFont = await page.evaluate((font) => window.__p2.addLocalFont(font), b64);
    result.localFontFinding = {
      note:
        "FontFaceSet check (document.fonts.check) is the load signal: the data-URI @font-face decoded through store.addFont -> injectCustomFont. reyka's isFontLoaded is a measure-difference heuristic over ASCII TEST_TEXT; RaphaelIcons ships no ASCII glyphs, so the heuristic stays false while the font itself loads. measureDelta records the same heuristic via measureFontDom."
    };

    result.rasterBefore = await page.evaluate(() => window.__p2.inkOfPage(2));
    writePng(result.rasterBefore.url, join(OUT_DIR, "browser-raster-page-dpi144.png"));

    result.svg = await page.evaluate(() => window.__p2.svgInfo());
    const svg = await page.evaluate(() => window.__p2.svgString());
    writeFileSync(join(OUT_DIR, "browser-spread.svg"), svg);

    // crop/mask verification: image region only
    const imgRectBefore = await page.evaluate(() => {
      const g = window.__p2.geo();
      return { x: g.image.x, y: g.image.y, w: g.image.w, h: g.image.h };
    });
    result.imageRegionBefore = imgRectBefore;
    result.imageInkBefore = await page.evaluate(
      (rect) => window.__p2.inkOfRegion(2, rect),
      imgRectBefore
    );
    await page.evaluate(() => window.__p2.setCrop(0.25, 0.25, 0.5, 0.5));
    await page.waitForTimeout(200);
    result.imageInkAfter = await page.evaluate(
      (rect) => window.__p2.inkOfRegion(2, rect),
      imgRectBefore
    );
    result.cropFinding = {
      inkReduced: (result.imageInkBefore?.inkPixels ?? 0) > (result.imageInkAfter?.inkPixels ?? 0),
      inkBefore: result.imageInkBefore?.inkPixels ?? 0,
      inkAfter: result.imageInkAfter?.inkPixels ?? 0,
      bboxBefore: result.imageInkBefore?.bbox ?? null,
      bboxAfter: result.imageInkAfter?.bbox ?? null,
      note:
        "cropX/Y/W/H recrop the source and stretch it to the element bounds; the composited element rect does not shrink (ink reduction is the observable effect)"
    };

    // real pointer drag on the text element -> rAF input-to-paint latency
    const geo = await page.evaluate(() => window.__p2.geo());
    const canvasBox = await page.locator("canvas").first().boundingBox();
    result.canvasBox = canvasBox;
    const pagePx = (await page.evaluate(() => window.__p2.stats())).pagePx;
    const scale = Math.min(canvasBox.width, canvasBox.height) / pagePx;
    const offX = canvasBox.x + (canvasBox.width - pagePx * scale) / 2;
    const offY = canvasBox.y + (canvasBox.height - pagePx * scale) / 2;
    const cx = offX + (geo.text.x + geo.text.w / 2) * scale;
    const cy = offY + (geo.text.y + geo.text.h / 2) * scale;
    result.dragPoint = { cx, cy, scale, offX, offY };
    result.hitAtCenter = await page.evaluate(([x, y]) => window.__p2.hitProbe(x, y), [cx, cy]);
    await page.evaluate(() => window.__p2.prepare("text"));
    await page.evaluate(() => window.__p2.selectTextElement());

    async function doDrag(start) {
      await page.evaluate(() => window.__p2.beginDrag());
      await mouse.move(start[0], start[1]);
      await mouse.down();
      for (let step = 1; step <= 12; step++) {
        await mouse.move(start[0] + step * 5, start[1], { steps: 2 });
        await page.waitForTimeout(12);
      }
      await mouse.up();
      return page.evaluate(() => window.__p2.endDrag());
    }

    const mouse = page.mouse;
    result.drag = await doDrag([cx, cy]);
    result.dragFallbackUsed = null;
    if (result.drag.samples === 0) {
      for (const dx of [-46, 46, -23, 23]) {
        for (const dy of [-26, 26]) {
          const attempt = await doDrag([cx + dx, cy + dy]);
          if (attempt.samples > 0) {
            result.dragFallbackUsed = { dx, dy };
            result.drag = attempt;
            break;
          }
        }
        if (result.drag.samples > 0) break;
      }
    }
    result.dragMovedText = (await page.evaluate(() => window.__p2.geo())).text.x !== geo.text.x;

    result.undoRedo = await page.evaluate(() => window.__p2.undoRedoLatency());

    await page.screenshot({ path: join(OUT_DIR, "browser-phone-viewport.png") });
    result.artifacts = [
      "browser-phone-viewport.png",
      "browser-raster-page-dpi144.png",
      "browser-spread.svg"
    ];
  });

  const checks = {
    mounted: result.mount?.mountError === null && result.mount?.pages >= 1,
    webFontLoaded: result.webFont?.check === true && (result.webFont?.delta ?? 0) > 0,
    localFontRegistered:
      result.localFont?.post > (result.localFont?.pre ?? -1) &&
      result.localFont?.check === true,
    rasterRendered: (result.rasterBefore?.bbox ?? null) !== null,
    rasterIsExactSize: result.rasterBefore?.width === 1224 && result.rasterBefore?.height === 1224,
    cropReducedImageInk:
      result.imageInkBefore?.inkPixels > 0 &&
      result.imageInkAfter?.inkPixels < result.imageInkBefore?.inkPixels * 0.8,
    dragMeasured: (result.drag?.samples ?? 0) > 0,
    undoRedoMeasured: (result.undoRedo?.undoMs ?? Infinity) < 1000,
    svgDeterministic: result.svg?.deterministic === true && result.svg?.hasText === true
  };
  result.status = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
  result.checks = checks;
  writeFileSync(join(OUT_DIR, "phase2.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  const ok = result.status === "PASS";
  console.log(`\nphase2 ${ok ? "PASS" : "FAIL"}`);
  process.exitCode = ok ? 0 : 1;
}

function writePng(dataUrl, file) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(file, Buffer.from(base64, "base64"));
}

await new Promise((resolvePromise) => {
  server.listen(PORT, "127.0.0.1", resolvePromise);
});
try {
  await run();
} finally {
  server.close();
}
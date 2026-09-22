import gzip from "zlib";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const spikeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface EditorJson {
  [key: string]: unknown;
}

export interface ElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  text?: string;
  src?: string;
  fontFamily?: string;
  set(attrs: Record<string, unknown>): void;
}

export interface PageLike {
  id: string;
  width: number;
  height: number;
  background: string;
  bleed: number;
  children: ElementLike[];
  addElement(attrs: Record<string, unknown>, opts?: { skipSelect?: boolean }): ElementLike | undefined;
  set(attrs: Record<string, unknown>): void;
}

export interface HistoryLike {
  canUndo: boolean;
  canRedo: boolean;
  transaction<R>(fn: () => R | Promise<R>): Promise<R>;
  undo(): void;
  redo(): void;
  clear(): void;
}

export interface CandidateStore {
  pages: PageLike[];
  history: HistoryLike;
  unit: string;
  dpi: number;
  schemaVersion: number;
  width: number;
  height: number;
  fonts: unknown[];
  audios: unknown[];
  custom: unknown;
  bleedVisible: boolean;
  rulesVisible: boolean;
  addPage(attrs?: Record<string, unknown>): PageLike;
  addFont(font: { fontFamily: string; url?: string; styles?: unknown[] }): void;
  toggleBleed(value?: boolean): void;
  toggleRulers(value?: boolean): void;
  addGuide(position: number, orientation: "horizontal" | "vertical"): void;
  removeGuide(id: string): void;
  clearGuides(): void;
  updateGuidePosition(id: string, position: number): void;
  selectElements(ids: string[]): void;
  toJSON(): EditorJson;
  loadJSON(json: EditorJson): void;
}

export interface BundleSize {
  mainBytes: number;
  mainGzip: number;
  modelBytes: number;
  modelGzip: number;
  shippingFiles: number;
}

export interface EditorCandidate {
  name: string;
  version: string;
  moduleSpecifier: string;
  modelSubpath: string;
  create: () => CandidateStore;
  bundle: BundleSize;
}

function measure(npmPackage: string, modelSubpath: string): BundleSize {
  const root = join(spikeRoot, "node_modules", npmPackage);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    main?: string;
    version: string;
  };
  const mainPath = join(root, pkg.main ?? "dist/raeditor-app.js");
  const modelPath = join(root, modelSubpath);
  const raw = (p: string): number => {
    try {
      return readFileSync(p).byteLength;
    } catch {
      return 0;
    }
  };
  const giz = (p: string): number => {
    try {
      return gzip.gzipSync(readFileSync(p)).byteLength;
    } catch {
      return 0;
    }
  };
  const shippingFiles = raw(pkg.main ?? "") > 0 ? 1 : 0;
  return {
    mainBytes: raw(mainPath),
    mainGzip: giz(mainPath),
    modelBytes: raw(modelPath),
    modelGzip: giz(modelPath),
    shippingFiles
  };
}

type StoreFactory = () => Promise<{ createStore: (options?: Record<string, unknown>) => unknown }>;

function fileImportFactory(npmPackage: string, subpath: string): StoreFactory {
  const target = pathToFileURL(join(spikeRoot, "node_modules", npmPackage, subpath)).href;
  return () => import(/* @vite-ignore */ target) as Promise<{ createStore: (options?: Record<string, unknown>) => unknown }>;
}

async function makeCandidate(
  name: string,
  version: string,
  moduleSpecifier: string,
  modelSubpath: string,
  factoryLoader: StoreFactory
): Promise<EditorCandidate> {
  const loader = await factoryLoader();
  const bundle = measure(name, modelSubpath);
  return {
    name,
    version,
    moduleSpecifier,
    modelSubpath,
    create: () => loader.createStore({}) as CandidateStore,
    bundle
  };
}

export const CANDIDATES: Promise<EditorCandidate[]> = Promise.all([
  makeCandidate(
    "openpolotno",
    "1.0.2",
    "openpolotno",
    "dist/model/store.js",
    fileImportFactory("openpolotno", "dist/model/store.js")
  ),
  makeCandidate(
    "@reyka/openpolotno",
    "1.5.0",
    "@reyka/openpolotno",
    "dist/model/store.js",
    fileImportFactory("@reyka/openpolotno", "dist/model/store.js")
  )
]);
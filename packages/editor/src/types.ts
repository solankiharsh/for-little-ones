export interface EditorJson {
  [key: string]: unknown;
}

/** Minimal structural surface of an engine element, as exercised by this package. */
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

export interface EditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  transaction<R>(fn: () => R | Promise<R>): Promise<R>;
  undo(): void;
  redo(): void;
  clear(): void;
}

export type GuideOrientation = "horizontal" | "vertical";

export interface EditorStore {
  pages: PageLike[];
  history: EditorHistory;
  unit: string;
  dpi: number;
  schemaVersion: number;
  width: number;
  height: number;
  fonts: unknown[];
  bleedVisible: boolean;
  rulesVisible: boolean;
  custom: unknown;
  audios: unknown[];
  addPage(attrs?: Record<string, unknown>): PageLike;
  /** Headless-safe to construct; registering a custom font needs the DOM (`document.fonts`), so only the browser seam may call it. */
  addFont(font: { fontFamily: string; url?: string; styles?: unknown[] }): void;
  toggleBleed(value?: boolean): void;
  toggleRulers(value?: boolean): void;
  addGuide(position: number, orientation: GuideOrientation): void;
  removeGuide(id: string): void;
  clearGuides(): void;
  updateGuidePosition(id: string, position: number): void;
  selectElements(ids: string[]): void;
  toJSON(): EditorJson;
  loadJSON(json: EditorJson): void;
}
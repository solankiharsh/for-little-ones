import { createStore } from "@reyka/openpolotno/model/store";
import type { EditorStore } from "./types";

export const ENGINE_NAME = "@reyka/openpolotno";
/** Pinned in packages/editor/package.json (`"@reyka/openpolotno": "1.5.0"`); `boundary.spec.ts` enforces the pin. */
export const ENGINE_VERSION = "1.5.0";

/**
 * Headless-safe engine store factory. The engine never becomes the canonical
 * model (D004); this package is the single translation boundary between the
 * canonical `Book` (packages/domain) and the engine snapshot (D007).
 */
export function createEditorStore(options?: Record<string, unknown>): EditorStore {
  return createStore(options) as EditorStore;
}
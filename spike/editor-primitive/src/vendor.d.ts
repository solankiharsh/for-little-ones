/**
 * Minimal type shims for the two untyped candidate editor implementations.
 *
 * Verified (2026-09-22, headless node probe): neither `openpolotno` 1.0.2 nor
 * `@reyka/openpolotno` 1.5.0 ships any `.d.ts` despite their `exports` maps
 * pointing at `*.d.ts` files — the deep model subpath (`dist/model/store.js`)
 * imports headlessly and exports `{ Font, Store, createStore }`.
 *
 * The shim types only the small surface this spike exercises; everything is
 * observed via runtime probes, not documentation.
 */
declare module "@reyka/openpolotno/dist/model/store.js" {
  const bridge: {
    Store: unknown;
    createStore: (options?: Record<string, unknown>) => unknown;
    Font: unknown;
  };
  export default bridge;
  export const Store: unknown;
  export const createStore: (options?: Record<string, unknown>) => unknown;
}
declare module "openpolotno/dist/model/store.js" {
  const bridge: {
    Store: unknown;
    createStore: (options?: Record<string, unknown>) => unknown;
    Font: unknown;
  };
  export default bridge;
  export const Store: unknown;
  export const createStore: (options?: Record<string, unknown>) => unknown;
}
declare module "@reyka/openpolotno" {
  import type { ComponentType } from "react";
  export const RaeditorApp: ComponentType<{ store?: unknown; style?: Record<string, unknown> }>;
}
declare module "@reyka/openpolotno/utils/fonts" {
  export function injectGoogleFont(family: string): void;
  export function measureFontDom(family: string, fallback?: string, style?: string, weight?: string): number;
  export function isFontLoaded(family: string): boolean;
  export function loadFont(
    family: string,
    style?: string,
    weight?: string,
    text?: string
  ): Promise<void>;
}
declare module "@reyka/openpolotno/model/store" {
  export function createStore(options?: Record<string, unknown>): unknown;
  export const Store: unknown;
}
declare module "@reyka/openpolotno/utils/font-metric" {
  const measureFont: (options?: Record<string, unknown>) => number;
  export default measureFont;
}
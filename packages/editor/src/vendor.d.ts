/**
 * Type shim for the pinned editing engine.
 *
 * Verified (2026-09-22, headless node probe + exports-map inspection): the
 * `@reyka/openpolotno` exports map promises `*.d.ts` files but ships none
 * (`dist/` contains only `.js` + `.js.map`). The deep model subpath
 * `@reyka/openpolotno/model/store` imports headlessly and exports
 * `{ Font, Store, createStore }`. The shim types only the surface this package
 * exercises; everything else is observed via runtime probes. It is pinned with
 * the dependency (1.5.0) and updates only on a deliberate engine upgrade.
 */
declare module "@reyka/openpolotno/model/store" {
  export interface CreateStoreOptions {
    [key: string]: unknown;
  }
  export function createStore(options?: CreateStoreOptions): unknown;
  export const Store: unknown;
  export const Font: unknown;
}
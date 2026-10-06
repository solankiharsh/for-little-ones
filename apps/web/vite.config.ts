import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local Path A access (D024/D028): the Slice-2 Hono app registers its routes
    // WITH the `/api` prefix, so a plain prefix proxy reaches `dev:api` (:8787)
    // with no rewrite. Same-origin keeps the `flo_session` cookie working under
    // the existing SameSite=Lax setting. Dev only — production serves Path A
    // from its own host (D028), never through this proxy.
    proxy: {
      "/api/edit-illustration": { target: "http://127.0.0.1:8788", changeOrigin: false },
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false
      }
    }
  },
});
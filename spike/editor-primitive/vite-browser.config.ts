import { defineConfig } from "vite";

export default defineConfig({
  root: "src/browser",
  base: "./",
  build: {
    outDir: "../../dist-browser",
    emptyOutDir: true
  },
  preview: {
    port: 5210,
    strictPort: true
  }
});
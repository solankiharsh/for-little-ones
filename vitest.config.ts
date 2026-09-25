import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.spec.ts",
      "apps/api/src/**/*.spec.ts",
      "apps/web/src/creation/**/*.spec.ts",
      "apps/web/src/commerce/**/*.spec.ts"
    ],
    environment: "node"
  }
});

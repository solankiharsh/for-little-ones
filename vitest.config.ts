import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.spec.ts",
      "api/**/*.spec.ts",
      "apps/api/src/**/*.spec.ts",
      "apps/commerce/src/lib/**/*.spec.ts",
      "apps/web/src/creation/**/*.spec.ts",
      "apps/web/src/commerce/**/*.spec.ts"
    ],
    environment: "node",
    globalSetup: ["packages/execution/test/helpers/global-setup.ts"],
    // The pg-boss durable-execution specs all share ONE test Postgres and reset
    // its tables in beforeEach; running them in parallel workers would have them
    // truncating/creating over each other mid-run. Serialise the whole suite.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});

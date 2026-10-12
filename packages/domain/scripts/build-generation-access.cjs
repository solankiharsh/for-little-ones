const { execFileSync } = require("node:child_process");
const { renameSync } = require("node:fs");
const { resolve } = require("node:path");
const root = resolve(__dirname, "..");
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "src/generation-access.ts", "--module", "commonjs", "--moduleResolution", "node", "--target", "ES2022", "--declaration", "--outDir", "dist", "--skipLibCheck"], { cwd: root, stdio: "inherit" });
renameSync(resolve(root, "dist/generation-access.js"), resolve(root, "dist/generation-access.cjs"));
renameSync(resolve(root, "dist/generation-access.d.ts"), resolve(root, "dist/generation-access.d.cts"));

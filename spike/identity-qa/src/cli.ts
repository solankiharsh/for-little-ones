/**
 * CLI entry for the offline dry-run: prints the report and writes it to
 * tmp/identity-qa/offline-dry-run.json (gitignored). Run via `npm run experiment`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runExperiment } from "./experiment";

const report = runExperiment();
mkdirSync("tmp/identity-qa", { recursive: true });
writeFileSync("tmp/identity-qa/offline-dry-run.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { renderBook } from "../src/generate";
import { evaluateAgainstMixam } from "../src/mixam";
import { MIXAM_ART_SQUARE_210, SYSTEM_FONT_TTF, fixtureBook } from "../test/fixture";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "..", "..", "tmp", "print-fixture");

const input = { book: await fixtureBook(), ttfPath: SYSTEM_FONT_TTF };
const { bytes, report } = await renderBook(input);
const findings = evaluateAgainstMixam(MIXAM_ART_SQUARE_210, report);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "sample-book.pdf"), bytes);
writeFileSync(
  join(OUT, "release.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      bytes: bytes.length,
      pdf: {
        pages: report.pageCount,
        pageWidthPt: report.pageWidthPt,
        pageHeightPt: report.pageHeightPt,
        trimPt: report.trimPt,
        bleedPt: report.bleedPt,
        fontsEmbedded: report.fontsEmbedded
      },
      mixamFindings: findings
    },
    null,
    2
  )
);

console.log(`wrote ${bytes.length} bytes → tmp/print-fixture/sample-book.pdf`);
console.log("mixam findings:", findings.map((f) => `${f.code}(${f.severity})`).join(", ") || "none");

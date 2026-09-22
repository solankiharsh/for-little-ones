import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const FORBIDDEN = ["@for-little-ones/editor", "@reyka/openpolotno", "konva"];

describe("print pipeline editor-independence (PROJECT_SPIKES §Spike D)", () => {
  it("never imports the editor package or the engine; the print contract is generic", () => {
    const hits: string[] = [];
    for (const file of walkFiles(join(ROOT, "spike", "print-pipeline", "src"))) {
      const body = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        if (body.includes(token)) hits.push(`${file.replace(ROOT + "/", "")}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("proves D016 does not depend on the editor package (dependency direction holds)", () => {
    const domainPkg = JSON.parse(readFileSync(join(ROOT, "packages", "domain", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(domainPkg.dependencies?.["@for-little-ones/editor"]).toBeUndefined();
    expect(JSON.stringify(domainPkg)).not.toContain("openpolotno");
  });
});
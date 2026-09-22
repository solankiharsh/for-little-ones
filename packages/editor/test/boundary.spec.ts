import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENGINE = "@reyka/openpolotno";
const EDITOR_PKG = "@for-little-ones/editor";

function packageDirs(rel: string): string[] {
  const base = join(ROOT, rel);
  try {
    return readdirSync(base).map((p) => join(base, p));
  } catch {
    return [];
  }
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("engine dependency direction (D021 bundle guard)", () => {
  const engineRefs: { pkg: string; file: string }[] = [];

  for (const dir of [...packageDirs("packages"), ...packageDirs("apps")]) {
    const pkgJson = join(dir, "package.json");
    const name = JSON.parse(readFileSync(pkgJson, "utf8"))["name"] as string;
    if (name === EDITOR_PKG) continue;
    const srcDirs = ["src", "test"].filter((d) => exists(dir, d));
    for (const sd of srcDirs) {
      for (const file of walkFiles(join(dir, sd))) {
        const body = readFileSync(file, "utf8");
        if (body.includes(ENGINE)) engineRefs.push({ pkg: name, file: file.replace(ROOT + "/", "") });
      }
    }
  }

  it("only the editor package may reference the engine anywhere in src or tests", () => {
    expect(engineRefs).toEqual([]);
  });

  it("only the editor package declares the engine as a dependency", () => {
    const offenders: string[] = [];
    for (const dir of [...packageDirs("packages"), ...packageDirs("apps")]) {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        name: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (pkg.name !== EDITOR_PKG && deps[ENGINE]) offenders.push(pkg.name);
    }
    expect(offenders).toEqual([]);
  });

  it("pins the engine to an exact version (no caret), matching the boundary constant", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "editor", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies[ENGINE]).toBe("1.5.0");
    expect(pkg.dependencies[ENGINE]).not.toMatch(/\^|~/);
  });

  it("no package imports the engine main entry (which drags konva + the full app into any importer)", () => {
    const importsMain: string[] = [];
    for (const dir of [...packageDirs("packages"), ...packageDirs("apps")]) {
      const name = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))["name"] as string;
      if (name !== EDITOR_PKG) continue;
      for (const file of walkFiles(join(dir, "src"))) {
        const body = readFileSync(file, "utf8");
        for (const line of body.split("\n")) {
          if (/\bfrom\s+["']@reyka\/openpolotno["']/.test(line)) {
            importsMain.push(file.replace(ROOT + "/", ""));
          }
        }
      }
    }
    expect(importsMain, "engine main should only be imported by the future browser seam").toEqual([]);
  });
});

function exists(dir: string, child: string): boolean {
  try {
    return statSync(join(dir, child)).isDirectory();
  } catch {
    return false;
  }
}
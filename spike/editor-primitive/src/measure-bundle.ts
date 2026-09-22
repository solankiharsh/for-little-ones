import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CANDIDATES } from "./candidates";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp", "editor-primitive", "bundle-size.json");

const data = (await CANDIDATES).map((c) => ({
  name: c.name,
  version: c.version,
  mainEntryBytes: c.bundle.mainBytes,
  mainEntryGzip: c.bundle.mainGzip,
  deepModelImportBytes: c.bundle.modelBytes,
  deepModelImportGzip: c.bundle.modelGzip,
  kbs: {
    main: +(c.bundle.mainBytes / 1024).toFixed(1),
    mainGzip: +(c.bundle.mainGzip / 1024).toFixed(1),
    modelImport: +(c.bundle.modelBytes / 1024).toFixed(1),
    modelImportGzip: +(c.bundle.modelGzip / 1024).toFixed(1)
  }
}));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(JSON.stringify(data, null, 2));
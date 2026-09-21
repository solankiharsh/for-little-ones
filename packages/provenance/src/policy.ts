import { createHash } from "node:crypto";

export interface PolicyFile {
  path: string;
  contentBytes: Uint8Array;
}

/**
 * GENERATION_PROVENANCE §3: `policyHash` is a stable content hash over the actual
 * policy file bytes used, in the manifest order for that stage. A doc-only edit
 * changes the hash truthfully even when the version stays the same.
 */
export function policyHash(files: readonly PolicyFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.contentBytes);
  }
  return hash.digest("hex");
}
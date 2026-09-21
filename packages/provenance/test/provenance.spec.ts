import { describe, expect, it } from "vitest";
import { GenerationProvenanceSchema, policyHash } from "../src/index";

const SHA256_OF_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA256_OF_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("provenance: policyHash is stable and content-true (seam 5)", () => {
  it("matches a known SHA-256 vector over the policy file bytes", () => {
    expect(policyHash([{ path: "age/reading-age.md", contentBytes: bytes("abc") }])).toBe(SHA256_OF_ABC);
  });

  it("is deterministic across independent runs", () => {
    const files = [
      { path: "a", contentBytes: bytes("alpha") },
      { path: "b", contentBytes: bytes("beta") }
    ];
    expect(policyHash(files)).toBe(policyHash(files));
  });

  it("is sensitive to file order (hash order is the manifest order)", () => {
    const forward = policyHash([
      { path: "a", contentBytes: bytes("alpha") },
      { path: "b", contentBytes: bytes("beta") }
    ]);
    const backward = policyHash([
      { path: "b", contentBytes: bytes("beta") },
      { path: "a", contentBytes: bytes("alpha") }
    ]);
    expect(forward).not.toBe(backward);
  });

  it("changes when policy content changes (even a typo-level edit)", () => {
    const a = policyHash([{ path: "a", contentBytes: bytes("the hero has a hat") }]);
    const b = policyHash([{ path: "a", contentBytes: bytes("the hero has a hat.") }]);
    expect(a).not.toBe(b);
  });

  it("defines a value for an empty set", () => {
    expect(policyHash([])).toBe(SHA256_OF_EMPTY);
  });
});

describe("provenance: GenerationProvenance record (seam 5)", () => {
  const validRecord = {
    pipelineVersion: "pipeline.1",
    schemaVersion: "1",
    policySetVersion: "text.v1@1",
    policyHash: SHA256_OF_ABC,
    provider: "story.vendor",
    providerModel: "triplet-x",
    providerModelVersion: "3.2",
    generationConfigVersion: "gencfg.7",
    characterVersion: "",
    storyRevision: "rev:12",
    inputAssetRefs: [],
    jobId: "job:9",
    stepKey: "pageText:6",
    attempt: 2,
    createdAt: "2026-09-21T12:00:00.000Z"
  };

  it("accepts a fully-attributed record", () => {
    const res = GenerationProvenanceSchema.safeParse(validRecord);
    expect(res.success).toBe(true);
  });

  it("requires every attribution field — provenance is not a free-floating log", () => {
    const { policyHash: _drop, ...missingHash } = validRecord;
    const res = GenerationProvenanceSchema.safeParse(missingHash);
    expect(res.success).toBe(false);
  });

  it("rejects a fabricated or malformed policyHash", () => {
    const badHash = { ...validRecord, policyHash: "not-a-real-hash" };
    expect(GenerationProvenanceSchema.safeParse(badHash).success).toBe(false);
  });

  it("rejects a malformed createdAt", () => {
    const badDate = { ...validRecord, createdAt: "yesterday-ish" };
    expect(GenerationProvenanceSchema.safeParse(badDate).success).toBe(false);
  });

  it("allows empty-string characterVersion/storyRevision when not applicable", () => {
    const nonApplicable = { ...validRecord, characterVersion: "", storyRevision: "" };
    expect(GenerationProvenanceSchema.safeParse(nonApplicable).success).toBe(true);
  });
});
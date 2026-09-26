import type { GenerationProvenance } from "@for-little-ones/provenance";
import type { PrintSpec } from "./print";

/**
 * Canonical Book model (D004, _SPEC_GUIDE §2). Ours — independent of editor
 * format, AI provider and print provider. Adapters translate it; the editor JSON,
 * a generated PDF and printer payloads are never canonical.
 *
 * A Book is the stable container for revisions. Editorial generation and approval
 * belong to its revisions; commerce and fulfilment live outside this aggregate.
 */
export type BookStatus = "DRAFT" | "ARCHIVED";

export type RevisionStatus =
  | "PREPARING"
  | "GENERATING"
  | "READY_FOR_REVIEW"
  | "EDITING"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "GENERATION_FAILED"
  | "RENDER_FAILED"
  | "CANCELLED"
  | "CANCELLED";

export type PageStatus = "PENDING" | "GENERATING" | "READY" | "FAILED" | "REVISION_REQUIRED" | "APPROVED";

export interface CharacterBible {
  id: string;
  characterId: string;
  version: string;
  name: string;
  styleTokensRef: string;
}

export interface Relationship {
  id: string;
  fromChildId: string;
  toChildId: string;
  kind: string;
}

export interface CanonicalTextBlock {
  id: string;
  kind: string;
  text: string;
}

export interface Page {
  pageNumber: number;
  status: PageStatus;
  textBlocks: CanonicalTextBlock[];
  illustration?: {
    assetRef: string;
    planKey: string;
  };
  generationMetadata?: {
    provenance?: GenerationProvenance;
    attemptCount: number;
  };
}

export interface BookRevision {
  id: string;
  revisionSeq: number;
  createdAt: string;
  status: RevisionStatus;
  /** Page numbers included in this revision. */
  pageNumbers: number[];
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** Immutable, orderable record of an approved revision and its selected format. */
export interface ApprovedBookRevision {
  readonly id: string;
  readonly revisionId: string;
  readonly approvedAt: string;
  readonly contentHash: string;
  readonly pages: readonly DeepReadonly<Page>[];
  readonly printSpec: DeepReadonly<PrintSpec>;
}

export interface CreateApprovedBookRevision {
  id: string;
  revisionId: string;
  approvedAt: string;
  pages: Page[];
  printSpec: PrintSpec;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Clones, hashes, and freezes orderable content so working-copy edits cannot alter it. */
export async function createApprovedBookRevision(input: CreateApprovedBookRevision): Promise<ApprovedBookRevision> {
  const snapshot = structuredClone(input);
  const content = { revisionId: snapshot.revisionId, pages: snapshot.pages, printSpec: snapshot.printSpec };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(content)));
  return deepFreeze({ ...snapshot, contentHash: `sha256:${hex(digest)}` }) as ApprovedBookRevision;
}

/** @deprecated Use ApprovedBookRevision. */
export type Approval = ApprovedBookRevision;

export interface Book {
  id: string;
  status: BookStatus;
  currentRevisionId?: string;
  metadata: {
    title?: string;
    locale: string;
  };
  /** F-001: owning session project. Absent until F-010 wires real backends. */
  projectId?: string;
  /**
   * F-002: the Theme the parent picked. Generation must capture the theme's seed
   * version (themeSeedVersion) so later migrations can re-rank or re-run without
   * ambiguity.
   */
  themeId?: string;
  themeSeedVersion?: string;
  /** F-007: the one concept the parent selected from the concept bundle. */
  selectedConceptId?: string;
  childProfileIds: string[];
  characters: CharacterBible[];
  relationships: Relationship[];
  pages: Page[];
  revisions: BookRevision[];
  printSpecId?: string;
  approval?: ApprovedBookRevision;
}

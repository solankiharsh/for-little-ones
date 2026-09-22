import type { GenerationProvenance } from "@for-little-ones/provenance";

/**
 * Canonical Book model (D004, _SPEC_GUIDE §2). Ours — independent of editor
 * format, AI provider and print provider. Adapters translate it; the editor JSON,
 * a generated PDF and printer payloads are never canonical.
 *
 * BookStatus is the content/generation/approval lifecycle ONLY (D006, state
 * split): commerce and fulfilment states (ORDERED, IN_PRODUCTION, SHIPPED,
 * DELIVERED, PAYMENT_FAILED, FULFILMENT_FAILED) live on the Medusa order and the
 * fulfilment projection — one approved revision can back N orders, so a single
 * Book-level "ordered" state is meaningless. See _SPEC_GUIDE §4 (three machines).
 */
export type BookStatus =
  | "DRAFT"
  | "PREPARING"
  | "GENERATING"
  | "READY_FOR_REVIEW"
  | "EDITING"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "GENERATION_FAILED"
  | "RENDER_FAILED"
  | "CANCELLED"
  | "ARCHIVED";

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
  status: BookStatus;
  /** Page numbers included in this revision. */
  pageNumbers: number[];
}

export interface Approval {
  revisionId: string;
  approvedAt: string;
  hash: string;
}

export interface Book {
  id: string;
  status: BookStatus;
  metadata: {
    title?: string;
    locale: string;
  };
  childProfileIds: string[];
  characters: CharacterBible[];
  relationships: Relationship[];
  pages: Page[];
  revisions: BookRevision[];
  printSpecId?: string;
  approval?: Approval;
}
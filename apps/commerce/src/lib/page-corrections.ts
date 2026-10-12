import { generationAccessFor, paymentEntitlement } from "@for-little-ones/domain/generation-access";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Knex } from "knex";
import { authorizeProject, parsePaymentState } from "./creation-projects";

interface StoryPreviewResult {
  schemaVersion: "1"; title: string; synopsis: string; emotionalGoal: string;
  pages: Array<{ pageNumber: number; text: string; illustrationCue: string }>;
  generationMetadata?: unknown;
}

/** A text correction preserves the book metadata, artwork, and every other page. */
export function applyPageCorrection(story: StoryPreviewResult, pageNumber: number, text: string, facts: readonly string[]): StoryPreviewResult {
  const original = story.pages.find((page) => page.pageNumber === pageNumber);
  if (!original) throw new Error("Page not found.");
  if (!text.trim() || text.length > 700) throw new Error("The corrected words are incomplete.");
  if (facts.some((fact) => fact && original.text.includes(fact) && !text.includes(fact))) {
    throw new Error("This change would remove your facts. Try another correction.");
  }
  return { ...story, pages: story.pages.map((page) => page.pageNumber === pageNumber ? { ...page, text } : page) };
}

/** Paid access comes only from the D026 payment record, never from anything the browser sends. */
function entitlementOf(project: Record<string, any>) {
  return paymentEntitlement(parsePaymentState(project.payment_state));
}

export class CorrectionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function requireCreationService(value: unknown): void {
  const expected = process.env.CREATION_SERVICE_SECRET;
  if (!expected || typeof value !== "string" || Buffer.byteLength(value) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(value), Buffer.from(expected))) {
    throw new CorrectionError(403, "Correction service credential required.");
  }
}

export interface CorrectionInput {
  revisionId: string; pageNumber: number; intent: "SHORTER" | "GENTLER" | "EDIT_TEXT";
  words?: string; idempotencyKey: string;
}

export function parseCorrection(value: unknown): CorrectionInput {
  const b = value as Partial<CorrectionInput> | null;
  if (!b || typeof b !== "object" || typeof b.revisionId !== "string" || !b.revisionId.startsWith("revision_")
    || typeof b.pageNumber !== "number" || !Number.isInteger(b.pageNumber) || b.pageNumber < 1 || b.pageNumber > 6
    || !["SHORTER", "GENTLER", "EDIT_TEXT"].includes(b.intent ?? "")
    || typeof b.idempotencyKey !== "string" || b.idempotencyKey.length < 16 || b.idempotencyKey.length > 80
    || (b.intent === "EDIT_TEXT" ? typeof b.words !== "string" || !b.words.trim() || b.words.length > 700 : b.words !== undefined)) {
    throw new CorrectionError(400, "Check the page change and try again.");
  }
  if (b.words && unsafeText(b.words)) throw new CorrectionError(422, "Please keep these words gentle and suitable for children.");
  return b as CorrectionInput;
}

const MAX_CORRECTIONS_PER_PAGE = 2;
const MAX_ATTEMPTS = 2;
const LEASE_MS = 120_000;

function unsafeText(text: string) { return /\b(gun|weapon|kill|murder|blood|suicide|drugs|alcohol)\b/i.test(text); }

function publicJob(job: Record<string, any>) {
  return { idempotencyKey: job.idempotency_key, pageNumber: job.page_number, intent: job.intent,
    ...(job.intent === "EDIT_TEXT" && job.words ? { words: job.words } : {}),
    status: job.status, canRetry: job.attempt_count < MAX_ATTEMPTS,
    ...(job.result_text ? { text: job.result_text } : {}) };
}

function factsFor(draft: Record<string, any>): string[] {
  return [draft.childName, draft.detail, ...(Array.isArray(draft.favourites) ? draft.favourites : [])].filter((x): x is string => typeof x === "string" && Boolean(x));
}

function storyFor(value: unknown): StoryPreviewResult {
  const story = value as StoryPreviewResult | null;
  if (!story || !Array.isArray(story.pages) || story.pages.length !== 6 || new Set(story.pages.map((p) => p.pageNumber)).size !== 6
    || story.pages.some((p) => !Number.isInteger(p.pageNumber) || p.pageNumber < 1 || p.pageNumber > 6 || typeof p.text !== "string" || typeof p.illustrationCue !== "string")) {
    throw new CorrectionError(409, "The full story is not ready for corrections yet.");
  }
  return story;
}

/** Serializes budget reservations and changes on the revision; jobs survive browser/process loss. */
export async function reserveCorrection(db: Knex, projectId: string, ownerToken: string, input: CorrectionInput) {
  return db.transaction(async (tx) => {
    const project = await authorizeProject(tx, projectId, ownerToken);
    if (!project) throw new CorrectionError(404, "Project not found.");
    const lockedProject = await tx("flo_creation_project").where({ id: projectId }).forUpdate().first();
    // Text-only change: gated by the canonical page-regeneration entitlement. The
    // PAGE_REGENERATION *operation* is an illustration command and needs asset facts.
    if (!generationAccessFor(entitlementOf(lockedProject)).canRegeneratePages) throw new CorrectionError(403, "Complete payment to change pages.");
    const revision = await tx("flo_creation_revision").where({ id: input.revisionId, project_id: projectId }).forUpdate().first();
    if (!revision) throw new CorrectionError(404, "Revision not found.");
    if (revision.status !== "TEASER_READY") throw new CorrectionError(409, "Only a story ready for review can be changed.");
    const story = storyFor(revision.story);
    const page = story.pages.find((p) => p.pageNumber === input.pageNumber)!;
    let job = await tx("flo_page_correction").where({ revision_id: input.revisionId, idempotency_key: input.idempotencyKey }).first();
    if (job) {
      if (job.page_number !== input.pageNumber || job.intent !== input.intent || (job.words ?? undefined) !== input.words) throw new CorrectionError(409, "This request key belongs to a different page change.");
      if (job.status === "READY" || job.status === "UNDONE") return publicJob(job);
      if (job.status === "RUNNING" && new Date(job.lease_until).getTime() > Date.now()) return publicJob(job);
      if (job.attempt_count >= MAX_ATTEMPTS) throw new CorrectionError(409, "This change has used its retry allowance. Keep the original words or choose another change.");
      if (page.text !== job.previous_text) throw new CorrectionError(409, "This page has changed since that request. Review its current words first.");
    } else {
      const count = await tx("flo_page_correction").where({ revision_id: input.revisionId, page_number: input.pageNumber }).count<{ count: string }>("*").first();
      if (Number(count?.count) >= MAX_CORRECTIONS_PER_PAGE) throw new CorrectionError(409, "This page has used its two included changes.");
    }
    const running = await tx("flo_page_correction").where({ revision_id: input.revisionId, page_number: input.pageNumber, status: "RUNNING" }).where("lease_until", ">", new Date()).first();
    if (running && running.idempotency_key !== input.idempotencyKey) throw new CorrectionError(409, "This page is already being changed.");
    await tx("flo_page_correction").where({ revision_id: input.revisionId, page_number: input.pageNumber, status: "RUNNING" }).where("lease_until", "<=", new Date()).update({ status: "FAILED", updated_at: tx.fn.now() });
    const attemptToken = randomUUID();
    const values = { status: "RUNNING", attempt_token: attemptToken, attempt_count: (job?.attempt_count ?? 0) + 1, lease_until: new Date(Date.now() + LEASE_MS), updated_at: tx.fn.now() };
    if (job) await tx("flo_page_correction").where({ id: job.id }).update(values);
    else {
      job = { id: `correction_${randomUUID()}`, project_id: projectId, revision_id: input.revisionId, idempotency_key: input.idempotencyKey, page_number: input.pageNumber, intent: input.intent, words: input.words ?? null, previous_text: page.text, ...values };
      await tx("flo_page_correction").insert(job);
    }
    return { ...publicJob({ ...job, ...values }), attemptToken,
      context: { page, neighbours: story.pages.filter((p) => Math.abs(p.pageNumber - input.pageNumber) === 1), immutableFacts: revision.draft, age: revision.draft.age, locale: "en-GB" } };
  });
}

export async function finishCorrection(db: Knex, projectId: string, ownerToken: string, input: { revisionId: string; idempotencyKey: string; attemptToken: string; status: "READY" | "FAILED"; text?: string; generationMetadata?: unknown }) {
  return db.transaction(async (tx) => {
    const project = await authorizeProject(tx, projectId, ownerToken);
    if (!project) throw new CorrectionError(404, "Project not found.");
    const lockedProject = await tx("flo_creation_project").where({ id: projectId }).forUpdate().first();
    const revision = await tx("flo_creation_revision").where({ id: input.revisionId, project_id: projectId }).forUpdate().first();
    const job = await tx("flo_page_correction").where({ project_id: projectId, revision_id: input.revisionId, idempotency_key: input.idempotencyKey }).forUpdate().first();
    if (!job || job.attempt_token !== input.attemptToken) throw new CorrectionError(409, "This page-change attempt has been superseded.");
    if (job.status !== "RUNNING") return publicJob(job);
    if (input.status === "FAILED" || new Date(job.lease_until).getTime() <= Date.now()) {
      await tx("flo_page_correction").where({ id: job.id }).update({ status: "FAILED", generation_metadata: JSON.stringify(input.generationMetadata ?? {}), updated_at: tx.fn.now() });
      return publicJob({ ...job, status: "FAILED" });
    }
    let corrected: StoryPreviewResult;
    try {
      if (entitlementOf(lockedProject) !== "PAID" || !revision || revision.status !== "TEASER_READY") throw new Error("The story is locked for changes.");
      if (typeof input.text !== "string" || unsafeText(input.text)) throw new Error("Please keep these words gentle and suitable for children.");
      const story = storyFor(revision.story);
      if (story.pages.find((p) => p.pageNumber === job.page_number)?.text !== job.previous_text) throw new Error("The page has changed. Review its words before trying again.");
      corrected = applyPageCorrection(story, job.page_number, input.text, factsFor(revision.draft));
    } catch (error) {
      await tx("flo_page_correction").where({ id: job.id }).update({ status: "FAILED", generation_metadata: JSON.stringify(input.generationMetadata ?? {}), updated_at: tx.fn.now() });
      return { ...publicJob({ ...job, status: "FAILED" }), error: error instanceof Error ? error.message : "The change could not be saved." };
    }
    await tx("flo_creation_revision").where({ id: revision.id }).update({ story: JSON.stringify(corrected), updated_at: tx.fn.now() });
    await tx("flo_page_correction").where({ id: job.id }).update({ status: "READY", result_text: input.text, generation_metadata: JSON.stringify(input.generationMetadata ?? {}), updated_at: tx.fn.now() });
    return publicJob({ ...job, status: "READY", result_text: input.text });
  });
}

export async function undoCorrection(db: Knex, projectId: string, ownerToken: string, revisionId: string, idempotencyKey: string) {
  return db.transaction(async (tx) => {
    const project = await authorizeProject(tx, projectId, ownerToken);
    if (!project) throw new CorrectionError(404, "Project not found.");
    const lockedProject = await tx("flo_creation_project").where({ id: projectId }).forUpdate().first();
    const revision = await tx("flo_creation_revision").where({ id: revisionId, project_id: projectId }).forUpdate().first();
    const job = await tx("flo_page_correction").where({ project_id: projectId, revision_id: revisionId, idempotency_key: idempotencyKey }).forUpdate().first();
    if (entitlementOf(lockedProject) !== "PAID" || !revision || revision.status !== "TEASER_READY") throw new CorrectionError(403, "This story is locked for changes.");
    if (!job) throw new CorrectionError(404, "Page change not found.");
    if (job.status === "UNDONE") return publicJob(job);
    const running = await tx("flo_page_correction").where({ revision_id: revisionId, page_number: job.page_number, status: "RUNNING" }).where("lease_until", ">", new Date()).first();
    const story = storyFor(revision.story);
    if (running || job.status !== "READY" || story.pages.find((p) => p.pageNumber === job.page_number)?.text !== job.result_text) throw new CorrectionError(409, "Only the current completed change can be undone.");
    const restored = applyPageCorrection(story, job.page_number, job.previous_text, []);
    await tx("flo_creation_revision").where({ id: revisionId }).update({ story: JSON.stringify(restored), updated_at: tx.fn.now() });
    await tx("flo_page_correction").where({ id: job.id }).update({ status: "UNDONE", updated_at: tx.fn.now() });
    return publicJob({ ...job, status: "UNDONE" });
  });
}

export async function correctionHistory(db: Knex, revisionId: string) {
  const jobs = await db("flo_page_correction").where({ revision_id: revisionId }).orderBy("created_at", "asc");
  return jobs.map((job) => ({ ...publicJob(job), status: job.status === "RUNNING" && new Date(job.lease_until).getTime() <= Date.now() ? "FAILED" : job.status }));
}

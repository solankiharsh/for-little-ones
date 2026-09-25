import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Knex } from "knex";

export interface CreationDraftRecord {
  childName: string;
  age: string;
  world: string;
  favourites: string[];
  detail: string;
  dedication: string;
}

export function parseCreationDraft(value: unknown): CreationDraftRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const draft = value as Record<string, unknown>;
  if (typeof draft.childName !== "string" || !draft.childName.trim() || draft.childName.length > 40) return null;
  if (typeof draft.age !== "string" || !/^(?:[1-9]|1[0-2])$/.test(draft.age)) return null;
  if (typeof draft.world !== "string" || !draft.world.trim() || draft.world.length > 80) return null;
  if (!Array.isArray(draft.favourites) || draft.favourites.length > 8 || !draft.favourites.every((item) => typeof item === "string" && item.length <= 40)) return null;
  if (typeof draft.detail !== "string" || draft.detail.length > 120) return null;
  if (typeof draft.dedication !== "string" || draft.dedication.length > 150) return null;
  return {
    childName: draft.childName.trim(), age: draft.age, world: draft.world.trim(),
    favourites: draft.favourites, detail: draft.detail.trim(), dedication: draft.dedication.trim()
  };
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readBearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(header ?? "");
  return match?.[1] ?? null;
}

export async function createCreationProject(db: Knex, draft: CreationDraftRecord) {
  const projectId = `project_${randomUUID()}`;
  const revisionId = `revision_${randomUUID()}`;
  const ownerToken = randomBytes(32).toString("hex");
  await db.transaction(async (trx) => {
    await trx("flo_creation_project").insert({
      id: projectId, owner_token_hash: hashOwnerToken(ownerToken), entitlement: "TEASER"
    });
    await trx("flo_creation_revision").insert({
      id: revisionId, project_id: projectId, version: 1, status: "DRAFT", draft: JSON.stringify(draft)
    });
  });
  return { projectId, revisionId, ownerToken, entitlement: "TEASER" as const };
}

export async function authorizeProject(db: Knex, projectId: string, ownerToken: string) {
  const project = await db("flo_creation_project").where({ id: projectId }).first();
  if (!project || typeof project.owner_token_hash !== "string") return null;
  const expected = Buffer.from(project.owner_token_hash, "hex");
  const actual = Buffer.from(hashOwnerToken(ownerToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? project : null;
}

export async function startStoryJob(db: Knex, projectId: string, revisionId: string) {
  const jobId = `job_${randomUUID()}`;
  await db("flo_generation_job").insert({
    id: jobId, project_id: projectId, revision_id: revisionId, kind: "STORY_PREVIEW", status: "RUNNING", progress: 10
  });
  await db("flo_creation_revision").where({ id: revisionId, project_id: projectId }).update({ status: "GENERATING", updated_at: db.fn.now() });
  return { jobId, status: "RUNNING" as const, progress: 10 };
}

export async function completeStoryJob(db: Knex, input: { projectId: string; revisionId: string; jobId: string; teaser: unknown }) {
  await db.transaction(async (trx) => {
    const changed = await trx("flo_generation_job").where({ id: input.jobId, project_id: input.projectId, revision_id: input.revisionId }).update({
      status: "READY", progress: 100, updated_at: trx.fn.now()
    });
    if (changed !== 1) throw new Error("Generation job not found");
    await trx("flo_creation_revision").where({ id: input.revisionId, project_id: input.projectId }).update({
      status: "TEASER_READY", teaser: JSON.stringify(input.teaser), updated_at: trx.fn.now()
    });
  });
}

export async function failStoryJob(db: Knex, input: { projectId: string; revisionId: string; jobId: string }) {
  await db("flo_generation_job").where({ id: input.jobId, project_id: input.projectId, revision_id: input.revisionId }).update({
    status: "FAILED", progress: 100, error_code: "PROVIDER_FAILED", updated_at: db.fn.now()
  });
  await db("flo_creation_revision").where({ id: input.revisionId, project_id: input.projectId }).update({ status: "DRAFT", updated_at: db.fn.now() });
}

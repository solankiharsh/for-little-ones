import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { knex, type Knex } from "knex";
import {
  completeConceptJob,
  completeStoryJob,
  createCreationProject,
  failConceptJob,
  parseClaimId,
  parseCreationDraft,
  readGenerationUsage,
  redeemCreationClaim,
  startConceptJob,
  startStoryJob
} from "./creation-projects";

let db: Knex;

const draft = parseCreationDraft({
  childName: "Milo", age: "6", world: "Bedtime wonder", favourites: ["Space"],
  detail: "Carries a red scarf", dedication: "Dream big."
});
if (!draft) throw new Error("fixture draft must parse");
const fixtureDraft = draft;

async function createTables() {
  if (await db.schema.hasTable("flo_generation_job")) return;
  await db.schema.createTable("flo_creation_project", (table) => {
    table.text("id").primary();
    table.text("owner_token_hash").notNullable();
    table.text("payment_state").notNullable().defaultTo("pending");
    table.text("claim_id").notNullable().unique();
    table.timestamp("claim_consumed_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
  });
  await db.schema.createTable("flo_creation_revision", (table) => {
    table.text("id").primary();
    table.text("project_id").notNullable().references("id").inTable("flo_creation_project").onDelete("CASCADE");
    table.integer("version").notNullable();
    table.text("status").notNullable();
    table.jsonb("draft").notNullable();
    table.jsonb("teaser").nullable();
    table.jsonb("concepts").nullable();
    table.text("selected_concept_id").nullable();
    table.jsonb("story").nullable();
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
    table.unique(["project_id", "version"]);
  });
  await db.schema.createTable("flo_generation_job", (table) => {
    table.text("id").primary();
    table.text("project_id").notNullable().references("id").inTable("flo_creation_project").onDelete("CASCADE");
    table.text("revision_id").notNullable().references("id").inTable("flo_creation_revision").onDelete("CASCADE");
    table.text("kind").notNullable();
    table.text("status").notNullable();
    table.integer("progress").notNullable().defaultTo(0);
    table.text("error_code").nullable();
    table.text("provider_model").nullable();
    table.integer("input_tokens").nullable();
    table.integer("output_tokens").nullable();
    table.integer("cost_cents").nullable();
    table.jsonb("moderation").nullable();
    table.jsonb("entitlement").nullable();
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
  });
}

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (root vitest global setup provides it)");
  db = knex({ client: "pg", connection: url });
  await createTables();
});

beforeEach(async () => {
  await db("flo_generation_job").delete();
  await db("flo_creation_revision").delete();
  await db("flo_creation_project").delete();
});

afterAll(async () => {
  await db.destroy();
});

async function createProject() {
  return createCreationProject(db, fixtureDraft);
}

describe("creation job recovery", () => {
  it("reclaims an in-flight concept job instead of starting a second one", async () => {
    const { projectId, revisionId } = await createProject();
    const first = await startConceptJob(db, projectId, revisionId, "pending");
    const second = await startConceptJob(db, projectId, revisionId, "pending");

    expect(second.jobId).toBe(first.jobId);
    const rows = await db("flo_generation_job").where({ revision_id: revisionId, kind: "CONCEPT_BUNDLE" });
    expect(rows).toHaveLength(1);
  });

  it("starts a fresh job once the previous one reached a terminal state", async () => {
    const { projectId, revisionId, ownerToken } = await createProject();
    void ownerToken;
    const first = await startConceptJob(db, projectId, revisionId, "pending");
    await completeConceptJob(db, { projectId, revisionId, jobId: first.jobId, concepts: [] });
    const second = await startConceptJob(db, projectId, revisionId, "pending");

    expect(second.jobId).not.toBe(first.jobId);
  });

  it("counts only terminal jobs toward the allowance, so an orphaned run burns nothing", async () => {
    const { projectId, revisionId } = await createProject();
    await startConceptJob(db, projectId, revisionId, "pending");

    expect((await readGenerationUsage(db, revisionId)).conceptAttempts).toBe(0);
  });

  it("fails a concept job and returns its revision to draft", async () => {
    const { projectId, revisionId } = await createProject();
    const { jobId } = await startConceptJob(db, projectId, revisionId, "pending");
    await failConceptJob(db, { projectId, revisionId, jobId });

    const job = await db("flo_generation_job").where({ id: jobId }).first();
    expect(job.status).toBe("FAILED");
    expect(job.error_code).toBe("PROVIDER_FAILED");
    const revision = await db("flo_creation_revision").where({ id: revisionId }).first();
    expect(revision.status).toBe("DRAFT");
  });

  it("refuses to complete a job against a revision the server did not assign it", async () => {
    const { projectId, revisionId } = await createProject();
    const { jobId } = await startConceptJob(db, projectId, revisionId, "pending");

    await expect(completeConceptJob(db, {
      projectId, revisionId: "revision_someone_elses", jobId, concepts: []
    })).rejects.toThrow();
  });
});

describe("moderation and entitlement audit trail", () => {
  it("persists the concept screening result on the job", async () => {
    const { projectId, revisionId } = await createProject();
    const { jobId } = await startConceptJob(db, projectId, revisionId, "pending");
    const moderation = { verdict: "FLAG" as const, findings: ["SOFT_FLAG:brand: matched \"elsa\""] };
    await completeConceptJob(db, { projectId, revisionId, jobId, concepts: [], moderation });

    const job = await db("flo_generation_job").where({ id: jobId }).first();
    expect(job.moderation).toEqual(moderation);
  });

  it("persists the story screening result on the job", async () => {
    const { projectId, revisionId } = await createProject();
    const { jobId } = await startStoryJob(db, projectId, revisionId, "pending");
    const moderation = { verdict: "ALLOW" as const, findings: [] as string[] };
    await completeStoryJob(db, { projectId, revisionId, jobId, teaser: {}, story: {}, moderation });

    const job = await db("flo_generation_job").where({ id: jobId }).first();
    expect(job.moderation).toEqual(moderation);
  });

  it("snapshots the payment state that authorised the job", async () => {
    const { projectId, revisionId } = await createProject();
    const { jobId } = await startConceptJob(db, projectId, revisionId, "pending");

    const job = await db("flo_generation_job").where({ id: jobId }).first();
    expect(job.entitlement).toMatchObject({ paymentState: "pending", kind: "CONCEPT_BUNDLE" });
  });
});

describe("payment claim minting", () => {
  it("mints an opaque single-use claim alongside the owner credential", async () => {
    const created = await createProject();

    expect(created.claimId).toMatch(/^claim_[a-f0-9]{64}$/);
    const project = await db("flo_creation_project").where({ id: created.projectId }).first();
    expect(project.claim_id).toBe(created.claimId);
    expect(project.claim_consumed_at).toBeNull();
    expect(project.payment_state).toBe("pending");
  });

  it("rejects anything that is not a minted claim shape", () => {
    expect(parseClaimId("claim_ab12")).toBeNull();
    expect(parseClaimId("project_ab".repeat(8))).toBeNull();
    expect(parseClaimId(undefined)).toBeNull();
  });

  it("captures the project exactly once, then refuses the spent claim", async () => {
    const created = await createProject();

    const redeemed = await redeemCreationClaim(db, created.claimId);
    expect(redeemed?.payment_state).toBe("captured");
    expect(redeemed?.claim_consumed_at).not.toBeNull();

    expect(await redeemCreationClaim(db, created.claimId)).toBeNull();
    expect(await redeemCreationClaim(db, `claim_${"ab".repeat(32)}`)).toBeNull();
  });
});

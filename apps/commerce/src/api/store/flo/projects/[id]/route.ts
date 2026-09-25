import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../lib/approvals";
import { authorizeProject, readBearerToken } from "../../../../../lib/creation-projects";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ message: "Project credential required." });
  const db = database(req.scope);
  const project = await authorizeProject(db, req.params.id, token);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const revision = await db("flo_creation_revision").where({ project_id: project.id }).orderBy("version", "desc").first();
  const job = revision ? await db("flo_generation_job").where({ revision_id: revision.id }).orderBy("created_at", "desc").first() : null;
  return res.json({
    projectId: project.id, entitlement: project.entitlement,
    revision: revision ? { revisionId: revision.id, version: revision.version, status: revision.status, draft: revision.draft, teaser: revision.teaser } : null,
    job: job ? { jobId: job.id, kind: job.kind, status: job.status, progress: job.progress, errorCode: job.error_code } : null
  });
}

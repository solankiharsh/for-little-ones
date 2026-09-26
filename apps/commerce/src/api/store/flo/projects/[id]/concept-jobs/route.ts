import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../lib/approvals";
import { authorizeProject, parsePaymentState, readBearerToken, RevokedGenerationError, startConceptJob } from "../../../../../../lib/creation-projects";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const revisionId = (req.body as { revisionId?: unknown } | undefined)?.revisionId;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof revisionId !== "string") return res.status(400).json({ message: "Revision required." });
  const db = database(req.scope);
  const project = await authorizeProject(db, req.params.id, token);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const revision = await db("flo_creation_revision").where({ id: revisionId, project_id: req.params.id }).first();
  if (!revision) return res.status(404).json({ message: "Revision not found." });
  const attempts = await db("flo_generation_job").where({ revision_id: revisionId, kind: "CONCEPT_BUNDLE" }).count<{ count: string }>("id as count").first();
  if (Number(attempts?.count ?? 0) >= 3) return res.status(429).json({ message: "Concept idea limit reached." });
  try {
    return res.status(201).json(await startConceptJob(db, req.params.id, revisionId, parsePaymentState(project.payment_state)));
  } catch (error) {
    if (error instanceof RevokedGenerationError) return res.status(402).json({ message: error.message });
    throw error;
  }
}

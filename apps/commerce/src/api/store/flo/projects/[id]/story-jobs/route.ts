import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../lib/approvals";
import { authorizeProject, parsePaymentState, readBearerToken, RevokedGenerationError, startStoryJob } from "../../../../../../lib/creation-projects";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const revisionId = (req.body as { revisionId?: unknown } | undefined)?.revisionId;
  const selectedConceptId = (req.body as { selectedConceptId?: unknown } | undefined)?.selectedConceptId;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof revisionId !== "string" || typeof selectedConceptId !== "string") return res.status(400).json({ message: "Revision and selected concept required." });
  const db = database(req.scope);
  const project = await authorizeProject(db, req.params.id, token);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const revision = await db("flo_creation_revision").where({ id: revisionId, project_id: req.params.id }).first();
  if (!revision) return res.status(404).json({ message: "Revision not found." });
  if (revision.selected_concept_id !== selectedConceptId) return res.status(409).json({ message: "Select this concept before writing the story." });
  try {
    return res.status(201).json(await startStoryJob(db, req.params.id, revisionId, parsePaymentState(project.payment_state)));
  } catch (error) {
    if (error instanceof RevokedGenerationError) return res.status(402).json({ message: error.message });
    throw error;
  }
}

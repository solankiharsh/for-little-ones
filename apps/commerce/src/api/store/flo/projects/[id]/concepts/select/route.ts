import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../../lib/approvals";
import { authorizeProject, readBearerToken, selectConcept } from "../../../../../../../lib/creation-projects";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const body = req.body as { revisionId?: unknown; conceptId?: unknown } | undefined;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof body?.revisionId !== "string" || typeof body.conceptId !== "string") return res.status(400).json({ message: "Concept selection required." });
  const db = database(req.scope);
  if (!await authorizeProject(db, req.params.id, token)) return res.status(404).json({ message: "Project not found." });
  if (!await selectConcept(db, { projectId: req.params.id, revisionId: body.revisionId, conceptId: body.conceptId })) {
    return res.status(404).json({ message: "Concept not found." });
  }
  return res.json({ conceptId: body.conceptId, status: "SELECTED" });
}

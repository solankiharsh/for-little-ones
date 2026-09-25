import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../lib/approvals";
import { authorizeProject, readBearerToken, startStoryJob } from "../../../../../../lib/creation-projects";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const revisionId = (req.body as { revisionId?: unknown } | undefined)?.revisionId;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof revisionId !== "string") return res.status(400).json({ message: "Revision required." });
  const db = database(req.scope);
  if (!await authorizeProject(db, req.params.id, token)) return res.status(404).json({ message: "Project not found." });
  const revision = await db("flo_creation_revision").where({ id: revisionId, project_id: req.params.id }).first();
  if (!revision) return res.status(404).json({ message: "Revision not found." });
  return res.status(201).json(await startStoryJob(db, req.params.id, revisionId));
}

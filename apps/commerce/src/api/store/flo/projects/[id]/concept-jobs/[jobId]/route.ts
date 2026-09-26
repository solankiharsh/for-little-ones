import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../../lib/approvals";
import { authorizeProject, completeConceptJob, readBearerToken } from "../../../../../../../lib/creation-projects";

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const body = req.body as { revisionId?: unknown; concepts?: unknown; generationMetadata?: { model?: string; inputTokens?: number; outputTokens?: number; costCents?: number } } | undefined;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof body?.revisionId !== "string" || !Array.isArray(body.concepts) || body.concepts.length !== 3) {
    return res.status(400).json({ message: "A valid concept bundle is required." });
  }
  const db = database(req.scope);
  if (!await authorizeProject(db, req.params.id, token)) return res.status(404).json({ message: "Project not found." });
  await completeConceptJob(db, { projectId: req.params.id, revisionId: body.revisionId, jobId: req.params.jobId, concepts: body.concepts, ...(body.generationMetadata ? { generationMetadata: body.generationMetadata } : {}) });
  return res.json({ jobId: req.params.jobId, status: "READY", progress: 100 });
}

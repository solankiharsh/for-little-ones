import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../../lib/approvals";
import { authorizeProject, completeStoryJob, failStoryJob, readBearerToken, readModerationBody } from "../../../../../../../lib/creation-projects";

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const token = readBearerToken(req.headers.authorization);
  const body = req.body as { revisionId?: unknown; status?: unknown; teaser?: unknown; story?: unknown; generationMetadata?: { model?: string; inputTokens?: number; outputTokens?: number; costCents?: number }; moderation?: unknown } | undefined;
  if (!token) return res.status(401).json({ message: "Project credential required." });
  if (typeof body?.revisionId !== "string" || (body.status !== "READY" && body.status !== "FAILED")) {
    return res.status(400).json({ message: "Valid revision and terminal status required." });
  }
  const moderated = readModerationBody(body);
  if (body.status === "READY" && "error" in moderated) {
    return res.status(400).json({ message: moderated.error });
  }
  const db = database(req.scope);
  if (!await authorizeProject(db, req.params.id, token)) return res.status(404).json({ message: "Project not found." });
  const input = { projectId: req.params.id, revisionId: body.revisionId, jobId: req.params.jobId };
  if (body.status === "READY") {
    if ("error" in moderated) return res.status(400).json({ message: moderated.error });
    await completeStoryJob(db, { ...input, teaser: body.teaser, ...(body.story === undefined ? {} : { story: body.story }), ...(body.generationMetadata ? { generationMetadata: body.generationMetadata } : {}), moderation: moderated.moderation });
  } else {
    await failStoryJob(db, input);
  }
  return res.json({ jobId: req.params.jobId, status: body.status, progress: 100 });
}

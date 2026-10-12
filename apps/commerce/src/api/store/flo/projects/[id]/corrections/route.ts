import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../../../lib/approvals";
import { readBearerToken } from "../../../../../../lib/creation-projects";
import { CorrectionError, finishCorrection, parseCorrection, requireCreationService, reserveCorrection, undoCorrection } from "../../../../../../lib/page-corrections";

async function handle(req: MedusaRequest, res: MedusaResponse, action: "start" | "finish" | "undo") {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) throw new CorrectionError(401, "Project credential required.");
    const db = database(req.scope);
    if (action === "undo") {
      const body = req.body as { revisionId?: unknown; idempotencyKey?: unknown };
      if (typeof body?.revisionId !== "string" || typeof body.idempotencyKey !== "string") throw new CorrectionError(400, "Page-change details required.");
      return res.json(await undoCorrection(db, req.params.id, token, body.revisionId, body.idempotencyKey));
    }
    requireCreationService(req.headers["x-flo-service-secret"]);
    if (action === "start") return res.json(await reserveCorrection(db, req.params.id, token, parseCorrection(req.body)));
    const body = req.body as { revisionId?: unknown; idempotencyKey?: unknown; attemptToken?: unknown; status?: unknown; text?: unknown; generationMetadata?: unknown };
    if (typeof body?.revisionId !== "string" || typeof body.idempotencyKey !== "string" || typeof body.attemptToken !== "string"
      || (body.status !== "READY" && body.status !== "FAILED") || (body.status === "READY" && typeof body.text !== "string")) throw new CorrectionError(400, "Valid page-change result required.");
    return res.json(await finishCorrection(db, req.params.id, token, { revisionId: body.revisionId, idempotencyKey: body.idempotencyKey, attemptToken: body.attemptToken, status: body.status,
      ...(typeof body.text === "string" ? { text: body.text } : {}), ...(body.generationMetadata ? { generationMetadata: body.generationMetadata } : {}) }));
  } catch (error) {
    return res.status(error instanceof CorrectionError ? error.status : 503).json({ message: error instanceof CorrectionError ? error.message : "The page-change service is temporarily unavailable." });
  }
}
export const POST = (req: MedusaRequest, res: MedusaResponse) => handle(req, res, "start");
export const PATCH = (req: MedusaRequest, res: MedusaResponse) => handle(req, res, "finish");
export const DELETE = (req: MedusaRequest, res: MedusaResponse) => handle(req, res, "undo");

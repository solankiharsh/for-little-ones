import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { database } from "../../../../lib/approvals";
import { createCreationProject, parseCreationDraft } from "../../../../lib/creation-projects";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const draft = parseCreationDraft((req.body as { draft?: unknown } | undefined)?.draft);
  if (!draft) return res.status(400).json({ message: "Check the story details and try again." });
  const created = await createCreationProject(database(req.scope), draft);
  return res.status(201).json(created);
}

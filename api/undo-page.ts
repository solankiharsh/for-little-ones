import { z } from "zod";
import { correctionRequest } from "./correct-page";
const Schema = z.strictObject({ projectId: z.string().startsWith("project_").max(80), ownerToken: z.string().regex(/^[a-f0-9]{64}$/), revisionId: z.string().startsWith("revision_").max(80), idempotencyKey: z.string().min(16).max(80) });
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const input = Schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Page-change details required." }, { status: 400 });
    try {
      const response = await correctionRequest(input.data, "DELETE", { revisionId: input.data.revisionId, idempotencyKey: input.data.idempotencyKey });
      const body = await response.json() as { message?: string };
      return response.ok ? Response.json(body) : Response.json({ error: body.message ?? "The original words could not be restored." }, { status: response.status });
    } catch { return Response.json({ error: "The original words could not be restored just now." }, { status: 503 }); }
  }
};

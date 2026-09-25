import { z } from "zod";

export const maxDuration = 15;
const RequestSchema = z.strictObject({
  projectId: z.string().startsWith("project_").max(80),
  revisionId: z.string().startsWith("revision_").max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/),
  conceptId: z.string().startsWith("concept_").max(80)
});

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Story choice is invalid." }, { status: 400 });
    const baseUrl = process.env.CREATION_API_URL;
    const publishableKey = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
    if (!baseUrl || !publishableKey) return Response.json({ error: "The creation service is not configured." }, { status: 503 });
    try {
      const response = await fetch(`${baseUrl}/store/flo/projects/${parsed.data.projectId}/concepts/select`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-publishable-api-key": publishableKey, authorization: `Bearer ${parsed.data.ownerToken}` },
        body: JSON.stringify({ revisionId: parsed.data.revisionId, conceptId: parsed.data.conceptId })
      });
      if (!response.ok) return Response.json({ error: "Story choice could not be saved." }, { status: response.status === 404 ? 404 : 502 });
      return Response.json(await response.json());
    } catch (error) {
      console.error("concept selection request failed", error);
      return Response.json({ error: "The creation service could not be reached." }, { status: 503 });
    }
  }
};

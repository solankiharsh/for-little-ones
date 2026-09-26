import { z } from "zod";
import { paymentEntitlement, type PaymentState } from "@for-little-ones/domain";

export const maxDuration = 15;

const RequestSchema = z.strictObject({
  projectId: z.string().startsWith("project_").max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/)
});

function paymentStateOf(value: unknown): PaymentState {
  return value === "authorized" || value === "captured" || value === "refunded" || value === "cancelled" ? value : "pending";
}

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Saved project details are invalid." }, { status: 400 });
    const baseUrl = process.env.CREATION_API_URL;
    const publishableKey = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
    if (!baseUrl || !publishableKey) return Response.json({ error: "The creation service is not configured." }, { status: 503 });
    try {
      const response = await fetch(`${baseUrl}/store/flo/projects/${parsed.data.projectId}`, {
        headers: {
          "x-publishable-api-key": publishableKey,
          authorization: `Bearer ${parsed.data.ownerToken}`
        }
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return Response.json({ error: response.status === 404 ? "Saved project not found." : "Saved project could not be restored." }, { status: response.status === 404 ? 404 : 502 });
      if (typeof body !== "object" || body === null) return Response.json({ error: "Saved project could not be restored." }, { status: 502 });
      // The entitlement is derived here from the payment record the creation
      // service resolved, so the browser only ever sees a server-derived value.
      const record = body as Record<string, unknown>;
      return Response.json({ ...record, entitlement: paymentEntitlement(paymentStateOf(record.paymentState)) });
    } catch (error) {
      console.error("creation-project status request failed", error);
      return Response.json({ error: "The creation service could not be reached." }, { status: 503 });
    }
  }
};

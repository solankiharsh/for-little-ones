import { z } from "zod";
import { paymentEntitlement, type PaymentState } from "@for-little-ones/domain";

export const maxDuration = 15;

const DraftSchema = z.strictObject({
  childName: z.string().trim().min(1).max(40),
  age: z.string().regex(/^(?:[1-9]|1[0-2])$/),
  world: z.string().trim().min(1).max(80),
  favourites: z.array(z.string().trim().min(1).max(40)).max(8),
  detail: z.string().trim().max(120),
  dedication: z.string().trim().max(150)
});

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const parsed = DraftSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Check the story details and try again." }, { status: 400 });
    const baseUrl = process.env.CREATION_API_URL;
    const publishableKey = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
    if (!baseUrl || !publishableKey) return Response.json({ error: "The creation service is not configured." }, { status: 503 });
    try {
      const response = await fetch(`${baseUrl}/store/flo/projects`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-publishable-api-key": publishableKey },
        body: JSON.stringify({ draft: parsed.data })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return Response.json({ error: "Your draft could not be saved." }, { status: 502 });
      if (typeof body !== "object" || body === null) return Response.json({ error: "Your draft could not be saved." }, { status: 502 });
      // A newly created project has no payment record yet, so the entitlement the
      // browser sees is derived here rather than taken from anything it asserted.
      const record = body as Record<string, unknown>;
      const paymentState: PaymentState = "pending";
      return Response.json({ ...record, paymentState, entitlement: paymentEntitlement(paymentState) }, { status: 201 });
    } catch (error) {
      console.error("creation-project request failed", error);
      return Response.json({ error: "The creation service could not be reached." }, { status: 503 });
    }
  }
};

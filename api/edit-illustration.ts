import { z } from 'zod';
import { GeminiImageEditProvider, PolicyTextModerationProvider, TEXT_MODERATION_POLICY_SET } from '@for-little-ones/providers';

export const maxDuration = 240;
const image = z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const schema = z.strictObject({
  source: image, reference: image.optional(), mask: image,
  instruction: z.string().trim().min(3).max(400),
  projectId: z.string().regex(/^project_[a-zA-Z0-9-]+$/).max(80),
  revisionId: z.string().regex(/^revision_[a-zA-Z0-9-]+$/).max(80),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
});
export async function POST(request: Request) {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const raw = await request.text();
  if (raw.length > 4_000_000) return Response.json({ error: 'Use a smaller image.' }, { status: 413 });
  const input = schema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!input.success) return Response.json({ error: 'Select an area and describe the change.' }, { status: 400 });
  if (process.env.IMAGE_EDIT_EXPERIMENT_ENABLED !== 'true') return Response.json({ error: 'AI editing is not available yet. Photo compositing is available in the editor.' }, { status: 503 });
  const base = process.env.CREATION_API_URL, key = process.env.VITE_MEDUSA_PUBLISHABLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return Response.json({ error: 'Image editing is not configured.' }, { status: 503 });
  if (!base || !key) return Response.json({ error: 'The editing service is not configured.' }, { status: 503 });
  const headers = { 'content-type': 'application/json', 'x-publishable-api-key': key, authorization: `Bearer ${input.data.ownerToken}` };
  const url = `${base}/store/flo/projects/${input.data.projectId}/image-jobs`;
  let jobId: string | undefined;
  try {
    const screened = await new PolicyTextModerationProvider().screen({ contentType: 'text', contentRef: 'illustration-edit', content: input.data.instruction, policySetVersion: TEXT_MODERATION_POLICY_SET });
    if (screened.verdict !== 'ALLOW') return Response.json({ error: 'Please describe a different, child-friendly change.' }, { status: 400 });
    // Ownership, payment, quota and duplicate reservation are checked atomically by the creation service.
    const reservation = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ revisionId: input.data.revisionId, requestId: input.data.requestId }), signal: AbortSignal.timeout(15_000) });
    if (!reservation.ok) return Response.json({ error: reservation.status === 402 ? 'Image editing opens with your purchased book.' : reservation.status === 429 ? 'This book has reached its image-edit allowance.' : 'The edit could not be started. Your original is unchanged.' }, { status: [401, 402, 404, 409, 429].includes(reservation.status) ? reservation.status : 503 });
    const reservationBody = await reservation.json() as { jobId?: string };
    jobId = reservationBody.jobId;
    if (!jobId) throw new Error('Missing edit reservation');
    const result = await new GeminiImageEditProvider(geminiKey).edit(input.data);
    const completed = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ jobId, status: 'READY' }), signal: AbortSignal.timeout(15_000) });
    if (!completed.ok) throw new Error('Edit completion could not be recorded');
    return new Response(new Uint8Array(result.bytes), { headers: { 'content-type': result.mediaType, 'cache-control': 'no-store' } });
  } catch {
    if (jobId) await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ jobId, status: 'FAILED' }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    return Response.json({ error: 'The illustration could not be edited just now. Your original is unchanged.' }, { status: 503 });
  }
}

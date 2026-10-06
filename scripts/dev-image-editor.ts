/** Local-only editing experiment. Never deploy this server or bind it publicly. */
import { createServer } from 'node:http';
import { z } from 'zod';
import { GeminiImageEditProvider, PolicyTextModerationProvider, TEXT_MODERATION_POLICY_SET } from '../packages/providers/src/index';
const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!key) throw new Error('Set GEMINI_API_KEY before starting the local image editor.');
const provider = new GeminiImageEditProvider(key);
const data = z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const schema = z.object({ source: data, reference: data.optional(), mask: data, instruction: z.string().trim().min(3).max(400) });
let active = false;
createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const fail = (status: number, error: string) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error })); };
  const origin = req.headers.origin;
  if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return fail(403, 'Only the local preview may use this editor.');
  if (req.method !== 'POST' || req.url !== '/api/edit-illustration') return fail(404, 'Not found.');
  if (active) return fail(429, 'Please wait for the current edit to finish.');
  active = true;
  try {
    let raw = '';
    for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > 4_000_000) return fail(413, 'Use a smaller image.'); }
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fail(400, 'Select an area and describe a change.');
    const screened = await new PolicyTextModerationProvider().screen({ contentType: 'text', contentRef: 'local-image-edit', content: parsed.data.instruction, policySetVersion: TEXT_MODERATION_POLICY_SET });
    if (screened.verdict !== 'ALLOW') return fail(400, 'Please describe a different, child-friendly change.');
    const result = await provider.edit(parsed.data);
    res.writeHead(200, { 'content-type': result.mediaType }); res.end(result.bytes);
  } catch { fail(503, 'The edit could not be prepared. Your original is unchanged.'); }
  finally { active = false; }
}).listen(8788, '127.0.0.1', () => console.log('Local Gemini image editor listening on 127.0.0.1:8788'));

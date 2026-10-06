import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './edit-illustration';
const input = { source: 'data:image/png;base64,YQ==', mask: 'data:image/png;base64,Yg==', instruction: 'Make the scarf blue', projectId: 'project_test', revisionId: 'revision_test', ownerToken: 'ab'.repeat(32), requestId: '03f15512-00b7-4fbe-b6bc-5049ae537bda' };
const post = (data: unknown) => POST(new Request('https://example.test/api/edit-illustration', { method: 'POST', body: JSON.stringify(data) }));
beforeEach(() => { vi.stubEnv('IMAGE_EDIT_EXPERIMENT_ENABLED', 'true'); vi.stubEnv('GEMINI_API_KEY', 'test-secret'); vi.stubEnv('CREATION_API_URL', 'https://creation.test'); vi.stubEnv('VITE_MEDUSA_PUBLISHABLE_KEY', 'pk_test'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('image edit boundary', () => {
  it('rejects remote image URLs before any network access', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await post({ ...input, source: 'http://169.254.169.254/' })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not call Gemini when the server rejects entitlement', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 402 })); vi.stubGlobal('fetch', fetcher);
    expect((await post(input)).status).toBe(402);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('passes actual source, reference and mask to Gemini directly and returns private image bytes', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ jobId: 'image_test' }, { status: 201 })).mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AQID' } }] } }] })).mockResolvedValueOnce(Response.json({ updated: true })); vi.stubGlobal('fetch', fetcher);
    const result = await post({ ...input, reference: 'data:image/jpeg;base64,Yw==' });
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, options] = fetcher.mock.calls[1]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent');
    const parts = JSON.parse(options.body).contents[0].parts;
    expect(parts.slice(1)).toEqual([{ inlineData: { mimeType: 'image/png', data: 'YQ==' } }, { inlineData: { mimeType: 'image/jpeg', data: 'Yw==' } }, { inlineData: { mimeType: 'image/png', data: 'Yg==' } }]);
  });
  it('does not enable the unrecoverable paid experiment by default', async () => {
    vi.stubEnv('IMAGE_EDIT_EXPERIMENT_ENABLED', ''); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await post(input)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
});

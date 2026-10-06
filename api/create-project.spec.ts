import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './create-project';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('reports backend unavailability as retryable instead of a rejected draft', async () => {
  vi.stubEnv('CREATION_API_URL', 'https://creation.test');
  vi.stubEnv('VITE_MEDUSA_PUBLISHABLE_KEY', 'pk_test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
  const response = await POST(new Request('https://example.test/api/create-project', { method: 'POST', body: JSON.stringify({ childName: 'Test', age: '5', world: 'Garden', favourites: [], detail: '', dedication: '' }) }));
  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('30');
  expect(await response.json()).toEqual({ error: 'Story creation is temporarily unavailable. Your details are still here; please try again shortly.' });
});

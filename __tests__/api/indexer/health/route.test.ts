/** @jest-environment node */
import { GET } from '@/app/api/indexer/health/route';

const originalFetch = global.fetch;
const originalInternal = process.env.INDEXER_API_URL_INTERNAL;
const originalPublic = process.env.NEXT_PUBLIC_INDEXER_API_URL;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  process.env.INDEXER_API_URL_INTERNAL = originalInternal;
  process.env.NEXT_PUBLIC_INDEXER_API_URL = originalPublic;
});

describe('GET /api/indexer/health', () => {
  it('prefers the internal URL and normalizes its trailing slash', async () => {
    process.env.INDEXER_API_URL_INTERNAL = 'http://internal.example///';
    process.env.NEXT_PUBLIC_INDEXER_API_URL = 'http://public.example';
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ lastLedger: 100, lastUpdated: 99, ledgerLag: 1 }),
      );

    const response = await GET();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://internal.example/health',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lastLedger: 100,
      lastUpdated: 99,
      ledgerLag: 1,
    });
  });

  it('falls back to the public URL when no internal URL is configured', async () => {
    delete process.env.INDEXER_API_URL_INTERNAL;
    process.env.NEXT_PUBLIC_INDEXER_API_URL = 'http://public.example/';
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}));

    const response = await GET();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://public.example/health',
      expect.any(Object),
    );
    expect(response.status).toBe(200);
  });

  it('returns 503 when neither indexer URL is configured', async () => {
    delete process.env.INDEXER_API_URL_INTERNAL;
    delete process.env.NEXT_PUBLIC_INDEXER_API_URL;
    global.fetch = jest.fn();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

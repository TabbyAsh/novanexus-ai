import { NextRequest } from 'next/server';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { GET, POST } from '../[...path]/route';

describe('same-origin proxy request correlation', () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  afterEach(() => {
    if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = originalBackendUrl;
    jest.restoreAllMocks();
  });

  it('forwards and returns one safe opaque request id', async () => {
    process.env.BACKEND_URL = 'https://api.example.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"success":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const request = new NextRequest('https://novanexus-ai.com/api/proxy/v1/contact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_01HZX3M2QX9Y2K7P',
      },
      body: '{}',
    });

    const response = await POST(request, { params: Promise.resolve({ path: ['v1', 'contact'] }) });
    const forwarded = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(forwarded['x-request-id']).toBe('req_01HZX3M2QX9Y2K7P');
    expect(response.headers.get('x-request-id')).toBe('req_01HZX3M2QX9Y2K7P');
  });

  it('does not disclose an upstream network error to the browser', async () => {
    process.env.BACKEND_URL = 'https://api.example.test';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('private upstream detail'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new NextRequest('https://novanexus-ai.com/api/proxy/v1/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const response = await POST(request, { params: Promise.resolve({ path: ['v1', 'contact'] }) });
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.error.message).toBe('The Nova backend could not be reached.');
    expect(JSON.stringify(payload)).not.toContain('private upstream detail');
  });
  it('preserves an inquiry idempotency key separately from request correlation', async () => {
    process.env.BACKEND_URL = 'https://api.example.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    const key = 'inquiry-request-123456789';
    const body = JSON.stringify({ requestId: key, serviceCode: 'MERCHANDISE_SOURCING' });
    const request = new NextRequest('https://novanexus-ai.com/api/proxy/v1/contact', {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body,
    });
    await POST(request, { params: Promise.resolve({ path: ['v1', 'contact'] }) });
    const options = fetchMock.mock.calls[0][1];
    expect((options?.headers as Record<string, string>)['idempotency-key']).toBe(key);
    expect((options?.headers as Record<string, string>)['x-request-id']).not.toBe(key);
    expect(options?.body).toBe(body);
  });
  it.each(['gzip', 'br', 'deflate'])('returns readable decoded JSON without stale %s response headers', async encoding => {
    process.env.BACKEND_URL = 'https://api.example.test';
    const payload = { success: true, data: { version: 'test-version', service: 'gateway' } };
    const decoded = JSON.stringify(payload);
    const compressed = encoding === 'br' ? brotliCompressSync(decoded)
      : encoding === 'deflate' ? deflateSync(decoded) : gzipSync(decoded);
    // Node fetch exposes decoded body bytes while retaining upstream headers.
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(decoded, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-encoding': encoding,
        'content-length': String(compressed.byteLength),
        'cache-control': 'private, no-store',
        'x-request-id': 'upstream-request-12345678',
      },
    }));
    const request = new NextRequest('https://novanexus-ai.com/api/proxy/version');
    const response = await GET(request, { params: Promise.resolve({ path: ['version'] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-request-id')).toBe('upstream-request-12345678');
    expect(response.headers.get('x-nova-proxy')).toBe('same-origin');
    expect(await response.json()).toEqual(payload);
  });
});

import { NextRequest } from 'next/server';
import { POST } from '../[...path]/route';

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
});

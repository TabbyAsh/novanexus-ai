import { NextRequest } from 'next/server';
import { POST, DELETE } from '../route';
import { WORLD_COOKIE } from '@/lib/world/access';
describe('World session endpoints', () => {
  const originalBackend = process.env.BACKEND_URL;
  afterEach(() => { if (originalBackend === undefined) delete process.env.BACKEND_URL; else process.env.BACKEND_URL = originalBackend; jest.restoreAllMocks(); });
  const request = (origin = 'https://nova.example', token = 'opaque-access-token') => new NextRequest('https://nova.example/api/world/session', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + token } });
  it('rejects cross-site login and logout without calling upstream', async () => {
    const upstream = jest.spyOn(global, 'fetch');
    expect((await POST(request('https://evil.example'))).status).toBe(403);
    expect((await DELETE(request('https://evil.example'))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('sets an HttpOnly strict session only for verified private authority', async () => {
    process.env.BACKEND_URL = 'https://auth.example';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { user: { id: 'owner-1', email: 'owner@example.test', status: 'ACTIVE' }, scopes: ['ops.admin'] } })));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.cookies.get(WORLD_COOKIE)).toMatchObject({ value: 'opaque-access-token', httpOnly: true, sameSite: 'strict', path: '/', maxAge: 900 });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ ok: true });
  });
  it('does not give a tenant owner the cookie or disclose private destinations', async () => {
    process.env.BACKEND_URL = 'https://auth.example';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { user: { id: 'tenant', email: 'tenant@example.test', status: 'ACTIVE' }, role: 'OWNER', scopes: [] } })));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.cookies.get(WORLD_COOKIE)?.value).toBe('');
    expect(await response.text()).not.toMatch(/tabbyash|libfile|opaque-access-token/);
  });
  it('expires the private session on an explicit same-origin lock', async () => {
    const response = await DELETE(request());
    expect(response.cookies.get(WORLD_COOKIE)).toMatchObject({ value: '', maxAge: 0 });
  });
});

import { verifyWorldToken, isSameOrigin, safeReturnPath } from '../access';
const endpoint = 'https://auth.example.test';
const identity = { success: true, data: { user: { id: 'owner-1', email: 'owner@example.test', status: 'ACTIVE' }, role: 'OWNER', scopes: ['ops.admin'] } };
function backend(body: unknown = identity, status = 200) { return jest.fn().mockResolvedValue({ ok: status === 200, status, json: async () => body }); }
describe('private World server authority', () => {
  it('never treats a cookie or an arbitrary JWT as authority', async () => {
    const request = backend(null, 401);
    expect(await verifyWorldToken('forged.jwt.value', endpoint, request)).toEqual({ ok: false, status: 401 });
    expect(await verifyWorldToken(undefined, endpoint, request)).toEqual({ ok: false, status: 401 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('requires the backend-verified platform scope, not a tenant OWNER role', async () => {
    const body = { ...identity, data: { ...identity.data, scopes: ['cards.read'], role: 'OWNER' } };
    expect(await verifyWorldToken('token', endpoint, backend(body))).toEqual({ ok: false, status: 403 });
  });
  it('returns only minimal identity after verification and disables caching and redirects', async () => {
    const request = backend();
    expect(await verifyWorldToken('token', endpoint, request)).toEqual({ ok: true, identity: { id: 'owner-1', email: 'owner@example.test' } });
    expect(request).toHaveBeenCalledWith(new URL(endpoint + '/v1/me'), expect.objectContaining({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer token', Accept: 'application/json' } }));
  });
  it.each([null, { success: false }, { ...identity, data: { ...identity.data, user: { ...identity.data.user, status: 'SUSPENDED' } } }, { ...identity, data: { ...identity.data, scopes: 'ops.admin' } }])('rejects inactive or malformed backend responses', async body => {
    expect((await verifyWorldToken('token', endpoint, backend(body))).ok).toBe(false);
  });
  it('fails closed on missing configuration, server failure and network failure', async () => {
    const request = backend();
    expect(await verifyWorldToken('token', null, request)).toEqual({ ok: false, status: 503 });
    expect(request).not.toHaveBeenCalled();
    expect(await verifyWorldToken('token', endpoint, backend(null, 500))).toEqual({ ok: false, status: 503 });
    expect(await verifyWorldToken('token', endpoint, jest.fn().mockRejectedValue(new Error('offline')))).toEqual({ ok: false, status: 503 });
  });
  it('blocks token header injection and rejects cross-origin session mutations', async () => {
    const request = backend();
    expect(await verifyWorldToken('abc\r\nInjected: x', endpoint, request)).toEqual({ ok: false, status: 401 });
    expect(request).not.toHaveBeenCalled();
    const fake = (origin: string | null) => new Request('https://nova.example/api/world/session', { headers: origin ? { Origin: origin } : {} });
    expect(isSameOrigin(fake('https://evil.example'))).toBe(false);
    expect(isSameOrigin(fake(null))).toBe(false);
    expect(isSameOrigin(fake('https://nova.example'))).toBe(true);
    expect(isSameOrigin(new Request('http://localhost/api/world/session', { headers: { Host: 'nova.example', Origin: 'https://nova.example', 'x-forwarded-proto': 'https' } }))).toBe(true);
    expect(isSameOrigin(new Request('http://localhost/api/world/session', { headers: { Host: 'nova.example', Origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } }))).toBe(false);
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/login?next=/world', '/foo\nbar', null])('blocks unsafe login return paths %s', path => {
    expect(safeReturnPath(path)).toBe('/dashboard');
  });
  it('preserves a safe private workspace destination', () => { expect(safeReturnPath('/world?view=tools')).toBe('/world?view=tools'); });
});

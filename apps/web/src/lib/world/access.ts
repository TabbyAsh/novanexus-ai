import { resolveBackendUrl } from '../backend-url';
import { hasWorldAuthority } from '../world-authority';

export const WORLD_COOKIE = 'nova_world_session';
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
export type WorldIdentity = { id: string; email: string };
export type WorldAccess = { ok: true; identity: WorldIdentity } | { ok: false; status: 401 | 403 | 503 };

// The token is opaque here: only the configured authentication service may
// validate it. Never trust a decoded JWT, a client role, or mere cookie presence.
export async function verifyWorldToken(token: string | undefined, backendUrl = resolveBackendUrl(), request = fetch): Promise<WorldAccess> {
  if (!token || token.length > 8192 || (/\s/.test(token) || [...token].some(c => c.charCodeAt(0) < 32))) return { ok: false, status: 401 };
  if (!backendUrl) return { ok: false, status: 503 };
  try {
    const response = await request(new URL('/v1/me', backendUrl), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, status: response.status === 401 ? 401 : response.status === 403 ? 403 : 503 };
    const body = await response.json();
    const data = body?.success === true ? body.data : null;
    if (!data?.user?.id || typeof data.user.email !== 'string' || data.user.status !== 'ACTIVE' || !Array.isArray(data.scopes)) return { ok: false, status: 403 };
    if (!hasWorldAuthority(data.scopes)) return { ok: false, status: 403 };
    return { ok: true, identity: { id: data.user.id, email: data.user.email } };
  } catch {
    return { ok: false, status: 503 };
  }
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    // Next may reconstruct request.url with an internal localhost hostname.
    // Host is the browser-controlled destination; do not trust forwarded-host.
    const destination = new URL(request.url);
    const host = request.headers.get('host') || destination.host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol + ':' : destination.protocol;
    const supplied = new URL(origin);
    return supplied.origin === origin && supplied.host === host.toLowerCase() && supplied.protocol === protocol;
  } catch { return false; }
}

export function safeReturnPath(input: string | null): string {
  if (!input || !input.startsWith('/') || input.startsWith('//') || (/[\\\s]/.test(input) || [...input].some(c => c.charCodeAt(0) < 33))) return '/dashboard';
  try {
    const parsed = new URL(input, 'https://nova.invalid');
    if (parsed.origin !== 'https://nova.invalid' || parsed.pathname === '/login') return '/dashboard';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return '/dashboard'; }
}

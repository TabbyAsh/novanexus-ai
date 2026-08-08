export const CONTACT_RATE_LIMIT_MAX = 5;
export const CONTACT_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
export const CONTACT_LOCAL_WINDOW_CAP = 10_000;

export function isPublicContactPath(pathname: string): boolean {
  return pathname === '/v1/contact';
}

interface ContactAddressRequest {
  ip?: string;
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string | null };
}

function cleanAddress(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-fA-F0-9:.[\]-]/g, '').slice(0, 96);
}

export function contactRateLimitKey(req: ContactAddressRequest): string {
  const socketAddress = cleanAddress(req.socket?.remoteAddress) || cleanAddress(req.ip) || 'unknown';
  const forwardedValue = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'];
  const forwardedChain = typeof forwardedValue === 'string'
    ? forwardedValue.split(',').map(cleanAddress).filter(Boolean)
    : [];
  // The nearest proxy appends the right-most address. Pairing it with the
  // socket address keeps a client-supplied X-Forwarded-For value from becoming
  // a standalone bypass key.
  const nearestForwardedAddress = forwardedChain[forwardedChain.length - 1] || 'none';
  return `${socketAddress}|${nearestForwardedAddress}`;
}

interface LocalWindow {
  count: number;
  resetAt: number;
}

const localWindows = new Map<string, LocalWindow>();
let lastSweepAt = 0;

function sweepExpiredWindows(nowMs: number): void {
  if (nowMs >= lastSweepAt && nowMs - lastSweepAt < 60_000) return;
  for (const [candidate, window] of localWindows) {
    if (window.resetAt <= nowMs) localWindows.delete(candidate);
  }
  lastSweepAt = nowMs;
}

export function checkLocalContactRateLimit(
  key: string,
  nowMs = Date.now(),
): { allowed: boolean; remaining: number; resetAt: number } {
  const windowMs = CONTACT_RATE_LIMIT_WINDOW_SECONDS * 1000;
  sweepExpiredWindows(nowMs);
  const existing = localWindows.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    if (!existing && localWindows.size >= CONTACT_LOCAL_WINDOW_CAP) {
      return { allowed: false, remaining: 0, resetAt: Math.floor((nowMs + windowMs) / 1000) };
    }
    const resetAt = nowMs + windowMs;
    localWindows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: CONTACT_RATE_LIMIT_MAX - 1, resetAt: Math.floor(resetAt / 1000) };
  }

  existing.count += 1;
  const allowed = existing.count <= CONTACT_RATE_LIMIT_MAX;
  return {
    allowed,
    remaining: Math.max(0, CONTACT_RATE_LIMIT_MAX - existing.count),
    resetAt: Math.floor(existing.resetAt / 1000),
  };
}

export function resetLocalContactRateLimits(): void {
  localWindows.clear();
  lastSweepAt = 0;
}

import {
  CONTACT_RATE_LIMIT_MAX,
  CONTACT_LOCAL_WINDOW_CAP,
  checkLocalContactRateLimit,
  contactRateLimitKey,
  isPublicContactPath,
  resetLocalContactRateLimits,
} from '../contact-rate-limit';

describe('public contact abuse controls', () => {
  beforeEach(() => resetLocalContactRateLimits());

  it('exposes only the exact anonymous contact path', () => {
    expect(isPublicContactPath('/v1/contact')).toBe(true);
    expect(isPublicContactPath('/v1/contact/private')).toBe(false);
    expect(isPublicContactPath('/v1/contact-admin')).toBe(false);
  });

  it('binds forwarded addresses to the connected socket address', () => {
    const key = contactRateLimitKey({
      ip: '10.0.0.2',
      socket: { remoteAddress: '10.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.4, 198.51.100.8' },
    });
    expect(key).toBe('10.0.0.1|198.51.100.8');
  });

  it('enforces a local fail-safe limit when the shared limiter is unavailable', () => {
    const now = Date.UTC(2026, 7, 8);
    for (let attempt = 1; attempt <= CONTACT_RATE_LIMIT_MAX; attempt += 1) {
      expect(checkLocalContactRateLimit('client', now).allowed).toBe(true);
    }
    expect(checkLocalContactRateLimit('client', now)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('caps unique local windows instead of allowing unbounded memory growth', () => {
    const now = Date.UTC(2026, 7, 8);
    for (let index = 0; index < CONTACT_LOCAL_WINDOW_CAP; index += 1) {
      expect(checkLocalContactRateLimit(`client-${index}`, now).allowed).toBe(true);
    }
    expect(checkLocalContactRateLimit('one-client-too-many', now)).toMatchObject({ allowed: false, remaining: 0 });
  });
});

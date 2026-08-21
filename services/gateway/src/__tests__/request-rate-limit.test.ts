import { requestRateLimitKey } from '../request-rate-limit';

describe('gateway request rate-limit identity', () => {
  const networkRequest = (authorization: string, address: string) => ({
    headers: { authorization },
    ip: address,
    socket: { remoteAddress: address },
  });

  it('never derives an anonymous bucket from attacker-controlled bearer bytes', () => {
    const first = requestRateLimitKey(networkRequest('Bearer predictable-prefix.one', '198.51.100.10'));
    const second = requestRateLimitKey(networkRequest('Bearer predictable-prefix.two', '198.51.100.11'));

    expect(first).toBe('ip:198.51.100.10|none');
    expect(second).toBe('ip:198.51.100.11|none');
    expect(first).not.toContain('predictable-prefix');
    expect(second).not.toContain('predictable-prefix');
  });

  it('isolates verified users by durable organization and user IDs', () => {
    const sharedNetwork = networkRequest('Bearer same-encoded-jwt-header', '198.51.100.10');
    const first = requestRateLimitKey({
      ...sharedNetwork,
      auth: { orgId: 'org-one', userId: 'user-one' },
    });
    const second = requestRateLimitKey({
      ...sharedNetwork,
      auth: { orgId: 'org-one', userId: 'user-two' },
    });

    expect(first).toBe('org:org-one:user:user-one');
    expect(second).toBe('org:org-one:user:user-two');
    expect(first).not.toBe(second);
  });
});

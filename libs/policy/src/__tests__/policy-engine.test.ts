import type { Policy, Scope, UserRole } from '@nova/shared';
import { PolicyEngine } from '../index';

function policy(
  id: string,
  subjectRole: UserRole,
  action: Scope,
  effect: Policy['effect'] = 'ALLOW',
): Policy {
  return {
    id,
    orgId: 'org-1',
    subjectRole,
    action,
    resource: '*',
    effect,
  };
}

function evaluate(engine: PolicyEngine, userRole: UserRole, action: Scope) {
  return engine.evaluate({
    orgId: 'org-1',
    userId: 'user-1',
    userRole,
    action,
    resource: '*',
  });
}

describe('PolicyEngine role matching', () => {
  it('does not apply an OWNER allow policy to another tenant role', () => {
    const engine = new PolicyEngine([
      policy('owner-admin', 'OWNER', 'admin.users'),
    ]);

    expect(evaluate(engine, 'OWNER', 'admin.users').allowed).toBe(true);
    expect(evaluate(engine, 'ADMIN', 'admin.users').allowed).toBe(false);
    expect(evaluate(engine, 'MEMBER', 'admin.users').allowed).toBe(false);
    expect(evaluate(engine, 'VIEWER', 'admin.users').allowed).toBe(false);
  });

  it('does not let an OWNER deny override an exact MEMBER allow', () => {
    const engine = new PolicyEngine([
      policy('owner-deny', 'OWNER', 'trade.read', 'DENY'),
      policy('member-allow', 'MEMBER', 'trade.read'),
    ]);

    expect(evaluate(engine, 'MEMBER', 'trade.read')).toMatchObject({
      allowed: true,
      matchedPolicy: { id: 'member-allow' },
    });
    expect(evaluate(engine, 'OWNER', 'trade.read')).toMatchObject({
      allowed: false,
      matchedPolicy: { id: 'owner-deny' },
    });
  });

  it('requires an exact organization and subject-role match', () => {
    const crossOrgOwnerPolicy = {
      ...policy('other-org-owner', 'OWNER', 'admin.billing'),
      orgId: 'org-2',
    };
    const engine = new PolicyEngine([crossOrgOwnerPolicy]);

    expect(evaluate(engine, 'OWNER', 'admin.billing').allowed).toBe(false);
  });
});

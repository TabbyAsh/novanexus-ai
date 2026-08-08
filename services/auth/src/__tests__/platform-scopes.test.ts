jest.mock('@nova/shared', () => ({
  getDefaultScopes: jest.fn(() => [
    'cards.read', 'cards.write', 'forge.read', 'forge.approve',
    'ops.admin', 'admin.killswitch',
  ]),
}));

import {
  refreshedAuthorizationForIdentity,
  registrationRoleForNewOrganization,
  scopesForIdentity,
  unverifiedPlatformOwnerRegistrationAllowed,
} from '../platform-scopes';

describe('platform scope separation', () => {
  it('does not grant platform control to an ordinary tenant owner', () => {
    const scopes = scopesForIdentity('OWNER', 'tenant@example.com', new Set(['founder@example.com']));
    expect(scopes).toEqual(['cards.read', 'cards.write']);
  });

  it('grants configured platform owners their role defaults', () => {
    const scopes = scopesForIdentity('OWNER', 'FOUNDER@example.com', new Set(['founder@example.com']));
    expect(scopes).toContain('forge.approve');
    expect(scopes).toContain('admin.killswitch');
  });

  it('keeps every new organization owned without granting tenant owners platform authority', () => {
    const owners = new Set(['founder@example.com']);
    const role = registrationRoleForNewOrganization();
    expect(role).toBe('OWNER');
    expect(scopesForIdentity(role, 'tenant@example.com', owners)).toEqual(['cards.read', 'cards.write']);
  });

  it('recomputes refreshed tenant-owner scopes without stale platform authority', () => {
    const staleTokenClaims = {
      role: 'OWNER' as const,
      scopes: ['cards.read', 'ops.admin', 'forge.approve'],
    };
    const refreshed = refreshedAuthorizationForIdentity(
      staleTokenClaims.role,
      'tenant@example.com',
      new Set(['founder@example.com']),
    );

    expect(refreshed.role).toBe('OWNER');
    expect(refreshed.scopes).not.toContain('ops.admin');
    expect(refreshed.scopes).not.toContain('forge.approve');
    expect(refreshed.scopes).not.toEqual(staleTokenClaims.scopes);
    expect(refreshed.scopes).toEqual(['cards.read', 'cards.write']);
  });

  it('defaults unverified platform-owner registration to disabled', () => {
    expect(unverifiedPlatformOwnerRegistrationAllowed(undefined)).toBe(false);
    expect(unverifiedPlatformOwnerRegistrationAllowed('false')).toBe(false);
    expect(unverifiedPlatformOwnerRegistrationAllowed(' TRUE ')).toBe(true);
  });
});

import { hasCrossOrgAuditAuthority } from '../platform-authority';

describe('cross-organization audit authority', () => {
  it('does not treat an ordinary tenant OWNER as a platform administrator', () => {
    expect(hasCrossOrgAuditAuthority({
      role: 'OWNER',
      scopes: ['cards.read', 'cards.write', 'admin.audit'],
    })).toBe(false);
  });

  it('requires ops.admin regardless of the tenant role', () => {
    expect(hasCrossOrgAuditAuthority({
      role: 'ADMIN',
      scopes: ['admin.audit'],
    })).toBe(false);
    expect(hasCrossOrgAuditAuthority({
      role: 'OWNER',
      scopes: ['admin.audit', 'ops.admin'],
    })).toBe(true);
  });
});

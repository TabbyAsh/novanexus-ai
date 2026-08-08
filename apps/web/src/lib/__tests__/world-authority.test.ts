import { hasWorldAuthority } from '../world-authority';

describe('World authority', () => {
  it('does not grant an ordinary tenant owner World control', () => {
    const tenantOwner = {
      role: 'OWNER',
      scopes: ['cards.read', 'cards.write', 'trade.read', 'store.read'],
    };

    expect(tenantOwner.role).toBe('OWNER');
    expect(hasWorldAuthority(tenantOwner.scopes)).toBe(false);
  });

  it('grants World control only when the verified identity has ops.admin', () => {
    expect(hasWorldAuthority(['cards.read', 'ops.admin'])).toBe(true);
    expect(hasWorldAuthority(['forge.approve', 'admin.audit'])).toBe(false);
    expect(hasWorldAuthority(undefined)).toBe(false);
  });
});

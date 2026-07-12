jest.mock('@nova/shared', () => ({
  getDefaultScopes: jest.fn(() => [
    'cards.read', 'cards.write', 'forge.read', 'forge.approve',
    'ops.admin', 'admin.killswitch',
  ]),
}));

import { scopesForIdentity } from '../platform-scopes';

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
});

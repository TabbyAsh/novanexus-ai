import { requiredScopesForRoute } from '../route-authority';

describe('method-aware gateway authority', () => {
  it('does not let a read scope authorize a write to the same resource family', () => {
    expect(requiredScopesForRoute('GET', '/v1/store/products')).toEqual(['store.read']);
    expect(requiredScopesForRoute('POST', '/v1/store/products')).toEqual(['store.write']);
  });

  it('uses the narrow execution scope instead of a broad route prefix', () => {
    expect(requiredScopesForRoute('POST', '/v1/trade/live/order')).toEqual(['trade.live.execute']);
    expect(requiredScopesForRoute('GET', '/v1/trade/live/order')).toEqual(['trade.read']);
  });

  it('requires approval authority for proposal decisions', () => {
    expect(requiredScopesForRoute('POST', '/v1/agents/proposals/decide/proposal-1')).toEqual(['forge.approve']);
    expect(requiredScopesForRoute('GET', '/v1/agents')).toEqual(['forge.read']);
  });
});

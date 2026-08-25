import {
  liveProviderWritesEnabled,
  providerEffectCapabilities,
  PROVIDER_WRITES_DISABLED_REASON,
} from '../provider-effect-policy';

describe('provider effect policy', () => {
  test('keeps irreversible provider writes fail-closed', () => {
    expect(liveProviderWritesEnabled()).toBe(false);
    expect(PROVIDER_WRITES_DISABLED_REASON).toContain('durable idempotency');
    expect(PROVIDER_WRITES_DISABLED_REASON).toContain('approval fencing');
  });

  test('reports provider configuration separately from write authority', () => {
    expect(providerEffectCapabilities(true)).toEqual({
      configured: true,
      readAccessEnabled: true,
      writeAccessEnabled: false,
      writeDisabledReason: PROVIDER_WRITES_DISABLED_REASON,
    });
  });
});

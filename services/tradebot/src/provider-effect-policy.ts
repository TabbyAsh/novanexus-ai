export const PROVIDER_WRITES_DISABLED_REASON =
  'Live provider writes are disabled until durable idempotency and approval fencing are implemented';

/**
 * Deliberately not configurable in this release. Database task fencing cannot
 * make an irreversible third-party write exactly once.
 */
export function liveProviderWritesEnabled(): boolean {
  return false;
}

/** Keep credential/configuration state distinct from authority to mutate. */
export function providerEffectCapabilities(configured: boolean) {
  const writesEnabled = liveProviderWritesEnabled();
  return {
    configured,
    readAccessEnabled: configured,
    writeAccessEnabled: writesEnabled,
    writeDisabledReason: writesEnabled ? null : PROVIDER_WRITES_DISABLED_REASON,
  };
}

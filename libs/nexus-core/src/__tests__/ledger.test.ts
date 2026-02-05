import { DecisionLedger, LedgerEntryType } from '../ledger';
import { AutonomyTier } from '../constitution';

describe('DecisionLedger', () => {
  test('verifyChain returns valid for untampered entries', () => {
    const ledger = new DecisionLedger();

    ledger.append(
      LedgerEntryType.SYSTEM_EVENT,
      'test',
      { type: 'system', id: 'tester' },
      { event: 'boot' },
      { tags: ['test'], autonomyTier: AutonomyTier.OBSERVE }
    );

    ledger.append(
      LedgerEntryType.DECISION_MADE,
      'test',
      { type: 'system', id: 'tester' },
      { decision: 'noop' },
      { tags: ['test'], autonomyTier: AutonomyTier.RECOMMEND }
    );

    expect(ledger.verifyChain().valid).toBe(true);
  });

  test('verifyChain detects tampering', () => {
    const ledger = new DecisionLedger();

    ledger.append(
      LedgerEntryType.SYSTEM_EVENT,
      'test',
      { type: 'system', id: 'tester' },
      { event: 'boot' },
      { tags: ['test'] }
    );

    // Simulate tampering by mutating an entry after it was hashed.
    const anyLedger = ledger as any;
    anyLedger.entries[0].payload = { event: 'tampered' };

    const verification = ledger.verifyChain();
    expect(verification.valid).toBe(false);
    expect(typeof verification.brokenAt).toBe('number');
  });
});

import { TrustLedger } from '../trust-ledger';

describe('TrustLedger', () => {
  test('records explanations and updates stats', () => {
    const trust = new TrustLedger();

    const explanation = trust.recordExplanation(
      { type: 'decision', id: 'd1', summary: 'Test decision' },
      {
        summary: 'Because reasons',
        reasoning: ['A', 'B'],
        evidence: [{ type: 'metric', description: 'x', weight: 1 }],
        alternatives: ['Do nothing'],
        caveats: ['Test caveat'],
      },
      0.8,
      'simple'
    );

    trust.recordExplanationResponse(explanation.id, 'accepted');

    const stats = trust.getStats();
    expect(stats.totalExplanations).toBe(1);
    expect(stats.acceptedExplanations).toBe(1);
    expect(stats.trustScore).toBeGreaterThanOrEqual(50);
  });

  test('initiates override with friction for constraints', () => {
    const trust = new TrustLedger();

    const override = trust.initiateOverride(
      { type: 'constraint', id: 'c1', originalValue: 1 },
      2,
      'test override'
    );

    // Constraints should trigger the highest friction by default.
    expect(override.friction.level).toBe('critical');
    expect(override.friction.completed).toBe(false);
    expect(override.friction.steps.length).toBeGreaterThanOrEqual(3);
  });
});

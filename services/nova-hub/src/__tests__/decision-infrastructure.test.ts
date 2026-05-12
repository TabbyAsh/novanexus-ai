import { buildFlipDecisionCard, computeOutcomeLearning } from '../decision-infrastructure';

describe('decision-infrastructure engine', () => {
  it('produces BUY/OFFER/SKIP style output with explicit uncertainty fields', () => {
    const card = buildFlipDecisionCard({
      title: 'Milwaukee Drill Set',
      category: 'Tools',
      condition: 'Good',
      askingPrice: 80,
      soldComps: [145, 150, 160, 138, 155, 148],
      estimatedShipping: 12,
      estimatedFees: 18,
      location: 'Austin, TX',
      sourceType: 'facebook_marketplace',
    });

    expect(['BUY', 'OFFER', 'SKIP', 'WAIT', 'SELL']).toContain(card.decision.action);
    expect(card.financials.grossResale.mid).toBeGreaterThan(0);
    expect(card.financials.expectedRoiPct).toBeDefined();
    expect(card.financials.opportunityCost).toBeGreaterThanOrEqual(0);
    expect(card.confidence.assumptions.length).toBeGreaterThan(0);
    expect(Array.isArray(card.confidence.uncertaintyExplanation)).toBe(true);
    expect(Array.isArray(card.confidence.missingInformation)).toBe(true);
  });

  it('adds missing-information warnings when sparse input is provided', () => {
    const card = buildFlipDecisionCard({
      title: 'Unknown Bundle',
      askingPrice: 50,
    });

    expect(card.confidence.missingInformation.length).toBeGreaterThan(0);
    expect(card.confidence.confidencePct).toBeLessThan(60);
    expect(card.marketIntelligence.soldRange.mid).toBeGreaterThan(0);
  });

  it('computes learning calibration against realized outcomes', () => {
    const card = buildFlipDecisionCard({
      title: 'PS5 Console',
      category: 'Gaming',
      condition: 'Like New',
      askingPrice: 320,
      soldComps: [410, 430, 420, 415, 405, 425],
      estimatedFees: 48,
      estimatedShipping: 20,
      expectedHoldDays: 7,
    });

    const learning = computeOutcomeLearning(card, {
      realizedNetProfit: 42,
      holdDays: 9,
    });

    expect(learning.absoluteError).toBeGreaterThanOrEqual(0);
    expect(learning.calibrationErrorPct).toBeGreaterThanOrEqual(0);
    expect(learning.summary[0]).toContain('Predicted net');
  });
});

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
    expect(card.financials.expectedTotalCost).toBeGreaterThan(card.financials.askingPrice);
    expect(card.financials.expectedSalePrice).toBeGreaterThan(0);
    expect(card.financials.opportunityCost).toBeGreaterThanOrEqual(0);
    expect(card.confidence.assumptions.length).toBeGreaterThan(0);
    expect(Array.isArray(card.confidence.uncertaintyExplanation)).toBe(true);
    expect(Array.isArray(card.confidence.uncertaintyDrivers)).toBe(true);
    expect(card.confidence.confidenceBounds.low).toBeLessThanOrEqual(card.confidence.confidenceBounds.mid);
    expect(card.confidence.confidenceBounds.high).toBeGreaterThanOrEqual(card.confidence.confidenceBounds.mid);
    expect(Array.isArray(card.confidence.missingInformation)).toBe(true);
    expect(card.marketIntelligence.activeListingSaturationScore).toBeGreaterThan(0);
    expect(card.marketIntelligence.competitionDensityScore).toBeGreaterThan(0);
    expect(['FAST', 'MODERATE', 'SLOW']).toContain(card.marketIntelligence.sellThroughVelocity);
    expect(card.marketIntel.averageComparablePrice).toBe(card.marketIntelligence.soldRange.mid);
    expect(card.financialModel.expectedNetProfit).toBe(card.financials.expectedNetProfit);
  });

  it('adds missing-information warnings when sparse input is provided', () => {
    const card = buildFlipDecisionCard({
      title: 'Unknown Bundle',
      askingPrice: 50,
    });

    expect(card.confidence.missingInformation.length).toBeGreaterThan(0);
    expect(card.confidence.confidencePct).toBeLessThan(60);
    expect(card.marketIntelligence.soldRange.mid).toBeGreaterThan(0);
    expect(card.marketIntel.estimatedDaysToSell).toBe(card.marketIntelligence.expectedDaysToSale.mid);
    expect(card.financialModel.expectedTotalCost).toBe(card.financials.expectedTotalCost);
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
    expect(learning.confidenceDeltaPct).toBeLessThanOrEqual(100);
    expect(learning.confidenceDeltaPct).toBeGreaterThanOrEqual(-100);
    expect(learning.summary[0]).toContain('Predicted net');
  });

  it('applies outcome calibration profile to future decision outputs', () => {
    const input = {
      title: 'PS5 Console',
      category: 'Gaming',
      condition: 'Like New',
      askingPrice: 320,
      soldComps: [410, 430, 420, 415, 405, 425],
      estimatedFees: 48,
      estimatedShipping: 20,
      expectedHoldDays: 7,
    };

    const baseline = buildFlipDecisionCard(input);
    const calibrated = buildFlipDecisionCard(input, {
      calibration: {
        sampleSize: 6,
        meanPredictionBiasPct: -25,
        meanCalibrationErrorPct: 40,
        meanConfidenceDeltaPct: -30,
      },
    });

    expect(calibrated.financials.expectedNetProfit).toBeLessThan(baseline.financials.expectedNetProfit);
    expect(calibrated.confidence.confidencePct).toBeLessThan(baseline.confidence.confidencePct);
    expect(calibrated.confidence.assumptions.join(' ')).toContain('Outcome feedback applied');
  });
});

import { RiskEngine } from '../risk-engine';

describe('RiskEngine', () => {
  test('vetoes positions exceeding hard max position size', () => {
    const risk = new RiskEngine(100000);

    // $200,000 position in a $100,000 portfolio (violates HARD_MAX_POSITION_SIZE)
    const result = risk.checkPosition({
      symbol: 'TEST',
      side: 'long',
      size: 2000,
      price: 100,
    });

    expect(result.approved).toBe(false);
    expect(result.violatedConstraints).toContain('HARD_MAX_POSITION_SIZE');
  });
});

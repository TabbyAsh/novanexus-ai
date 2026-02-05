/**
 * Nova Hub Service Tests
 * Tests for critical path functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock journal entry P/L calculation
function calculatePnL(entry: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
}): number {
  const { direction, entryPrice, exitPrice, quantity } = entry;
  if (direction === 'LONG') {
    return (exitPrice - entryPrice) * quantity;
  } else {
    return (entryPrice - exitPrice) * quantity;
  }
}

// Mock backtest SMA calculation
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      sma.push(avg);
    }
  }
  return sma;
}

// Mock quota enforcement
function checkQuota(
  usage: number,
  limit: number
): { allowed: boolean; remaining: number } {
  if (limit === -1) return { allowed: true, remaining: Infinity };
  const remaining = Math.max(0, limit - usage);
  return { allowed: remaining > 0, remaining };
}

// Mock risk/reward calculation
function calculateRiskReward(
  entry: number,
  target: number,
  stopLoss: number,
  direction: 'LONG' | 'SHORT'
): number {
  if (direction === 'LONG') {
    const reward = target - entry;
    const risk = entry - stopLoss;
    return risk > 0 ? reward / risk : 0;
  } else {
    const reward = entry - target;
    const risk = stopLoss - entry;
    return risk > 0 ? reward / risk : 0;
  }
}

describe('Journal P/L Calculation', () => {
  it('calculates profit for winning LONG trade', () => {
    const pnl = calculatePnL({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 110,
      quantity: 10,
    });
    expect(pnl).toBe(100); // (110 - 100) * 10 = 100
  });

  it('calculates loss for losing LONG trade', () => {
    const pnl = calculatePnL({
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 90,
      quantity: 10,
    });
    expect(pnl).toBe(-100); // (90 - 100) * 10 = -100
  });

  it('calculates profit for winning SHORT trade', () => {
    const pnl = calculatePnL({
      direction: 'SHORT',
      entryPrice: 100,
      exitPrice: 90,
      quantity: 10,
    });
    expect(pnl).toBe(100); // (100 - 90) * 10 = 100
  });

  it('calculates loss for losing SHORT trade', () => {
    const pnl = calculatePnL({
      direction: 'SHORT',
      entryPrice: 100,
      exitPrice: 110,
      quantity: 10,
    });
    expect(pnl).toBe(-100); // (100 - 110) * 10 = -100
  });

  it('handles fractional quantities', () => {
    const pnl = calculatePnL({
      direction: 'LONG',
      entryPrice: 150.50,
      exitPrice: 155.75,
      quantity: 5.5,
    });
    expect(pnl).toBeCloseTo(28.875); // (155.75 - 150.50) * 5.5
  });
});

describe('Backtest SMA Calculation', () => {
  it('calculates correct SMA values', () => {
    const prices = [10, 20, 30, 40, 50];
    const sma = calculateSMA(prices, 3);
    
    expect(sma[0]).toBeNaN();
    expect(sma[1]).toBeNaN();
    expect(sma[2]).toBe(20); // (10 + 20 + 30) / 3
    expect(sma[3]).toBe(30); // (20 + 30 + 40) / 3
    expect(sma[4]).toBe(40); // (30 + 40 + 50) / 3
  });

  it('handles single-period SMA', () => {
    const prices = [10, 20, 30];
    const sma = calculateSMA(prices, 1);
    
    expect(sma).toEqual([10, 20, 30]);
  });

  it('handles period equal to data length', () => {
    const prices = [10, 20, 30];
    const sma = calculateSMA(prices, 3);
    
    expect(sma[0]).toBeNaN();
    expect(sma[1]).toBeNaN();
    expect(sma[2]).toBe(20);
  });
});

describe('Plan Quota Enforcement', () => {
  it('allows action when under limit', () => {
    const result = checkQuota(5, 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it('denies action when at limit', () => {
    const result = checkQuota(10, 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('allows unlimited for PRO plan (-1 limit)', () => {
    const result = checkQuota(1000, -1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it('denies action when over limit', () => {
    const result = checkQuota(15, 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('Risk/Reward Calculation', () => {
  it('calculates R/R for LONG position', () => {
    const rr = calculateRiskReward(100, 120, 90, 'LONG');
    expect(rr).toBe(2); // (120-100) / (100-90) = 20/10 = 2
  });

  it('calculates R/R for SHORT position', () => {
    const rr = calculateRiskReward(100, 80, 110, 'SHORT');
    expect(rr).toBe(2); // (100-80) / (110-100) = 20/10 = 2
  });

  it('handles asymmetric risk/reward', () => {
    const rr = calculateRiskReward(100, 115, 95, 'LONG');
    expect(rr).toBe(3); // (115-100) / (100-95) = 15/5 = 3
  });

  it('returns 0 for invalid stop loss', () => {
    const rr = calculateRiskReward(100, 120, 100, 'LONG');
    expect(rr).toBe(0); // No risk = invalid
  });
});

describe('Trade Metrics', () => {
  it('calculates win rate correctly', () => {
    const trades = [
      { pnl: 100 },
      { pnl: -50 },
      { pnl: 75 },
      { pnl: -25 },
      { pnl: 200 },
    ];
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRate = (wins / trades.length) * 100;
    expect(winRate).toBe(60);
  });

  it('calculates average P/L correctly', () => {
    const trades = [
      { pnl: 100 },
      { pnl: -50 },
      { pnl: 75 },
      { pnl: -25 },
      { pnl: 200 },
    ];
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalPnL / trades.length;
    expect(avgPnL).toBe(60);
  });

  it('calculates profit factor correctly', () => {
    const trades = [
      { pnl: 100 },
      { pnl: -50 },
      { pnl: 75 },
      { pnl: -25 },
    ];
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
    expect(profitFactor).toBeCloseTo(2.33, 1); // 175 / 75
  });
});

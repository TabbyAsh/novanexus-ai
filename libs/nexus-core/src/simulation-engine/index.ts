/**
 * NOVA NEXUS SIMULATION ENGINE
 * ============================
 * Pre-execution simulation with expected value, drawdown distribution,
 * tail risk analysis, and opportunity cost calculation.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// SIMULATION TYPES
// ============================================================================

export interface SimulationScenario {
  id: string;
  name: string;
  probability: number;
  outcome: {
    returnPercent: number;
    maxDrawdown: number;
    durationHours: number;
    exitReason: 'take_profit' | 'stop_loss' | 'time_exit' | 'signal_invalidation';
  };
}

export interface DrawdownDistribution {
  /** Percentile values */
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  
  /** Maximum observed */
  max: number;
  
  /** Expected (mean) */
  expected: number;
  
  /** Standard deviation */
  stdDev: number;
}

export interface TailRiskMetrics {
  /** Value at Risk (5%) */
  var5: number;
  
  /** Value at Risk (1%) */
  var1: number;
  
  /** Conditional VaR (Expected Shortfall) */
  cvar: number;
  
  /** Maximum potential loss */
  maxLoss: number;
  
  /** Probability of catastrophic loss (>20%) */
  catastrophicProbability: number;
  
  /** Skewness of return distribution */
  skewness: number;
  
  /** Kurtosis (tail heaviness) */
  kurtosis: number;
}

export interface OpportunityCost {
  /** Best alternative return if capital deployed elsewhere */
  bestAlternative: {
    symbol: string;
    expectedReturn: number;
    confidence: number;
  };
  
  /** Risk-free alternative */
  riskFree: {
    rate: number;
    returnForPeriod: number;
  };
  
  /** Market average return */
  marketAverage: {
    benchmark: string;
    expectedReturn: number;
  };
  
  /** Net opportunity cost */
  netCost: number;
}

export interface SimulationResult {
  id: string;
  symbol: string;
  strategyId: string;
  simulatedAt: number;
  
  /** Position details */
  position: {
    direction: 'long' | 'short';
    entryPrice: number;
    positionSize: number;
    capitalAtRisk: number;
  };
  
  /** Expected value analysis */
  expectedValue: {
    /** Probability-weighted expected return */
    ev: number;
    /** Confidence interval */
    ci95: { low: number; high: number };
    /** Win probability */
    winProbability: number;
    /** Average win size */
    avgWin: number;
    /** Average loss size */
    avgLoss: number;
    /** Kelly criterion optimal size */
    kellyOptimal: number;
  };
  
  /** Scenarios analyzed */
  scenarios: SimulationScenario[];
  
  /** Drawdown analysis */
  drawdownDistribution: DrawdownDistribution;
  
  /** Tail risk metrics */
  tailRisk: TailRiskMetrics;
  
  /** Opportunity cost */
  opportunityCost: OpportunityCost;
  
  /** Time analysis */
  timeMetrics: {
    expectedDuration: number;
    durationDistribution: { p50: number; p90: number };
    timeDecay: number; // Expected value loss per day
  };
  
  /** Overall recommendation */
  recommendation: {
    action: 'execute' | 'reduce_size' | 'wait' | 'skip';
    confidence: number;
    reasoning: string[];
    suggestedSize?: number;
    suggestedDelay?: number;
  };
  
  /** Simulation quality */
  quality: {
    sampleSize: number;
    convergenceScore: number;
    dataQuality: number;
  };
}

// ============================================================================
// MONTE CARLO CONFIG
// ============================================================================

export interface MonteCarloConfig {
  /** Number of simulations */
  iterations: number;
  
  /** Time steps per simulation */
  timeSteps: number;
  
  /** Confidence level for intervals */
  confidenceLevel: number;
  
  /** Use historical data */
  useHistorical: boolean;
  
  /** Include regime transitions */
  includeRegimeTransitions: boolean;
}

// ============================================================================
// SIMULATION ENGINE
// ============================================================================

export class SimulationEngine {
  private results: Map<string, SimulationResult[]> = new Map();
  private defaultConfig: MonteCarloConfig = {
    iterations: 10000,
    timeSteps: 100,
    confidenceLevel: 0.95,
    useHistorical: true,
    includeRegimeTransitions: true,
  };

  /**
   * Run full simulation for a trade
   */
  simulate(
    symbol: string,
    strategyId: string,
    position: {
      direction: 'long' | 'short';
      entryPrice: number;
      positionSize: number;
      stopLoss: number;
      takeProfit: number;
      trailingStop?: number;
    },
    marketContext: {
      volatility: number;
      trend: number;
      liquidity: number;
      regime: string;
      avgDailyRange: number;
    },
    config: Partial<MonteCarloConfig> = {}
  ): SimulationResult {
    const cfg = { ...this.defaultConfig, ...config };
    
    // Run Monte Carlo simulation
    const simulations = this.runMonteCarlo(position, marketContext, cfg);
    
    // Analyze results
    const scenarios = this.generateScenarios(simulations, position);
    const expectedValue = this.calculateExpectedValue(simulations, position);
    const drawdownDistribution = this.calculateDrawdownDistribution(simulations);
    const tailRisk = this.calculateTailRisk(simulations);
    const timeMetrics = this.calculateTimeMetrics(simulations);
    const opportunityCost = this.calculateOpportunityCost(expectedValue.ev, timeMetrics.expectedDuration);
    
    // Generate recommendation
    const recommendation = this.generateRecommendation(
      expectedValue,
      tailRisk,
      opportunityCost,
      position.positionSize
    );

    const result: SimulationResult = {
      id: uuidv4(),
      symbol,
      strategyId,
      simulatedAt: Date.now(),
      position: {
        direction: position.direction,
        entryPrice: position.entryPrice,
        positionSize: position.positionSize,
        capitalAtRisk: position.positionSize * Math.abs(position.entryPrice - position.stopLoss) / position.entryPrice,
      },
      expectedValue,
      scenarios,
      drawdownDistribution,
      tailRisk,
      opportunityCost,
      timeMetrics,
      recommendation,
      quality: {
        sampleSize: cfg.iterations,
        convergenceScore: this.calculateConvergence(simulations),
        dataQuality: marketContext.liquidity,
      },
    };

    // Store result
    if (!this.results.has(symbol)) {
      this.results.set(symbol, []);
    }
    this.results.get(symbol)!.push(result);

    return result;
  }

  /**
   * Run Monte Carlo simulation
   */
  private runMonteCarlo(
    position: {
      direction: 'long' | 'short';
      entryPrice: number;
      positionSize: number;
      stopLoss: number;
      takeProfit: number;
      trailingStop?: number;
    },
    context: {
      volatility: number;
      trend: number;
      liquidity: number;
      regime: string;
      avgDailyRange: number;
    },
    config: MonteCarloConfig
  ): Array<{
    finalReturn: number;
    maxDrawdown: number;
    exitTime: number;
    exitReason: 'take_profit' | 'stop_loss' | 'time_exit' | 'signal_invalidation';
    path: number[];
  }> {
    const results: Array<{
      finalReturn: number;
      maxDrawdown: number;
      exitTime: number;
      exitReason: 'take_profit' | 'stop_loss' | 'time_exit' | 'signal_invalidation';
      path: number[];
    }> = [];

    const { entryPrice, stopLoss, takeProfit, trailingStop, direction } = position;
    const { volatility, trend, avgDailyRange } = context;

    // Convert stop/target to percentages
    const stopPercent = Math.abs(entryPrice - stopLoss) / entryPrice;
    const targetPercent = Math.abs(takeProfit - entryPrice) / entryPrice;
    const trailPercent = trailingStop ?? stopPercent;

    // Daily volatility (assuming volatility is annualized)
    const dailyVol = volatility / Math.sqrt(252);
    const hourlyVol = dailyVol / Math.sqrt(24);

    for (let i = 0; i < config.iterations; i++) {
      let price = entryPrice;
      let highWaterMark = entryPrice;
      let maxDrawdown = 0;
      const path: number[] = [0];
      let exitTime = config.timeSteps;
      let exitReason: 'take_profit' | 'stop_loss' | 'time_exit' | 'signal_invalidation' = 'time_exit';

      for (let t = 1; t <= config.timeSteps; t++) {
        // Geometric Brownian Motion with drift
        const drift = (trend / 252 / 24); // Hourly drift
        const shock = this.normalRandom() * hourlyVol;
        const returnStep = drift + shock;
        
        price = price * (1 + returnStep);
        const currentReturn = (direction === 'long' ? 1 : -1) * (price - entryPrice) / entryPrice;
        path.push(currentReturn);

        // Track high water mark and drawdown
        if (currentReturn > (highWaterMark - entryPrice) / entryPrice) {
          highWaterMark = entryPrice * (1 + currentReturn);
        }
        const drawdown = (highWaterMark - price) / highWaterMark;
        maxDrawdown = Math.max(maxDrawdown, drawdown);

        // Check exit conditions
        if (direction === 'long') {
          if (price <= stopLoss) {
            exitTime = t;
            exitReason = 'stop_loss';
            break;
          }
          if (price >= takeProfit) {
            exitTime = t;
            exitReason = 'take_profit';
            break;
          }
          // Trailing stop
          if (trailingStop && price <= highWaterMark * (1 - trailPercent)) {
            exitTime = t;
            exitReason = 'stop_loss';
            break;
          }
        } else {
          if (price >= stopLoss) {
            exitTime = t;
            exitReason = 'stop_loss';
            break;
          }
          if (price <= takeProfit) {
            exitTime = t;
            exitReason = 'take_profit';
            break;
          }
        }
      }

      const finalReturn = path[path.length - 1];
      results.push({
        finalReturn,
        maxDrawdown,
        exitTime,
        exitReason,
        path,
      });
    }

    return results;
  }

  /**
   * Generate scenario summary
   */
  private generateScenarios(
    simulations: Array<{ finalReturn: number; maxDrawdown: number; exitTime: number; exitReason: string }>,
    position: { stopLoss: number; takeProfit: number; entryPrice: number }
  ): SimulationScenario[] {
    const scenarios: SimulationScenario[] = [];
    const total = simulations.length;

    // Group by exit reason
    const byReason = {
      take_profit: simulations.filter(s => s.exitReason === 'take_profit'),
      stop_loss: simulations.filter(s => s.exitReason === 'stop_loss'),
      time_exit: simulations.filter(s => s.exitReason === 'time_exit'),
      signal_invalidation: simulations.filter(s => s.exitReason === 'signal_invalidation'),
    };

    // Win scenario
    if (byReason.take_profit.length > 0) {
      const wins = byReason.take_profit;
      scenarios.push({
        id: 'win_target',
        name: 'Target Hit',
        probability: wins.length / total,
        outcome: {
          returnPercent: this.average(wins.map(s => s.finalReturn)),
          maxDrawdown: this.average(wins.map(s => s.maxDrawdown)),
          durationHours: this.average(wins.map(s => s.exitTime)),
          exitReason: 'take_profit',
        },
      });
    }

    // Stop loss scenario
    if (byReason.stop_loss.length > 0) {
      const losses = byReason.stop_loss;
      scenarios.push({
        id: 'stop_loss',
        name: 'Stop Loss Hit',
        probability: losses.length / total,
        outcome: {
          returnPercent: this.average(losses.map(s => s.finalReturn)),
          maxDrawdown: this.average(losses.map(s => s.maxDrawdown)),
          durationHours: this.average(losses.map(s => s.exitTime)),
          exitReason: 'stop_loss',
        },
      });
    }

    // Time exit scenario
    if (byReason.time_exit.length > 0) {
      const timeExits = byReason.time_exit;
      scenarios.push({
        id: 'time_exit',
        name: 'Time Exit',
        probability: timeExits.length / total,
        outcome: {
          returnPercent: this.average(timeExits.map(s => s.finalReturn)),
          maxDrawdown: this.average(timeExits.map(s => s.maxDrawdown)),
          durationHours: this.average(timeExits.map(s => s.exitTime)),
          exitReason: 'time_exit',
        },
      });
    }

    return scenarios;
  }

  /**
   * Calculate expected value metrics
   */
  private calculateExpectedValue(
    simulations: Array<{ finalReturn: number }>,
    position: { positionSize: number }
  ): SimulationResult['expectedValue'] {
    const returns = simulations.map(s => s.finalReturn);
    const sorted = [...returns].sort((a, b) => a - b);
    const n = returns.length;

    // Expected value
    const ev = this.average(returns);
    
    // Confidence interval
    const ci95Low = sorted[Math.floor(n * 0.025)];
    const ci95High = sorted[Math.floor(n * 0.975)];
    
    // Win/loss stats
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r <= 0);
    const winProbability = wins.length / n;
    const avgWin = wins.length > 0 ? this.average(wins) : 0;
    const avgLoss = losses.length > 0 ? Math.abs(this.average(losses)) : 0;

    // Kelly criterion
    const kelly = winProbability - (1 - winProbability) / (avgWin / avgLoss || 1);
    const kellyOptimal = Math.max(0, Math.min(1, kelly));

    return {
      ev,
      ci95: { low: ci95Low, high: ci95High },
      winProbability,
      avgWin,
      avgLoss,
      kellyOptimal,
    };
  }

  /**
   * Calculate drawdown distribution
   */
  private calculateDrawdownDistribution(
    simulations: Array<{ maxDrawdown: number }>
  ): DrawdownDistribution {
    const drawdowns = simulations.map(s => s.maxDrawdown);
    const sorted = [...drawdowns].sort((a, b) => a - b);
    const n = drawdowns.length;

    return {
      p10: sorted[Math.floor(n * 0.1)],
      p25: sorted[Math.floor(n * 0.25)],
      p50: sorted[Math.floor(n * 0.5)],
      p75: sorted[Math.floor(n * 0.75)],
      p90: sorted[Math.floor(n * 0.9)],
      p99: sorted[Math.floor(n * 0.99)],
      max: sorted[n - 1],
      expected: this.average(drawdowns),
      stdDev: this.stdDev(drawdowns),
    };
  }

  /**
   * Calculate tail risk metrics
   */
  private calculateTailRisk(
    simulations: Array<{ finalReturn: number }>
  ): TailRiskMetrics {
    const returns = simulations.map(s => s.finalReturn);
    const sorted = [...returns].sort((a, b) => a - b);
    const n = returns.length;

    // VaR
    const var5 = sorted[Math.floor(n * 0.05)];
    const var1 = sorted[Math.floor(n * 0.01)];
    
    // CVaR (Expected Shortfall)
    const tail5 = sorted.slice(0, Math.floor(n * 0.05));
    const cvar = tail5.length > 0 ? this.average(tail5) : var5;
    
    // Max loss
    const maxLoss = sorted[0];
    
    // Catastrophic probability
    const catastrophicProbability = returns.filter(r => r < -0.20).length / n;
    
    // Higher moments
    const mean = this.average(returns);
    const stdDev = this.stdDev(returns);
    
    // Skewness
    const skewness = this.moment(returns, mean, stdDev, 3);
    
    // Kurtosis
    const kurtosis = this.moment(returns, mean, stdDev, 4) - 3; // Excess kurtosis

    return {
      var5,
      var1,
      cvar,
      maxLoss,
      catastrophicProbability,
      skewness,
      kurtosis,
    };
  }

  /**
   * Calculate time metrics
   */
  private calculateTimeMetrics(
    simulations: Array<{ exitTime: number; finalReturn: number }>
  ): SimulationResult['timeMetrics'] {
    const times = simulations.map(s => s.exitTime);
    const sorted = [...times].sort((a, b) => a - b);
    const n = times.length;

    const expectedDuration = this.average(times);
    
    // Time decay: expected return loss per time unit
    const earlyExits = simulations.filter(s => s.exitTime <= expectedDuration / 2);
    const lateExits = simulations.filter(s => s.exitTime > expectedDuration / 2);
    
    const earlyReturn = earlyExits.length > 0 ? this.average(earlyExits.map(s => s.finalReturn)) : 0;
    const lateReturn = lateExits.length > 0 ? this.average(lateExits.map(s => s.finalReturn)) : 0;
    const timeDecay = (earlyReturn - lateReturn) / expectedDuration;

    return {
      expectedDuration,
      durationDistribution: {
        p50: sorted[Math.floor(n * 0.5)],
        p90: sorted[Math.floor(n * 0.9)],
      },
      timeDecay,
    };
  }

  /**
   * Calculate opportunity cost
   */
  private calculateOpportunityCost(
    expectedReturn: number,
    expectedDuration: number
  ): OpportunityCost {
    // Annualized expected duration in days
    const durationDays = expectedDuration / 24;
    
    // Risk-free rate (simplified - would be fetched from market data)
    const annualRiskFree = 0.05; // 5%
    const riskFreeForPeriod = annualRiskFree * (durationDays / 365);
    
    // Market average (simplified)
    const annualMarketReturn = 0.10; // 10%
    const marketReturnForPeriod = annualMarketReturn * (durationDays / 365);
    
    // Best alternative (would be computed from watchlist)
    const bestAlternative = {
      symbol: 'MARKET_AVG',
      expectedReturn: marketReturnForPeriod,
      confidence: 0.6,
    };

    // Net opportunity cost
    const netCost = Math.max(
      riskFreeForPeriod - expectedReturn,
      marketReturnForPeriod - expectedReturn,
      bestAlternative.expectedReturn - expectedReturn
    );

    return {
      bestAlternative,
      riskFree: {
        rate: annualRiskFree,
        returnForPeriod: riskFreeForPeriod,
      },
      marketAverage: {
        benchmark: 'SPY',
        expectedReturn: marketReturnForPeriod,
      },
      netCost: Math.max(0, netCost),
    };
  }

  /**
   * Generate recommendation
   */
  private generateRecommendation(
    ev: SimulationResult['expectedValue'],
    tailRisk: TailRiskMetrics,
    opportunityCost: OpportunityCost,
    positionSize: number
  ): SimulationResult['recommendation'] {
    const reasoning: string[] = [];
    let action: 'execute' | 'reduce_size' | 'wait' | 'skip' = 'execute';
    let confidence = 0.7;
    let suggestedSize = positionSize;

    // EV check
    if (ev.ev <= 0) {
      action = 'skip';
      reasoning.push(`Negative expected value (${(ev.ev * 100).toFixed(2)}%)`);
      confidence = 0.9;
    } else if (ev.ev < 0.01) {
      action = 'wait';
      reasoning.push('Low expected value (<1%)');
      confidence = 0.7;
    } else {
      reasoning.push(`Positive EV of ${(ev.ev * 100).toFixed(2)}%`);
    }

    // Win probability check
    if (ev.winProbability < 0.4) {
      if (action === 'execute') action = 'reduce_size';
      reasoning.push(`Low win probability (${(ev.winProbability * 100).toFixed(0)}%)`);
      suggestedSize *= 0.5;
    } else if (ev.winProbability > 0.6) {
      reasoning.push(`Strong win probability (${(ev.winProbability * 100).toFixed(0)}%)`);
      confidence += 0.1;
    }

    // Tail risk check
    if (tailRisk.catastrophicProbability > 0.05) {
      action = 'skip';
      reasoning.push(`High catastrophic risk (${(tailRisk.catastrophicProbability * 100).toFixed(1)}%)`);
      confidence = 0.85;
    } else if (tailRisk.var5 < -0.10) {
      if (action === 'execute') action = 'reduce_size';
      reasoning.push(`High VaR5 (${(tailRisk.var5 * 100).toFixed(1)}%)`);
      suggestedSize *= 0.7;
    }

    // Opportunity cost check
    if (opportunityCost.netCost > ev.ev * 0.5) {
      if (action === 'execute') action = 'wait';
      reasoning.push('High opportunity cost relative to EV');
    }

    // Kelly sizing
    if (ev.kellyOptimal < positionSize && action === 'execute') {
      suggestedSize = Math.min(suggestedSize, ev.kellyOptimal);
      reasoning.push(`Kelly optimal size: ${(ev.kellyOptimal * 100).toFixed(1)}%`);
    }

    return {
      action,
      confidence: Math.min(1, confidence),
      reasoning,
      suggestedSize: action === 'reduce_size' ? suggestedSize : undefined,
      suggestedDelay: action === 'wait' ? 24 * 60 * 60 * 1000 : undefined, // 24h delay
    };
  }

  /**
   * Calculate convergence score
   */
  private calculateConvergence(
    simulations: Array<{ finalReturn: number }>
  ): number {
    // Split into two halves and compare means
    const half = Math.floor(simulations.length / 2);
    const firstHalf = simulations.slice(0, half).map(s => s.finalReturn);
    const secondHalf = simulations.slice(half).map(s => s.finalReturn);
    
    const mean1 = this.average(firstHalf);
    const mean2 = this.average(secondHalf);
    
    // Convergence is high if halves have similar means
    const difference = Math.abs(mean1 - mean2);
    const avgMean = (Math.abs(mean1) + Math.abs(mean2)) / 2 || 0.01;
    
    return Math.max(0, 1 - difference / avgMean);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  private normalRandom(): number {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  private stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = this.average(arr);
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(this.average(squaredDiffs));
  }

  private moment(arr: number[], mean: number, stdDev: number, order: number): number {
    if (stdDev === 0) return 0;
    const standardized = arr.map(v => Math.pow((v - mean) / stdDev, order));
    return this.average(standardized);
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get simulation results for a symbol
   */
  getResults(symbol: string, limit?: number): SimulationResult[] {
    const results = this.results.get(symbol) ?? [];
    const sorted = [...results].sort((a, b) => b.simulatedAt - a.simulatedAt);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get latest result for a symbol
   */
  getLatestResult(symbol: string): SimulationResult | undefined {
    const results = this.results.get(symbol);
    if (!results || results.length === 0) return undefined;
    return results[results.length - 1];
  }

  /**
   * Compare multiple symbols
   */
  compare(symbols: string[]): {
    symbol: string;
    ev: number;
    winProbability: number;
    tailRisk: number;
    recommendation: string;
  }[] {
    return symbols.map(symbol => {
      const result = this.getLatestResult(symbol);
      if (!result) {
        return {
          symbol,
          ev: 0,
          winProbability: 0,
          tailRisk: 0,
          recommendation: 'no_data',
        };
      }
      return {
        symbol,
        ev: result.expectedValue.ev,
        winProbability: result.expectedValue.winProbability,
        tailRisk: result.tailRisk.var5,
        recommendation: result.recommendation.action,
      };
    }).sort((a, b) => b.ev - a.ev);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalSimulations: number;
    symbolCount: number;
    avgEV: number;
    avgWinRate: number;
  } {
    let totalSimulations = 0;
    let totalEV = 0;
    let totalWinRate = 0;
    let resultCount = 0;

    for (const results of this.results.values()) {
      totalSimulations += results.length;
      for (const result of results) {
        totalEV += result.expectedValue.ev;
        totalWinRate += result.expectedValue.winProbability;
        resultCount++;
      }
    }

    return {
      totalSimulations,
      symbolCount: this.results.size,
      avgEV: resultCount > 0 ? totalEV / resultCount : 0,
      avgWinRate: resultCount > 0 ? totalWinRate / resultCount : 0,
    };
  }
}

export default SimulationEngine;

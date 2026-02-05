/**
 * NOVA NEXUS STRATEGY ENGINE
 * ==========================
 * Conditional strategy families with regime compatibility,
 * entry/exit conditions, and dynamic weighting.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// STRATEGY TYPES
// ============================================================================

export enum StrategyFamily {
  MOMENTUM = 'MOMENTUM',
  MEAN_REVERSION = 'MEAN_REVERSION',
  VOLATILITY_BREAKOUT = 'VOLATILITY_BREAKOUT',
  EVENT_DRIVEN = 'EVENT_DRIVEN',
  ATTENTION_LAG = 'ATTENTION_LAG',
  TREND_FOLLOWING = 'TREND_FOLLOWING',
  ARBITRAGE = 'ARBITRAGE',
}

export enum MarketRegime {
  BULL_TRENDING = 'BULL_TRENDING',
  BEAR_TRENDING = 'BEAR_TRENDING',
  RANGE_BOUND = 'RANGE_BOUND',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_VOLATILITY = 'LOW_VOLATILITY',
  RISK_OFF = 'RISK_OFF',
  RISK_ON = 'RISK_ON',
}

export enum TimeHorizon {
  SCALP = 'SCALP',         // Minutes to hour
  INTRADAY = 'INTRADAY',   // Same day
  SWING = 'SWING',         // Days to week
  POSITION = 'POSITION',   // Weeks to month
  INVESTMENT = 'INVESTMENT', // Months to years
}

// ============================================================================
// STRATEGY CONDITIONS
// ============================================================================

export interface EntryCondition {
  id: string;
  name: string;
  description: string;
  
  /** Condition type */
  type: 'signal' | 'price' | 'indicator' | 'time' | 'volume' | 'sentiment' | 'composite';
  
  /** Parameters for evaluation */
  parameters: Record<string, unknown>;
  
  /** Weight in composite scoring */
  weight: number;
  
  /** Is this required or optional? */
  required: boolean;
  
  /** Current evaluation result */
  evaluation?: {
    met: boolean;
    score: number;
    reason: string;
    evaluatedAt: number;
  };
}

export interface ExitCondition {
  id: string;
  name: string;
  type: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_based' | 'signal_invalidation' | 'regime_change';
  
  /** Parameters */
  parameters: {
    /** For stop_loss/take_profit: percentage from entry */
    percentage?: number;
    /** For trailing_stop: trail amount */
    trailAmount?: number;
    /** For time_based: max hold duration (ms) */
    maxDuration?: number;
    /** Custom condition */
    condition?: string;
  };
  
  /** Priority (higher = checked first) */
  priority: number;
}

// ============================================================================
// STRATEGY DEFINITION
// ============================================================================

export interface Strategy {
  id: string;
  name: string;
  family: StrategyFamily;
  description: string;
  version: string;
  
  /** Market regimes where this strategy performs well */
  compatibleRegimes: MarketRegime[];
  
  /** Regimes where strategy should be paused */
  incompatibleRegimes: MarketRegime[];
  
  /** Preferred time horizon */
  timeHorizon: TimeHorizon;
  
  /** Entry conditions */
  entryConditions: EntryCondition[];
  
  /** Exit conditions */
  exitConditions: ExitCondition[];
  
  /** Position sizing rules */
  positionSizing: {
    /** Base size as % of allocated capital */
    baseSize: number;
    /** Maximum size */
    maxSize: number;
    /** Adjustment based on conviction */
    convictionMultiplier: number;
    /** Adjustment based on volatility */
    volatilityAdjustment: boolean;
  };
  
  /** Risk parameters */
  riskParams: {
    maxLossPerTrade: number;
    maxDrawdown: number;
    maxOpenPositions: number;
    correlationLimit: number;
  };
  
  /** Performance tracking */
  performance: {
    totalTrades: number;
    winRate: number;
    avgReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    lastUpdated: number;
  };
  
  /** Current state */
  state: {
    active: boolean;
    weight: number;
    pausedUntil?: number;
    pauseReason?: string;
    lastTriggered?: number;
  };
  
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// STRATEGY SIGNAL
// ============================================================================

export interface StrategySignal {
  id: string;
  strategyId: string;
  symbol: string;
  timestamp: number;
  
  /** Signal direction */
  direction: 'long' | 'short' | 'close';
  
  /** Signal strength 0-1 */
  strength: number;
  
  /** Confidence in signal */
  confidence: number;
  
  /** Entry conditions evaluation */
  conditionResults: {
    conditionId: string;
    met: boolean;
    score: number;
    reason: string;
  }[];
  
  /** Overall conviction score */
  conviction: number;
  
  /** Recommended position size */
  recommendedSize: number;
  
  /** Target levels */
  targets: {
    entry: number;
    stopLoss: number;
    takeProfit: number[];
    trailingStop?: number;
  };
  
  /** Risk/reward metrics */
  metrics: {
    riskRewardRatio: number;
    expectedValue: number;
    maxRisk: number;
    timeToTarget: number; // estimated hours
  };
  
  /** Expiration */
  validUntil: number;
  
  /** Status */
  status: 'pending' | 'executed' | 'expired' | 'invalidated';
}

// ============================================================================
// STRATEGY ENGINE
// ============================================================================

export class StrategyEngine {
  private strategies: Map<string, Strategy> = new Map();
  private signals: Map<string, StrategySignal[]> = new Map();
  private currentRegime: MarketRegime = MarketRegime.RANGE_BOUND;

  constructor() {
    // Initialize with default strategies
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default strategy templates
   */
  private initializeDefaultStrategies(): void {
    // Momentum Strategy
    this.registerStrategy({
      id: 'momentum_breakout',
      name: 'Momentum Breakout',
      family: StrategyFamily.MOMENTUM,
      description: 'Captures price momentum following breakouts from consolidation',
      version: '1.0.0',
      compatibleRegimes: [MarketRegime.BULL_TRENDING, MarketRegime.RISK_ON],
      incompatibleRegimes: [MarketRegime.RANGE_BOUND, MarketRegime.RISK_OFF],
      timeHorizon: TimeHorizon.SWING,
      entryConditions: [
        {
          id: 'price_breakout',
          name: 'Price Breakout',
          description: 'Price breaks above resistance with volume',
          type: 'price',
          parameters: { breakoutPercent: 0.02, volumeMultiplier: 1.5 },
          weight: 0.4,
          required: true,
        },
        {
          id: 'momentum_confirmation',
          name: 'Momentum Confirmation',
          description: 'RSI above 50, MACD bullish',
          type: 'indicator',
          parameters: { rsiMin: 50, macdPositive: true },
          weight: 0.3,
          required: true,
        },
        {
          id: 'trend_alignment',
          name: 'Trend Alignment',
          description: 'Higher timeframe trend is bullish',
          type: 'signal',
          parameters: { trendDirection: 'up' },
          weight: 0.3,
          required: false,
        },
      ],
      exitConditions: [
        { id: 'stop_loss', name: 'Stop Loss', type: 'stop_loss', parameters: { percentage: 0.03 }, priority: 1 },
        { id: 'take_profit_1', name: 'Take Profit 1', type: 'take_profit', parameters: { percentage: 0.05 }, priority: 2 },
        { id: 'trailing_stop', name: 'Trailing Stop', type: 'trailing_stop', parameters: { trailAmount: 0.02 }, priority: 3 },
      ],
      positionSizing: { baseSize: 0.05, maxSize: 0.10, convictionMultiplier: 1.5, volatilityAdjustment: true },
      riskParams: { maxLossPerTrade: 0.02, maxDrawdown: 0.10, maxOpenPositions: 5, correlationLimit: 0.7 },
      performance: { totalTrades: 0, winRate: 0, avgReturn: 0, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: Date.now() },
      state: { active: true, weight: 1.0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Mean Reversion Strategy
    this.registerStrategy({
      id: 'mean_reversion_oversold',
      name: 'Mean Reversion Oversold',
      family: StrategyFamily.MEAN_REVERSION,
      description: 'Buys oversold conditions expecting reversion to mean',
      version: '1.0.0',
      compatibleRegimes: [MarketRegime.RANGE_BOUND, MarketRegime.BULL_TRENDING],
      incompatibleRegimes: [MarketRegime.BEAR_TRENDING, MarketRegime.HIGH_VOLATILITY],
      timeHorizon: TimeHorizon.SWING,
      entryConditions: [
        {
          id: 'oversold_rsi',
          name: 'Oversold RSI',
          description: 'RSI below 30',
          type: 'indicator',
          parameters: { rsiMax: 30 },
          weight: 0.35,
          required: true,
        },
        {
          id: 'support_proximity',
          name: 'Near Support',
          description: 'Price near key support level',
          type: 'price',
          parameters: { supportDistance: 0.02 },
          weight: 0.35,
          required: true,
        },
        {
          id: 'volume_exhaustion',
          name: 'Volume Exhaustion',
          description: 'Selling volume decreasing',
          type: 'volume',
          parameters: { volumeTrend: 'decreasing' },
          weight: 0.3,
          required: false,
        },
      ],
      exitConditions: [
        { id: 'stop_loss', name: 'Stop Loss', type: 'stop_loss', parameters: { percentage: 0.025 }, priority: 1 },
        { id: 'take_profit', name: 'Take Profit', type: 'take_profit', parameters: { percentage: 0.04 }, priority: 2 },
        { id: 'time_exit', name: 'Time Exit', type: 'time_based', parameters: { maxDuration: 5 * 24 * 60 * 60 * 1000 }, priority: 3 },
      ],
      positionSizing: { baseSize: 0.04, maxSize: 0.08, convictionMultiplier: 1.3, volatilityAdjustment: true },
      riskParams: { maxLossPerTrade: 0.015, maxDrawdown: 0.08, maxOpenPositions: 6, correlationLimit: 0.6 },
      performance: { totalTrades: 0, winRate: 0, avgReturn: 0, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: Date.now() },
      state: { active: true, weight: 1.0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Volatility Breakout Strategy
    this.registerStrategy({
      id: 'volatility_expansion',
      name: 'Volatility Expansion',
      family: StrategyFamily.VOLATILITY_BREAKOUT,
      description: 'Captures moves during volatility expansion from compression',
      version: '1.0.0',
      compatibleRegimes: [MarketRegime.LOW_VOLATILITY, MarketRegime.RANGE_BOUND],
      incompatibleRegimes: [MarketRegime.HIGH_VOLATILITY],
      timeHorizon: TimeHorizon.INTRADAY,
      entryConditions: [
        {
          id: 'bollinger_squeeze',
          name: 'Bollinger Squeeze',
          description: 'Bollinger bands contracted',
          type: 'indicator',
          parameters: { bbWidth: 0.03, squeezeThreshold: 0.02 },
          weight: 0.4,
          required: true,
        },
        {
          id: 'breakout_candle',
          name: 'Breakout Candle',
          description: 'Strong candle breaking bands',
          type: 'price',
          parameters: { candleStrength: 0.7, breakBand: true },
          weight: 0.4,
          required: true,
        },
        {
          id: 'volume_surge',
          name: 'Volume Surge',
          description: 'Volume spike on breakout',
          type: 'volume',
          parameters: { volumeMultiplier: 2.0 },
          weight: 0.2,
          required: false,
        },
      ],
      exitConditions: [
        { id: 'stop_loss', name: 'Stop Loss', type: 'stop_loss', parameters: { percentage: 0.015 }, priority: 1 },
        { id: 'take_profit', name: 'Take Profit', type: 'take_profit', parameters: { percentage: 0.03 }, priority: 2 },
        { id: 'time_exit', name: 'Time Exit', type: 'time_based', parameters: { maxDuration: 4 * 60 * 60 * 1000 }, priority: 3 },
      ],
      positionSizing: { baseSize: 0.03, maxSize: 0.06, convictionMultiplier: 1.2, volatilityAdjustment: false },
      riskParams: { maxLossPerTrade: 0.01, maxDrawdown: 0.05, maxOpenPositions: 3, correlationLimit: 0.5 },
      performance: { totalTrades: 0, winRate: 0, avgReturn: 0, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: Date.now() },
      state: { active: true, weight: 0.8 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Attention Lag Strategy
    this.registerStrategy({
      id: 'attention_lag',
      name: 'Social Attention Lag',
      family: StrategyFamily.ATTENTION_LAG,
      description: 'Exploits lag between social attention and price movement',
      version: '1.0.0',
      compatibleRegimes: [MarketRegime.BULL_TRENDING, MarketRegime.RISK_ON],
      incompatibleRegimes: [MarketRegime.BEAR_TRENDING, MarketRegime.RISK_OFF],
      timeHorizon: TimeHorizon.SWING,
      entryConditions: [
        {
          id: 'attention_surge',
          name: 'Attention Surge',
          description: 'Social mentions accelerating',
          type: 'sentiment',
          parameters: { velocityIncrease: 2.0, sentimentPositive: true },
          weight: 0.4,
          required: true,
        },
        {
          id: 'price_not_moved',
          name: 'Price Lag',
          description: 'Price has not yet responded',
          type: 'price',
          parameters: { priceChangeMax: 0.02 },
          weight: 0.3,
          required: true,
        },
        {
          id: 'liquidity_available',
          name: 'Liquidity Check',
          description: 'Sufficient liquidity for entry',
          type: 'volume',
          parameters: { minVolume: 1000000 },
          weight: 0.3,
          required: true,
        },
      ],
      exitConditions: [
        { id: 'stop_loss', name: 'Stop Loss', type: 'stop_loss', parameters: { percentage: 0.04 }, priority: 1 },
        { id: 'attention_fade', name: 'Attention Fade', type: 'signal_invalidation', parameters: { condition: 'attention_drops' }, priority: 2 },
        { id: 'take_profit', name: 'Take Profit', type: 'take_profit', parameters: { percentage: 0.08 }, priority: 3 },
      ],
      positionSizing: { baseSize: 0.04, maxSize: 0.08, convictionMultiplier: 1.4, volatilityAdjustment: true },
      riskParams: { maxLossPerTrade: 0.02, maxDrawdown: 0.10, maxOpenPositions: 4, correlationLimit: 0.5 },
      performance: { totalTrades: 0, winRate: 0, avgReturn: 0, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: Date.now() },
      state: { active: true, weight: 0.9 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Event-Driven Strategy
    this.registerStrategy({
      id: 'event_catalyst',
      name: 'Event Catalyst',
      family: StrategyFamily.EVENT_DRIVEN,
      description: 'Positions ahead of known catalysts with asymmetric payoff',
      version: '1.0.0',
      compatibleRegimes: [MarketRegime.BULL_TRENDING, MarketRegime.RANGE_BOUND, MarketRegime.RISK_ON],
      incompatibleRegimes: [MarketRegime.RISK_OFF],
      timeHorizon: TimeHorizon.POSITION,
      entryConditions: [
        {
          id: 'catalyst_identified',
          name: 'Catalyst Identified',
          description: 'Known upcoming event with price impact potential',
          type: 'signal',
          parameters: { eventType: ['earnings', 'fda', 'merger', 'product_launch'], daysUntil: 30 },
          weight: 0.5,
          required: true,
        },
        {
          id: 'favorable_setup',
          name: 'Favorable Technical Setup',
          description: 'Technical setup supports thesis',
          type: 'indicator',
          parameters: { trendAligned: true, consolidating: true },
          weight: 0.3,
          required: false,
        },
        {
          id: 'options_positioning',
          name: 'Options Flow',
          description: 'Smart money options positioning',
          type: 'signal',
          parameters: { callPutRatio: 1.5 },
          weight: 0.2,
          required: false,
        },
      ],
      exitConditions: [
        { id: 'stop_loss', name: 'Stop Loss', type: 'stop_loss', parameters: { percentage: 0.05 }, priority: 1 },
        { id: 'event_complete', name: 'Post Event', type: 'time_based', parameters: { maxDuration: 2 * 24 * 60 * 60 * 1000 }, priority: 2 },
        { id: 'take_profit', name: 'Take Profit', type: 'take_profit', parameters: { percentage: 0.15 }, priority: 3 },
      ],
      positionSizing: { baseSize: 0.03, maxSize: 0.06, convictionMultiplier: 1.5, volatilityAdjustment: true },
      riskParams: { maxLossPerTrade: 0.025, maxDrawdown: 0.12, maxOpenPositions: 3, correlationLimit: 0.4 },
      performance: { totalTrades: 0, winRate: 0, avgReturn: 0, sharpeRatio: 0, maxDrawdown: 0, lastUpdated: Date.now() },
      state: { active: true, weight: 0.7 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // ==========================================================================
  // STRATEGY MANAGEMENT
  // ==========================================================================

  /**
   * Register a new strategy
   */
  registerStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * Get a strategy by ID
   */
  getStrategy(id: string): Strategy | undefined {
    return this.strategies.get(id);
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get strategies compatible with current regime
   */
  getCompatibleStrategies(): Strategy[] {
    return this.getAllStrategies().filter(s => 
      s.state.active &&
      s.compatibleRegimes.includes(this.currentRegime) &&
      !s.incompatibleRegimes.includes(this.currentRegime) &&
      (!s.state.pausedUntil || s.state.pausedUntil < Date.now())
    );
  }

  /**
   * Update market regime
   */
  setRegime(regime: MarketRegime): void {
    const previousRegime = this.currentRegime;
    this.currentRegime = regime;

    // Pause incompatible strategies
    for (const strategy of this.strategies.values()) {
      if (strategy.incompatibleRegimes.includes(regime) && strategy.state.active) {
        strategy.state.pausedUntil = Date.now() + 24 * 60 * 60 * 1000; // 24h pause
        strategy.state.pauseReason = `Incompatible with ${regime} regime`;
      }
    }

    console.log(`[StrategyEngine] Regime changed: ${previousRegime} -> ${regime}`);
  }

  /**
   * Get current regime
   */
  getRegime(): MarketRegime {
    return this.currentRegime;
  }

  // ==========================================================================
  // SIGNAL GENERATION
  // ==========================================================================

  /**
   * Evaluate a symbol against all compatible strategies
   */
  evaluate(
    symbol: string,
    marketData: {
      price: number;
      change: number;
      volume: number;
      avgVolume: number;
      rsi?: number;
      macd?: { value: number; signal: number; histogram: number };
      supportLevel?: number;
      resistanceLevel?: number;
      volatility?: number;
    },
    contextData?: {
      sentiment?: number;
      socialVelocity?: number;
      upcomingEvents?: string[];
      regime?: MarketRegime;
    }
  ): StrategySignal[] {
    const signals: StrategySignal[] = [];
    const compatibleStrategies = this.getCompatibleStrategies();

    for (const strategy of compatibleStrategies) {
      const signal = this.evaluateStrategy(symbol, strategy, marketData, contextData);
      if (signal && signal.conviction > 0.5) {
        signals.push(signal);
        
        // Store signal
        if (!this.signals.has(symbol)) {
          this.signals.set(symbol, []);
        }
        this.signals.get(symbol)!.push(signal);
      }
    }

    return signals.sort((a, b) => b.conviction - a.conviction);
  }

  /**
   * Evaluate a single strategy
   */
  private evaluateStrategy(
    symbol: string,
    strategy: Strategy,
    marketData: Record<string, unknown>,
    contextData?: Record<string, unknown>
  ): StrategySignal | null {
    const conditionResults: StrategySignal['conditionResults'] = [];
    let totalScore = 0;
    let totalWeight = 0;
    let allRequiredMet = true;

    for (const condition of strategy.entryConditions) {
      const result = this.evaluateCondition(condition, marketData, contextData);
      conditionResults.push({
        conditionId: condition.id,
        met: result.met,
        score: result.score,
        reason: result.reason,
      });

      totalScore += result.score * condition.weight;
      totalWeight += condition.weight;

      if (condition.required && !result.met) {
        allRequiredMet = false;
      }
    }

    // If any required condition is not met, no signal
    if (!allRequiredMet) {
      return null;
    }

    const conviction = totalWeight > 0 ? totalScore / totalWeight : 0;
    const price = marketData.price as number;

    // Calculate targets
    const stopLossExit = strategy.exitConditions.find(e => e.type === 'stop_loss');
    const takeProfitExits = strategy.exitConditions.filter(e => e.type === 'take_profit');
    
    const stopLossPercent = stopLossExit?.parameters.percentage ?? 0.03;
    const stopLoss = price * (1 - stopLossPercent);
    const takeProfits = takeProfitExits.map(e => 
      price * (1 + (e.parameters.percentage ?? 0.05))
    );

    // Calculate position size
    const baseSize = strategy.positionSizing.baseSize;
    const convictionAdjusted = baseSize * (conviction * strategy.positionSizing.convictionMultiplier);
    const recommendedSize = Math.min(convictionAdjusted, strategy.positionSizing.maxSize);

    // Calculate risk/reward
    const riskPercent = stopLossPercent;
    const rewardPercent = takeProfits.length > 0 ? (takeProfits[0] / price - 1) : 0.05;
    const riskRewardRatio = rewardPercent / riskPercent;

    return {
      id: uuidv4(),
      strategyId: strategy.id,
      symbol,
      timestamp: Date.now(),
      direction: 'long', // Simplified - would be determined by strategy logic
      strength: conviction,
      confidence: conviction,
      conditionResults,
      conviction,
      recommendedSize,
      targets: {
        entry: price,
        stopLoss,
        takeProfit: takeProfits.length > 0 ? takeProfits : [price * 1.05],
        trailingStop: strategy.exitConditions.find(e => e.type === 'trailing_stop')?.parameters.trailAmount,
      },
      metrics: {
        riskRewardRatio,
        expectedValue: conviction * rewardPercent - (1 - conviction) * riskPercent,
        maxRisk: riskPercent * recommendedSize,
        timeToTarget: this.estimateTimeToTarget(strategy.timeHorizon),
      },
      validUntil: Date.now() + this.getSignalValidity(strategy.timeHorizon),
      status: 'pending',
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: EntryCondition,
    marketData: Record<string, unknown>,
    contextData?: Record<string, unknown>
  ): { met: boolean; score: number; reason: string } {
    const params = condition.parameters;

    switch (condition.type) {
      case 'indicator': {
        // RSI check
        if (params.rsiMin !== undefined && marketData.rsi !== undefined) {
          const rsi = marketData.rsi as number;
          if (rsi >= (params.rsiMin as number)) {
            return { met: true, score: Math.min(1, rsi / 100), reason: `RSI ${rsi.toFixed(0)} >= ${params.rsiMin}` };
          }
          return { met: false, score: rsi / 100, reason: `RSI ${rsi.toFixed(0)} < ${params.rsiMin}` };
        }
        if (params.rsiMax !== undefined && marketData.rsi !== undefined) {
          const rsi = marketData.rsi as number;
          if (rsi <= (params.rsiMax as number)) {
            return { met: true, score: Math.min(1, (100 - rsi) / 100), reason: `RSI ${rsi.toFixed(0)} <= ${params.rsiMax}` };
          }
          return { met: false, score: (100 - rsi) / 100, reason: `RSI ${rsi.toFixed(0)} > ${params.rsiMax}` };
        }
        break;
      }

      case 'price': {
        const price = marketData.price as number;
        const change = marketData.change as number;
        
        if (params.breakoutPercent !== undefined) {
          const threshold = params.breakoutPercent as number;
          if (change >= threshold) {
            return { met: true, score: Math.min(1, change / threshold), reason: `Price breakout ${(change * 100).toFixed(1)}%` };
          }
          return { met: false, score: change / threshold, reason: `Waiting for breakout (${(change * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}%)` };
        }
        
        if (params.supportDistance !== undefined && marketData.supportLevel !== undefined) {
          const support = marketData.supportLevel as number;
          const distance = (price - support) / price;
          const threshold = params.supportDistance as number;
          if (distance <= threshold) {
            return { met: true, score: 1 - distance / threshold, reason: `Near support (${(distance * 100).toFixed(1)}% away)` };
          }
          return { met: false, score: Math.max(0, 1 - distance / threshold), reason: `Too far from support (${(distance * 100).toFixed(1)}% away)` };
        }
        break;
      }

      case 'volume': {
        const volume = marketData.volume as number;
        const avgVolume = marketData.avgVolume as number;
        const relativeVolume = avgVolume > 0 ? volume / avgVolume : 1;
        
        if (params.volumeMultiplier !== undefined) {
          const threshold = params.volumeMultiplier as number;
          if (relativeVolume >= threshold) {
            return { met: true, score: Math.min(1, relativeVolume / (threshold * 2)), reason: `Volume ${relativeVolume.toFixed(1)}x average` };
          }
          return { met: false, score: relativeVolume / threshold, reason: `Volume ${relativeVolume.toFixed(1)}x (need ${threshold}x)` };
        }
        break;
      }

      case 'sentiment': {
        if (contextData?.sentiment !== undefined) {
          const sentiment = contextData.sentiment as number;
          const positiveRequired = params.sentimentPositive as boolean;
          const met = positiveRequired ? sentiment > 0 : sentiment < 0;
          return { met, score: Math.abs(sentiment), reason: `Sentiment: ${sentiment > 0 ? 'positive' : 'negative'} (${(sentiment * 100).toFixed(0)}%)` };
        }
        break;
      }

      case 'signal': {
        // Generic signal condition
        return { met: true, score: 0.7, reason: 'Signal condition assumed met' };
      }
    }

    return { met: false, score: 0, reason: 'Condition could not be evaluated' };
  }

  /**
   * Estimate time to target based on time horizon
   */
  private estimateTimeToTarget(horizon: TimeHorizon): number {
    switch (horizon) {
      case TimeHorizon.SCALP: return 1;
      case TimeHorizon.INTRADAY: return 6;
      case TimeHorizon.SWING: return 72;
      case TimeHorizon.POSITION: return 336;
      case TimeHorizon.INVESTMENT: return 2160;
    }
  }

  /**
   * Get signal validity duration based on time horizon
   */
  private getSignalValidity(horizon: TimeHorizon): number {
    switch (horizon) {
      case TimeHorizon.SCALP: return 30 * 60 * 1000;
      case TimeHorizon.INTRADAY: return 4 * 60 * 60 * 1000;
      case TimeHorizon.SWING: return 24 * 60 * 60 * 1000;
      case TimeHorizon.POSITION: return 72 * 60 * 60 * 1000;
      case TimeHorizon.INVESTMENT: return 168 * 60 * 60 * 1000;
    }
  }

  // ==========================================================================
  // PERFORMANCE TRACKING
  // ==========================================================================

  /**
   * Record trade outcome
   */
  recordOutcome(
    strategyId: string,
    outcome: {
      success: boolean;
      returnPercent: number;
      holdingPeriod: number;
      regime: MarketRegime;
    }
  ): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    const perf = strategy.performance;
    const oldTrades = perf.totalTrades;
    
    // Update metrics
    perf.totalTrades++;
    perf.winRate = ((perf.winRate * oldTrades) + (outcome.success ? 1 : 0)) / perf.totalTrades;
    perf.avgReturn = ((perf.avgReturn * oldTrades) + outcome.returnPercent) / perf.totalTrades;
    
    // Update max drawdown if applicable
    if (outcome.returnPercent < 0 && Math.abs(outcome.returnPercent) > perf.maxDrawdown) {
      perf.maxDrawdown = Math.abs(outcome.returnPercent);
    }
    
    perf.lastUpdated = Date.now();
    strategy.updatedAt = Date.now();
  }

  /**
   * Get signals for a symbol
   */
  getSignals(symbol: string, options?: { since?: number; limit?: number }): StrategySignal[] {
    let signals = this.signals.get(symbol) ?? [];
    
    if (options?.since) {
      const since = options.since;
      signals = signals.filter(s => s.timestamp >= since);
    }
    
    signals.sort((a, b) => b.timestamp - a.timestamp);
    
    return options?.limit ? signals.slice(0, options.limit) : signals;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalStrategies: number;
    activeStrategies: number;
    compatibleStrategies: number;
    totalSignals: number;
    currentRegime: MarketRegime;
  } {
    let totalSignals = 0;
    for (const signals of this.signals.values()) {
      totalSignals += signals.length;
    }

    return {
      totalStrategies: this.strategies.size,
      activeStrategies: this.getAllStrategies().filter(s => s.state.active).length,
      compatibleStrategies: this.getCompatibleStrategies().length,
      totalSignals,
      currentRegime: this.currentRegime,
    };
  }
}

export default StrategyEngine;

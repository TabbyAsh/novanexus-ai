/**
 * NOVA NEXUS SIGNAL INGESTION
 * ===========================
 * Universal signal capture and translation layer.
 * Ingests market, attention, and structural signals with
 * confidence scoring and temporal relevance decay.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// SIGNAL TYPES
// ============================================================================

export enum SignalCategory {
  MARKET = 'MARKET',
  ATTENTION = 'ATTENTION',
  STRUCTURAL = 'STRUCTURAL',
}

export enum MarketSignalType {
  PRICE_ACTION = 'PRICE_ACTION',
  VOLUME_PROFILE = 'VOLUME_PROFILE',
  VOLATILITY = 'VOLATILITY',
  MOMENTUM = 'MOMENTUM',
  ORDER_FLOW = 'ORDER_FLOW',
}

export enum AttentionSignalType {
  SOCIAL_VELOCITY = 'SOCIAL_VELOCITY',
  SENTIMENT_SHIFT = 'SENTIMENT_SHIFT',
  NARRATIVE_EMERGENCE = 'NARRATIVE_EMERGENCE',
  INFLUENCER_ACTIVITY = 'INFLUENCER_ACTIVITY',
  NEWS_DENSITY = 'NEWS_DENSITY',
}

export enum StructuralSignalType {
  REGIME_CHANGE = 'REGIME_CHANGE',
  LIQUIDITY_SHIFT = 'LIQUIDITY_SHIFT',
  CORRELATION_BREAK = 'CORRELATION_BREAK',
  VOLATILITY_REGIME = 'VOLATILITY_REGIME',
  MARKET_STRUCTURE = 'MARKET_STRUCTURE',
}

// ============================================================================
// CONFIDENCE AND CONTEXT
// ============================================================================

export interface ConfidenceScore {
  /** Overall confidence 0-1 */
  value: number;
  
  /** Data quality component */
  dataQuality: number;
  
  /** Source reliability component */
  sourceReliability: number;
  
  /** Recency factor */
  recencyFactor: number;
  
  /** Agreement across sources */
  sourceAgreement: number;
}

export interface TemporalRelevance {
  /** When signal was generated */
  capturedAt: number;
  
  /** When signal becomes relevant */
  relevantFrom: number;
  
  /** When signal expires */
  relevantUntil: number;
  
  /** Half-life of signal value (ms) */
  halfLife: number;
  
  /** Current relevance (computed) */
  currentRelevance: number;
}

export interface FailureCondition {
  /** What would invalidate this signal */
  condition: string;
  
  /** Metric to monitor */
  metric?: string;
  
  /** Threshold that triggers failure */
  threshold?: number;
  
  /** Current value of metric */
  currentValue?: number;
  
  /** Is condition currently met? */
  triggered: boolean;
}

// ============================================================================
// SIGNAL DEFINITIONS
// ============================================================================

export interface BaseSignal {
  id: string;
  category: SignalCategory;
  symbol: string;
  capturedAt: number;
  confidence: ConfidenceScore;
  temporalRelevance: TemporalRelevance;
  failureConditions: FailureCondition[];
  source: string;
  raw?: unknown;
}

export interface MarketSignal extends BaseSignal {
  category: SignalCategory.MARKET;
  signalType: MarketSignalType;
  
  priceAction?: {
    currentPrice: number;
    priceChange: number;
    priceChangePercent: number;
    direction: 'up' | 'down' | 'sideways';
    strength: number; // 0-1
  };
  
  volume?: {
    current: number;
    average: number;
    relativeVolume: number;
    buyVolume: number;
    sellVolume: number;
    volumeDirection: 'accumulation' | 'distribution' | 'neutral';
  };
  
  volatility?: {
    current: number;
    historical: number;
    implied?: number;
    percentile: number;
    regime: 'low' | 'normal' | 'high' | 'extreme';
  };
  
  momentum?: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    stochastic: { k: number; d: number };
    adx: number;
    trendStrength: number;
  };
  
  orderFlow?: {
    bidAskImbalance: number;
    largeOrderRatio: number;
    institutionalFlow: number;
    retailFlow: number;
  };
}

export interface AttentionSignal extends BaseSignal {
  category: SignalCategory.ATTENTION;
  signalType: AttentionSignalType;
  
  socialVelocity?: {
    mentionCount: number;
    velocityChange: number;
    peakVelocity: number;
    currentVelocity: number;
    accelerating: boolean;
  };
  
  sentiment?: {
    score: number; // -1 to 1
    positiveRatio: number;
    negativeRatio: number;
    neutralRatio: number;
    sentimentShift: number;
    dominantEmotion?: string;
  };
  
  narrative?: {
    emergingThemes: string[];
    dominantNarrative: string;
    narrativeStrength: number;
    counterNarratives: string[];
    narrativeAge: number; // hours since emergence
  };
  
  influencer?: {
    activeInfluencers: number;
    totalReach: number;
    engagementRate: number;
    sentimentLean: number;
    notableCallouts: string[];
  };
  
  news?: {
    articleCount: number;
    majorOutlets: number;
    sentimentBias: number;
    topHeadlines: string[];
    breakingNews: boolean;
  };
}

export interface StructuralSignal extends BaseSignal {
  category: SignalCategory.STRUCTURAL;
  signalType: StructuralSignalType;
  
  regime?: {
    current: 'bull' | 'bear' | 'sideways' | 'volatile' | 'trending' | 'ranging';
    previous: string;
    changeConfidence: number;
    regimeDuration: number; // hours
    transitionProbability: number;
  };
  
  liquidity?: {
    depth: number;
    spread: number;
    spreadPercent: number;
    slippageEstimate: number;
    liquidityScore: number; // 0-1
    deteriorating: boolean;
  };
  
  correlation?: {
    marketCorrelation: number;
    sectorCorrelation: number;
    betaToSpy: number;
    correlationBreak: boolean;
    decorrelationStrength: number;
  };
  
  structure?: {
    supportLevels: number[];
    resistanceLevels: number[];
    keyLevel: number;
    distanceToKey: number;
    structureIntact: boolean;
  };
}

export type Signal = MarketSignal | AttentionSignal | StructuralSignal;

// ============================================================================
// SIGNAL TRANSLATOR
// ============================================================================

export interface TranslatedSignal {
  signal: Signal;
  
  /** Normalized strength -1 to 1 (bearish to bullish) */
  normalizedStrength: number;
  
  /** Actionability score 0-1 */
  actionability: number;
  
  /** Time sensitivity */
  urgency: 'immediate' | 'hours' | 'days' | 'weeks';
  
  /** Suggested response */
  suggestedAction: 'buy' | 'sell' | 'hold' | 'watch' | 'avoid';
  
  /** Key insight */
  insight: string;
}

// ============================================================================
// SIGNAL INGESTION ENGINE
// ============================================================================

export class SignalIngestion {
  private signals: Map<string, Signal[]> = new Map();
  private translatedSignals: Map<string, TranslatedSignal[]> = new Map();
  private signalHandlers: Map<SignalCategory, ((signal: Signal) => void)[]> = new Map();
  
  // Configuration
  private readonly maxSignalsPerSymbol = 1000;
  private readonly defaultHalfLife = 4 * 60 * 60 * 1000; // 4 hours

  constructor() {
    // Initialize handler arrays
    Object.values(SignalCategory).forEach(cat => {
      this.signalHandlers.set(cat as SignalCategory, []);
    });
  }

  // ==========================================================================
  // SIGNAL INGESTION
  // ==========================================================================

  /**
   * Ingest a market signal
   */
  ingestMarket(
    symbol: string,
    signalType: MarketSignalType,
    data: Partial<Omit<MarketSignal, 'id' | 'category' | 'signalType' | 'symbol' | 'capturedAt'>>,
    options: {
      source?: string;
      halfLife?: number;
      relevantFor?: number;
    } = {}
  ): MarketSignal {
    const now = Date.now();
    
    const signal: MarketSignal = {
      id: uuidv4(),
      category: SignalCategory.MARKET,
      signalType,
      symbol,
      capturedAt: now,
      confidence: this.calculateConfidence(data),
      temporalRelevance: this.calculateTemporalRelevance(now, options.halfLife, options.relevantFor),
      failureConditions: this.generateFailureConditions(SignalCategory.MARKET, signalType, data),
      source: options.source ?? 'internal',
      ...data,
    };

    this.storeSignal(signal);
    this.notifyHandlers(signal);
    
    return signal;
  }

  /**
   * Ingest an attention signal
   */
  ingestAttention(
    symbol: string,
    signalType: AttentionSignalType,
    data: Partial<Omit<AttentionSignal, 'id' | 'category' | 'signalType' | 'symbol' | 'capturedAt'>>,
    options: {
      source?: string;
      halfLife?: number;
      relevantFor?: number;
    } = {}
  ): AttentionSignal {
    const now = Date.now();
    
    const signal: AttentionSignal = {
      id: uuidv4(),
      category: SignalCategory.ATTENTION,
      signalType,
      symbol,
      capturedAt: now,
      confidence: this.calculateConfidence(data),
      temporalRelevance: this.calculateTemporalRelevance(now, options.halfLife, options.relevantFor),
      failureConditions: this.generateFailureConditions(SignalCategory.ATTENTION, signalType, data),
      source: options.source ?? 'internal',
      ...data,
    };

    this.storeSignal(signal);
    this.notifyHandlers(signal);
    
    return signal;
  }

  /**
   * Ingest a structural signal
   */
  ingestStructural(
    symbol: string,
    signalType: StructuralSignalType,
    data: Partial<Omit<StructuralSignal, 'id' | 'category' | 'signalType' | 'symbol' | 'capturedAt'>>,
    options: {
      source?: string;
      halfLife?: number;
      relevantFor?: number;
    } = {}
  ): StructuralSignal {
    const now = Date.now();
    
    const signal: StructuralSignal = {
      id: uuidv4(),
      category: SignalCategory.STRUCTURAL,
      signalType,
      symbol,
      capturedAt: now,
      confidence: this.calculateConfidence(data),
      temporalRelevance: this.calculateTemporalRelevance(now, options.halfLife, options.relevantFor),
      failureConditions: this.generateFailureConditions(SignalCategory.STRUCTURAL, signalType, data),
      source: options.source ?? 'internal',
      ...data,
    };

    this.storeSignal(signal);
    this.notifyHandlers(signal);
    
    return signal;
  }

  // ==========================================================================
  // SIGNAL TRANSLATION
  // ==========================================================================

  /**
   * Translate a signal into actionable intelligence
   */
  translate(signal: Signal): TranslatedSignal {
    const normalizedStrength = this.calculateNormalizedStrength(signal);
    const actionability = this.calculateActionability(signal);
    const urgency = this.determineUrgency(signal);
    const suggestedAction = this.determineSuggestedAction(normalizedStrength, actionability, signal);
    const insight = this.generateInsight(signal, normalizedStrength);

    const translated: TranslatedSignal = {
      signal,
      normalizedStrength,
      actionability,
      urgency,
      suggestedAction,
      insight,
    };

    // Store translated signal
    if (!this.translatedSignals.has(signal.symbol)) {
      this.translatedSignals.set(signal.symbol, []);
    }
    this.translatedSignals.get(signal.symbol)!.push(translated);

    return translated;
  }

  /**
   * Calculate normalized strength -1 to 1
   */
  private calculateNormalizedStrength(signal: Signal): number {
    let strength = 0;

    if (signal.category === SignalCategory.MARKET) {
      const ms = signal as MarketSignal;
      if (ms.priceAction) {
        strength += ms.priceAction.strength * (ms.priceAction.direction === 'up' ? 1 : -1);
      }
      if (ms.momentum) {
        // RSI contribution (overbought/oversold)
        const rsiSignal = ms.momentum.rsi > 70 ? -0.3 : ms.momentum.rsi < 30 ? 0.3 : 0;
        strength += rsiSignal;
        // Trend strength contribution
        strength += ms.momentum.trendStrength * (ms.momentum.macd.histogram > 0 ? 0.3 : -0.3);
      }
      if (ms.volume?.volumeDirection === 'accumulation') strength += 0.2;
      if (ms.volume?.volumeDirection === 'distribution') strength -= 0.2;
    } 
    else if (signal.category === SignalCategory.ATTENTION) {
      const as = signal as AttentionSignal;
      if (as.sentiment) strength += as.sentiment.score * 0.5;
      if (as.socialVelocity?.accelerating) strength += 0.2;
      if (as.narrative?.narrativeStrength) {
        strength += as.narrative.narrativeStrength * 0.3;
      }
    }
    else if (signal.category === SignalCategory.STRUCTURAL) {
      const ss = signal as StructuralSignal;
      if (ss.regime?.current === 'bull') strength += 0.4;
      if (ss.regime?.current === 'bear') strength -= 0.4;
      if (ss.liquidity?.deteriorating) strength -= 0.2;
      if (ss.correlation?.correlationBreak) strength += 0.1; // Decorrelation can be opportunity
    }

    // Clamp to -1 to 1
    return Math.max(-1, Math.min(1, strength));
  }

  /**
   * Calculate actionability score
   */
  private calculateActionability(signal: Signal): number {
    let score = signal.confidence.value;
    
    // Apply temporal relevance
    score *= signal.temporalRelevance.currentRelevance;
    
    // Check failure conditions
    const failedConditions = signal.failureConditions.filter(fc => fc.triggered).length;
    score *= Math.pow(0.7, failedConditions);
    
    // Boost for high data quality
    if (signal.confidence.dataQuality > 0.8) score *= 1.1;
    
    // Category-specific adjustments
    if (signal.category === SignalCategory.MARKET) {
      const ms = signal as MarketSignal;
      if (ms.volume && ms.volume.relativeVolume > 2) score *= 1.2;
    }

    return Math.min(1, score);
  }

  /**
   * Determine urgency
   */
  private determineUrgency(signal: Signal): TranslatedSignal['urgency'] {
    const remainingRelevance = signal.temporalRelevance.relevantUntil - Date.now();
    const hoursRemaining = remainingRelevance / (60 * 60 * 1000);
    
    if (hoursRemaining < 1) return 'immediate';
    if (hoursRemaining < 24) return 'hours';
    if (hoursRemaining < 168) return 'days';
    return 'weeks';
  }

  /**
   * Determine suggested action
   */
  private determineSuggestedAction(
    strength: number, 
    actionability: number,
    signal: Signal
  ): TranslatedSignal['suggestedAction'] {
    // Check for structural warnings
    if (signal.category === SignalCategory.STRUCTURAL) {
      const ss = signal as StructuralSignal;
      if (ss.liquidity?.deteriorating || (ss.liquidity?.liquidityScore !== undefined && ss.liquidity.liquidityScore < 0.3)) {
        return 'avoid';
      }
    }

    // Low actionability = watch
    if (actionability < 0.4) return 'watch';
    
    // High positive strength = buy
    if (strength > 0.5 && actionability > 0.6) return 'buy';
    
    // High negative strength = sell
    if (strength < -0.5 && actionability > 0.6) return 'sell';
    
    // Moderate signals = hold
    if (Math.abs(strength) > 0.2) return 'hold';
    
    return 'watch';
  }

  /**
   * Generate human-readable insight
   */
  private generateInsight(signal: Signal, strength: number): string {
    const direction = strength > 0 ? 'bullish' : strength < 0 ? 'bearish' : 'neutral';
    const intensity = Math.abs(strength) > 0.7 ? 'strong' : Math.abs(strength) > 0.4 ? 'moderate' : 'weak';
    
    if (signal.category === SignalCategory.MARKET) {
      const ms = signal as MarketSignal;
      if (ms.signalType === MarketSignalType.PRICE_ACTION && ms.priceAction) {
        return `${intensity} ${direction} price action: ${ms.priceAction.priceChangePercent.toFixed(2)}% move with ${(ms.priceAction.strength * 100).toFixed(0)}% conviction`;
      }
      if (ms.signalType === MarketSignalType.VOLUME_PROFILE && ms.volume) {
        return `Volume ${ms.volume.relativeVolume.toFixed(1)}x average, showing ${ms.volume.volumeDirection}`;
      }
      if (ms.signalType === MarketSignalType.VOLATILITY && ms.volatility) {
        return `Volatility in ${ms.volatility.regime} regime (${ms.volatility.percentile}th percentile)`;
      }
    }
    
    if (signal.category === SignalCategory.ATTENTION) {
      const as = signal as AttentionSignal;
      if (as.signalType === AttentionSignalType.SOCIAL_VELOCITY && as.socialVelocity) {
        return `Social attention ${as.socialVelocity.accelerating ? 'accelerating' : 'decelerating'}: ${as.socialVelocity.mentionCount} mentions`;
      }
      if (as.signalType === AttentionSignalType.SENTIMENT_SHIFT && as.sentiment) {
        return `Sentiment ${as.sentiment.score > 0 ? 'positive' : 'negative'} (${(as.sentiment.score * 100).toFixed(0)}%), shift of ${(as.sentiment.sentimentShift * 100).toFixed(0)}%`;
      }
    }
    
    if (signal.category === SignalCategory.STRUCTURAL) {
      const ss = signal as StructuralSignal;
      if (ss.signalType === StructuralSignalType.REGIME_CHANGE && ss.regime) {
        return `Regime transition from ${ss.regime.previous} to ${ss.regime.current} (${(ss.regime.changeConfidence * 100).toFixed(0)}% confidence)`;
      }
      if (ss.signalType === StructuralSignalType.LIQUIDITY_SHIFT && ss.liquidity) {
        return `Liquidity ${ss.liquidity.deteriorating ? 'deteriorating' : 'stable'}, score ${(ss.liquidity.liquidityScore * 100).toFixed(0)}%`;
      }
    }
    
    return `${intensity} ${direction} signal in ${signal.category.toLowerCase()}`;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private calculateConfidence(data: unknown): ConfidenceScore {
    // Simplified confidence calculation
    const hasData = Object.keys(data as object).length > 0;
    const baseConfidence = hasData ? 0.7 : 0.3;
    
    return {
      value: baseConfidence,
      dataQuality: hasData ? 0.8 : 0.4,
      sourceReliability: 0.8,
      recencyFactor: 1.0,
      sourceAgreement: 0.7,
    };
  }

  private calculateTemporalRelevance(
    now: number,
    halfLife?: number,
    relevantFor?: number
  ): TemporalRelevance {
    const hl = halfLife ?? this.defaultHalfLife;
    const duration = relevantFor ?? hl * 4;
    
    return {
      capturedAt: now,
      relevantFrom: now,
      relevantUntil: now + duration,
      halfLife: hl,
      currentRelevance: 1.0,
    };
  }

  private generateFailureConditions(
    category: SignalCategory,
    signalType: string,
    data: unknown
  ): FailureCondition[] {
    const conditions: FailureCondition[] = [];
    
    // Time-based failure
    conditions.push({
      condition: 'Signal has expired',
      metric: 'time',
      triggered: false,
    });
    
    // Category-specific conditions
    if (category === SignalCategory.MARKET) {
      conditions.push({
        condition: 'Price reverses beyond threshold',
        metric: 'price_reversal',
        threshold: 0.05,
        triggered: false,
      });
    }
    
    if (category === SignalCategory.ATTENTION) {
      conditions.push({
        condition: 'Attention velocity drops to zero',
        metric: 'attention_velocity',
        threshold: 0,
        triggered: false,
      });
    }
    
    if (category === SignalCategory.STRUCTURAL) {
      conditions.push({
        condition: 'Regime reverts to previous state',
        metric: 'regime_stability',
        triggered: false,
      });
    }
    
    return conditions;
  }

  private storeSignal(signal: Signal): void {
    if (!this.signals.has(signal.symbol)) {
      this.signals.set(signal.symbol, []);
    }
    
    const symbolSignals = this.signals.get(signal.symbol)!;
    symbolSignals.push(signal);
    
    // Trim to max size
    if (symbolSignals.length > this.maxSignalsPerSymbol) {
      symbolSignals.shift();
    }
  }

  private notifyHandlers(signal: Signal): void {
    const handlers = this.signalHandlers.get(signal.category) ?? [];
    handlers.forEach(handler => handler(signal));
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Register a signal handler
   */
  onSignal(category: SignalCategory, handler: (signal: Signal) => void): void {
    const handlers = this.signalHandlers.get(category) ?? [];
    handlers.push(handler);
    this.signalHandlers.set(category, handlers);
  }

  /**
   * Get recent signals for a symbol
   */
  getSignals(symbol: string, options?: {
    category?: SignalCategory;
    since?: number;
    limit?: number;
  }): Signal[] {
    let signals = this.signals.get(symbol) ?? [];
    
    if (options?.category) {
      signals = signals.filter(s => s.category === options.category);
    }
    
    if (options?.since) {
      const since = options.since;
      signals = signals.filter(s => s.capturedAt >= since);
    }
    
    // Update temporal relevance
    const now = Date.now();
    signals = signals.map(s => ({
      ...s,
      temporalRelevance: {
        ...s.temporalRelevance,
        currentRelevance: this.calculateCurrentRelevance(s.temporalRelevance, now),
      },
    }));
    
    // Sort by recency
    signals.sort((a, b) => b.capturedAt - a.capturedAt);
    
    return options?.limit ? signals.slice(0, options.limit) : signals;
  }

  /**
   * Get translated signals for a symbol
   */
  getTranslatedSignals(symbol: string, limit?: number): TranslatedSignal[] {
    const signals = this.translatedSignals.get(symbol) ?? [];
    const sorted = [...signals].sort((a, b) => b.signal.capturedAt - a.signal.capturedAt);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Calculate current relevance with decay
   */
  private calculateCurrentRelevance(tr: TemporalRelevance, now: number): number {
    if (now < tr.relevantFrom) return 0;
    if (now > tr.relevantUntil) return 0;
    
    const elapsed = now - tr.capturedAt;
    const decayFactor = Math.pow(0.5, elapsed / tr.halfLife);
    
    return decayFactor;
  }

  /**
   * Get composite signal strength for a symbol
   */
  getCompositeStrength(symbol: string): {
    market: number;
    attention: number;
    structural: number;
    overall: number;
  } {
    const signals = this.getSignals(symbol, { since: Date.now() - 4 * 60 * 60 * 1000 });
    
    const byCategory = {
      market: signals.filter(s => s.category === SignalCategory.MARKET),
      attention: signals.filter(s => s.category === SignalCategory.ATTENTION),
      structural: signals.filter(s => s.category === SignalCategory.STRUCTURAL),
    };
    
    const avgStrength = (sigs: Signal[]): number => {
      if (sigs.length === 0) return 0;
      const translated = sigs.map(s => this.translate(s));
      const weighted = translated.reduce((sum, t) => 
        sum + t.normalizedStrength * t.signal.temporalRelevance.currentRelevance, 0
      );
      const totalWeight = translated.reduce((sum, t) => 
        sum + t.signal.temporalRelevance.currentRelevance, 0
      );
      return totalWeight > 0 ? weighted / totalWeight : 0;
    };
    
    const market = avgStrength(byCategory.market);
    const attention = avgStrength(byCategory.attention);
    const structural = avgStrength(byCategory.structural);
    
    // Weighted overall (market 40%, attention 30%, structural 30%)
    const overall = market * 0.4 + attention * 0.3 + structural * 0.3;
    
    return { market, attention, structural, overall };
  }

  /**
   * Get stats
   */
  getStats(): {
    totalSignals: number;
    symbolCount: number;
    byCategory: Record<SignalCategory, number>;
    recentSignals: number;
  } {
    let totalSignals = 0;
    const byCategory: Record<SignalCategory, number> = {
      [SignalCategory.MARKET]: 0,
      [SignalCategory.ATTENTION]: 0,
      [SignalCategory.STRUCTURAL]: 0,
    };
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let recentSignals = 0;
    
    for (const signals of this.signals.values()) {
      totalSignals += signals.length;
      for (const signal of signals) {
        byCategory[signal.category]++;
        if (signal.capturedAt > oneHourAgo) recentSignals++;
      }
    }
    
    return {
      totalSignals,
      symbolCount: this.signals.size,
      byCategory,
      recentSignals,
    };
  }
}

export default SignalIngestion;

/**
 * NOVA NEXUS REGIME ENGINE
 * =========================
 * Environment classification system that grounds abstract market conditions
 * into actionable regime states for strategy selection.
 * 
 * AXIOM 1: Everything Must Ground
 * - Regimes are not feelings - they are calculated states with evidence
 * - Each regime classification produces measurable signals
 * 
 * AXIOM 3: Decisions Are The Atomic Unit
 * - Regime determines which strategies are valid
 * - Strategy compatibility is regime-dependent
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// REGIME TYPES
// ============================================================================

export enum RegimeType {
  // Primary market regimes
  BULL_STRONG = 'BULL_STRONG',           // Strong uptrend, high momentum
  BULL_WEAK = 'BULL_WEAK',               // Mild uptrend, consolidating
  BEAR_STRONG = 'BEAR_STRONG',           // Strong downtrend, capitulation
  BEAR_WEAK = 'BEAR_WEAK',               // Mild downtrend, uncertainty
  
  // Volatility regimes
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',   // Elevated volatility, whipsaws
  LOW_VOLATILITY = 'LOW_VOLATILITY',     // Compressed volatility, coiling
  VOLATILITY_EXPANSION = 'VOLATILITY_EXPANSION', // Volatility breaking out
  VOLATILITY_CONTRACTION = 'VOLATILITY_CONTRACTION', // Volatility compressing
  
  // Structural regimes
  RANGING = 'RANGING',                   // Sideways, mean-reverting
  TRENDING = 'TRENDING',                 // Directional movement
  BREAKOUT = 'BREAKOUT',                 // Breaking key levels
  BREAKDOWN = 'BREAKDOWN',               // Breaking down from levels
  
  // Special regimes
  CRISIS = 'CRISIS',                     // Extreme risk-off
  EUPHORIA = 'EUPHORIA',                 // Extreme risk-on
  TRANSITION = 'TRANSITION',             // Regime changing
  UNKNOWN = 'UNKNOWN',                   // Insufficient data
}

export enum RegimeCategory {
  TREND = 'TREND',
  VOLATILITY = 'VOLATILITY',
  STRUCTURE = 'STRUCTURE',
  EXTREME = 'EXTREME',
}

// ============================================================================
// REGIME EVIDENCE
// ============================================================================

export interface RegimeIndicator {
  id: string;
  name: string;
  
  /** What category this indicator measures */
  category: RegimeCategory;
  
  /** Current value */
  value: number;
  
  /** Normalized value (-1 to 1 or 0 to 1 depending on indicator) */
  normalized: number;
  
  /** Confidence in this reading */
  confidence: number;
  
  /** What regime this indicator suggests */
  suggestedRegime: RegimeType;
  
  /** How strongly it suggests this regime (0-1) */
  strength: number;
  
  timestamp: number;
}

export interface RegimeEvidence {
  /** All indicator readings */
  indicators: RegimeIndicator[];
  
  /** Weighted consensus by category */
  categoryConsensus: Record<RegimeCategory, {
    regime: RegimeType;
    confidence: number;
    agreementScore: number;
  }>;
  
  /** Overall evidence strength */
  overallStrength: number;
  
  /** Conflicting signals */
  conflicts: Array<{
    indicator1: string;
    indicator2: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

// ============================================================================
// REGIME STATE
// ============================================================================

export interface RegimeState {
  id: string;
  
  /** Primary regime classification */
  primary: RegimeType;
  
  /** Secondary regime (if mixed) */
  secondary?: RegimeType;
  
  /** Confidence in classification (0-1) */
  confidence: number;
  
  /** Evidence supporting this classification */
  evidence: RegimeEvidence;
  
  /** When this regime started */
  startedAt: number;
  
  /** Duration in milliseconds */
  duration: number;
  
  /** Is the regime stable or transitioning? */
  stability: 'stable' | 'unstable' | 'transitioning';
  
  /** Expected strategies for this regime */
  compatibleStrategies: string[];
  
  /** Risk modifier for this regime */
  riskMultiplier: number;
  
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// REGIME TRANSITION
// ============================================================================

export interface RegimeTransition {
  id: string;
  
  /** Previous regime */
  from: RegimeType;
  
  /** New regime */
  to: RegimeType;
  
  /** When detected */
  detectedAt: number;
  
  /** Confidence in transition */
  confidence: number;
  
  /** Trigger indicators */
  triggers: string[];
  
  /** Expected duration of new regime (estimate) */
  expectedDuration?: number;
  
  /** Historical similar transitions */
  historicalPrecedents: Array<{
    timestamp: number;
    duration: number;
    outcome: string;
  }>;
  
  /** Recommended actions */
  recommendations: string[];
}

// ============================================================================
// REGIME HISTORY
// ============================================================================

export interface RegimeHistoryEntry {
  regime: RegimeType;
  startedAt: number;
  endedAt?: number;
  duration: number;
  confidence: number;
  
  /** Performance during this regime */
  performance?: {
    return: number;
    volatility: number;
    maxDrawdown: number;
    winRate: number;
  };
}

// ============================================================================
// REGIME ENGINE
// ============================================================================

export class RegimeEngine {
  private currentState: RegimeState | null = null;
  private history: RegimeHistoryEntry[] = [];
  private transitions: RegimeTransition[] = [];
  private indicators: Map<string, RegimeIndicator> = new Map();
  
  /** Minimum confidence to declare regime */
  private minConfidence: number = 0.6;
  
  /** Minimum duration before regime is stable (ms) */
  private stabilityThreshold: number = 3600000; // 1 hour
  
  /** Strategy compatibility matrix */
  private strategyCompatibility: Map<RegimeType, string[]> = new Map();

  constructor() {
    this.initializeStrategyCompatibility();
    this.initializeDefaultIndicators();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeStrategyCompatibility(): void {
    this.strategyCompatibility.set(RegimeType.BULL_STRONG, [
      'momentum', 'trend_following', 'breakout', 'attention_lag'
    ]);
    this.strategyCompatibility.set(RegimeType.BULL_WEAK, [
      'momentum', 'mean_reversion', 'range_trading'
    ]);
    this.strategyCompatibility.set(RegimeType.BEAR_STRONG, [
      'hedging', 'cash_preservation', 'defensive'
    ]);
    this.strategyCompatibility.set(RegimeType.BEAR_WEAK, [
      'mean_reversion', 'defensive', 'selective_long'
    ]);
    this.strategyCompatibility.set(RegimeType.HIGH_VOLATILITY, [
      'volatility_breakout', 'options_strategies', 'reduced_size'
    ]);
    this.strategyCompatibility.set(RegimeType.LOW_VOLATILITY, [
      'mean_reversion', 'range_trading', 'carry'
    ]);
    this.strategyCompatibility.set(RegimeType.RANGING, [
      'mean_reversion', 'range_trading', 'grid_trading'
    ]);
    this.strategyCompatibility.set(RegimeType.TRENDING, [
      'trend_following', 'momentum', 'breakout'
    ]);
    this.strategyCompatibility.set(RegimeType.BREAKOUT, [
      'breakout', 'momentum', 'trend_following'
    ]);
    this.strategyCompatibility.set(RegimeType.CRISIS, [
      'cash_only', 'hedging', 'tail_protection'
    ]);
    this.strategyCompatibility.set(RegimeType.EUPHORIA, [
      'profit_taking', 'reduced_exposure', 'hedging'
    ]);
  }

  private initializeDefaultIndicators(): void {
    // These would be populated with real data in production
    const defaultIndicators = [
      { name: 'SMA_Cross', category: RegimeCategory.TREND },
      { name: 'ADX', category: RegimeCategory.TREND },
      { name: 'RSI', category: RegimeCategory.TREND },
      { name: 'ATR_Percentile', category: RegimeCategory.VOLATILITY },
      { name: 'VIX_Level', category: RegimeCategory.VOLATILITY },
      { name: 'Bollinger_Width', category: RegimeCategory.VOLATILITY },
      { name: 'Support_Resistance', category: RegimeCategory.STRUCTURE },
      { name: 'Higher_Highs', category: RegimeCategory.STRUCTURE },
      { name: 'Volume_Profile', category: RegimeCategory.STRUCTURE },
    ];

    for (const ind of defaultIndicators) {
      const indicator: RegimeIndicator = {
        id: uuidv4(),
        name: ind.name,
        category: ind.category,
        value: 0,
        normalized: 0,
        confidence: 0,
        suggestedRegime: RegimeType.UNKNOWN,
        strength: 0,
        timestamp: Date.now(),
      };
      this.indicators.set(ind.name, indicator);
    }
  }

  // ==========================================================================
  // INDICATOR UPDATES
  // ==========================================================================

  /**
   * Update an indicator with new data
   */
  updateIndicator(
    name: string,
    value: number,
    options: {
      normalized?: number;
      confidence?: number;
      suggestedRegime?: RegimeType;
      strength?: number;
    } = {}
  ): RegimeIndicator | null {
    const indicator = this.indicators.get(name);
    if (!indicator) return null;

    indicator.value = value;
    indicator.normalized = options.normalized ?? this.normalizeValue(name, value);
    indicator.confidence = options.confidence ?? 0.7;
    indicator.suggestedRegime = options.suggestedRegime ?? this.inferRegimeFromIndicator(name, indicator.normalized);
    indicator.strength = options.strength ?? Math.abs(indicator.normalized);
    indicator.timestamp = Date.now();

    return indicator;
  }

  /**
   * Normalize indicator value to standard range
   */
  private normalizeValue(name: string, value: number): number {
    // Normalization rules by indicator type
    switch (name) {
      case 'RSI':
        return (value - 50) / 50; // -1 to 1
      case 'ADX':
        return Math.min(value / 50, 1); // 0 to 1
      case 'VIX_Level':
        return Math.min(value / 40, 1); // 0 to 1, capped
      default:
        return Math.max(-1, Math.min(1, value)); // Clamp to -1,1
    }
  }

  /**
   * Infer regime from indicator reading
   */
  private inferRegimeFromIndicator(name: string, normalized: number): RegimeType {
    switch (name) {
      case 'SMA_Cross':
      case 'RSI':
        if (normalized > 0.5) return RegimeType.BULL_STRONG;
        if (normalized > 0.2) return RegimeType.BULL_WEAK;
        if (normalized < -0.5) return RegimeType.BEAR_STRONG;
        if (normalized < -0.2) return RegimeType.BEAR_WEAK;
        return RegimeType.RANGING;
        
      case 'ADX':
        if (normalized > 0.5) return RegimeType.TRENDING;
        if (normalized < 0.3) return RegimeType.RANGING;
        return RegimeType.TRANSITION;
        
      case 'ATR_Percentile':
      case 'VIX_Level':
        if (normalized > 0.8) return RegimeType.CRISIS;
        if (normalized > 0.6) return RegimeType.HIGH_VOLATILITY;
        if (normalized < 0.2) return RegimeType.LOW_VOLATILITY;
        return RegimeType.UNKNOWN;
        
      default:
        return RegimeType.UNKNOWN;
    }
  }

  // ==========================================================================
  // REGIME CLASSIFICATION
  // ==========================================================================

  /**
   * Classify current regime based on all indicators
   */
  classifyRegime(): RegimeState {
    const evidence = this.buildEvidence();
    const { primary, secondary, confidence } = this.determineRegime(evidence);
    
    // Check for transition
    const isTransition = this.currentState && this.currentState.primary !== primary;
    
    if (isTransition && this.currentState) {
      this.recordTransition(this.currentState.primary, primary, evidence);
    }

    // Determine stability
    let stability: RegimeState['stability'] = 'unstable';
    if (this.currentState && this.currentState.primary === primary) {
      const duration = Date.now() - this.currentState.startedAt;
      if (duration > this.stabilityThreshold && confidence > 0.7) {
        stability = 'stable';
      }
    }
    if (isTransition) {
      stability = 'transitioning';
    }

    // Get compatible strategies
    const compatibleStrategies = this.strategyCompatibility.get(primary) ?? [];

    // Calculate risk multiplier
    const riskMultiplier = this.calculateRiskMultiplier(primary, evidence);

    const startedAt = isTransition || !this.currentState 
      ? Date.now() 
      : this.currentState.startedAt;

    const state: RegimeState = {
      id: uuidv4(),
      primary,
      secondary,
      confidence,
      evidence,
      startedAt,
      duration: Date.now() - startedAt,
      stability,
      compatibleStrategies,
      riskMultiplier,
      timestamp: Date.now(),
    };

    // Update history if regime changed
    if (isTransition && this.currentState) {
      this.history.push({
        regime: this.currentState.primary,
        startedAt: this.currentState.startedAt,
        endedAt: Date.now(),
        duration: Date.now() - this.currentState.startedAt,
        confidence: this.currentState.confidence,
      });
    }

    this.currentState = state;
    return state;
  }

  /**
   * Build evidence from all indicators
   */
  private buildEvidence(): RegimeEvidence {
    const indicators = Array.from(this.indicators.values())
      .filter(i => i.timestamp > Date.now() - 3600000); // Last hour only

    // Group by category
    const byCategory = new Map<RegimeCategory, RegimeIndicator[]>();
    for (const ind of indicators) {
      const list = byCategory.get(ind.category) ?? [];
      list.push(ind);
      byCategory.set(ind.category, list);
    }

    // Calculate category consensus
    const categoryConsensus: RegimeEvidence['categoryConsensus'] = {} as RegimeEvidence['categoryConsensus'];
    
    for (const [category, inds] of byCategory) {
      if (inds.length === 0) continue;

      // Vote by regime
      const votes = new Map<RegimeType, { count: number; totalStrength: number; totalConfidence: number }>();
      for (const ind of inds) {
        const existing = votes.get(ind.suggestedRegime) ?? { count: 0, totalStrength: 0, totalConfidence: 0 };
        existing.count++;
        existing.totalStrength += ind.strength;
        existing.totalConfidence += ind.confidence;
        votes.set(ind.suggestedRegime, existing);
      }

      // Find winner
      let winner = RegimeType.UNKNOWN;
      let maxScore = 0;
      for (const [regime, stats] of votes) {
        const score = stats.totalStrength * stats.totalConfidence;
        if (score > maxScore) {
          maxScore = score;
          winner = regime;
        }
      }

      const winnerStats = votes.get(winner)!;
      const agreementScore = winnerStats.count / inds.length;

      categoryConsensus[category] = {
        regime: winner,
        confidence: winnerStats.totalConfidence / winnerStats.count,
        agreementScore,
      };
    }

    // Find conflicts
    const conflicts: RegimeEvidence['conflicts'] = [];
    const indArray = indicators.filter(i => i.confidence > 0.5);
    for (let i = 0; i < indArray.length; i++) {
      for (let j = i + 1; j < indArray.length; j++) {
        const a = indArray[i];
        const b = indArray[j];
        if (this.areRegimesConflicting(a.suggestedRegime, b.suggestedRegime)) {
          conflicts.push({
            indicator1: a.name,
            indicator2: b.name,
            severity: this.conflictSeverity(a, b),
          });
        }
      }
    }

    // Overall strength
    const overallStrength = indicators.length > 0
      ? indicators.reduce((sum, i) => sum + i.strength * i.confidence, 0) / indicators.length
      : 0;

    return {
      indicators,
      categoryConsensus,
      overallStrength,
      conflicts,
    };
  }

  /**
   * Determine primary and secondary regime from evidence
   */
  private determineRegime(evidence: RegimeEvidence): {
    primary: RegimeType;
    secondary?: RegimeType;
    confidence: number;
  } {
    // Weighted voting across categories
    const votes = new Map<RegimeType, number>();
    const categoryWeights: Record<RegimeCategory, number> = {
      [RegimeCategory.TREND]: 0.4,
      [RegimeCategory.VOLATILITY]: 0.3,
      [RegimeCategory.STRUCTURE]: 0.2,
      [RegimeCategory.EXTREME]: 0.1,
    };

    for (const [category, consensus] of Object.entries(evidence.categoryConsensus)) {
      const weight = categoryWeights[category as RegimeCategory] ?? 0.1;
      const score = consensus.confidence * consensus.agreementScore * weight;
      const existing = votes.get(consensus.regime) ?? 0;
      votes.set(consensus.regime, existing + score);
    }

    // Sort by score
    const sorted = Array.from(votes.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([regime]) => regime !== RegimeType.UNKNOWN);

    if (sorted.length === 0) {
      return { primary: RegimeType.UNKNOWN, confidence: 0 };
    }

    const primary = sorted[0][0];
    const primaryScore = sorted[0][1];
    const secondary = sorted.length > 1 && sorted[1][1] > primaryScore * 0.5 
      ? sorted[1][0] 
      : undefined;

    // Confidence based on margin and agreement
    const totalScore = Array.from(votes.values()).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.min(primaryScore / totalScore + 0.3, 1) : 0;

    return { primary, secondary, confidence };
  }

  /**
   * Check if two regimes conflict
   */
  private areRegimesConflicting(a: RegimeType, b: RegimeType): boolean {
    const conflictPairs: [RegimeType, RegimeType][] = [
      [RegimeType.BULL_STRONG, RegimeType.BEAR_STRONG],
      [RegimeType.BULL_STRONG, RegimeType.BEAR_WEAK],
      [RegimeType.BULL_WEAK, RegimeType.BEAR_STRONG],
      [RegimeType.HIGH_VOLATILITY, RegimeType.LOW_VOLATILITY],
      [RegimeType.TRENDING, RegimeType.RANGING],
      [RegimeType.CRISIS, RegimeType.EUPHORIA],
    ];

    return conflictPairs.some(([x, y]) => 
      (a === x && b === y) || (a === y && b === x)
    );
  }

  /**
   * Determine conflict severity
   */
  private conflictSeverity(a: RegimeIndicator, b: RegimeIndicator): 'low' | 'medium' | 'high' {
    const strengthDiff = Math.abs(a.strength - b.strength);
    const avgConfidence = (a.confidence + b.confidence) / 2;
    
    if (avgConfidence > 0.8 && strengthDiff < 0.2) return 'high';
    if (avgConfidence > 0.6) return 'medium';
    return 'low';
  }

  /**
   * Calculate risk multiplier for regime
   */
  private calculateRiskMultiplier(regime: RegimeType, evidence: RegimeEvidence): number {
    const baseMultipliers: Record<RegimeType, number> = {
      [RegimeType.BULL_STRONG]: 1.0,
      [RegimeType.BULL_WEAK]: 0.8,
      [RegimeType.BEAR_STRONG]: 0.3,
      [RegimeType.BEAR_WEAK]: 0.5,
      [RegimeType.HIGH_VOLATILITY]: 0.5,
      [RegimeType.LOW_VOLATILITY]: 1.0,
      [RegimeType.VOLATILITY_EXPANSION]: 0.6,
      [RegimeType.VOLATILITY_CONTRACTION]: 0.9,
      [RegimeType.RANGING]: 0.7,
      [RegimeType.TRENDING]: 1.0,
      [RegimeType.BREAKOUT]: 0.8,
      [RegimeType.BREAKDOWN]: 0.4,
      [RegimeType.CRISIS]: 0.1,
      [RegimeType.EUPHORIA]: 0.5,
      [RegimeType.TRANSITION]: 0.5,
      [RegimeType.UNKNOWN]: 0.3,
    };

    let multiplier = baseMultipliers[regime] ?? 0.5;

    // Reduce for high conflict
    const highConflicts = evidence.conflicts.filter(c => c.severity === 'high').length;
    multiplier *= Math.max(0.5, 1 - highConflicts * 0.1);

    // Reduce for low overall strength
    multiplier *= Math.max(0.5, evidence.overallStrength);

    return Math.max(0.1, Math.min(1.0, multiplier));
  }

  // ==========================================================================
  // TRANSITIONS
  // ==========================================================================

  /**
   * Record a regime transition
   */
  private recordTransition(from: RegimeType, to: RegimeType, evidence: RegimeEvidence): void {
    // Find triggering indicators
    const triggers = evidence.indicators
      .filter(i => i.suggestedRegime === to && i.strength > 0.5)
      .map(i => i.name);

    // Find historical precedents
    const precedents = this.findHistoricalPrecedents(from, to);

    const transition: RegimeTransition = {
      id: uuidv4(),
      from,
      to,
      detectedAt: Date.now(),
      confidence: evidence.overallStrength,
      triggers,
      expectedDuration: precedents.length > 0
        ? precedents.reduce((sum, p) => sum + p.duration, 0) / precedents.length
        : undefined,
      historicalPrecedents: precedents,
      recommendations: this.generateTransitionRecommendations(from, to),
    };

    this.transitions.push(transition);

    // Keep last 100 transitions
    if (this.transitions.length > 100) {
      this.transitions = this.transitions.slice(-100);
    }
  }

  /**
   * Find historical transitions of same type
   */
  private findHistoricalPrecedents(from: RegimeType, to: RegimeType): RegimeTransition['historicalPrecedents'] {
    const similar = this.transitions.filter(t => t.from === from && t.to === to);
    
    return similar.slice(-5).map(t => {
      // Find duration of "to" regime after this transition
      const historyEntry = this.history.find(h => 
        h.startedAt > t.detectedAt && h.regime === to
      );
      
      return {
        timestamp: t.detectedAt,
        duration: historyEntry?.duration ?? 0,
        outcome: historyEntry?.performance?.return 
          ? (historyEntry.performance.return > 0 ? 'positive' : 'negative')
          : 'unknown',
      };
    });
  }

  /**
   * Generate recommendations for transition
   */
  private generateTransitionRecommendations(from: RegimeType, to: RegimeType): string[] {
    const recommendations: string[] = [];

    // Risk-based recommendations
    if ([RegimeType.CRISIS, RegimeType.BEAR_STRONG].includes(to)) {
      recommendations.push('Reduce position sizes');
      recommendations.push('Review stop losses');
      recommendations.push('Consider hedging');
    }

    if ([RegimeType.EUPHORIA, RegimeType.BULL_STRONG].includes(from) && 
        [RegimeType.TRANSITION, RegimeType.BEAR_WEAK].includes(to)) {
      recommendations.push('Take partial profits');
      recommendations.push('Tighten trailing stops');
    }

    if (to === RegimeType.HIGH_VOLATILITY) {
      recommendations.push('Widen stop losses');
      recommendations.push('Reduce leverage');
    }

    if (to === RegimeType.RANGING) {
      recommendations.push('Switch to mean reversion strategies');
      recommendations.push('Define range boundaries');
    }

    if (to === RegimeType.TRENDING) {
      recommendations.push('Enable trend following strategies');
      recommendations.push('Let winners run');
    }

    return recommendations;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get current regime state
   */
  getCurrentRegime(): RegimeState | null {
    return this.currentState;
  }

  /**
   * Get regime history
   */
  getHistory(limit?: number): RegimeHistoryEntry[] {
    const history = [...this.history].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get recent transitions
   */
  getRecentTransitions(limit: number = 10): RegimeTransition[] {
    return [...this.transitions].reverse().slice(0, limit);
  }

  /**
   * Check if strategy is compatible with current regime
   */
  isStrategyCompatible(strategyName: string): boolean {
    if (!this.currentState) return false;
    return this.currentState.compatibleStrategies.includes(strategyName);
  }

  /**
   * Get compatible strategies for current regime
   */
  getCompatibleStrategies(): string[] {
    return this.currentState?.compatibleStrategies ?? [];
  }

  /**
   * Get all indicators
   */
  getIndicators(): RegimeIndicator[] {
    return Array.from(this.indicators.values());
  }

  /**
   * Get engine stats
   */
  getStats(): {
    currentRegime: RegimeType;
    confidence: number;
    stability: string;
    riskMultiplier: number;
    historyLength: number;
    transitionCount: number;
    indicatorCount: number;
    activeIndicators: number;
  } {
    const activeIndicators = Array.from(this.indicators.values())
      .filter(i => i.timestamp > Date.now() - 3600000).length;

    return {
      currentRegime: this.currentState?.primary ?? RegimeType.UNKNOWN,
      confidence: this.currentState?.confidence ?? 0,
      stability: this.currentState?.stability ?? 'unknown',
      riskMultiplier: this.currentState?.riskMultiplier ?? 0.5,
      historyLength: this.history.length,
      transitionCount: this.transitions.length,
      indicatorCount: this.indicators.size,
      activeIndicators,
    };
  }
}

export default RegimeEngine;

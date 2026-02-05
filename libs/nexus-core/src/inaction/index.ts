/**
 * NOVA NEXUS INACTION ARTIFACTS
 * ==============================
 * Restraint is a first-class output. Discipline is a product.
 * 
 * This module makes visible, explainable, and valuable:
 * - Decisions NOT to trade
 * - Entries deliberately deferred
 * - Losses avoided through restraint
 * - Risk abstentions and their rationale
 * 
 * "The money you didn't lose is just as real as the money you made."
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// INACTION TYPES
// ============================================================================

export enum InactionType {
  // Active non-execution
  NO_TRADE = 'NO_TRADE',                    // Explicitly decided not to trade
  DEFERRED_ENTRY = 'DEFERRED_ENTRY',        // Waiting for better conditions
  EARLY_EXIT_AVOIDED = 'EARLY_EXIT_AVOIDED', // Held when tempted to sell
  
  // Risk-based restraint
  RISK_ABSTENTION = 'RISK_ABSTENTION',      // Avoided due to risk limits
  REGIME_PAUSE = 'REGIME_PAUSE',            // Paused due to regime
  CORRELATION_SKIP = 'CORRELATION_SKIP',    // Skipped due to correlation
  
  // Quality-based restraint
  CONFIDENCE_INSUFFICIENT = 'CONFIDENCE_INSUFFICIENT', // Signal too weak
  THESIS_INCOMPLETE = 'THESIS_INCOMPLETE',  // Missing key elements
  TIMING_SUBOPTIMAL = 'TIMING_SUBOPTIMAL',  // Not the right moment
  
  // Discipline-based
  OVERTRADING_PREVENTION = 'OVERTRADING_PREVENTION', // Stopped excessive activity
  REVENGE_TRADE_BLOCKED = 'REVENGE_TRADE_BLOCKED',   // Prevented emotional trade
  FOMO_RESISTED = 'FOMO_RESISTED',                   // Resisted fear of missing out
}

export enum InactionOutcome {
  CORRECT = 'CORRECT',           // Not acting was right
  INCORRECT = 'INCORRECT',       // Should have acted
  NEUTRAL = 'NEUTRAL',           // No clear winner
  PENDING = 'PENDING',           // Outcome not yet known
}

// ============================================================================
// INACTION ARTIFACTS
// ============================================================================

export interface InactionArtifact {
  id: string;
  type: InactionType;
  timestamp: number;
  
  /** What was NOT done */
  subject: {
    type: 'trade' | 'entry' | 'exit' | 'allocation' | 'strategy_change';
    symbol?: string;
    proposedAction?: string;
    proposedSize?: number;
    proposedPrice?: number;
  };
  
  /** Why action was not taken */
  reasoning: {
    primaryReason: string;
    supportingFactors: string[];
    confidence: number;
    constraints: string[];
  };
  
  /** Alternative actions considered */
  alternatives: Array<{
    action: string;
    whyRejected: string;
  }>;
  
  /** Market context at decision time */
  context: {
    regime: string;
    volatility: number;
    riskLevel: number;
    signalStrength: number;
    portfolioState: string;
  };
  
  /** Conditions for revisiting this decision */
  revisitConditions?: {
    priceTargets?: { above?: number; below?: number };
    timeLimit?: number;
    signalThreshold?: number;
    regimeChange?: string;
  };
  
  /** Outcome after the fact */
  outcome?: {
    status: InactionOutcome;
    determinedAt: number;
    actualResult: string;
    hypotheticalResult?: string;
    avoidedLoss?: number;
    missedGain?: number;
    netImpact: number;
  };
  
  /** Is this artifact billable? */
  billable: boolean;
  billableValue?: number;
}

// ============================================================================
// AVOIDED LOSS REPORT
// ============================================================================

export interface AvoidedLossReport {
  id: string;
  periodStart: number;
  periodEnd: number;
  
  /** Summary statistics */
  summary: {
    totalInactions: number;
    correctInactions: number;
    incorrectInactions: number;
    pendingInactions: number;
    
    totalAvoidedLoss: number;
    totalMissedGain: number;
    netValue: number;
    
    avgConfidence: number;
    avgOutcomeAccuracy: number;
  };
  
  /** Breakdown by type */
  byType: Record<InactionType, {
    count: number;
    avoidedLoss: number;
    missedGain: number;
    accuracy: number;
  }>;
  
  /** Top avoided losses */
  topAvoidedLosses: Array<{
    artifactId: string;
    symbol: string;
    avoidedLoss: number;
    reason: string;
  }>;
  
  /** Lessons learned */
  insights: string[];
  
  /** Billable summary */
  billing: {
    billableInactions: number;
    totalBillableValue: number;
    valuePerInaction: number;
  };
}

// ============================================================================
// RESTRAINT METRICS
// ============================================================================

export interface RestraintMetrics {
  /** Period for metrics */
  periodDays: number;
  
  /** Core metrics */
  metrics: {
    /** How often we chose not to act */
    restraintRate: number;
    
    /** Of restraints, how many were correct */
    restraintAccuracy: number;
    
    /** Total value preserved through restraint */
    valuePreserved: number;
    
    /** Average confidence when choosing inaction */
    avgInactionConfidence: number;
    
    /** How often revisit conditions were met */
    revisitTriggeredRate: number;
    
    /** How many revenge trades were blocked */
    emotionalTradesBlocked: number;
    
    /** FOMO resistance rate */
    fomoResistanceRate: number;
  };
  
  /** Comparison to acting */
  comparison: {
    /** What if we had acted on all proposals */
    hypotheticalPnL: number;
    
    /** Actual PnL including restraint value */
    actualPnL: number;
    
    /** Value added by restraint */
    restraintValue: number;
    
    /** Risk-adjusted comparison */
    restraintSharpeContribution: number;
  };
  
  /** Quality indicators */
  quality: {
    /** Are we being too restrictive? */
    overRestraint: boolean;
    
    /** Are we not restrictive enough? */
    underRestraint: boolean;
    
    /** Optimal restraint estimate */
    suggestedRestraintRate: number;
  };
}

// ============================================================================
// INACTION ENGINE
// ============================================================================

export class InactionEngine {
  private artifacts: Map<string, InactionArtifact> = new Map();
  private reports: Map<string, AvoidedLossReport> = new Map();
  
  /** Value per correct inaction for billing */
  private baseInactionValue: number = 50;
  
  /** Multipliers by type */
  private typeMultipliers: Record<InactionType, number> = {
    [InactionType.NO_TRADE]: 1.0,
    [InactionType.DEFERRED_ENTRY]: 0.8,
    [InactionType.EARLY_EXIT_AVOIDED]: 1.2,
    [InactionType.RISK_ABSTENTION]: 1.5,
    [InactionType.REGIME_PAUSE]: 1.3,
    [InactionType.CORRELATION_SKIP]: 1.0,
    [InactionType.CONFIDENCE_INSUFFICIENT]: 0.7,
    [InactionType.THESIS_INCOMPLETE]: 0.8,
    [InactionType.TIMING_SUBOPTIMAL]: 0.9,
    [InactionType.OVERTRADING_PREVENTION]: 1.4,
    [InactionType.REVENGE_TRADE_BLOCKED]: 2.0,
    [InactionType.FOMO_RESISTED]: 1.8,
  };

  constructor() {}

  // ==========================================================================
  // ARTIFACT CREATION
  // ==========================================================================

  /**
   * Record a decision NOT to act
   */
  recordInaction(
    type: InactionType,
    subject: InactionArtifact['subject'],
    reasoning: InactionArtifact['reasoning'],
    context: InactionArtifact['context'],
    options: {
      alternatives?: InactionArtifact['alternatives'];
      revisitConditions?: InactionArtifact['revisitConditions'];
    } = {}
  ): InactionArtifact {
    const artifact: InactionArtifact = {
      id: uuidv4(),
      type,
      timestamp: Date.now(),
      subject,
      reasoning,
      alternatives: options.alternatives ?? [],
      context,
      revisitConditions: options.revisitConditions,
      billable: this.isBillable(type, reasoning.confidence),
    };

    if (artifact.billable) {
      artifact.billableValue = this.calculateBillableValue(type, reasoning.confidence);
    }

    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  /**
   * Record a no-trade decision
   */
  recordNoTrade(
    symbol: string,
    proposedAction: string,
    primaryReason: string,
    confidence: number,
    context: InactionArtifact['context']
  ): InactionArtifact {
    return this.recordInaction(
      InactionType.NO_TRADE,
      { type: 'trade', symbol, proposedAction },
      { primaryReason, supportingFactors: [], confidence, constraints: [] },
      context
    );
  }

  /**
   * Record a deferred entry
   */
  recordDeferredEntry(
    symbol: string,
    proposedPrice: number,
    targetPrice: number,
    primaryReason: string,
    confidence: number,
    context: InactionArtifact['context']
  ): InactionArtifact {
    return this.recordInaction(
      InactionType.DEFERRED_ENTRY,
      { type: 'entry', symbol, proposedPrice },
      { primaryReason, supportingFactors: [], confidence, constraints: [] },
      context,
      {
        revisitConditions: {
          priceTargets: { below: targetPrice },
          timeLimit: Date.now() + 86400000 * 7, // 7 days
        },
      }
    );
  }

  /**
   * Record a blocked emotional trade
   */
  recordBlockedEmotionalTrade(
    type: InactionType.REVENGE_TRADE_BLOCKED | InactionType.FOMO_RESISTED | InactionType.OVERTRADING_PREVENTION,
    symbol: string,
    proposedAction: string,
    triggerEvent: string,
    context: InactionArtifact['context']
  ): InactionArtifact {
    return this.recordInaction(
      type,
      { type: 'trade', symbol, proposedAction },
      {
        primaryReason: `Emotional trade blocked: ${triggerEvent}`,
        supportingFactors: ['Pattern recognition', 'Behavioral safeguard'],
        confidence: 0.9,
        constraints: ['Emotional trading prevention'],
      },
      context
    );
  }

  // ==========================================================================
  // OUTCOME TRACKING
  // ==========================================================================

  /**
   * Update artifact with outcome
   */
  recordOutcome(
    artifactId: string,
    status: InactionOutcome,
    actualResult: string,
    metrics: {
      hypotheticalResult?: string;
      avoidedLoss?: number;
      missedGain?: number;
    } = {}
  ): void {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return;

    const avoidedLoss = metrics.avoidedLoss ?? 0;
    const missedGain = metrics.missedGain ?? 0;
    const netImpact = avoidedLoss - missedGain;

    artifact.outcome = {
      status,
      determinedAt: Date.now(),
      actualResult,
      hypotheticalResult: metrics.hypotheticalResult,
      avoidedLoss,
      missedGain,
      netImpact,
    };

    // Update billable value based on actual outcome
    if (status === InactionOutcome.CORRECT && avoidedLoss > 0) {
      artifact.billable = true;
      artifact.billableValue = Math.max(
        artifact.billableValue ?? 0,
        this.calculateOutcomeBasedValue(artifact.type, avoidedLoss)
      );
    } else if (status === InactionOutcome.INCORRECT) {
      artifact.billable = false;
      artifact.billableValue = 0;
    }
  }

  /**
   * Check revisit conditions for pending artifacts
   */
  checkRevisitConditions(currentPrice: Record<string, number>): InactionArtifact[] {
    const triggered: InactionArtifact[] = [];
    const now = Date.now();

    for (const artifact of this.artifacts.values()) {
      if (!artifact.revisitConditions) continue;
      if (artifact.outcome?.status !== InactionOutcome.PENDING && artifact.outcome) continue;

      const { priceTargets, timeLimit, signalThreshold } = artifact.revisitConditions;
      const symbol = artifact.subject.symbol;
      
      let shouldRevisit = false;

      // Check price targets
      if (priceTargets && symbol && currentPrice[symbol] !== undefined) {
        const price = currentPrice[symbol];
        if (priceTargets.above && price >= priceTargets.above) shouldRevisit = true;
        if (priceTargets.below && price <= priceTargets.below) shouldRevisit = true;
      }

      // Check time limit
      if (timeLimit && now >= timeLimit) shouldRevisit = true;

      if (shouldRevisit) {
        triggered.push(artifact);
      }
    }

    return triggered;
  }

  // ==========================================================================
  // VALUE CALCULATION
  // ==========================================================================

  /**
   * Determine if inaction is billable
   */
  private isBillable(type: InactionType, confidence: number): boolean {
    // High-value inactions are always billable
    const highValueTypes = [
      InactionType.REVENGE_TRADE_BLOCKED,
      InactionType.FOMO_RESISTED,
      InactionType.RISK_ABSTENTION,
    ];
    
    if (highValueTypes.includes(type)) return true;
    
    // Others require high confidence
    return confidence >= 0.7;
  }

  /**
   * Calculate billable value for inaction
   */
  private calculateBillableValue(type: InactionType, confidence: number): number {
    const baseValue = this.baseInactionValue;
    const typeMultiplier = this.typeMultipliers[type] ?? 1.0;
    const confidenceMultiplier = 0.5 + (confidence * 0.5); // 0.5 to 1.0
    
    return baseValue * typeMultiplier * confidenceMultiplier;
  }

  /**
   * Calculate value based on actual avoided loss
   */
  private calculateOutcomeBasedValue(type: InactionType, avoidedLoss: number): number {
    // Value is a percentage of avoided loss, capped
    const percentage = 0.1; // 10% of avoided loss
    const minValue = this.baseInactionValue * (this.typeMultipliers[type] ?? 1.0);
    const maxValue = 1000;
    
    return Math.min(maxValue, Math.max(minValue, avoidedLoss * percentage));
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Generate avoided loss report for period
   */
  generateReport(periodStart: number, periodEnd: number): AvoidedLossReport {
    const periodArtifacts = Array.from(this.artifacts.values())
      .filter(a => a.timestamp >= periodStart && a.timestamp <= periodEnd);

    // Calculate summary
    const withOutcome = periodArtifacts.filter(a => a.outcome);
    const correct = withOutcome.filter(a => a.outcome?.status === InactionOutcome.CORRECT);
    const incorrect = withOutcome.filter(a => a.outcome?.status === InactionOutcome.INCORRECT);
    const pending = periodArtifacts.filter(a => !a.outcome || a.outcome.status === InactionOutcome.PENDING);

    const totalAvoidedLoss = correct.reduce((sum, a) => sum + (a.outcome?.avoidedLoss ?? 0), 0);
    const totalMissedGain = periodArtifacts.reduce((sum, a) => sum + (a.outcome?.missedGain ?? 0), 0);

    // Breakdown by type
    const byType: AvoidedLossReport['byType'] = {} as AvoidedLossReport['byType'];
    for (const type of Object.values(InactionType)) {
      const typeArtifacts = periodArtifacts.filter(a => a.type === type);
      const typeWithOutcome = typeArtifacts.filter(a => a.outcome);
      const typeCorrect = typeWithOutcome.filter(a => a.outcome?.status === InactionOutcome.CORRECT);
      
      byType[type] = {
        count: typeArtifacts.length,
        avoidedLoss: typeCorrect.reduce((sum, a) => sum + (a.outcome?.avoidedLoss ?? 0), 0),
        missedGain: typeArtifacts.reduce((sum, a) => sum + (a.outcome?.missedGain ?? 0), 0),
        accuracy: typeWithOutcome.length > 0 ? typeCorrect.length / typeWithOutcome.length : 0,
      };
    }

    // Top avoided losses
    const topAvoidedLosses = correct
      .filter(a => a.outcome?.avoidedLoss && a.outcome.avoidedLoss > 0)
      .sort((a, b) => (b.outcome?.avoidedLoss ?? 0) - (a.outcome?.avoidedLoss ?? 0))
      .slice(0, 10)
      .map(a => ({
        artifactId: a.id,
        symbol: a.subject.symbol ?? 'N/A',
        avoidedLoss: a.outcome?.avoidedLoss ?? 0,
        reason: a.reasoning.primaryReason,
      }));

    // Generate insights
    const insights = this.generateInsights(periodArtifacts, byType);

    // Billing
    const billableArtifacts = periodArtifacts.filter(a => a.billable);
    const totalBillableValue = billableArtifacts.reduce((sum, a) => sum + (a.billableValue ?? 0), 0);

    const report: AvoidedLossReport = {
      id: uuidv4(),
      periodStart,
      periodEnd,
      summary: {
        totalInactions: periodArtifacts.length,
        correctInactions: correct.length,
        incorrectInactions: incorrect.length,
        pendingInactions: pending.length,
        totalAvoidedLoss,
        totalMissedGain,
        netValue: totalAvoidedLoss - totalMissedGain,
        avgConfidence: periodArtifacts.length > 0
          ? periodArtifacts.reduce((sum, a) => sum + a.reasoning.confidence, 0) / periodArtifacts.length
          : 0,
        avgOutcomeAccuracy: withOutcome.length > 0 ? correct.length / withOutcome.length : 0,
      },
      byType,
      topAvoidedLosses,
      insights,
      billing: {
        billableInactions: billableArtifacts.length,
        totalBillableValue,
        valuePerInaction: billableArtifacts.length > 0 ? totalBillableValue / billableArtifacts.length : 0,
      },
    };

    this.reports.set(report.id, report);
    return report;
  }

  /**
   * Generate insights from inaction data
   */
  private generateInsights(
    artifacts: InactionArtifact[],
    byType: AvoidedLossReport['byType']
  ): string[] {
    const insights: string[] = [];

    // Type performance insights
    const bestType = Object.entries(byType)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)[0];
    
    if (bestType && bestType[1].accuracy > 0.7) {
      insights.push(`Best restraint type: ${bestType[0]} with ${(bestType[1].accuracy * 100).toFixed(0)}% accuracy`);
    }

    // Emotional trading insights
    const emotionalBlocks = artifacts.filter(a => 
      a.type === InactionType.REVENGE_TRADE_BLOCKED || 
      a.type === InactionType.FOMO_RESISTED
    );
    if (emotionalBlocks.length > 0) {
      const emotionalValue = emotionalBlocks.reduce((sum, a) => sum + (a.outcome?.avoidedLoss ?? 0), 0);
      insights.push(`Blocked ${emotionalBlocks.length} emotional trades, preserving $${emotionalValue.toFixed(0)}`);
    }

    // Timing insights
    const timingInactions = artifacts.filter(a => a.type === InactionType.TIMING_SUBOPTIMAL);
    if (timingInactions.length > 5) {
      insights.push(`Frequent timing-based deferrals suggest market patience is valuable`);
    }

    // Risk abstention insights
    const riskAbstentions = artifacts.filter(a => a.type === InactionType.RISK_ABSTENTION);
    if (riskAbstentions.length > 0) {
      const riskValue = riskAbstentions.reduce((sum, a) => sum + (a.outcome?.avoidedLoss ?? 0), 0);
      if (riskValue > 0) {
        insights.push(`Risk-based restraint protected $${riskValue.toFixed(0)}`);
      }
    }

    return insights;
  }

  /**
   * Calculate restraint metrics
   */
  calculateRestraintMetrics(periodDays: number = 30): RestraintMetrics {
    const periodStart = Date.now() - (periodDays * 86400000);
    const artifacts = Array.from(this.artifacts.values())
      .filter(a => a.timestamp >= periodStart);

    const withOutcome = artifacts.filter(a => a.outcome);
    const correct = withOutcome.filter(a => a.outcome?.status === InactionOutcome.CORRECT);
    
    const emotionalBlocks = artifacts.filter(a =>
      a.type === InactionType.REVENGE_TRADE_BLOCKED ||
      a.type === InactionType.FOMO_RESISTED ||
      a.type === InactionType.OVERTRADING_PREVENTION
    );

    const fomoResisted = artifacts.filter(a => a.type === InactionType.FOMO_RESISTED);

    const valuePreserved = correct.reduce((sum, a) => sum + (a.outcome?.netImpact ?? 0), 0);
    const avgConfidence = artifacts.length > 0
      ? artifacts.reduce((sum, a) => sum + a.reasoning.confidence, 0) / artifacts.length
      : 0;

    // Check revisit conditions
    const withRevisit = artifacts.filter(a => a.revisitConditions);
    const revisitTriggered = withRevisit.filter(a => 
      a.revisitConditions?.timeLimit && Date.now() >= a.revisitConditions.timeLimit
    );

    // Hypothetical comparison (simplified)
    const hypotheticalPnL = artifacts.reduce((sum, a) => {
      if (a.outcome?.status === InactionOutcome.INCORRECT) {
        return sum + (a.outcome.missedGain ?? 0);
      }
      return sum - (a.outcome?.avoidedLoss ?? 0);
    }, 0);

    const actualPnL = valuePreserved;

    return {
      periodDays,
      metrics: {
        restraintRate: artifacts.length / Math.max(1, periodDays), // Per day
        restraintAccuracy: withOutcome.length > 0 ? correct.length / withOutcome.length : 0,
        valuePreserved,
        avgInactionConfidence: avgConfidence,
        revisitTriggeredRate: withRevisit.length > 0 ? revisitTriggered.length / withRevisit.length : 0,
        emotionalTradesBlocked: emotionalBlocks.length,
        fomoResistanceRate: artifacts.length > 0 ? fomoResisted.length / artifacts.length : 0,
      },
      comparison: {
        hypotheticalPnL,
        actualPnL,
        restraintValue: actualPnL - hypotheticalPnL,
        restraintSharpeContribution: 0, // Would need more data to calculate
      },
      quality: {
        overRestraint: artifacts.length > periodDays * 5, // More than 5/day
        underRestraint: artifacts.length < periodDays * 0.5, // Less than 0.5/day
        suggestedRestraintRate: 2, // 2 per day suggested
      },
    };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get artifact by ID
   */
  getArtifact(artifactId: string): InactionArtifact | undefined {
    return this.artifacts.get(artifactId);
  }

  /**
   * Get recent artifacts
   */
  getRecentArtifacts(limit: number = 20, type?: InactionType): InactionArtifact[] {
    let artifacts = Array.from(this.artifacts.values());
    
    if (type) {
      artifacts = artifacts.filter(a => a.type === type);
    }
    
    return artifacts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get pending artifacts (no outcome yet)
   */
  getPendingArtifacts(): InactionArtifact[] {
    return Array.from(this.artifacts.values())
      .filter(a => !a.outcome || a.outcome.status === InactionOutcome.PENDING)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get billable artifacts
   */
  getBillableArtifacts(periodStart?: number): InactionArtifact[] {
    let artifacts = Array.from(this.artifacts.values()).filter(a => a.billable);
    
    if (periodStart) {
      artifacts = artifacts.filter(a => a.timestamp >= periodStart);
    }
    
    return artifacts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get report by ID
   */
  getReport(reportId: string): AvoidedLossReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalArtifacts: number;
    pendingOutcomes: number;
    correctInactions: number;
    incorrectInactions: number;
    totalAvoidedLoss: number;
    totalBillableValue: number;
    restraintRate: number;
    emotionalTradesBlocked: number;
  } {
    const artifacts = Array.from(this.artifacts.values());
    const withOutcome = artifacts.filter(a => a.outcome);
    const correct = withOutcome.filter(a => a.outcome?.status === InactionOutcome.CORRECT);
    const incorrect = withOutcome.filter(a => a.outcome?.status === InactionOutcome.INCORRECT);
    const emotional = artifacts.filter(a =>
      a.type === InactionType.REVENGE_TRADE_BLOCKED ||
      a.type === InactionType.FOMO_RESISTED
    );

    // Calculate rate over last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recentArtifacts = artifacts.filter(a => a.timestamp >= thirtyDaysAgo);

    return {
      totalArtifacts: artifacts.length,
      pendingOutcomes: artifacts.filter(a => !a.outcome || a.outcome.status === InactionOutcome.PENDING).length,
      correctInactions: correct.length,
      incorrectInactions: incorrect.length,
      totalAvoidedLoss: correct.reduce((sum, a) => sum + (a.outcome?.avoidedLoss ?? 0), 0),
      totalBillableValue: artifacts.filter(a => a.billable).reduce((sum, a) => sum + (a.billableValue ?? 0), 0),
      restraintRate: recentArtifacts.length / 30,
      emotionalTradesBlocked: emotional.length,
    };
  }
}

export default InactionEngine;

/**
 * NOVA NEXUS EVALUATOR
 * ====================
 * The truth authority. Measures what matters, not what's flattering.
 * Can override models, freeze modules, and reduce autonomy.
 */

import { AutonomyTier } from '../constitution';
import { IntentRecord } from '../ledger';

// ============================================================================
// METRICS SYSTEM
// ============================================================================

export interface MetricDefinition {
  name: string;
  description: string;
  type: 'ratio' | 'percentage' | 'currency' | 'duration' | 'count';
  higherIsBetter: boolean;
  warningThreshold: number;
  criticalThreshold: number;
}

export const CORE_METRICS: MetricDefinition[] = [
  {
    name: 'expected_vs_realized',
    description: 'Ratio of realized value to expected value',
    type: 'ratio',
    higherIsBetter: true,
    warningThreshold: 0.8,
    criticalThreshold: 0.5,
  },
  {
    name: 'max_drawdown',
    description: 'Maximum portfolio drawdown percentage',
    type: 'percentage',
    higherIsBetter: false,
    warningThreshold: 10,
    criticalThreshold: 20,
  },
  {
    name: 'sharpe_ratio',
    description: 'Risk-adjusted return measure',
    type: 'ratio',
    higherIsBetter: true,
    warningThreshold: 1.0,
    criticalThreshold: 0.5,
  },
  {
    name: 'win_rate',
    description: 'Percentage of successful trades',
    type: 'percentage',
    higherIsBetter: true,
    warningThreshold: 45,
    criticalThreshold: 35,
  },
  {
    name: 'opportunity_cost',
    description: 'Returns missed by not taking optimal action',
    type: 'percentage',
    higherIsBetter: false,
    warningThreshold: 5,
    criticalThreshold: 15,
  },
  {
    name: 'regime_accuracy',
    description: 'Accuracy of regime detection',
    type: 'percentage',
    higherIsBetter: true,
    warningThreshold: 60,
    criticalThreshold: 40,
  },
  {
    name: 'saturation_timing',
    description: 'How well we time market saturation',
    type: 'ratio',
    higherIsBetter: true,
    warningThreshold: 0.7,
    criticalThreshold: 0.4,
  },
];

export interface MetricValue {
  metric: string;
  value: number;
  timestamp: number;
  context: {
    period: 'daily' | 'weekly' | 'monthly' | 'all_time';
    regime?: string;
    strategy?: string;
  };
  status: 'healthy' | 'warning' | 'critical';
}

// ============================================================================
// STRATEGY EVALUATION
// ============================================================================

export interface StrategyEvaluation {
  strategyId: string;
  strategyName: string;
  evaluatedAt: number;
  
  metrics: MetricValue[];
  
  overallScore: number; // 0-100
  
  recommendation: 'continue' | 'reduce_size' | 'pause' | 'retire';
  
  reasoning: string[];
  
  regimePerformance: {
    regime: string;
    score: number;
    sampleSize: number;
  }[];
}

// ============================================================================
// AUTHORITY ACTIONS
// ============================================================================

export enum AuthorityAction {
  NONE = 'NONE',
  WARN = 'WARN',
  REDUCE_POSITION_SIZE = 'REDUCE_POSITION_SIZE',
  DOWNGRADE_STRATEGY = 'DOWNGRADE_STRATEGY',
  FREEZE_MODULE = 'FREEZE_MODULE',
  REDUCE_AUTONOMY = 'REDUCE_AUTONOMY',
  FORCE_RETRAIN = 'FORCE_RETRAIN',
  EMERGENCY_HALT = 'EMERGENCY_HALT',
}

export interface AuthorityDecision {
  id: string;
  timestamp: number;
  action: AuthorityAction;
  target: {
    type: 'strategy' | 'module' | 'system';
    id: string;
  };
  reason: string;
  metrics: MetricValue[];
  reversible: boolean;
  expiresAt?: number;
}

// ============================================================================
// EVALUATOR
// ============================================================================

export class Evaluator {
  private metrics: Map<string, MetricValue[]> = new Map();
  private strategyEvaluations: Map<string, StrategyEvaluation> = new Map();
  private authorityDecisions: AuthorityDecision[] = [];
  private frozenModules: Set<string> = new Set();

  /**
   * Record a metric value
   */
  recordMetric(
    metric: string,
    value: number,
    context: MetricValue['context']
  ): MetricValue {
    const definition = CORE_METRICS.find(m => m.name === metric);
    
    let status: MetricValue['status'] = 'healthy';
    if (definition) {
      const isWorse = definition.higherIsBetter 
        ? value < definition.warningThreshold
        : value > definition.warningThreshold;
      const isCritical = definition.higherIsBetter
        ? value < definition.criticalThreshold
        : value > definition.criticalThreshold;
      
      if (isCritical) status = 'critical';
      else if (isWorse) status = 'warning';
    }

    const metricValue: MetricValue = {
      metric,
      value,
      timestamp: Date.now(),
      context,
      status,
    };

    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(metricValue);

    // Check if we need to take authority action
    if (status === 'critical') {
      this.triggerAuthorityAction(metricValue);
    }

    return metricValue;
  }

  /**
   * Evaluate a strategy based on its historical performance
   */
  evaluateStrategy(
    strategyId: string,
    strategyName: string,
    intentRecords: IntentRecord[]
  ): StrategyEvaluation {
    const completed = intentRecords.filter(r => r.outcome);
    
    if (completed.length === 0) {
      return {
        strategyId,
        strategyName,
        evaluatedAt: Date.now(),
        metrics: [],
        overallScore: 50, // Neutral score for no data
        recommendation: 'continue',
        reasoning: ['Insufficient data for evaluation'],
        regimePerformance: [],
      };
    }

    // Calculate metrics
    const successful = completed.filter(r => r.outcome!.success);
    const winRate = (successful.length / completed.length) * 100;

    // Expected vs realized (simplified)
    let totalExpected = 0;
    let totalRealized = 0;
    for (const record of completed) {
      if (record.outcome!.metrics.expected) {
        totalExpected += record.outcome!.metrics.expected;
      }
      if (record.outcome!.metrics.realized) {
        totalRealized += record.outcome!.metrics.realized;
      }
    }
    const expectedVsRealized = totalExpected > 0 ? totalRealized / totalExpected : 1;

    const metrics: MetricValue[] = [
      {
        metric: 'win_rate',
        value: winRate,
        timestamp: Date.now(),
        context: { period: 'all_time', strategy: strategyId },
        status: winRate >= 45 ? 'healthy' : winRate >= 35 ? 'warning' : 'critical',
      },
      {
        metric: 'expected_vs_realized',
        value: expectedVsRealized,
        timestamp: Date.now(),
        context: { period: 'all_time', strategy: strategyId },
        status: expectedVsRealized >= 0.8 ? 'healthy' : expectedVsRealized >= 0.5 ? 'warning' : 'critical',
      },
    ];

    // Calculate overall score
    const overallScore = Math.min(100, Math.max(0,
      (winRate * 0.4) + 
      (expectedVsRealized * 50 * 0.4) +
      (Math.min(completed.length, 100) * 0.2)
    ));

    // Determine recommendation
    let recommendation: StrategyEvaluation['recommendation'] = 'continue';
    const reasoning: string[] = [];

    if (overallScore < 30) {
      recommendation = 'retire';
      reasoning.push('Overall score is critically low');
    } else if (overallScore < 50) {
      recommendation = 'pause';
      reasoning.push('Strategy needs review before continuing');
    } else if (winRate < 40) {
      recommendation = 'reduce_size';
      reasoning.push('Win rate below acceptable threshold');
    } else {
      reasoning.push('Strategy performing within acceptable parameters');
    }

    const evaluation: StrategyEvaluation = {
      strategyId,
      strategyName,
      evaluatedAt: Date.now(),
      metrics,
      overallScore,
      recommendation,
      reasoning,
      regimePerformance: [], // Would be populated with regime-specific analysis
    };

    this.strategyEvaluations.set(strategyId, evaluation);
    return evaluation;
  }

  /**
   * Trigger an authority action based on metric violations
   */
  private triggerAuthorityAction(metric: MetricValue): AuthorityDecision | null {
    let action = AuthorityAction.WARN;
    let target: AuthorityDecision['target'] = { type: 'system', id: 'global' };

    // Determine appropriate action based on metric
    switch (metric.metric) {
      case 'max_drawdown':
        if (metric.value > 20) {
          action = AuthorityAction.EMERGENCY_HALT;
        } else {
          action = AuthorityAction.REDUCE_POSITION_SIZE;
        }
        break;
      case 'win_rate':
        if (metric.context.strategy) {
          target = { type: 'strategy', id: metric.context.strategy };
          action = AuthorityAction.DOWNGRADE_STRATEGY;
        }
        break;
      case 'expected_vs_realized':
        if (metric.context.strategy) {
          target = { type: 'strategy', id: metric.context.strategy };
          action = metric.value < 0.3 
            ? AuthorityAction.FREEZE_MODULE 
            : AuthorityAction.FORCE_RETRAIN;
        }
        break;
    }

    const decision: AuthorityDecision = {
      id: `auth_${Date.now()}`,
      timestamp: Date.now(),
      action,
      target,
      reason: `Metric ${metric.metric} at critical level: ${metric.value}`,
      metrics: [metric],
      reversible: action !== AuthorityAction.EMERGENCY_HALT,
      expiresAt: action === AuthorityAction.WARN 
        ? Date.now() + 24 * 60 * 60 * 1000 
        : undefined,
    };

    this.authorityDecisions.push(decision);

    if (action === AuthorityAction.FREEZE_MODULE && target.type === 'module') {
      this.frozenModules.add(target.id);
    }

    return decision;
  }

  /**
   * Check if a module is frozen
   */
  isModuleFrozen(moduleId: string): boolean {
    return this.frozenModules.has(moduleId);
  }

  /**
   * Unfreeze a module
   */
  unfreezeModule(moduleId: string, reason: string): void {
    this.frozenModules.delete(moduleId);
    this.authorityDecisions.push({
      id: `auth_${Date.now()}`,
      timestamp: Date.now(),
      action: AuthorityAction.NONE,
      target: { type: 'module', id: moduleId },
      reason: `Module unfrozen: ${reason}`,
      metrics: [],
      reversible: true,
    });
  }

  /**
   * Get latest metrics
   */
  getLatestMetrics(): MetricValue[] {
    const latest: MetricValue[] = [];
    for (const [, values] of this.metrics) {
      if (values.length > 0) {
        latest.push(values[values.length - 1]);
      }
    }
    return latest;
  }

  /**
   * Get metrics in critical/warning state
   */
  getAlertMetrics(): MetricValue[] {
    return this.getLatestMetrics().filter(m => m.status !== 'healthy');
  }

  /**
   * Get recent authority decisions
   */
  getRecentDecisions(limit: number = 10): AuthorityDecision[] {
    return this.authorityDecisions.slice(-limit);
  }

  /**
   * Determine if autonomy should be reduced
   */
  shouldReduceAutonomy(): { should: boolean; reason: string; suggestedTier?: AutonomyTier } {
    const alerts = this.getAlertMetrics();
    const criticalCount = alerts.filter(a => a.status === 'critical').length;
    
    if (criticalCount >= 3) {
      return {
        should: true,
        reason: `${criticalCount} metrics in critical state`,
        suggestedTier: AutonomyTier.OBSERVE,
      };
    }
    
    if (criticalCount >= 1) {
      return {
        should: true,
        reason: `Critical metric detected: ${alerts.find(a => a.status === 'critical')?.metric}`,
        suggestedTier: AutonomyTier.RECOMMEND,
      };
    }

    const warningCount = alerts.filter(a => a.status === 'warning').length;
    if (warningCount >= 5) {
      return {
        should: true,
        reason: `${warningCount} metrics in warning state`,
        suggestedTier: AutonomyTier.GUARDED_AUTONOMOUS,
      };
    }

    return { should: false, reason: 'All metrics within acceptable ranges' };
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    metricsSummary: { healthy: number; warning: number; critical: number };
    frozenModules: string[];
    recentDecisions: AuthorityDecision[];
    recommendations: string[];
  } {
    const latest = this.getLatestMetrics();
    const summary = {
      healthy: latest.filter(m => m.status === 'healthy').length,
      warning: latest.filter(m => m.status === 'warning').length,
      critical: latest.filter(m => m.status === 'critical').length,
    };

    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (summary.critical > 0) overallHealth = 'critical';
    else if (summary.warning > 2) overallHealth = 'degraded';

    const recommendations: string[] = [];
    if (summary.critical > 0) {
      recommendations.push('Immediate attention required for critical metrics');
    }
    if (this.frozenModules.size > 0) {
      recommendations.push(`${this.frozenModules.size} modules are frozen and need review`);
    }

    return {
      overallHealth,
      metricsSummary: summary,
      frozenModules: Array.from(this.frozenModules),
      recentDecisions: this.authorityDecisions.slice(-5),
      recommendations,
    };
  }
}

export default Evaluator;

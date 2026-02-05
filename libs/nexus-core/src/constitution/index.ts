/**
 * NOVA NEXUS CONSTITUTION LAYER
 * =============================
 * Immutable rules that govern the entire system.
 * These cannot be bypassed or modified at runtime.
 */

// ============================================================================
// AUTONOMY TIERS - Progressive trust levels
// ============================================================================

export enum AutonomyTier {
  /** Level 0: Watch and learn only. No actions permitted. */
  OBSERVE = 'OBSERVE',
  
  /** Level 1: Can recommend actions but cannot execute. Human must approve. */
  RECOMMEND = 'RECOMMEND',
  
  /** Level 2: Can execute within strict guardrails. Auto-halts on anomalies. */
  GUARDED_AUTONOMOUS = 'GUARDED_AUTONOMOUS',
  
  /** Level 3: Full autonomy within defined risk envelope. Reserved for proven strategies. */
  FULL_AUTONOMOUS = 'FULL_AUTONOMOUS',
}

export const AUTONOMY_HIERARCHY = [
  AutonomyTier.OBSERVE,
  AutonomyTier.RECOMMEND,
  AutonomyTier.GUARDED_AUTONOMOUS,
  AutonomyTier.FULL_AUTONOMOUS,
] as const;

export interface AutonomyTransitionRule {
  from: AutonomyTier;
  to: AutonomyTier;
  requirements: {
    minSuccessfulDecisions: number;
    minTimeInCurrentTier: number; // milliseconds
    maxDrawdownPercent: number;
    requiresHumanApproval: boolean;
  };
}

// Tier advancement rules - NO SKIPPING ALLOWED
export const AUTONOMY_TRANSITION_RULES: AutonomyTransitionRule[] = [
  {
    from: AutonomyTier.OBSERVE,
    to: AutonomyTier.RECOMMEND,
    requirements: {
      minSuccessfulDecisions: 50,
      minTimeInCurrentTier: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxDrawdownPercent: 0, // No drawdown at observe level
      requiresHumanApproval: true,
    },
  },
  {
    from: AutonomyTier.RECOMMEND,
    to: AutonomyTier.GUARDED_AUTONOMOUS,
    requirements: {
      minSuccessfulDecisions: 100,
      minTimeInCurrentTier: 14 * 24 * 60 * 60 * 1000, // 14 days
      maxDrawdownPercent: 5,
      requiresHumanApproval: true,
    },
  },
  {
    from: AutonomyTier.GUARDED_AUTONOMOUS,
    to: AutonomyTier.FULL_AUTONOMOUS,
    requirements: {
      minSuccessfulDecisions: 500,
      minTimeInCurrentTier: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxDrawdownPercent: 10,
      requiresHumanApproval: true,
    },
  },
];

// ============================================================================
// DECISION TRACEABILITY - Every action must have this chain
// ============================================================================

export interface DecisionTrace {
  /** Unique identifier for this decision */
  id: string;
  
  /** Timestamp when decision was initiated */
  timestamp: number;
  
  /** The inputs that triggered this decision */
  inputs: {
    source: string;
    data: Record<string, unknown>;
    receivedAt: number;
  }[];
  
  /** Context at the time of decision */
  context: {
    currentTier: AutonomyTier;
    worldState: Record<string, unknown>;
    activeConstraints: string[];
    recentHistory: string[]; // Last N decision IDs
  };
  
  /** Reasoning chain - how we got from inputs to intent */
  reasoning: {
    step: number;
    description: string;
    factors: Record<string, number>; // Weighted factors
    confidence: number;
  }[];
  
  /** Simulation results before execution */
  simulation: {
    expectedOutcome: Record<string, unknown>;
    riskAssessment: {
      category: string;
      probability: number;
      impact: number;
    }[];
    worstCase: Record<string, unknown>;
    bestCase: Record<string, unknown>;
  };
  
  /** Constraint validation */
  constraintCheck: {
    constraint: string;
    passed: boolean;
    value?: number;
    threshold?: number;
    reason?: string;
  }[];
  
  /** Execution details (if executed) */
  execution?: {
    executedAt: number;
    executor: string;
    actualAction: Record<string, unknown>;
    status: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'ROLLED_BACK';
  };
  
  /** Outcome (filled in after execution completes) */
  outcome?: {
    recordedAt: number;
    actualResult: Record<string, unknown>;
    expectedVsActual: number; // -1 to 1, where 0 is exact match
    learnings: string[];
  };
}

// ============================================================================
// SURVIVABILITY CONSTRAINTS - Capital/Data/Reputation before Growth
// ============================================================================

export interface SurvivabilityConstraints {
  /** Maximum portfolio drawdown before all trading halts */
  maxDrawdownPercent: number;
  
  /** Maximum single position size as percent of portfolio */
  maxPositionSizePercent: number;
  
  /** Maximum daily loss before halting */
  maxDailyLossPercent: number;
  
  /** Minimum cash reserve that must be maintained */
  minCashReservePercent: number;
  
  /** Maximum correlation allowed between positions */
  maxPositionCorrelation: number;
  
  /** Time to wait after a loss before new trades (ms) */
  cooldownAfterLossMs: number;
  
  /** Number of consecutive losses before mandatory review */
  consecutiveLossLimit: number;
}

export const DEFAULT_SURVIVABILITY_CONSTRAINTS: SurvivabilityConstraints = {
  maxDrawdownPercent: 20,
  maxPositionSizePercent: 5,
  maxDailyLossPercent: 3,
  minCashReservePercent: 20,
  maxPositionCorrelation: 0.7,
  cooldownAfterLossMs: 60 * 60 * 1000, // 1 hour
  consecutiveLossLimit: 3,
};

// ============================================================================
// FAIL-CLOSED BEHAVIOR - Degrade gracefully
// ============================================================================

export enum DegradationLevel {
  NORMAL = 'NORMAL',
  REDUCED = 'REDUCED',
  MINIMAL = 'MINIMAL',
  EMERGENCY = 'EMERGENCY',
}

export interface DegradationPolicy {
  level: DegradationLevel;
  triggers: string[];
  actions: {
    closeNewPositions: boolean;
    reducePositionSizes: boolean;
    increaseHumanOversight: boolean;
    haltNonEssential: boolean;
    notifyHuman: boolean;
  };
  autoRecovery: {
    enabled: boolean;
    conditions: string[];
    waitTimeMs: number;
  };
}

export const DEGRADATION_POLICIES: Record<DegradationLevel, DegradationPolicy> = {
  [DegradationLevel.NORMAL]: {
    level: DegradationLevel.NORMAL,
    triggers: [],
    actions: {
      closeNewPositions: false,
      reducePositionSizes: false,
      increaseHumanOversight: false,
      haltNonEssential: false,
      notifyHuman: false,
    },
    autoRecovery: { enabled: true, conditions: [], waitTimeMs: 0 },
  },
  [DegradationLevel.REDUCED]: {
    level: DegradationLevel.REDUCED,
    triggers: ['api_latency_high', 'data_feed_delayed', 'single_loss_threshold'],
    actions: {
      closeNewPositions: false,
      reducePositionSizes: true,
      increaseHumanOversight: true,
      haltNonEssential: false,
      notifyHuman: true,
    },
    autoRecovery: { 
      enabled: true, 
      conditions: ['metrics_normal_5min'], 
      waitTimeMs: 5 * 60 * 1000 
    },
  },
  [DegradationLevel.MINIMAL]: {
    level: DegradationLevel.MINIMAL,
    triggers: ['consecutive_losses', 'drawdown_warning', 'data_feed_stale'],
    actions: {
      closeNewPositions: true,
      reducePositionSizes: true,
      increaseHumanOversight: true,
      haltNonEssential: true,
      notifyHuman: true,
    },
    autoRecovery: { 
      enabled: true, 
      conditions: ['human_review', 'metrics_normal_15min'], 
      waitTimeMs: 15 * 60 * 1000 
    },
  },
  [DegradationLevel.EMERGENCY]: {
    level: DegradationLevel.EMERGENCY,
    triggers: ['max_drawdown_reached', 'data_feed_offline', 'execution_failure'],
    actions: {
      closeNewPositions: true,
      reducePositionSizes: true,
      increaseHumanOversight: true,
      haltNonEssential: true,
      notifyHuman: true,
    },
    autoRecovery: { 
      enabled: false, 
      conditions: ['human_manual_recovery'], 
      waitTimeMs: 0 
    },
  },
};

// ============================================================================
// CONSTITUTION ENFORCER - Validates all decisions against constitution
// ============================================================================

export class ConstitutionEnforcer {
  private currentTier: AutonomyTier = AutonomyTier.OBSERVE;
  private degradationLevel: DegradationLevel = DegradationLevel.NORMAL;
  private constraints: SurvivabilityConstraints;
  private tierStartTime: number;
  private successfulDecisions: number = 0;

  constructor(constraints: SurvivabilityConstraints = DEFAULT_SURVIVABILITY_CONSTRAINTS) {
    this.constraints = constraints;
    this.tierStartTime = Date.now();
  }

  /**
   * Check if an action is permitted under current autonomy tier
   */
  canExecute(actionType: 'observe' | 'recommend' | 'execute_guarded' | 'execute_full'): boolean {
    const tierIndex = AUTONOMY_HIERARCHY.indexOf(this.currentTier);
    
    switch (actionType) {
      case 'observe':
        return tierIndex >= 0; // All tiers can observe
      case 'recommend':
        return tierIndex >= 1; // RECOMMEND and above
      case 'execute_guarded':
        return tierIndex >= 2; // GUARDED_AUTONOMOUS and above
      case 'execute_full':
        return tierIndex >= 3; // FULL_AUTONOMOUS only
      default:
        return false;
    }
  }

  /**
   * Validate a decision against survivability constraints
   */
  validateConstraints(decision: {
    positionSizePercent: number;
    currentDrawdownPercent: number;
    dailyLossPercent: number;
    cashReservePercent: number;
    correlationWithExisting: number;
    consecutiveLosses: number;
    timeSinceLastLoss: number;
  }): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    if (decision.positionSizePercent > this.constraints.maxPositionSizePercent) {
      violations.push(`Position size ${decision.positionSizePercent}% exceeds max ${this.constraints.maxPositionSizePercent}%`);
    }

    if (decision.currentDrawdownPercent > this.constraints.maxDrawdownPercent) {
      violations.push(`Drawdown ${decision.currentDrawdownPercent}% exceeds max ${this.constraints.maxDrawdownPercent}%`);
    }

    if (decision.dailyLossPercent > this.constraints.maxDailyLossPercent) {
      violations.push(`Daily loss ${decision.dailyLossPercent}% exceeds max ${this.constraints.maxDailyLossPercent}%`);
    }

    if (decision.cashReservePercent < this.constraints.minCashReservePercent) {
      violations.push(`Cash reserve ${decision.cashReservePercent}% below min ${this.constraints.minCashReservePercent}%`);
    }

    if (decision.correlationWithExisting > this.constraints.maxPositionCorrelation) {
      violations.push(`Position correlation ${decision.correlationWithExisting} exceeds max ${this.constraints.maxPositionCorrelation}`);
    }

    if (decision.consecutiveLosses >= this.constraints.consecutiveLossLimit) {
      violations.push(`Consecutive losses ${decision.consecutiveLosses} at/above limit ${this.constraints.consecutiveLossLimit}`);
    }

    if (decision.timeSinceLastLoss < this.constraints.cooldownAfterLossMs && decision.consecutiveLosses > 0) {
      violations.push(`Cooldown period not elapsed: ${decision.timeSinceLastLoss}ms < ${this.constraints.cooldownAfterLossMs}ms`);
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * Check if tier advancement is possible
   */
  canAdvanceTier(): { canAdvance: boolean; reason: string; nextTier?: AutonomyTier } {
    const currentIndex = AUTONOMY_HIERARCHY.indexOf(this.currentTier);
    
    if (currentIndex >= AUTONOMY_HIERARCHY.length - 1) {
      return { canAdvance: false, reason: 'Already at maximum autonomy tier' };
    }

    const nextTier = AUTONOMY_HIERARCHY[currentIndex + 1];
    const rule = AUTONOMY_TRANSITION_RULES.find(r => r.from === this.currentTier && r.to === nextTier);

    if (!rule) {
      return { canAdvance: false, reason: 'No transition rule found' };
    }

    const timeInTier = Date.now() - this.tierStartTime;

    if (this.successfulDecisions < rule.requirements.minSuccessfulDecisions) {
      return { 
        canAdvance: false, 
        reason: `Need ${rule.requirements.minSuccessfulDecisions - this.successfulDecisions} more successful decisions`,
        nextTier 
      };
    }

    if (timeInTier < rule.requirements.minTimeInCurrentTier) {
      const remainingDays = Math.ceil((rule.requirements.minTimeInCurrentTier - timeInTier) / (24 * 60 * 60 * 1000));
      return { 
        canAdvance: false, 
        reason: `Need ${remainingDays} more days in current tier`,
        nextTier 
      };
    }

    return { canAdvance: true, reason: 'All requirements met', nextTier };
  }

  /**
   * Record a successful decision
   */
  recordSuccess(): void {
    this.successfulDecisions++;
  }

  /**
   * Get current state
   */
  getState(): {
    tier: AutonomyTier;
    degradationLevel: DegradationLevel;
    successfulDecisions: number;
    timeInTier: number;
    constraints: SurvivabilityConstraints;
  } {
    return {
      tier: this.currentTier,
      degradationLevel: this.degradationLevel,
      successfulDecisions: this.successfulDecisions,
      timeInTier: Date.now() - this.tierStartTime,
      constraints: { ...this.constraints },
    };
  }

  /**
   * Set degradation level
   */
  setDegradationLevel(level: DegradationLevel): DegradationPolicy {
    this.degradationLevel = level;
    return DEGRADATION_POLICIES[level];
  }

  /**
   * Advance to next tier (requires external approval check)
   */
  advanceTier(): boolean {
    const { canAdvance, nextTier } = this.canAdvanceTier();
    if (canAdvance && nextTier) {
      this.currentTier = nextTier;
      this.tierStartTime = Date.now();
      this.successfulDecisions = 0;
      return true;
    }
    return false;
  }

  /**
   * Force downgrade tier (for violations or manual intervention)
   */
  downgradeTier(reason: string): AutonomyTier {
    const currentIndex = AUTONOMY_HIERARCHY.indexOf(this.currentTier);
    if (currentIndex > 0) {
      this.currentTier = AUTONOMY_HIERARCHY[currentIndex - 1];
      this.tierStartTime = Date.now();
      this.successfulDecisions = 0;
      console.warn(`[CONSTITUTION] Tier downgraded to ${this.currentTier}: ${reason}`);
    }
    return this.currentTier;
  }
}

export default ConstitutionEnforcer;

/**
 * NOVA NEXUS RISK ENGINE
 * =======================
 * Survivability-first risk management system.
 * Constraints cannot be overridden by intelligence - this is by design.
 * 
 * AXIOM 2: Intelligence Never Executes
 * - Intelligence proposes. Risk enforces. Execution obeys.
 * - The risk engine has absolute veto authority.
 * 
 * AXIOM 5: Governance Is Above Capability
 * - Hard limits are constitutional - they cannot be bypassed
 * - Soft limits can be adjusted through governance proposals only
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// CONSTRAINT TYPES
// ============================================================================

export enum ConstraintType {
  // Hard limits - CANNOT be overridden under any circumstance
  HARD_MAX_POSITION_SIZE = 'HARD_MAX_POSITION_SIZE',
  HARD_MAX_PORTFOLIO_DRAWDOWN = 'HARD_MAX_PORTFOLIO_DRAWDOWN',
  HARD_MAX_SINGLE_LOSS = 'HARD_MAX_SINGLE_LOSS',
  HARD_MIN_CASH_RESERVE = 'HARD_MIN_CASH_RESERVE',
  HARD_MAX_LEVERAGE = 'HARD_MAX_LEVERAGE',
  HARD_MAX_CONCENTRATION = 'HARD_MAX_CONCENTRATION',
  HARD_DAILY_LOSS_LIMIT = 'HARD_DAILY_LOSS_LIMIT',
  
  // Soft limits - can be adjusted through governance
  SOFT_TARGET_VOLATILITY = 'SOFT_TARGET_VOLATILITY',
  SOFT_CORRELATION_LIMIT = 'SOFT_CORRELATION_LIMIT',
  SOFT_SECTOR_EXPOSURE = 'SOFT_SECTOR_EXPOSURE',
  SOFT_POSITION_TIMEOUT = 'SOFT_POSITION_TIMEOUT',
  SOFT_PROFIT_TARGET = 'SOFT_PROFIT_TARGET',
  
  // Dynamic limits - adjust based on conditions
  DYNAMIC_REGIME_MULTIPLIER = 'DYNAMIC_REGIME_MULTIPLIER',
  DYNAMIC_VOLATILITY_SCALAR = 'DYNAMIC_VOLATILITY_SCALAR',
  DYNAMIC_DRAWDOWN_REDUCTION = 'DYNAMIC_DRAWDOWN_REDUCTION',
}

export interface Constraint {
  id: string;
  type: ConstraintType;
  name: string;
  description: string;
  
  /** The constraint value */
  value: number;
  
  /** Unit of measurement */
  unit: 'percent' | 'absolute' | 'ratio' | 'days' | 'multiplier';
  
  /** Is this a hard constraint? */
  isHard: boolean;
  
  /** Can this be temporarily relaxed? (only for soft constraints) */
  canRelax: boolean;
  
  /** Current active value (may differ from base value due to dynamics) */
  activeValue: number;
  
  /** Why is active value different from base? */
  adjustmentReason?: string;
  
  /** When was this last triggered? */
  lastTriggered?: number;
  
  /** How many times has this been triggered? */
  triggerCount: number;
  
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// RISK ENVELOPE
// ============================================================================

export interface RiskEnvelope {
  id: string;
  timestamp: number;
  
  /** Maximum position size allowed right now */
  maxPositionSize: number;
  
  /** Maximum portfolio exposure */
  maxExposure: number;
  
  /** Risk budget remaining today */
  remainingRiskBudget: number;
  
  /** Drawdown room before hard stop */
  drawdownRoom: number;
  
  /** Current portfolio risk score (0-100) */
  riskScore: number;
  
  /** Risk state */
  state: 'normal' | 'elevated' | 'high' | 'critical' | 'halted';
  
  /** What constraints are most binding? */
  bindingConstraints: Array<{
    constraintId: string;
    constraintName: string;
    utilizationPercent: number;
  }>;
  
  /** Recommendations based on current envelope */
  recommendations: string[];
}

// ============================================================================
// RISK EVENTS
// ============================================================================

export enum RiskEventType {
  CONSTRAINT_TRIGGERED = 'CONSTRAINT_TRIGGERED',
  CONSTRAINT_BREACHED = 'CONSTRAINT_BREACHED',
  LIMIT_APPROACHED = 'LIMIT_APPROACHED',
  POSITION_VETOED = 'POSITION_VETOED',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
  RISK_STATE_CHANGE = 'RISK_STATE_CHANGE',
  DRAWDOWN_WARNING = 'DRAWDOWN_WARNING',
  CORRELATION_SPIKE = 'CORRELATION_SPIKE',
}

export interface RiskEvent {
  id: string;
  type: RiskEventType;
  timestamp: number;
  
  /** Severity level */
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  
  /** Description */
  description: string;
  
  /** Related constraint */
  constraintId?: string;
  
  /** Action taken */
  action: string;
  
  /** Was this automatically handled? */
  automaticResponse: boolean;
  
  /** Resolution status */
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
}

// ============================================================================
// POSITION RISK CHECK
// ============================================================================

export interface PositionRequest {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  price: number;
  stopLoss?: number;
  strategy?: string;
}

export interface RiskCheckResult {
  approved: boolean;
  
  /** If not approved, why? */
  rejectionReason?: string;
  
  /** Which constraints blocked it? */
  violatedConstraints: string[];
  
  /** If approved, any modifications required? */
  modifications?: {
    adjustedSize?: number;
    requiredStopLoss?: number;
    maxHoldingPeriod?: number;
  };
  
  /** Risk metrics for this position */
  metrics: {
    positionRisk: number;
    portfolioImpact: number;
    drawdownContribution: number;
    correlationImpact: number;
  };
  
  /** Warnings even if approved */
  warnings: string[];
}

// ============================================================================
// PORTFOLIO STATE
// ============================================================================

export interface PortfolioRiskState {
  totalValue: number;
  cashValue: number;
  exposedValue: number;
  
  /** Current drawdown from peak */
  currentDrawdown: number;
  
  /** Peak value */
  peakValue: number;
  
  /** Daily P&L */
  dailyPnL: number;
  
  /** Daily P&L as percent */
  dailyPnLPercent: number;
  
  /** Current leverage */
  leverage: number;
  
  /** Number of open positions */
  openPositions: number;
  
  /** Largest position as percent of portfolio */
  largestPositionPercent: number;
  
  /** Concentration by sector/type */
  concentration: Record<string, number>;
  
  /** Estimated portfolio volatility */
  estimatedVolatility: number;
  
  /** Time since last update */
  lastUpdate: number;
}

// ============================================================================
// RISK ENGINE
// ============================================================================

export class RiskEngine {
  private constraints: Map<string, Constraint> = new Map();
  private events: RiskEvent[] = [];
  private currentEnvelope: RiskEnvelope | null = null;
  private portfolioState: PortfolioRiskState;
  
  /** Is the system halted? */
  private halted: boolean = false;
  private haltReason?: string;
  
  /** Daily tracking */
  private dailyLoss: number = 0;
  private dailyStartValue: number = 0;
  private lastDailyReset: number = Date.now();

  constructor(initialCapital: number = 100000) {
    this.portfolioState = {
      totalValue: initialCapital,
      cashValue: initialCapital,
      exposedValue: 0,
      currentDrawdown: 0,
      peakValue: initialCapital,
      dailyPnL: 0,
      dailyPnLPercent: 0,
      leverage: 0,
      openPositions: 0,
      largestPositionPercent: 0,
      concentration: {},
      estimatedVolatility: 0,
      lastUpdate: Date.now(),
    };
    this.dailyStartValue = initialCapital;
    this.initializeConstraints();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeConstraints(): void {
    const defaultConstraints: Array<Omit<Constraint, 'id' | 'activeValue' | 'triggerCount' | 'createdAt' | 'updatedAt'>> = [
      // HARD LIMITS - These CANNOT be overridden
      {
        type: ConstraintType.HARD_MAX_POSITION_SIZE,
        name: 'Maximum Position Size',
        description: 'No single position can exceed this percentage of portfolio',
        value: 10,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN,
        name: 'Maximum Portfolio Drawdown',
        description: 'Trading halts if drawdown exceeds this level',
        value: 20,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_MAX_SINGLE_LOSS,
        name: 'Maximum Single Trade Loss',
        description: 'No single trade can lose more than this percentage',
        value: 2,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_MIN_CASH_RESERVE,
        name: 'Minimum Cash Reserve',
        description: 'Always maintain this percentage in cash',
        value: 10,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_MAX_LEVERAGE,
        name: 'Maximum Leverage',
        description: 'Portfolio leverage cannot exceed this ratio',
        value: 1.0,
        unit: 'ratio',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_MAX_CONCENTRATION,
        name: 'Maximum Sector Concentration',
        description: 'No sector can exceed this percentage of portfolio',
        value: 30,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      {
        type: ConstraintType.HARD_DAILY_LOSS_LIMIT,
        name: 'Daily Loss Limit',
        description: 'Trading halts for the day if daily loss exceeds this',
        value: 5,
        unit: 'percent',
        isHard: true,
        canRelax: false,
      },
      
      // SOFT LIMITS - Can be adjusted through governance
      {
        type: ConstraintType.SOFT_TARGET_VOLATILITY,
        name: 'Target Portfolio Volatility',
        description: 'Target annualized volatility for the portfolio',
        value: 15,
        unit: 'percent',
        isHard: false,
        canRelax: true,
      },
      {
        type: ConstraintType.SOFT_CORRELATION_LIMIT,
        name: 'Position Correlation Limit',
        description: 'Maximum allowed correlation between positions',
        value: 0.7,
        unit: 'ratio',
        isHard: false,
        canRelax: true,
      },
      {
        type: ConstraintType.SOFT_SECTOR_EXPOSURE,
        name: 'Target Sector Exposure',
        description: 'Soft target for maximum sector exposure',
        value: 25,
        unit: 'percent',
        isHard: false,
        canRelax: true,
      },
      {
        type: ConstraintType.SOFT_POSITION_TIMEOUT,
        name: 'Maximum Position Duration',
        description: 'Review positions held longer than this',
        value: 30,
        unit: 'days',
        isHard: false,
        canRelax: true,
      },
    ];

    for (const config of defaultConstraints) {
      const constraint: Constraint = {
        id: uuidv4(),
        ...config,
        activeValue: config.value,
        triggerCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.constraints.set(constraint.id, constraint);
    }
  }

  // ==========================================================================
  // CORE RISK CHECKS
  // ==========================================================================

  /**
   * Check if a position request passes all risk constraints
   * This is the main entry point for risk validation
   */
  checkPosition(request: PositionRequest): RiskCheckResult {
    // System halt check
    if (this.halted) {
      return {
        approved: false,
        rejectionReason: `System halted: ${this.haltReason}`,
        violatedConstraints: ['SYSTEM_HALT'],
        metrics: { positionRisk: 0, portfolioImpact: 0, drawdownContribution: 0, correlationImpact: 0 },
        warnings: [],
      };
    }

    const violations: string[] = [];
    const warnings: string[] = [];
    let adjustedSize = request.size;
    let requiredStopLoss = request.stopLoss;

    const positionValue = request.size * request.price;
    const positionPercent = (positionValue / this.portfolioState.totalValue) * 100;

    // Check hard constraints
    
    // 1. Position size limit
    const maxPositionSize = this.getConstraintValue(ConstraintType.HARD_MAX_POSITION_SIZE);
    if (positionPercent > maxPositionSize) {
      violations.push('HARD_MAX_POSITION_SIZE');
      // Calculate adjusted size
      adjustedSize = (maxPositionSize / 100) * this.portfolioState.totalValue / request.price;
    }

    // 2. Cash reserve check
    const minCashReserve = this.getConstraintValue(ConstraintType.HARD_MIN_CASH_RESERVE);
    const cashAfterTrade = this.portfolioState.cashValue - positionValue;
    const cashPercentAfter = (cashAfterTrade / this.portfolioState.totalValue) * 100;
    if (cashPercentAfter < minCashReserve) {
      violations.push('HARD_MIN_CASH_RESERVE');
    }

    // 3. Leverage check
    const maxLeverage = this.getConstraintValue(ConstraintType.HARD_MAX_LEVERAGE);
    const newExposure = this.portfolioState.exposedValue + positionValue;
    const newLeverage = newExposure / this.portfolioState.totalValue;
    if (newLeverage > maxLeverage) {
      violations.push('HARD_MAX_LEVERAGE');
    }

    // 4. Daily loss limit check
    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    if (Math.abs(this.portfolioState.dailyPnLPercent) >= dailyLossLimit && this.portfolioState.dailyPnLPercent < 0) {
      violations.push('HARD_DAILY_LOSS_LIMIT');
    }

    // 5. Drawdown check
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    if (this.portfolioState.currentDrawdown >= maxDrawdown) {
      violations.push('HARD_MAX_PORTFOLIO_DRAWDOWN');
    }

    // 6. Single loss check (requires stop loss)
    const maxSingleLoss = this.getConstraintValue(ConstraintType.HARD_MAX_SINGLE_LOSS);
    const maxLossAmount = (maxSingleLoss / 100) * this.portfolioState.totalValue;
    
    if (!request.stopLoss) {
      // Calculate required stop loss
      const maxLossPerShare = maxLossAmount / request.size;
      if (request.side === 'long') {
        requiredStopLoss = request.price - maxLossPerShare;
      } else {
        requiredStopLoss = request.price + maxLossPerShare;
      }
      warnings.push('Stop loss required - calculated based on max single loss limit');
    } else {
      // Verify existing stop loss is adequate
      const potentialLoss = request.side === 'long'
        ? (request.price - request.stopLoss) * request.size
        : (request.stopLoss - request.price) * request.size;
      
      if (potentialLoss > maxLossAmount) {
        violations.push('HARD_MAX_SINGLE_LOSS');
        warnings.push('Stop loss too wide - tighten stop or reduce size');
      }
    }

    // Calculate risk metrics
    const positionRisk = positionPercent;
    const portfolioImpact = positionValue / this.portfolioState.totalValue;
    const drawdownContribution = this.calculateDrawdownContribution(positionValue);
    const correlationImpact = 0; // Would need position data to calculate

    // Additional warnings for soft limits
    const targetVol = this.getConstraintValue(ConstraintType.SOFT_TARGET_VOLATILITY);
    if (this.portfolioState.estimatedVolatility > targetVol * 0.9) {
      warnings.push('Approaching target volatility limit');
    }

    // Record event if any hard violations
    if (violations.length > 0) {
      this.recordEvent({
        type: RiskEventType.POSITION_VETOED,
        severity: 'warning',
        description: `Position vetoed: ${violations.join(', ')}`,
        action: 'Position request rejected',
        automaticResponse: true,
        resolved: true,
        resolution: 'Rejected by risk engine',
      });

      // Mark constraints as triggered
      for (const violation of violations) {
        this.triggerConstraint(violation);
      }
    }

    return {
      approved: violations.length === 0,
      rejectionReason: violations.length > 0 ? `Violated: ${violations.join(', ')}` : undefined,
      violatedConstraints: violations,
      modifications: violations.length === 0 ? {
        adjustedSize: adjustedSize !== request.size ? adjustedSize : undefined,
        requiredStopLoss: requiredStopLoss !== request.stopLoss ? requiredStopLoss : undefined,
      } : undefined,
      metrics: {
        positionRisk,
        portfolioImpact,
        drawdownContribution,
        correlationImpact,
      },
      warnings,
    };
  }

  /**
   * Emergency halt - stops all trading immediately
   */
  emergencyHalt(reason: string): void {
    this.halted = true;
    this.haltReason = reason;

    this.recordEvent({
      type: RiskEventType.EMERGENCY_STOP,
      severity: 'emergency',
      description: `Emergency halt activated: ${reason}`,
      action: 'All trading halted',
      automaticResponse: true,
      resolved: false,
    });

    console.error(`[RiskEngine] EMERGENCY HALT: ${reason}`);
  }

  /**
   * Resume trading after halt (requires explicit action)
   */
  resumeTrading(authorizedBy: string): boolean {
    if (!this.halted) return true;

    // Check if it's safe to resume
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    if (this.portfolioState.currentDrawdown >= maxDrawdown * 0.9) {
      console.warn('[RiskEngine] Cannot resume - still near drawdown limit');
      return false;
    }

    this.halted = false;
    this.haltReason = undefined;

    this.recordEvent({
      type: RiskEventType.RISK_STATE_CHANGE,
      severity: 'info',
      description: `Trading resumed by ${authorizedBy}`,
      action: 'Trading resumed',
      automaticResponse: false,
      resolved: true,
      resolution: 'Manual resume',
    });

    return true;
  }

  // ==========================================================================
  // RISK ENVELOPE
  // ==========================================================================

  /**
   * Generate current risk envelope
   */
  generateEnvelope(): RiskEnvelope {
    // Calculate binding constraints
    const bindingConstraints = this.findBindingConstraints();

    // Determine risk state
    const state = this.determineRiskState();

    // Calculate available capacity
    const maxPositionSize = this.getConstraintValue(ConstraintType.HARD_MAX_POSITION_SIZE);
    const maxExposure = this.portfolioState.totalValue * this.getConstraintValue(ConstraintType.HARD_MAX_LEVERAGE);
    const remainingExposure = maxExposure - this.portfolioState.exposedValue;
    
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    const drawdownRoom = maxDrawdown - this.portfolioState.currentDrawdown;

    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    const remainingDailyBudget = dailyLossLimit - Math.abs(Math.min(0, this.portfolioState.dailyPnLPercent));

    // Risk score (0-100, higher = more risk)
    const riskScore = this.calculateRiskScore();

    // Generate recommendations
    const recommendations = this.generateRecommendations(state, riskScore, bindingConstraints);

    const envelope: RiskEnvelope = {
      id: uuidv4(),
      timestamp: Date.now(),
      maxPositionSize: (maxPositionSize / 100) * this.portfolioState.totalValue,
      maxExposure: Math.max(0, remainingExposure),
      remainingRiskBudget: remainingDailyBudget,
      drawdownRoom,
      riskScore,
      state,
      bindingConstraints,
      recommendations,
    };

    this.currentEnvelope = envelope;
    return envelope;
  }

  /**
   * Find which constraints are most utilized
   */
  private findBindingConstraints(): RiskEnvelope['bindingConstraints'] {
    const binding: RiskEnvelope['bindingConstraints'] = [];

    // Position size utilization
    const maxPosSize = this.getConstraintValue(ConstraintType.HARD_MAX_POSITION_SIZE);
    const posUtilization = (this.portfolioState.largestPositionPercent / maxPosSize) * 100;
    if (posUtilization > 50) {
      const constraint = this.getConstraintByType(ConstraintType.HARD_MAX_POSITION_SIZE);
      if (constraint) {
        binding.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          utilizationPercent: posUtilization,
        });
      }
    }

    // Drawdown utilization
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    const drawdownUtilization = (this.portfolioState.currentDrawdown / maxDrawdown) * 100;
    if (drawdownUtilization > 30) {
      const constraint = this.getConstraintByType(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
      if (constraint) {
        binding.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          utilizationPercent: drawdownUtilization,
        });
      }
    }

    // Leverage utilization
    const maxLeverage = this.getConstraintValue(ConstraintType.HARD_MAX_LEVERAGE);
    const leverageUtilization = (this.portfolioState.leverage / maxLeverage) * 100;
    if (leverageUtilization > 50) {
      const constraint = this.getConstraintByType(ConstraintType.HARD_MAX_LEVERAGE);
      if (constraint) {
        binding.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          utilizationPercent: leverageUtilization,
        });
      }
    }

    // Daily loss utilization
    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    const dailyLossUtilization = (Math.abs(Math.min(0, this.portfolioState.dailyPnLPercent)) / dailyLossLimit) * 100;
    if (dailyLossUtilization > 30) {
      const constraint = this.getConstraintByType(ConstraintType.HARD_DAILY_LOSS_LIMIT);
      if (constraint) {
        binding.push({
          constraintId: constraint.id,
          constraintName: constraint.name,
          utilizationPercent: dailyLossUtilization,
        });
      }
    }

    return binding.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  }

  /**
   * Determine overall risk state
   */
  private determineRiskState(): RiskEnvelope['state'] {
    if (this.halted) return 'halted';

    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    const drawdownPercent = (this.portfolioState.currentDrawdown / maxDrawdown) * 100;

    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    const dailyLossPercent = (Math.abs(Math.min(0, this.portfolioState.dailyPnLPercent)) / dailyLossLimit) * 100;

    const maxRiskPercent = Math.max(drawdownPercent, dailyLossPercent);

    if (maxRiskPercent >= 90) return 'critical';
    if (maxRiskPercent >= 70) return 'high';
    if (maxRiskPercent >= 40) return 'elevated';
    return 'normal';
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(): number {
    let score = 0;

    // Drawdown contribution (0-40)
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    score += (this.portfolioState.currentDrawdown / maxDrawdown) * 40;

    // Leverage contribution (0-20)
    const maxLeverage = this.getConstraintValue(ConstraintType.HARD_MAX_LEVERAGE);
    score += (this.portfolioState.leverage / maxLeverage) * 20;

    // Concentration contribution (0-20)
    score += (this.portfolioState.largestPositionPercent / 100) * 20;

    // Daily loss contribution (0-20)
    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    const dailyLossRatio = Math.abs(Math.min(0, this.portfolioState.dailyPnLPercent)) / dailyLossLimit;
    score += dailyLossRatio * 20;

    return Math.min(100, Math.round(score));
  }

  /**
   * Generate recommendations based on current state
   */
  private generateRecommendations(
    state: RiskEnvelope['state'],
    riskScore: number,
    bindingConstraints: RiskEnvelope['bindingConstraints']
  ): string[] {
    const recommendations: string[] = [];

    if (state === 'critical') {
      recommendations.push('CRITICAL: Consider reducing exposure immediately');
      recommendations.push('Review all open positions for potential exit');
    } else if (state === 'high') {
      recommendations.push('HIGH RISK: No new positions recommended');
      recommendations.push('Consider profit-taking on winners');
    } else if (state === 'elevated') {
      recommendations.push('Reduce position sizes for new trades');
      recommendations.push('Ensure tight stop losses on all positions');
    }

    // Specific constraint recommendations
    for (const bc of bindingConstraints) {
      if (bc.utilizationPercent > 80) {
        recommendations.push(`${bc.constraintName} at ${bc.utilizationPercent.toFixed(0)}% - approaching limit`);
      }
    }

    // Risk score recommendations
    if (riskScore > 70) {
      recommendations.push('Portfolio risk elevated - consider rebalancing');
    }

    return recommendations;
  }

  // ==========================================================================
  // CONSTRAINT MANAGEMENT
  // ==========================================================================

  /**
   * Get constraint value by type
   */
  private getConstraintValue(type: ConstraintType): number {
    const constraint = Array.from(this.constraints.values())
      .find(c => c.type === type);
    return constraint?.activeValue ?? 0;
  }

  /**
   * Get constraint by type
   */
  private getConstraintByType(type: ConstraintType): Constraint | undefined {
    return Array.from(this.constraints.values()).find(c => c.type === type);
  }

  /**
   * Trigger a constraint (record that it was hit)
   */
  private triggerConstraint(typeOrId: string): void {
    const constraint = this.constraints.get(typeOrId) ?? 
      Array.from(this.constraints.values()).find(c => c.type === typeOrId);
    
    if (constraint) {
      constraint.triggerCount++;
      constraint.lastTriggered = Date.now();
      constraint.updatedAt = Date.now();
    }
  }

  /**
   * Calculate how much a position would contribute to drawdown
   */
  private calculateDrawdownContribution(positionValue: number): number {
    // Simplified - assumes worst case scenario
    return (positionValue / this.portfolioState.totalValue) * 100;
  }

  // ==========================================================================
  // PORTFOLIO STATE UPDATES
  // ==========================================================================

  /**
   * Update portfolio state (called externally when positions change)
   */
  updatePortfolioState(update: Partial<PortfolioRiskState>): void {
    this.portfolioState = {
      ...this.portfolioState,
      ...update,
      lastUpdate: Date.now(),
    };

    // Update peak value
    if (this.portfolioState.totalValue > this.portfolioState.peakValue) {
      this.portfolioState.peakValue = this.portfolioState.totalValue;
    }

    // Calculate current drawdown
    this.portfolioState.currentDrawdown = 
      ((this.portfolioState.peakValue - this.portfolioState.totalValue) / this.portfolioState.peakValue) * 100;

    // Check for automatic halt conditions
    this.checkAutoHalt();

    // Daily reset check
    this.checkDailyReset();
  }

  /**
   * Check if automatic halt should be triggered
   */
  private checkAutoHalt(): void {
    // Drawdown halt
    const maxDrawdown = this.getConstraintValue(ConstraintType.HARD_MAX_PORTFOLIO_DRAWDOWN);
    if (this.portfolioState.currentDrawdown >= maxDrawdown) {
      this.emergencyHalt(`Maximum drawdown exceeded: ${this.portfolioState.currentDrawdown.toFixed(2)}%`);
      return;
    }

    // Daily loss halt
    const dailyLossLimit = this.getConstraintValue(ConstraintType.HARD_DAILY_LOSS_LIMIT);
    if (this.portfolioState.dailyPnLPercent <= -dailyLossLimit) {
      this.emergencyHalt(`Daily loss limit exceeded: ${this.portfolioState.dailyPnLPercent.toFixed(2)}%`);
      return;
    }
  }

  /**
   * Check and perform daily reset
   */
  private checkDailyReset(): void {
    const now = new Date();
    const lastReset = new Date(this.lastDailyReset);
    
    // Check if it's a new trading day (simplified - assumes same timezone)
    if (now.getDate() !== lastReset.getDate()) {
      this.dailyLoss = 0;
      this.dailyStartValue = this.portfolioState.totalValue;
      this.lastDailyReset = Date.now();
      
      // If halted due to daily loss, can potentially resume
      if (this.halted && this.haltReason?.includes('Daily loss limit')) {
        // Don't auto-resume, but log that it's possible
        console.log('[RiskEngine] New trading day - daily loss halt can be cleared');
      }
    }
  }

  // ==========================================================================
  // EVENT RECORDING
  // ==========================================================================

  private recordEvent(event: Omit<RiskEvent, 'id' | 'timestamp'>): void {
    const fullEvent: RiskEvent = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...event,
    };

    this.events.push(fullEvent);

    // Keep last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get all constraints
   */
  getConstraints(): Constraint[] {
    return Array.from(this.constraints.values());
  }

  /**
   * Get hard constraints only
   */
  getHardConstraints(): Constraint[] {
    return Array.from(this.constraints.values()).filter(c => c.isHard);
  }

  /**
   * Get current portfolio state
   */
  getPortfolioState(): PortfolioRiskState {
    return { ...this.portfolioState };
  }

  /**
   * Get current risk envelope
   */
  getCurrentEnvelope(): RiskEnvelope | null {
    return this.currentEnvelope;
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 50): RiskEvent[] {
    return [...this.events].reverse().slice(0, limit);
  }

  /**
   * Is the system currently halted?
   */
  isHalted(): boolean {
    return this.halted;
  }

  /**
   * Get halt reason
   */
  getHaltReason(): string | undefined {
    return this.haltReason;
  }

  /**
   * Get engine stats
   */
  getStats(): {
    isHalted: boolean;
    riskState: string;
    riskScore: number;
    currentDrawdown: number;
    dailyPnL: number;
    constraintCount: number;
    hardConstraintCount: number;
    eventCount: number;
    recentTriggers: number;
  } {
    const envelope = this.currentEnvelope ?? this.generateEnvelope();
    const recentTriggers = Array.from(this.constraints.values())
      .filter(c => c.lastTriggered && c.lastTriggered > Date.now() - 86400000).length;

    return {
      isHalted: this.halted,
      riskState: envelope.state,
      riskScore: envelope.riskScore,
      currentDrawdown: this.portfolioState.currentDrawdown,
      dailyPnL: this.portfolioState.dailyPnLPercent,
      constraintCount: this.constraints.size,
      hardConstraintCount: Array.from(this.constraints.values()).filter(c => c.isHard).length,
      eventCount: this.events.length,
      recentTriggers,
    };
  }
}

export default RiskEngine;

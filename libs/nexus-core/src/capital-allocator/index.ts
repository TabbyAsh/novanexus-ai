/**
 * NOVA NEXUS CAPITAL ALLOCATOR
 * ============================
 * Dynamic capital pool management with risk-adjusted allocation,
 * drawdown protection, and opportunity-based rebalancing.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// CAPITAL POOL TYPES
// ============================================================================

export enum PoolType {
  ACTIVE_OPPORTUNITY = 'ACTIVE_OPPORTUNITY',
  DEFENSIVE_BUFFER = 'DEFENSIVE_BUFFER',
  LONG_HORIZON = 'LONG_HORIZON',
  EXPERIMENTAL = 'EXPERIMENTAL',
  CASH_RESERVE = 'CASH_RESERVE',
}

export interface CapitalPool {
  id: string;
  type: PoolType;
  name: string;
  description: string;
  
  /** Capital allocation */
  allocation: {
    /** Target percentage of total capital */
    targetPercent: number;
    /** Current percentage */
    currentPercent: number;
    /** Absolute amount */
    amount: number;
    /** Minimum allowed */
    minPercent: number;
    /** Maximum allowed */
    maxPercent: number;
  };
  
  /** Risk parameters */
  riskParams: {
    maxDrawdown: number;
    maxPositionSize: number;
    maxCorrelation: number;
    volatilityTarget: number;
  };
  
  /** Performance */
  performance: {
    returnYTD: number;
    returnMTD: number;
    sharpeRatio: number;
    currentDrawdown: number;
    maxDrawdownHit: number;
  };
  
  /** Positions in this pool */
  positions: PoolPosition[];
  
  /** Pool state */
  state: {
    active: boolean;
    locked: boolean;
    lockReason?: string;
    lastRebalanced: number;
  };
}

export interface PoolPosition {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  value: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
  strategyId: string;
  enteredAt: number;
  stopLoss?: number;
  takeProfit?: number;
}

// ============================================================================
// ALLOCATION RULES
// ============================================================================

export interface AllocationRule {
  id: string;
  name: string;
  description: string;
  
  /** Conditions that trigger this rule */
  conditions: {
    type: 'drawdown' | 'volatility' | 'regime' | 'performance' | 'opportunity';
    operator: 'gt' | 'lt' | 'eq' | 'between';
    value: number | [number, number];
    poolType?: PoolType;
  }[];
  
  /** Actions to take */
  actions: {
    type: 'rebalance' | 'increase' | 'decrease' | 'lock' | 'unlock' | 'transfer';
    poolType: PoolType;
    amount?: number;
    targetPoolType?: PoolType;
  }[];
  
  /** Priority (higher = more important) */
  priority: number;
  
  /** Is rule active? */
  active: boolean;
}

// ============================================================================
// ALLOCATION REQUEST/RESULT
// ============================================================================

export interface AllocationRequest {
  symbol: string;
  strategyId: string;
  direction: 'long' | 'short';
  requestedSize: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  conviction: number;
  timeHorizon: 'short' | 'medium' | 'long';
  riskRewardRatio: number;
}

export interface AllocationResult {
  id: string;
  request: AllocationRequest;
  timestamp: number;
  
  /** Approved allocation */
  approved: {
    size: number;
    poolType: PoolType;
    capitalAllocated: number;
    riskBudgetUsed: number;
  } | null;
  
  /** Rejection reason if not approved */
  rejection?: {
    reason: string;
    constraints: string[];
    suggestion?: string;
  };
  
  /** Risk analysis */
  riskAnalysis: {
    portfolioImpact: number;
    correlationImpact: number;
    drawdownImpact: number;
    concentrationRisk: number;
  };
}

// ============================================================================
// CAPITAL ALLOCATOR
// ============================================================================

export class CapitalAllocator {
  private totalCapital: number = 0;
  private pools: Map<PoolType, CapitalPool> = new Map();
  private rules: Map<string, AllocationRule> = new Map();
  private allocationHistory: AllocationResult[] = [];

  constructor(initialCapital: number = 100000) {
    this.totalCapital = initialCapital;
    this.initializePools();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default capital pools
   */
  private initializePools(): void {
    const poolConfigs: Array<{
      type: PoolType;
      name: string;
      description: string;
      targetPercent: number;
      minPercent: number;
      maxPercent: number;
      riskParams: CapitalPool['riskParams'];
    }> = [
      {
        type: PoolType.ACTIVE_OPPORTUNITY,
        name: 'Active Opportunity',
        description: 'High-conviction short-term trades',
        targetPercent: 0.40,
        minPercent: 0.20,
        maxPercent: 0.50,
        riskParams: {
          maxDrawdown: 0.15,
          maxPositionSize: 0.10,
          maxCorrelation: 0.7,
          volatilityTarget: 0.20,
        },
      },
      {
        type: PoolType.DEFENSIVE_BUFFER,
        name: 'Defensive Buffer',
        description: 'Low-volatility positions for stability',
        targetPercent: 0.20,
        minPercent: 0.15,
        maxPercent: 0.30,
        riskParams: {
          maxDrawdown: 0.08,
          maxPositionSize: 0.15,
          maxCorrelation: 0.5,
          volatilityTarget: 0.10,
        },
      },
      {
        type: PoolType.LONG_HORIZON,
        name: 'Long Horizon Growth',
        description: 'Long-term investment positions',
        targetPercent: 0.25,
        minPercent: 0.15,
        maxPercent: 0.35,
        riskParams: {
          maxDrawdown: 0.25,
          maxPositionSize: 0.20,
          maxCorrelation: 0.6,
          volatilityTarget: 0.15,
        },
      },
      {
        type: PoolType.EXPERIMENTAL,
        name: 'Experimental',
        description: 'High-risk/high-reward experimental positions',
        targetPercent: 0.05,
        minPercent: 0.00,
        maxPercent: 0.10,
        riskParams: {
          maxDrawdown: 0.50,
          maxPositionSize: 0.25,
          maxCorrelation: 0.8,
          volatilityTarget: 0.40,
        },
      },
      {
        type: PoolType.CASH_RESERVE,
        name: 'Cash Reserve',
        description: 'Liquid cash for opportunities and emergencies',
        targetPercent: 0.10,
        minPercent: 0.05,
        maxPercent: 1.00,
        riskParams: {
          maxDrawdown: 0,
          maxPositionSize: 0,
          maxCorrelation: 0,
          volatilityTarget: 0,
        },
      },
    ];

    for (const config of poolConfigs) {
      const pool: CapitalPool = {
        id: uuidv4(),
        type: config.type,
        name: config.name,
        description: config.description,
        allocation: {
          targetPercent: config.targetPercent,
          currentPercent: config.targetPercent,
          amount: this.totalCapital * config.targetPercent,
          minPercent: config.minPercent,
          maxPercent: config.maxPercent,
        },
        riskParams: config.riskParams,
        performance: {
          returnYTD: 0,
          returnMTD: 0,
          sharpeRatio: 0,
          currentDrawdown: 0,
          maxDrawdownHit: 0,
        },
        positions: [],
        state: {
          active: true,
          locked: false,
          lastRebalanced: Date.now(),
        },
      };

      this.pools.set(config.type, pool);
    }
  }

  /**
   * Initialize default allocation rules
   */
  private initializeDefaultRules(): void {
    // Drawdown protection rule
    this.registerRule({
      id: 'drawdown_protection',
      name: 'Drawdown Protection',
      description: 'Reduce active allocation when drawdown exceeds threshold',
      conditions: [
        { type: 'drawdown', operator: 'gt', value: 0.10, poolType: PoolType.ACTIVE_OPPORTUNITY },
      ],
      actions: [
        { type: 'decrease', poolType: PoolType.ACTIVE_OPPORTUNITY, amount: 0.10 },
        { type: 'transfer', poolType: PoolType.ACTIVE_OPPORTUNITY, targetPoolType: PoolType.CASH_RESERVE },
      ],
      priority: 100,
      active: true,
    });

    // High volatility rule
    this.registerRule({
      id: 'high_volatility',
      name: 'High Volatility Response',
      description: 'Increase defensive allocation in high volatility',
      conditions: [
        { type: 'volatility', operator: 'gt', value: 0.30 },
      ],
      actions: [
        { type: 'increase', poolType: PoolType.DEFENSIVE_BUFFER, amount: 0.10 },
        { type: 'decrease', poolType: PoolType.EXPERIMENTAL, amount: 0.05 },
      ],
      priority: 90,
      active: true,
    });

    // Opportunity surge rule
    this.registerRule({
      id: 'opportunity_surge',
      name: 'Opportunity Surge',
      description: 'Increase active allocation when opportunities are abundant',
      conditions: [
        { type: 'opportunity', operator: 'gt', value: 5 },
        { type: 'drawdown', operator: 'lt', value: 0.05 },
      ],
      actions: [
        { type: 'increase', poolType: PoolType.ACTIVE_OPPORTUNITY, amount: 0.05 },
      ],
      priority: 70,
      active: true,
    });

    // Performance-based experimental allocation
    this.registerRule({
      id: 'experimental_performance',
      name: 'Experimental Performance Gate',
      description: 'Lock experimental pool if performance is poor',
      conditions: [
        { type: 'performance', operator: 'lt', value: -0.15, poolType: PoolType.EXPERIMENTAL },
      ],
      actions: [
        { type: 'lock', poolType: PoolType.EXPERIMENTAL },
      ],
      priority: 80,
      active: true,
    });
  }

  // ==========================================================================
  // ALLOCATION MANAGEMENT
  // ==========================================================================

  /**
   * Request capital allocation for a trade
   */
  requestAllocation(request: AllocationRequest): AllocationResult {
    const result: AllocationResult = {
      id: uuidv4(),
      request,
      timestamp: Date.now(),
      approved: null,
      riskAnalysis: this.analyzeRisk(request),
    };

    // Determine appropriate pool
    const poolType = this.selectPool(request);
    const pool = this.pools.get(poolType);

    if (!pool) {
      result.rejection = {
        reason: 'No suitable pool found',
        constraints: ['Pool not available'],
      };
      this.allocationHistory.push(result);
      return result;
    }

    // Check pool state
    if (!pool.state.active || pool.state.locked) {
      result.rejection = {
        reason: pool.state.locked ? `Pool locked: ${pool.state.lockReason}` : 'Pool inactive',
        constraints: ['Pool state'],
        suggestion: 'Try a different time horizon or wait for pool unlock',
      };
      this.allocationHistory.push(result);
      return result;
    }

    // Check constraints
    const constraints = this.checkConstraints(request, pool);
    if (constraints.length > 0) {
      result.rejection = {
        reason: 'Allocation constraints not met',
        constraints,
        suggestion: this.generateSuggestion(constraints, request),
      };
      this.allocationHistory.push(result);
      return result;
    }

    // Calculate approved size
    const approvedSize = this.calculateApprovedSize(request, pool);
    const capitalAllocated = approvedSize * request.entryPrice;
    const riskBudgetUsed = this.calculateRiskBudget(request, approvedSize);

    result.approved = {
      size: approvedSize,
      poolType,
      capitalAllocated,
      riskBudgetUsed,
    };

    // Update pool
    this.updatePoolAllocation(pool, capitalAllocated);

    this.allocationHistory.push(result);
    return result;
  }

  /**
   * Select appropriate pool for allocation
   */
  private selectPool(request: AllocationRequest): PoolType {
    const { timeHorizon, conviction, riskRewardRatio } = request;

    // Experimental: high conviction, high risk/reward
    if (conviction > 0.85 && riskRewardRatio > 3 && timeHorizon === 'short') {
      const experimental = this.pools.get(PoolType.EXPERIMENTAL);
      if (experimental && !experimental.state.locked && experimental.allocation.currentPercent < experimental.allocation.maxPercent) {
        return PoolType.EXPERIMENTAL;
      }
    }

    // Long horizon investments
    if (timeHorizon === 'long') {
      return PoolType.LONG_HORIZON;
    }

    // Active opportunity: short-term, medium-high conviction
    if (timeHorizon === 'short' || (timeHorizon === 'medium' && conviction > 0.6)) {
      return PoolType.ACTIVE_OPPORTUNITY;
    }

    // Defensive: lower conviction, medium horizon
    if (conviction < 0.6 || riskRewardRatio < 1.5) {
      return PoolType.DEFENSIVE_BUFFER;
    }

    return PoolType.ACTIVE_OPPORTUNITY;
  }

  /**
   * Check allocation constraints
   */
  private checkConstraints(request: AllocationRequest, pool: CapitalPool): string[] {
    const constraints: string[] = [];
    const { riskParams, allocation, positions } = pool;

    // Position size constraint
    const requestedCapital = request.requestedSize * request.entryPrice;
    const requestedPercent = requestedCapital / this.totalCapital;
    if (requestedPercent > riskParams.maxPositionSize) {
      constraints.push(`Position size ${(requestedPercent * 100).toFixed(1)}% exceeds max ${(riskParams.maxPositionSize * 100).toFixed(0)}%`);
    }

    // Pool capacity constraint
    const availableCapital = allocation.amount - positions.reduce((sum, p) => sum + p.value, 0);
    if (requestedCapital > availableCapital) {
      constraints.push(`Insufficient pool capital: requested $${requestedCapital.toFixed(0)}, available $${availableCapital.toFixed(0)}`);
    }

    // Concentration constraint
    const existingSymbol = positions.find(p => p.symbol === request.symbol);
    if (existingSymbol) {
      const totalSymbolWeight = existingSymbol.weight + requestedPercent;
      if (totalSymbolWeight > riskParams.maxPositionSize * 1.5) {
        constraints.push(`Symbol concentration would exceed limit`);
      }
    }

    // Drawdown constraint
    if (pool.performance.currentDrawdown > riskParams.maxDrawdown * 0.8) {
      constraints.push(`Pool near drawdown limit (${(pool.performance.currentDrawdown * 100).toFixed(1)}%)`);
    }

    // Risk/reward constraint
    if (request.riskRewardRatio < 1.0) {
      constraints.push(`Risk/reward ratio ${request.riskRewardRatio.toFixed(2)} below minimum 1.0`);
    }

    return constraints;
  }

  /**
   * Calculate approved position size
   */
  private calculateApprovedSize(request: AllocationRequest, pool: CapitalPool): number {
    const { riskParams, allocation, positions } = pool;
    const requestedCapital = request.requestedSize * request.entryPrice;
    
    // Available capital in pool
    const usedCapital = positions.reduce((sum, p) => sum + p.value, 0);
    const availableCapital = allocation.amount - usedCapital;
    
    // Maximum based on position size limit
    const maxPositionCapital = this.totalCapital * riskParams.maxPositionSize;
    
    // Maximum based on risk budget (stop loss distance)
    const riskPercent = Math.abs(request.entryPrice - request.stopLoss) / request.entryPrice;
    const maxRiskCapital = (this.totalCapital * 0.02) / riskPercent; // 2% risk per trade
    
    // Conviction-adjusted size
    const convictionAdjustment = 0.5 + request.conviction * 0.5; // 50% to 100%
    
    // Take minimum of all constraints
    const maxCapital = Math.min(
      requestedCapital,
      availableCapital,
      maxPositionCapital,
      maxRiskCapital
    ) * convictionAdjustment;
    
    // Convert back to size
    return Math.floor(maxCapital / request.entryPrice);
  }

  /**
   * Calculate risk budget used
   */
  private calculateRiskBudget(request: AllocationRequest, size: number): number {
    const capital = size * request.entryPrice;
    const riskPercent = Math.abs(request.entryPrice - request.stopLoss) / request.entryPrice;
    return capital * riskPercent;
  }

  /**
   * Analyze risk impact of allocation
   */
  private analyzeRisk(request: AllocationRequest): AllocationResult['riskAnalysis'] {
    const capital = request.requestedSize * request.entryPrice;
    
    return {
      portfolioImpact: capital / this.totalCapital,
      correlationImpact: 0.1, // Simplified - would calculate actual correlation
      drawdownImpact: (capital / this.totalCapital) * 0.5, // Rough estimate
      concentrationRisk: this.calculateConcentrationRisk(request.symbol),
    };
  }

  /**
   * Calculate concentration risk for a symbol
   */
  private calculateConcentrationRisk(symbol: string): number {
    let totalSymbolValue = 0;
    
    for (const pool of this.pools.values()) {
      for (const position of pool.positions) {
        if (position.symbol === symbol) {
          totalSymbolValue += position.value;
        }
      }
    }
    
    return totalSymbolValue / this.totalCapital;
  }

  /**
   * Generate suggestion for rejected allocation
   */
  private generateSuggestion(constraints: string[], request: AllocationRequest): string {
    if (constraints.some(c => c.includes('Position size'))) {
      const maxSize = this.totalCapital * 0.10 / request.entryPrice;
      return `Reduce position size to ${Math.floor(maxSize)} shares`;
    }
    if (constraints.some(c => c.includes('Insufficient'))) {
      return 'Wait for positions to close or add capital';
    }
    if (constraints.some(c => c.includes('drawdown'))) {
      return 'Wait for pool to recover before new allocations';
    }
    return 'Review position parameters';
  }

  /**
   * Update pool allocation after trade
   */
  private updatePoolAllocation(pool: CapitalPool, capitalUsed: number): void {
    pool.allocation.amount -= capitalUsed;
    pool.allocation.currentPercent = pool.allocation.amount / this.totalCapital;
  }

  // ==========================================================================
  // POSITION MANAGEMENT
  // ==========================================================================

  /**
   * Add position to pool
   */
  addPosition(
    poolType: PoolType,
    position: Omit<PoolPosition, 'id' | 'pnl' | 'pnlPercent' | 'weight'>
  ): PoolPosition | null {
    const pool = this.pools.get(poolType);
    if (!pool) return null;

    const pnl = (position.currentPrice - position.entryPrice) * position.quantity * 
                (position.direction === 'long' ? 1 : -1);
    const pnlPercent = (position.currentPrice - position.entryPrice) / position.entryPrice *
                       (position.direction === 'long' ? 1 : -1);
    const weight = position.value / this.totalCapital;

    const fullPosition: PoolPosition = {
      id: uuidv4(),
      ...position,
      pnl,
      pnlPercent,
      weight,
    };

    pool.positions.push(fullPosition);
    return fullPosition;
  }

  /**
   * Update position prices and PnL
   */
  updatePositions(prices: Map<string, number>): void {
    for (const pool of this.pools.values()) {
      for (const position of pool.positions) {
        const newPrice = prices.get(position.symbol);
        if (newPrice) {
          position.currentPrice = newPrice;
          position.value = newPrice * position.quantity;
          position.pnl = (newPrice - position.entryPrice) * position.quantity *
                        (position.direction === 'long' ? 1 : -1);
          position.pnlPercent = (newPrice - position.entryPrice) / position.entryPrice *
                               (position.direction === 'long' ? 1 : -1);
          position.weight = position.value / this.totalCapital;
        }
      }

      // Update pool performance
      this.updatePoolPerformance(pool);
    }
  }

  /**
   * Close position
   */
  closePosition(poolType: PoolType, positionId: string): PoolPosition | null {
    const pool = this.pools.get(poolType);
    if (!pool) return null;

    const index = pool.positions.findIndex(p => p.id === positionId);
    if (index === -1) return null;

    const [position] = pool.positions.splice(index, 1);
    
    // Return capital to pool
    pool.allocation.amount += position.value;
    pool.allocation.currentPercent = pool.allocation.amount / this.totalCapital;

    return position;
  }

  /**
   * Update pool performance metrics
   */
  private updatePoolPerformance(pool: CapitalPool): void {
    if (pool.positions.length === 0) {
      pool.performance.currentDrawdown = 0;
      return;
    }

    const totalPnl = pool.positions.reduce((sum, p) => sum + p.pnl, 0);
    const totalValue = pool.positions.reduce((sum, p) => sum + p.value, 0);
    
    // Current return
    const currentReturn = totalValue > 0 ? totalPnl / (totalValue - totalPnl) : 0;
    
    // Drawdown (simplified)
    if (currentReturn < 0) {
      pool.performance.currentDrawdown = Math.abs(currentReturn);
      pool.performance.maxDrawdownHit = Math.max(
        pool.performance.maxDrawdownHit,
        pool.performance.currentDrawdown
      );
    } else {
      pool.performance.currentDrawdown = 0;
    }
  }

  // ==========================================================================
  // REBALANCING
  // ==========================================================================

  /**
   * Check and execute rebalancing rules
   */
  rebalance(marketContext: {
    volatility: number;
    regime: string;
    opportunityCount: number;
  }): {
    rulesTriggered: string[];
    actionsExecuted: string[];
  } {
    const rulesTriggered: string[] = [];
    const actionsExecuted: string[] = [];

    // Sort rules by priority
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.active)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.evaluateRuleConditions(rule, marketContext)) {
        rulesTriggered.push(rule.name);
        
        for (const action of rule.actions) {
          const executed = this.executeAction(action);
          if (executed) {
            actionsExecuted.push(`${action.type} on ${action.poolType}`);
          }
        }
      }
    }

    // Update rebalance timestamp
    for (const pool of this.pools.values()) {
      pool.state.lastRebalanced = Date.now();
    }

    return { rulesTriggered, actionsExecuted };
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateRuleConditions(
    rule: AllocationRule,
    context: { volatility: number; regime: string; opportunityCount: number }
  ): boolean {
    for (const condition of rule.conditions) {
      const pool = condition.poolType ? this.pools.get(condition.poolType) : null;
      let value: number;

      switch (condition.type) {
        case 'drawdown':
          value = pool?.performance.currentDrawdown ?? 0;
          break;
        case 'volatility':
          value = context.volatility;
          break;
        case 'performance':
          value = pool?.performance.returnMTD ?? 0;
          break;
        case 'opportunity':
          value = context.opportunityCount;
          break;
        default:
          value = 0;
      }

      const threshold = condition.value;
      let conditionMet = false;

      if (Array.isArray(threshold)) {
        conditionMet = condition.operator === 'between' && 
                      value >= threshold[0] && value <= threshold[1];
      } else {
        switch (condition.operator) {
          case 'gt': conditionMet = value > threshold; break;
          case 'lt': conditionMet = value < threshold; break;
          case 'eq': conditionMet = Math.abs(value - threshold) < 0.001; break;
        }
      }

      if (!conditionMet) return false;
    }

    return true;
  }

  /**
   * Execute rebalancing action
   */
  private executeAction(action: AllocationRule['actions'][0]): boolean {
    const pool = this.pools.get(action.poolType);
    if (!pool) return false;

    switch (action.type) {
      case 'lock':
        pool.state.locked = true;
        pool.state.lockReason = 'Rule triggered lock';
        return true;
        
      case 'unlock':
        pool.state.locked = false;
        pool.state.lockReason = undefined;
        return true;
        
      case 'increase':
        if (action.amount) {
          const newTarget = Math.min(
            pool.allocation.maxPercent,
            pool.allocation.targetPercent + action.amount
          );
          pool.allocation.targetPercent = newTarget;
          return true;
        }
        break;
        
      case 'decrease':
        if (action.amount) {
          const newTarget = Math.max(
            pool.allocation.minPercent,
            pool.allocation.targetPercent - action.amount
          );
          pool.allocation.targetPercent = newTarget;
          return true;
        }
        break;
        
      case 'transfer':
        if (action.targetPoolType && action.amount) {
          const targetPool = this.pools.get(action.targetPoolType);
          if (targetPool) {
            const transferAmount = pool.allocation.amount * action.amount;
            pool.allocation.amount -= transferAmount;
            targetPool.allocation.amount += transferAmount;
            return true;
          }
        }
        break;
    }

    return false;
  }

  // ==========================================================================
  // RULE MANAGEMENT
  // ==========================================================================

  /**
   * Register an allocation rule
   */
  registerRule(rule: AllocationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Get all rules
   */
  getRules(): AllocationRule[] {
    return Array.from(this.rules.values());
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Get pool by type
   */
  getPool(type: PoolType): CapitalPool | undefined {
    return this.pools.get(type);
  }

  /**
   * Get all pools
   */
  getAllPools(): CapitalPool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get total capital
   */
  getTotalCapital(): number {
    return this.totalCapital;
  }

  /**
   * Update total capital
   */
  setTotalCapital(amount: number): void {
    const ratio = amount / this.totalCapital;
    this.totalCapital = amount;
    
    // Scale pool allocations
    for (const pool of this.pools.values()) {
      pool.allocation.amount *= ratio;
    }
  }

  /**
   * Get allocation history
   */
  getAllocationHistory(limit?: number): AllocationResult[] {
    const sorted = [...this.allocationHistory].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get portfolio summary
   */
  getSummary(): {
    totalCapital: number;
    deployedCapital: number;
    cashReserve: number;
    totalPnl: number;
    totalPositions: number;
    poolSummary: Array<{
      type: PoolType;
      name: string;
      allocation: number;
      positions: number;
      pnl: number;
      drawdown: number;
    }>;
  } {
    let deployedCapital = 0;
    let totalPnl = 0;
    let totalPositions = 0;
    const poolSummary: Array<{
      type: PoolType;
      name: string;
      allocation: number;
      positions: number;
      pnl: number;
      drawdown: number;
    }> = [];

    for (const pool of this.pools.values()) {
      const positionValue = pool.positions.reduce((sum, p) => sum + p.value, 0);
      const poolPnl = pool.positions.reduce((sum, p) => sum + p.pnl, 0);
      
      if (pool.type !== PoolType.CASH_RESERVE) {
        deployedCapital += positionValue;
      }
      totalPnl += poolPnl;
      totalPositions += pool.positions.length;

      poolSummary.push({
        type: pool.type,
        name: pool.name,
        allocation: pool.allocation.currentPercent,
        positions: pool.positions.length,
        pnl: poolPnl,
        drawdown: pool.performance.currentDrawdown,
      });
    }

    const cashPool = this.pools.get(PoolType.CASH_RESERVE);
    const cashReserve = cashPool?.allocation.amount ?? 0;

    return {
      totalCapital: this.totalCapital,
      deployedCapital,
      cashReserve,
      totalPnl,
      totalPositions,
      poolSummary,
    };
  }

  /**
   * Get stats
   */
  getStats(): {
    totalCapital: number;
    poolCount: number;
    totalPositions: number;
    ruleCount: number;
    allocationRequests: number;
    approvalRate: number;
  } {
    let totalPositions = 0;
    for (const pool of this.pools.values()) {
      totalPositions += pool.positions.length;
    }

    const approved = this.allocationHistory.filter(a => a.approved !== null).length;
    const approvalRate = this.allocationHistory.length > 0 
      ? approved / this.allocationHistory.length 
      : 0;

    return {
      totalCapital: this.totalCapital,
      poolCount: this.pools.size,
      totalPositions,
      ruleCount: this.rules.size,
      allocationRequests: this.allocationHistory.length,
      approvalRate,
    };
  }
}

export default CapitalAllocator;

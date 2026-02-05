/**
 * NEXUS TRADER
 * ============
 * AI-Governed Trading Intelligence
 * 
 * This module integrates Nova Nexus core with the tradebot,
 * enabling constitutional AI-driven trading decisions.
 */

import {
  NovaNexus,
  createNexus,
  AutonomyTier,
  IntentType,
  CommandType,
  CommandStatus,
  DataDomain,
  AssetType,
} from '@nova/nexus-core';
import { createLogger } from '@nova/telemetry';
import { generateId, nowTimestamp } from '@nova/shared';

const logger = createLogger('nexus-trader');

// ============================================================================
// Types
// ============================================================================

export interface TradingThesis {
  id: string;
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reasoning: string;
  indicators: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export interface TradeDecision {
  approved: boolean;
  reasoning: string;
  constraints: string[];
  tier: AutonomyTier;
  confidence: number;
  timestamp: string;
}

export interface TradeExecution {
  decision: TradeDecision;
  executed: boolean;
  orderId?: string;
  error?: string;
}

interface DecisionRecord {
  id: string;
  thesis: TradingThesis;
  decision: TradeDecision;
  execution?: TradeExecution;
  timestamp: number;
}

// ============================================================================
// NexusTrader Class
// ============================================================================

export class NexusTrader {
  private nexus: NovaNexus;
  private initialized: boolean = false;
  private decisionLedger: DecisionRecord[] = [];
  private dailyStats = {
    trades: 0,
    approvals: 0,
    rejections: 0,
    totalValue: 0,
  };

  constructor() {
    this.nexus = createNexus();
  }

  /**
   * Check if NexusTrader is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the Nexus trading system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.nexus.initialize();
    
    // Set up execution callbacks
    this.nexus.executor.setCallbacks({
      onExecute: async (command) => {
        // This would connect to actual broker API
        logger.info('Executing command', { type: command.type, params: command.parameters });
        return { success: true, data: { orderId: `sim-${Date.now()}` } };
      },
    });
    
    // Create initial observation intent
    this.nexus.mind.createIntent(
      IntentType.OBSERVE,
      'Monitor market conditions and identify opportunities',
      {
        action: 'observe',
        target: 'market',
        parameters: {
          maxPositions: 5,
          maxRiskPerTrade: 0.02,
          maxDailyLoss: 0.05,
        },
      },
      {
        confidence: 0.9,
        requiredTier: AutonomyTier.OBSERVE,
        reasoning: ['Initial system startup', 'Entering observation mode'],
      }
    );

    this.initialized = true;
    logger.info('NexusTrader initialized', { tier: this.nexus.constitution.getState().tier });
  }

  /**
   * Evaluate a trade thesis through the Nexus AI system
   */
  async evaluateTrade(thesis: TradingThesis): Promise<TradeDecision> {
    // 1. Store thesis in MindSpace memory
    this.nexus.mind.remember('trading', 'thesis', thesis, {
      confidence: thesis.confidence,
      tags: ['thesis', thesis.symbol, thesis.signal],
    });

    // 2. Update entity in world state
    this.nexus.mind.upsertEntity({
      id: `stock:${thesis.symbol}`,
      type: 'asset',
      name: thesis.symbol,
      attributes: {
        price: thesis.entryPrice,
        signal: thesis.signal,
        confidence: thesis.confidence,
        indicators: thesis.indicators,
      },
    });

    // 3. Ingest signal into blender
    this.nexus.blender.ingestSignal({
      domain: DataDomain.MARKET,
      type: thesis.signal === 'BUY' ? 'bullish_signal' : 'bearish_signal',
      signal: `${thesis.signal} signal for ${thesis.symbol}`,
      strength: thesis.confidence,
      confidence: thesis.confidence,
      timestamp: Date.now(),
      features: Object.keys(thesis.indicators),
    });

    // 4. Get appraisal
    const valuation = this.nexus.appraiser.appraiseFinancial(
      thesis.symbol,
      AssetType.EQUITY,
      thesis.entryPrice,
      {
        technical: {
          support: thesis.stopLoss,
          resistance: thesis.targetPrice,
          trend: thesis.signal === 'BUY' ? 0.5 : -0.5,
          rsi: (thesis.indicators.rsi as number) || 50,
        },
      }
    );

    // 5. Check constitution state
    const constitutionState = this.nexus.constitution.getState();
    const currentTier = constitutionState.tier;
    
    // 6. Build decision
    const constraints: string[] = [];
    let approved = false;
    let reasoning = '';

    // Check confidence threshold
    if (thesis.confidence < 0.5) {
      constraints.push('Confidence below threshold (50%)');
      reasoning = 'Insufficient confidence for trade execution';
    }
    // Check risk/reward
    else if (thesis.riskRewardRatio < 1.5) {
      constraints.push('Risk/reward ratio below 1.5');
      reasoning = 'Unfavorable risk/reward profile';
    }
    // Check valuation alignment
    else if (valuation.recommendation.action === 'hold' && thesis.signal !== 'HOLD') {
      constraints.push('Valuation recommends HOLD');
      reasoning = 'Valuation analysis conflicts with signal';
    }
    // Check autonomy tier
    else if (currentTier === AutonomyTier.OBSERVE) {
      constraints.push('System in OBSERVE tier - no execution');
      reasoning = 'Autonomy tier restricts execution';
    }
    else {
      approved = true;
      reasoning = `Trade approved: ${thesis.signal} ${thesis.symbol} - Confidence: ${(thesis.confidence * 100).toFixed(1)}%, R/R: ${thesis.riskRewardRatio.toFixed(2)}`;
    }

    const decision: TradeDecision = {
      approved,
      reasoning,
      constraints,
      tier: currentTier,
      confidence: thesis.confidence * (approved ? 1 : 0.5),
      timestamp: nowTimestamp(),
    };

    // 7. Record in ledger
    this.nexus.ledger.append(
      'STRATEGY_EVALUATION' as any,
      'nexus-trader',
      { type: 'system' as const, id: thesis.symbol },
      { thesis, decision, valuation },
      { tags: ['evaluation', thesis.signal, thesis.symbol] }
    );

    // Track stats
    if (approved) {
      this.dailyStats.approvals++;
    } else {
      this.dailyStats.rejections++;
    }

    // Store in local ledger
    this.decisionLedger.push({
      id: generateId(),
      thesis,
      decision,
      timestamp: Date.now(),
    });

    return decision;
  }

  /**
   * Execute an AI-governed trade
   */
  async executeAITrade(thesis: TradingThesis, autoExecute: boolean = false): Promise<TradeExecution> {
    // First evaluate
    const decision = await this.evaluateTrade(thesis);
    
    const execution: TradeExecution = {
      decision,
      executed: false,
    };

    if (!decision.approved) {
      return execution;
    }

    if (!autoExecute) {
      execution.error = 'Auto-execution disabled';
      return execution;
    }

    // Check if we can execute at current tier
    const currentTier = this.nexus.constitution.getState().tier;
    if (currentTier === AutonomyTier.OBSERVE) {
      execution.error = 'Cannot execute in OBSERVE tier';
      return execution;
    }

    // Submit command to execution fabric
    try {
      const commandType = thesis.signal === 'BUY' ? CommandType.MARKET_BUY : CommandType.MARKET_SELL;
      const quantity = Math.floor(1000 / thesis.entryPrice); // $1000 position size
      
      const command = await this.nexus.executor.submit(
        commandType,
        {
          symbol: thesis.symbol,
          quantity,
          price: thesis.entryPrice,
          stopLoss: thesis.stopLoss,
          takeProfit: thesis.targetPrice,
        },
        {
          idempotencyKey: `trade:${thesis.id}`,
          requiredTier: AutonomyTier.GUARDED_AUTONOMOUS,
          requiresApproval: currentTier !== AutonomyTier.FULL_AUTONOMOUS,
        }
      );

      if (command.status === CommandStatus.COMPLETED && command.result?.success) {
        execution.executed = true;
        execution.orderId = command.result.data?.orderId as string;
        this.dailyStats.trades++;
        this.dailyStats.totalValue += thesis.entryPrice * quantity;
        
        logger.info('Trade executed', {
          symbol: thesis.symbol,
          signal: thesis.signal,
          quantity,
          orderId: execution.orderId,
        });
      } else if (command.status === CommandStatus.AWAITING_APPROVAL) {
        execution.error = 'Awaiting human approval';
      } else if (command.status === CommandStatus.RATE_LIMITED) {
        execution.error = 'Rate limited - try again later';
      } else {
        execution.error = command.lastError || 'Execution failed';
      }
    } catch (error) {
      execution.error = (error as Error).message;
      logger.error('Trade execution failed', error as Error);
    }

    // Update ledger record
    const lastRecord = this.decisionLedger[this.decisionLedger.length - 1];
    if (lastRecord && lastRecord.thesis.id === thesis.id) {
      lastRecord.execution = execution;
    }

    return execution;
  }

  /**
   * Get decision ledger
   */
  getDecisionLedger(limit: number = 50): DecisionRecord[] {
    return this.decisionLedger.slice(-limit);
  }

  /**
   * Get current system status
   */
  getStatus(): {
    initialized: boolean;
    nexus: ReturnType<NovaNexus['getStatus']>;
    dailyStats: { trades: number; approvals: number; rejections: number; totalValue: number };
    recentDecisions: number;
    activeOpportunities: number;
  } {
    return {
      initialized: this.initialized,
      nexus: this.nexus.getStatus(),
      dailyStats: this.dailyStats,
      recentDecisions: this.decisionLedger.length,
      activeOpportunities: this.nexus.blender.getActiveOpportunities().length,
    };
  }

  /**
   * Emergency stop all trading
   */
  emergencyStop(reason: string): void {
    this.nexus.emergencyHalt(reason);
    logger.error('EMERGENCY STOP', new Error(reason));
  }

  /**
   * Shutdown the trader gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down NexusTrader');
    this.initialized = false;
    // Export state for persistence if needed
    const state = this.nexus.exportState();
    logger.info('State exported', { 
      ledgerEntries: state.ledger.entries.length,
      mindMemories: state.mind.memory.past.length + state.mind.memory.present.length 
    });
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let instance: NexusTrader | null = null;

export function getNexusTrader(): NexusTrader {
  if (!instance) {
    instance = new NexusTrader();
  }
  return instance;
}

export async function initializeNexusTrader(): Promise<NexusTrader> {
  const trader = getNexusTrader();
  await trader.initialize();
  return trader;
}

export default NexusTrader;

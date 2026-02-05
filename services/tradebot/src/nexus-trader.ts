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
  LedgerEntryType,
  InactionType,
  type Explanation,
  type InactionArtifact,
  type LedgerEntry,
  type RiskCheckResult,
  type RiskEnvelope,
  type RegimeState,
  type TrustScore,
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

export interface NexusDecisionCard {
  id: string;
  createdAt: string;
  thesis: TradingThesis;
  decision: TradeDecision;

  ledgerEntry?: Pick<
    LedgerEntry,
    'id' | 'sequence' | 'type' | 'timestamp' | 'hash' | 'prevHash' | 'domain' | 'tags' | 'autonomyTier'
  >;

  risk?: {
    envelope: RiskEnvelope | null;
    check: RiskCheckResult | null;
  };

  trust?: {
    trustScore: TrustScore | null;
    explanation: Explanation | null;
  };

  inaction?: {
    artifact: InactionArtifact | null;
  };
}

interface DecisionRecord {
  id: string;
  thesis: TradingThesis;
  decision: TradeDecision;
  card?: NexusDecisionCard;
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
   * Update the regime engine using a coarse market snapshot.
   *
   * This is used to make scanning/screening regime-aware without changing any API response shapes.
   * It does not execute trades and does not write ledger entries.
   */
  updateRegimeFromMarketSnapshot(snapshot: {
    rsi?: number;
    /** Normalized short-vs-long MA cross signal (-1..1). */
    smaCross?: number;
    /** Approximate trend strength (0..50) analogous to ADX. */
    adx?: number;
    /** Normalized volatility percentile proxy (0..1). */
    atrPercentile?: number;
    confidence?: number;
  }): RegimeState {
    const confidence = typeof snapshot.confidence === 'number' && Number.isFinite(snapshot.confidence)
      ? Math.max(0.1, Math.min(1, snapshot.confidence))
      : 0.65;

    if (typeof snapshot.rsi === 'number' && Number.isFinite(snapshot.rsi)) {
      this.nexus.regime.updateIndicator('RSI', snapshot.rsi, { confidence });
    }

    if (typeof snapshot.smaCross === 'number' && Number.isFinite(snapshot.smaCross)) {
      // 'SMA_Cross' is expected to be a signed, normalized (-1..1) trend signal.
      const v = Math.max(-1, Math.min(1, snapshot.smaCross));
      this.nexus.regime.updateIndicator('SMA_Cross', v, { confidence });
    }

    if (typeof snapshot.adx === 'number' && Number.isFinite(snapshot.adx)) {
      const v = Math.max(0, Math.min(50, snapshot.adx));
      this.nexus.regime.updateIndicator('ADX', v, { confidence });
    }

    if (typeof snapshot.atrPercentile === 'number' && Number.isFinite(snapshot.atrPercentile)) {
      // 'ATR_Percentile' is used here as a volatility proxy; pass a normalized (0..1) value.
      const v = Math.max(0, Math.min(1, snapshot.atrPercentile));
      this.nexus.regime.updateIndicator('ATR_Percentile', v, { confidence, normalized: v });
    }

    return this.nexus.regime.classifyRegime();
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
   * Evaluate a trade thesis through the Nexus AI system.
   *
   * Returns the decision only (compat layer). Use evaluateTradeCard for a full decision card.
   */
  async evaluateTrade(thesis: TradingThesis): Promise<TradeDecision> {
    const { decision } = await this.evaluateTradeCard(thesis);
    return decision;
  }

  /**
   * Evaluate a trade thesis and return a full, UI-ready decision card.
   */
  async evaluateTradeCard(thesis: TradingThesis): Promise<{ decision: TradeDecision; card: NexusDecisionCard }> {
    const decisionId = generateId();

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
    const blenderSignalType = thesis.signal === 'BUY'
      ? 'bullish_signal'
      : thesis.signal === 'SELL'
        ? 'bearish_signal'
        : 'neutral_signal';

    this.nexus.blender.ingestSignal({
      domain: DataDomain.MARKET,
      type: blenderSignalType,
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
          trend: thesis.signal === 'BUY' ? 0.5 : thesis.signal === 'SELL' ? -0.5 : 0,
          rsi: (thesis.indicators.rsi as number) || 50,
        },
      }
    );

    // 5. Check constitution state
    const constitutionState = this.nexus.constitution.getState();
    const currentTier = constitutionState.tier;

    // 6. Survivability-first risk checks (absolute veto authority)
    let riskEnvelope: RiskEnvelope | null = null;
    let riskCheck: RiskCheckResult | null = null;

    try {
      riskEnvelope = this.nexus.risk.generateEnvelope();

      const hasValidPrice = thesis.entryPrice > 0;
      const isActionableSignal = thesis.signal === 'BUY' || thesis.signal === 'SELL';

      if (hasValidPrice && isActionableSignal) {
        const quantity = Math.max(1, Math.floor(1000 / thesis.entryPrice));
        const side = thesis.signal === 'BUY' ? 'long' : 'short';

        riskCheck = this.nexus.risk.checkPosition({
          symbol: thesis.symbol,
          side,
          size: quantity,
          price: thesis.entryPrice,
          stopLoss: thesis.stopLoss > 0 ? thesis.stopLoss : undefined,
          strategy: 'nexus-trader',
        });
      }
    } catch (error) {
      logger.warn('Risk engine check failed', { error });
    }

    // 7. Build decision
    const constraints: string[] = [];
    let approved = false;
    let reasoning = '';

    // Basic sanity checks
    if (!thesis.entryPrice || thesis.entryPrice <= 0) {
      constraints.push('Entry price missing or invalid');
      reasoning = 'Cannot evaluate trade without a valid entry price';
    }
    // Check confidence threshold
    else if (thesis.confidence < 0.5) {
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
    // Risk engine veto
    else if (riskCheck && !riskCheck.approved) {
      constraints.push(`Risk engine veto: ${riskCheck.rejectionReason ?? 'Position request rejected'}`);
      reasoning = 'Rejected by survivability constraints (risk engine veto)';
    } else {
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

    // 8. Trust Ledger: record what was explained (separate from truth)
    const explanationReasoning: string[] = [
      `Signal: ${thesis.signal} ${thesis.symbol}`,
      `Thesis confidence: ${(thesis.confidence * 100).toFixed(1)}%`,
      `Risk/Reward: ${thesis.riskRewardRatio.toFixed(2)}`,
      `Valuation: ${valuation.recommendation.action.toUpperCase()}`,
      `Autonomy tier: ${currentTier}`,
    ];

    if (riskEnvelope) {
      explanationReasoning.push(`Risk state: ${riskEnvelope.state} (score ${riskEnvelope.riskScore})`);
    }

    if (riskCheck?.warnings?.length) {
      for (const warning of riskCheck.warnings.slice(0, 5)) {
        explanationReasoning.push(`Risk warning: ${warning}`);
      }
    }

    const explanationEvidence: Explanation['content']['evidence'] = [
      {
        type: 'signal_confidence',
        description: `Signal confidence ${(thesis.confidence * 100).toFixed(0)}%`,
        weight: Math.max(0.1, Math.min(1, thesis.confidence)),
      },
      {
        type: 'risk_reward',
        description: `R/R ${thesis.riskRewardRatio.toFixed(2)}`,
        weight: thesis.riskRewardRatio >= 1.5 ? 0.7 : 0.3,
      },
      {
        type: 'valuation',
        description: `Valuation recommends ${valuation.recommendation.action.toUpperCase()}`,
        weight: valuation.recommendation.action === 'hold' ? 0.4 : 0.6,
      },
    ];

    const explanation = this.nexus.trust.recordExplanation(
      {
        type: 'decision',
        id: decisionId,
        summary: `${thesis.signal} ${thesis.symbol} (${decision.approved ? 'approved' : 'rejected'})`,
      },
      {
        summary: decision.reasoning,
        reasoning: explanationReasoning,
        evidence: explanationEvidence,
        alternatives: decision.approved
          ? ['HOLD (no action)']
          : ['Wait for better conditions', 'Reduce size', 'Tighten stop loss'],
        caveats: [
          'Intelligence proposes; execution obeys constraints.',
          'Governance tier may restrict execution even when a trade is approved.',
        ],
      },
      decision.confidence,
      'standard'
    );

    const trustScore = this.nexus.trust.getTrustScore() ?? null;

    // 9. Inaction Artifacts: restraint as a first-class output
    let inactionArtifact: InactionArtifact | null = null;
    if (!decision.approved) {
      const regime = this.nexus.regime.getCurrentRegime()?.primary ?? 'UNKNOWN';
      const portfolioState = riskEnvelope?.state ?? 'unknown';

      const proposedSize = thesis.entryPrice > 0 ? Math.max(1, Math.floor(1000 / thesis.entryPrice)) : undefined;

      // Select the most precise inaction type we can, without inventing new types.
      const inactionType = (riskCheck && !riskCheck.approved)
        ? InactionType.RISK_ABSTENTION
        : currentTier === AutonomyTier.OBSERVE
          ? InactionType.NO_TRADE
          : thesis.confidence < 0.5
            ? InactionType.CONFIDENCE_INSUFFICIENT
            : thesis.riskRewardRatio < 1.5
              ? InactionType.TIMING_SUBOPTIMAL
              : valuation.recommendation.action === 'hold' && thesis.signal !== 'HOLD'
                ? InactionType.DEFERRED_ENTRY
                : InactionType.NO_TRADE;

      const supportingFactors: string[] = [];
      supportingFactors.push(...constraints);
      if (riskEnvelope) {
        supportingFactors.push(`Risk envelope: ${riskEnvelope.state} (score ${riskEnvelope.riskScore})`);
      }
      if (riskCheck?.violatedConstraints?.length) {
        supportingFactors.push(`Violated constraints: ${riskCheck.violatedConstraints.join(', ')}`);
      }
      if (riskCheck?.warnings?.length) {
        for (const w of riskCheck.warnings.slice(0, 3)) {
          supportingFactors.push(`Risk warning: ${w}`);
        }
      }

      const alternatives: Array<{ action: string; whyRejected: string }> = [];

      // Alternative actions are recorded as "considered but rejected" (the system chose restraint).
      if (riskCheck && !riskCheck.approved) {
        alternatives.push({
          action: 'Execute proposed trade as-is',
          whyRejected: riskCheck.rejectionReason ?? 'Rejected by risk engine',
        });
        alternatives.push({
          action: 'Reduce position size and re-evaluate',
          whyRejected: 'Not auto-tuning size; requires explicit re-analysis with updated parameters.',
        });
        alternatives.push({
          action: 'Tighten stop loss and re-evaluate',
          whyRejected: 'Not auto-tuning stops; requires explicit re-analysis with updated parameters.',
        });
      } else if (currentTier === AutonomyTier.OBSERVE) {
        alternatives.push({
          action: 'Execute trade despite tier restriction',
          whyRejected: 'Governance restriction: OBSERVE tier forbids execution.',
        });
        alternatives.push({
          action: 'Escalate autonomy tier',
          whyRejected: 'Tier changes require governance/human action, not automatic escalation.',
        });
      } else if (thesis.confidence < 0.5) {
        alternatives.push({
          action: 'Execute trade with low confidence',
          whyRejected: 'Confidence below threshold (50%).',
        });
        alternatives.push({
          action: 'Wait for stronger signal',
          whyRejected: 'Deferred until signal confidence improves.',
        });
      } else if (thesis.riskRewardRatio < 1.5) {
        alternatives.push({
          action: 'Execute trade with poor R/R',
          whyRejected: 'Risk/reward ratio below 1.5.',
        });
        alternatives.push({
          action: 'Rework thesis (target/stop) and re-evaluate',
          whyRejected: 'Thesis adjustments require explicit re-analysis.',
        });
      } else if (valuation.recommendation.action === 'hold' && thesis.signal !== 'HOLD') {
        alternatives.push({
          action: 'Execute trade despite HOLD valuation',
          whyRejected: 'Valuation analysis conflicts with signal.',
        });
        alternatives.push({
          action: 'Wait for valuation alignment',
          whyRejected: 'Deferred until valuation supports the signal.',
        });
      }

      // Revisit conditions provide a concrete "when to look again" anchor.
      const revisitConditions: InactionArtifact['revisitConditions'] = (() => {
        const now = Date.now();

        if (inactionType === InactionType.CONFIDENCE_INSUFFICIENT) {
          const threshold = Math.min(0.95, Math.max(0.6, thesis.confidence + 0.1));
          return { signalThreshold: threshold, timeLimit: now + 4 * 60 * 60 * 1000 };
        }

        if (inactionType === InactionType.RISK_ABSTENTION) {
          const waitMs = riskEnvelope?.state === 'critical'
            ? 24 * 60 * 60 * 1000
            : riskEnvelope?.state === 'high'
              ? 6 * 60 * 60 * 1000
              : 60 * 60 * 1000;
          return { timeLimit: now + waitMs };
        }

        if (currentTier === AutonomyTier.OBSERVE) {
          return { timeLimit: now + 6 * 60 * 60 * 1000 };
        }

        if (inactionType === InactionType.DEFERRED_ENTRY) {
          return { timeLimit: now + 24 * 60 * 60 * 1000 };
        }

        return { timeLimit: now + 2 * 60 * 60 * 1000 };
      })();

      inactionArtifact = this.nexus.inaction.recordInaction(
        inactionType,
        {
          type: 'trade',
          symbol: thesis.symbol,
          proposedAction: thesis.signal,
          proposedSize,
          proposedPrice: thesis.entryPrice,
        },
        {
          primaryReason: decision.reasoning,
          supportingFactors: supportingFactors.slice(0, 12),
          confidence: decision.confidence,
          constraints,
        },
        {
          regime: String(regime),
          volatility: 0,
          riskLevel: riskEnvelope?.riskScore ?? 0,
          signalStrength: thesis.confidence,
          portfolioState,
        },
        {
          alternatives,
          revisitConditions,
        }
      );
    }

    // 10. Truth Ledger: immutable record of what happened (with references to other artifacts)
    const ledgerEntry = this.nexus.ledger.append(
      LedgerEntryType.DECISION_MADE,
      'nexus-trader',
      { type: 'agent', id: 'nexus-trader', name: 'NexusTrader' },
      {
        decisionId,
        thesis,
        decision,
        valuation,
        risk: {
          envelope: riskEnvelope,
          check: riskCheck,
        },
        trust: {
          explanationId: explanation.id,
        },
        inaction: {
          artifactId: inactionArtifact?.id ?? null,
        },
      },
      {
        tags: ['evaluation', thesis.signal, thesis.symbol, decision.approved ? 'approved' : 'rejected'],
        autonomyTier: currentTier,
      }
    );

    const card: NexusDecisionCard = {
      id: decisionId,
      createdAt: nowTimestamp(),
      thesis,
      decision,
      ledgerEntry: {
        id: ledgerEntry.id,
        sequence: ledgerEntry.sequence,
        type: ledgerEntry.type,
        timestamp: ledgerEntry.timestamp,
        hash: ledgerEntry.hash,
        prevHash: ledgerEntry.prevHash,
        domain: ledgerEntry.domain,
        tags: ledgerEntry.tags,
        autonomyTier: ledgerEntry.autonomyTier,
      },
      risk: {
        envelope: riskEnvelope,
        check: riskCheck,
      },
      trust: {
        trustScore,
        explanation,
      },
      inaction: {
        artifact: inactionArtifact,
      },
    };

    // Track stats
    if (decision.approved) {
      this.dailyStats.approvals++;
    } else {
      this.dailyStats.rejections++;
    }

    // Store in local ledger
    this.decisionLedger.push({
      id: decisionId,
      thesis,
      decision,
      card,
      timestamp: Date.now(),
    });

    return { decision, card };
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

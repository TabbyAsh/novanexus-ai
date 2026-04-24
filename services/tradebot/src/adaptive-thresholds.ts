/**
 * ADAPTIVE THRESHOLD ENGINE (ATE)
 * ================================
 * Dynamically adjusts trade execution parameters based on real-time volatility
 * estimation, regime classification, and closed-loop outcome feedback.
 *
 * Mathematical foundations:
 *   - Volatility: EMA of absolute returns (computationally efficient, almost as
 *     good as GARCH for real-time adaptation)
 *   - Regime: Percentile bands of realized vol → 4 discrete states
 *   - Stops/targets: ATR-scaled (not fixed %), so they breathe with the market
 *   - Position sizing: Half-Kelly with vol scaling
 *   - Slippage: Non-linear model — slippage grows with vol^1.5 in thin markets
 *   - Feedback: Exponential-decay weighted outcomes calibrate all parameters
 *
 * Design:
 *   - Stateless per call (all state in the instance, serializable for persistence)
 *   - No external dependencies beyond @nova/telemetry
 *   - Consumes market data; consumed by Scanner, ThesisGenerator, PaperTrader, NexusTrader
 */

import { createLogger } from '@nova/telemetry';

const logger = createLogger('adaptive-thresholds');

// ─── Types ───────────────────────────────────────────────────────────

export type VolRegime = 'compressed' | 'normal' | 'expanded' | 'extreme';

export interface VolatilityState {
  /** Current EMA of absolute returns (annualized %) */
  realizedVol: number;
  /** Current regime classification */
  regime: VolRegime;
  /** Ratio of current vol to long-term normal (1.0 = average) */
  volRatio: number;
  /** Percentile rank of current vol (0–100) */
  percentile: number;
  /** How many return observations have been ingested */
  observations: number;
  /** Timestamp of last update */
  updatedAt: number;
}

export interface AdaptiveParams {
  /** Minimum confidence to trigger a BUY/SELL signal (0–100) */
  signalThreshold: number;
  /** Stop distance as multiple of ATR */
  stopAtrMultiple: number;
  /** Target distance as multiple of ATR */
  targetAtrMultiple: number;
  /** Position size as fraction of equity (0–1) */
  positionSizeFraction: number;
  /** Estimated slippage in basis points */
  slippageBps: number;
  /** Minimum R:R ratio to accept a trade */
  minRiskReward: number;
  /** Score dampener (0–1, applied to scanner scores to compress in high vol) */
  scoreDampener: number;
  /** Derived from which regime */
  regime: VolRegime;
  /** Confidence in these parameters (0–1, higher with more feedback data) */
  paramConfidence: number;
}

export interface TradeOutcome {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  holdingPeriodMs: number;
  actualSlippageBps: number;
  hitStop: boolean;
  hitTarget: boolean;
  volRegimeAtEntry: VolRegime;
  timestamp: number;
}

interface FeedbackState {
  /** Per-regime win rates (exponentially weighted) */
  regimeWinRates: Record<VolRegime, { wins: number; total: number }>;
  /** Per-regime average slippage (exponentially weighted) */
  regimeSlippage: Record<VolRegime, { sum: number; count: number }>;
  /** Per-regime stop-hit rate */
  regimeStopHits: Record<VolRegime, { hits: number; total: number }>;
  /** Overall calibration from feedback */
  totalOutcomes: number;
  lastOutcomeAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────

/** EMA spans for fast/slow volatility estimation */
const VOL_EMA_FAST_SPAN = 10;   // ~10 observations (e.g. 10 candles)
const VOL_EMA_SLOW_SPAN = 50;   // Long-term baseline

/** Regime percentile boundaries (of realized vol history) */
const REGIME_COMPRESSED_CEIL = 20;  // Bottom 20% → compressed
const REGIME_NORMAL_CEIL = 60;      // 20–60% → normal
const REGIME_EXPANDED_CEIL = 90;    // 60–90% → expanded
// Above 90% → extreme

/** ATR multiples per regime (stop distance) */
const STOP_ATR: Record<VolRegime, number> = {
  compressed: 1.5,
  normal: 2.0,
  expanded: 2.5,
  extreme: 3.5,
};

/** Minimum R:R ratios per regime */
const MIN_RR: Record<VolRegime, number> = {
  compressed: 2.0,
  normal: 2.0,
  expanded: 2.5,
  extreme: 3.0,
};

/** Score thresholds per regime (higher = harder to trigger signal) */
const SIGNAL_THRESHOLD: Record<VolRegime, number> = {
  compressed: 62,
  normal: 65,
  expanded: 70,
  extreme: 78,
};

/** Position size ceiling per regime (fraction of equity) */
const MAX_POSITION_SIZE: Record<VolRegime, number> = {
  compressed: 0.10,
  normal: 0.08,
  expanded: 0.05,
  extreme: 0.02,
};

/** Score dampener per regime */
const SCORE_DAMPENER: Record<VolRegime, number> = {
  compressed: 1.0,
  normal: 1.0,
  expanded: 0.85,
  extreme: 0.65,
};

/** Feedback decay half-life (in number of outcomes) */
const FEEDBACK_HALF_LIFE = 30;
const FEEDBACK_DECAY = Math.LN2 / FEEDBACK_HALF_LIFE;

// ─── EMA Helper ──────────────────────────────────────────────────────

function emaUpdate(prev: number, value: number, span: number): number {
  const alpha = 2 / (span + 1);
  return prev + alpha * (value - prev);
}

// ─── Engine ──────────────────────────────────────────────────────────

export class AdaptiveThresholdEngine {
  // Volatility state
  private volFast: number = 0;
  private volSlow: number = 0;
  private volHistory: number[] = [];       // Rolling window of vol readings for percentile
  private volHistoryMax = 500;
  private observations = 0;
  private lastPrice: number | null = null;
  private lastUpdateAt = 0;

  // ATR state (per-symbol, keyed by symbol)
  private atrMap: Map<string, number> = new Map();

  // Feedback state
  private feedback: FeedbackState = {
    regimeWinRates: {
      compressed: { wins: 0, total: 0 },
      normal: { wins: 0, total: 0 },
      expanded: { wins: 0, total: 0 },
      extreme: { wins: 0, total: 0 },
    },
    regimeSlippage: {
      compressed: { sum: 0, count: 0 },
      normal: { sum: 0, count: 0 },
      expanded: { sum: 0, count: 0 },
      extreme: { sum: 0, count: 0 },
    },
    regimeStopHits: {
      compressed: { hits: 0, total: 0 },
      normal: { hits: 0, total: 0 },
      expanded: { hits: 0, total: 0 },
      extreme: { hits: 0, total: 0 },
    },
    totalOutcomes: 0,
    lastOutcomeAt: 0,
  };

  // ── Volatility Ingestion ───────────────────────────────────────────

  /**
   * Ingest a price observation (e.g., each candle close or quote update).
   * Call this regularly — the engine adapts from these observations.
   */
  ingestPrice(price: number, symbol?: string): void {
    if (!Number.isFinite(price) || price <= 0) return;

    if (this.lastPrice !== null && this.lastPrice > 0) {
      const absReturn = Math.abs((price - this.lastPrice) / this.lastPrice);
      // Annualize: assume ~252 trading days, ~6.5h/day, depends on observation frequency
      // For simplicity, store raw absolute return — regime is relative anyway
      this.volFast = this.observations > 1
        ? emaUpdate(this.volFast, absReturn, VOL_EMA_FAST_SPAN)
        : absReturn;
      this.volSlow = this.observations > 1
        ? emaUpdate(this.volSlow, absReturn, VOL_EMA_SLOW_SPAN)
        : absReturn;

      this.volHistory.push(this.volFast);
      if (this.volHistory.length > this.volHistoryMax) {
        this.volHistory.shift();
      }
    }

    this.lastPrice = price;
    this.observations++;
    this.lastUpdateAt = Date.now();
  }

  /**
   * Ingest ATR for a specific symbol (from market data indicators).
   * ATR is the unit of measurement for stop/target distances.
   */
  ingestATR(symbol: string, atr: number): void {
    if (Number.isFinite(atr) && atr > 0) {
      this.atrMap.set(symbol.toUpperCase(), atr);
    }
  }

  /**
   * Ingest ATR from price data when explicit ATR isn't available.
   * Approximates ATR from high-low-close data.
   */
  ingestCandle(symbol: string, high: number, low: number, close: number, prevClose?: number): void {
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return;

    // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
    const hl = high - low;
    const hpc = prevClose !== undefined ? Math.abs(high - prevClose) : hl;
    const lpc = prevClose !== undefined ? Math.abs(low - prevClose) : hl;
    const tr = Math.max(hl, hpc, lpc);

    const sym = symbol.toUpperCase();
    const prev = this.atrMap.get(sym);
    if (prev !== undefined && prev > 0) {
      // EMA of TR with span 14 (standard ATR period)
      this.atrMap.set(sym, emaUpdate(prev, tr, 14));
    } else {
      this.atrMap.set(sym, tr);
    }

    // Also update global vol from close
    this.ingestPrice(close, symbol);
  }

  // ── Regime Classification ──────────────────────────────────────────

  /**
   * Get current volatility state.
   */
  getVolatilityState(): VolatilityState {
    const regime = this.classifyRegime();
    const volRatio = this.volSlow > 0 ? this.volFast / this.volSlow : 1;
    const percentile = this.computePercentile();

    return {
      realizedVol: Math.round(this.volFast * 10000) / 100, // As percentage with 2 decimals
      regime,
      volRatio: Math.round(volRatio * 100) / 100,
      percentile: Math.round(percentile),
      observations: this.observations,
      updatedAt: this.lastUpdateAt,
    };
  }

  private classifyRegime(): VolRegime {
    if (this.observations < 5) return 'normal'; // Not enough data, assume normal

    const percentile = this.computePercentile();

    if (percentile <= REGIME_COMPRESSED_CEIL) return 'compressed';
    if (percentile <= REGIME_NORMAL_CEIL) return 'normal';
    if (percentile <= REGIME_EXPANDED_CEIL) return 'expanded';
    return 'extreme';
  }

  private computePercentile(): number {
    if (this.volHistory.length < 5) return 50; // Neutral assumption

    const current = this.volFast;
    const sorted = [...this.volHistory].sort((a, b) => a - b);
    let rank = 0;
    for (const v of sorted) {
      if (v <= current) rank++;
    }
    return (rank / sorted.length) * 100;
  }

  // ── Adaptive Parameters ────────────────────────────────────────────

  /**
   * Get adaptive execution parameters for a given symbol.
   * This is the main API — call this before making any trade decision.
   */
  getAdaptiveParams(symbol?: string): AdaptiveParams {
    const regime = this.classifyRegime();
    const volRatio = this.volSlow > 0 ? this.volFast / this.volSlow : 1;

    // Base parameters from regime lookup
    let signalThreshold = SIGNAL_THRESHOLD[regime];
    let stopMultiple = STOP_ATR[regime];
    let minRR = MIN_RR[regime];
    let positionSize = MAX_POSITION_SIZE[regime];
    let scoreDampener = SCORE_DAMPENER[regime];

    // Slippage: non-linear model — grows with vol^1.5
    const baseSlippage = 3; // bps
    const volFactor = Math.pow(Math.max(1, volRatio), 1.5);
    let slippageBps = Math.round(baseSlippage * volFactor);

    // ── Feedback adjustments ──
    const fb = this.feedback;
    let paramConfidence = 0.5; // Default: moderate confidence in params

    if (fb.totalOutcomes >= 10) {
      paramConfidence = Math.min(0.95, 0.5 + (fb.totalOutcomes / 200));

      // Adjust signal threshold based on regime-specific win rate
      const wr = fb.regimeWinRates[regime];
      if (wr.total >= 5) {
        const winRate = wr.wins / wr.total;
        // If win rate is low in this regime, raise the threshold (be pickier)
        // If win rate is high, we can afford to lower it slightly
        if (winRate < 0.40) {
          signalThreshold = Math.min(85, signalThreshold + 5);
          positionSize *= 0.7; // Reduce size in poorly-performing regimes
        } else if (winRate > 0.55) {
          signalThreshold = Math.max(55, signalThreshold - 3);
        }
      }

      // Adjust slippage based on actual vs estimated
      const sl = fb.regimeSlippage[regime];
      if (sl.count >= 5) {
        const avgActual = sl.sum / sl.count;
        // Blend: 60% model, 40% actual (model anchors, actual calibrates)
        slippageBps = Math.round(slippageBps * 0.6 + avgActual * 0.4);
      }

      // Adjust stop distance based on stop-hit rate
      const sh = fb.regimeStopHits[regime];
      if (sh.total >= 5) {
        const stopHitRate = sh.hits / sh.total;
        // If stops are getting hit too often (>60%), they're too tight → widen
        if (stopHitRate > 0.60) {
          stopMultiple *= 1.2;
          logger.info(`ATE: widening stops in ${regime} regime (stop-hit rate: ${(stopHitRate * 100).toFixed(0)}%)`);
        }
        // If stops rarely hit (<20%) but win rate is also low, stops might be too wide
        // (letting losers run). Tighten slightly.
        const wr2 = fb.regimeWinRates[regime];
        if (stopHitRate < 0.20 && wr2.total >= 5 && (wr2.wins / wr2.total) < 0.45) {
          stopMultiple *= 0.9;
        }
      }
    }

    // Target = stop × R:R ratio
    const targetMultiple = stopMultiple * minRR;

    // Kelly-informed position sizing (if we have enough outcome data)
    if (fb.totalOutcomes >= 20) {
      const wr = fb.regimeWinRates[regime];
      if (wr.total >= 8) {
        const p = wr.wins / wr.total;     // Win probability
        const b = minRR;                    // Payoff ratio (R:R)
        const q = 1 - p;
        const kelly = (p * b - q) / b;     // Kelly fraction

        if (kelly > 0) {
          // Half-Kelly for safety, further scaled by inverse vol
          const halfKelly = kelly / 2;
          const volScale = 1 / Math.sqrt(Math.max(1, volRatio));
          const kellySize = halfKelly * volScale;

          // Blend Kelly with regime ceiling: min of both
          positionSize = Math.min(positionSize, kellySize);
          positionSize = Math.max(0.005, positionSize); // Floor at 0.5%
        } else {
          // Kelly says don't trade (negative edge) — shrink to minimum
          positionSize = 0.005;
          signalThreshold = Math.min(85, signalThreshold + 10);
        }
      }
    }

    return {
      signalThreshold: Math.round(signalThreshold),
      stopAtrMultiple: Math.round(stopMultiple * 100) / 100,
      targetAtrMultiple: Math.round(targetMultiple * 100) / 100,
      positionSizeFraction: Math.round(positionSize * 10000) / 10000,
      slippageBps: Math.max(1, Math.min(50, slippageBps)),
      minRiskReward: Math.round(minRR * 100) / 100,
      scoreDampener: Math.round(scoreDampener * 100) / 100,
      regime,
      paramConfidence: Math.round(paramConfidence * 100) / 100,
    };
  }

  /**
   * Get ATR for a symbol, or a sensible default.
   */
  getATR(symbol: string): number | null {
    return this.atrMap.get(symbol.toUpperCase()) ?? null;
  }

  /**
   * Compute adaptive stop and target prices for a specific trade.
   */
  computeStopTarget(
    symbol: string,
    entryPrice: number,
    side: 'BUY' | 'SELL',
  ): { stopLoss: number; targetPrice: number; stopAtr: number; targetAtr: number; atrUsed: number } {
    const params = this.getAdaptiveParams(symbol);
    let atr = this.getATR(symbol);

    // Fallback: estimate ATR as 1.5% of price (conservative)
    if (!atr || atr <= 0) {
      atr = entryPrice * 0.015;
    }

    const stopDist = atr * params.stopAtrMultiple;
    const targetDist = atr * params.targetAtrMultiple;

    const stopLoss = side === 'BUY'
      ? Math.round((entryPrice - stopDist) * 100) / 100
      : Math.round((entryPrice + stopDist) * 100) / 100;

    const targetPrice = side === 'BUY'
      ? Math.round((entryPrice + targetDist) * 100) / 100
      : Math.round((entryPrice - targetDist) * 100) / 100;

    return {
      stopLoss,
      targetPrice,
      stopAtr: params.stopAtrMultiple,
      targetAtr: params.targetAtrMultiple,
      atrUsed: Math.round(atr * 100) / 100,
    };
  }

  // ── Feedback Loop ──────────────────────────────────────────────────

  /**
   * Record a completed trade outcome. This is how the engine learns.
   * Call this every time a paper trade or real trade closes.
   */
  recordOutcome(outcome: TradeOutcome): void {
    const regime = outcome.volRegimeAtEntry;
    const isWin = outcome.pnlPercent > 0;

    // Apply exponential decay to existing data before adding new
    const decayFactor = Math.exp(-FEEDBACK_DECAY);
    for (const r of ['compressed', 'normal', 'expanded', 'extreme'] as VolRegime[]) {
      this.feedback.regimeWinRates[r].wins *= decayFactor;
      this.feedback.regimeWinRates[r].total *= decayFactor;
      this.feedback.regimeSlippage[r].sum *= decayFactor;
      this.feedback.regimeSlippage[r].count *= decayFactor;
      this.feedback.regimeStopHits[r].hits *= decayFactor;
      this.feedback.regimeStopHits[r].total *= decayFactor;
    }

    // Add new outcome
    this.feedback.regimeWinRates[regime].total += 1;
    if (isWin) this.feedback.regimeWinRates[regime].wins += 1;

    this.feedback.regimeSlippage[regime].sum += outcome.actualSlippageBps;
    this.feedback.regimeSlippage[regime].count += 1;

    this.feedback.regimeStopHits[regime].total += 1;
    if (outcome.hitStop) this.feedback.regimeStopHits[regime].hits += 1;

    this.feedback.totalOutcomes++;
    this.feedback.lastOutcomeAt = outcome.timestamp;

    logger.info('ATE: outcome recorded', {
      regime,
      win: isWin,
      pnl: `${outcome.pnlPercent.toFixed(2)}%`,
      slippage: `${outcome.actualSlippageBps}bps`,
      totalOutcomes: this.feedback.totalOutcomes,
    });
  }

  // ── Serialization (for persistence across restarts) ────────────────

  exportState(): {
    volFast: number;
    volSlow: number;
    volHistory: number[];
    observations: number;
    lastPrice: number | null;
    atrMap: [string, number][];
    feedback: FeedbackState;
  } {
    return {
      volFast: this.volFast,
      volSlow: this.volSlow,
      volHistory: this.volHistory,
      observations: this.observations,
      lastPrice: this.lastPrice,
      atrMap: [...this.atrMap.entries()],
      feedback: structuredClone(this.feedback),
    };
  }

  importState(state: ReturnType<AdaptiveThresholdEngine['exportState']>): void {
    this.volFast = state.volFast;
    this.volSlow = state.volSlow;
    this.volHistory = state.volHistory;
    this.observations = state.observations;
    this.lastPrice = state.lastPrice;
    this.atrMap = new Map(state.atrMap);
    this.feedback = state.feedback;
    this.lastUpdateAt = Date.now();
    logger.info('ATE: state restored', {
      observations: this.observations,
      totalOutcomes: this.feedback.totalOutcomes,
    });
  }

  // ── Diagnostics ────────────────────────────────────────────────────

  getDiagnostics(): {
    volatility: VolatilityState;
    params: AdaptiveParams;
    feedback: {
      totalOutcomes: number;
      regimeWinRates: Record<VolRegime, number | null>;
      regimeAvgSlippage: Record<VolRegime, number | null>;
      regimeStopHitRates: Record<VolRegime, number | null>;
    };
    atrSymbols: number;
  } {
    const winRates: Record<VolRegime, number | null> = {} as any;
    const avgSlippage: Record<VolRegime, number | null> = {} as any;
    const stopHitRates: Record<VolRegime, number | null> = {} as any;

    for (const r of ['compressed', 'normal', 'expanded', 'extreme'] as VolRegime[]) {
      const wr = this.feedback.regimeWinRates[r];
      winRates[r] = wr.total >= 3 ? Math.round((wr.wins / wr.total) * 100) : null;

      const sl = this.feedback.regimeSlippage[r];
      avgSlippage[r] = sl.count >= 3 ? Math.round((sl.sum / sl.count) * 100) / 100 : null;

      const sh = this.feedback.regimeStopHits[r];
      stopHitRates[r] = sh.total >= 3 ? Math.round((sh.hits / sh.total) * 100) : null;
    }

    return {
      volatility: this.getVolatilityState(),
      params: this.getAdaptiveParams(),
      feedback: {
        totalOutcomes: this.feedback.totalOutcomes,
        regimeWinRates: winRates,
        regimeAvgSlippage: avgSlippage,
        regimeStopHitRates: stopHitRates,
      },
      atrSymbols: this.atrMap.size,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let instance: AdaptiveThresholdEngine | null = null;

export function getAdaptiveEngine(): AdaptiveThresholdEngine {
  if (!instance) {
    instance = new AdaptiveThresholdEngine();
  }
  return instance;
}

export default AdaptiveThresholdEngine;

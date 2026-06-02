import express, { Request, Response } from 'express';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp, HTTP_STATUS, query, novaCardInsert } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { RegimeType } from '@nova/nexus-core';
import { NexusTrader, type NexusDecisionCard } from './nexus-trader';
import { getAdaptiveEngine, type TradeOutcome, type VolRegime } from './adaptive-thresholds';
import { analyzeStock } from './trade-analyzer';

const PORT = parseInt(process.env.PORT || '3010', 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';

// Alpaca API Configuration
const ALPACA_ENDPOINT = process.env.ALPACA_ENDPOINT || 'https://paper-api.alpaca.markets/v2';
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';
const USE_ALPACA = !!ALPACA_API_KEY && !!ALPACA_SECRET_KEY;

const logger = createLogger('tradebot');
const app = express();
app.use(express.json());

// ============================================================================
// Alpaca Trading Client
// ============================================================================

interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: 'buy' | 'sell';
  type: string;
  time_in_force: string;
  status: string;
  filled_avg_price: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
}

class AlpacaClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = ALPACA_ENDPOINT;
    this.headers = {
      'APCA-API-KEY-ID': ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      'Content-Type': 'application/json',
    };
  }

  async getAccount(): Promise<AlpacaAccount | null> {
    try {
      const res = await fetch(`${this.baseUrl}/account`, { headers: this.headers });
      if (!res.ok) {
        logger.error('Alpaca account fetch failed', { status: res.status } as any);
        return null;
      }
      return await res.json() as AlpacaAccount;
    } catch (err) {
      logger.error('Alpaca API error', err as Error);
      return null;
    }
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    try {
      const res = await fetch(`${this.baseUrl}/positions`, { headers: this.headers });
      if (!res.ok) return [];
      return await res.json() as AlpacaPosition[];
    } catch (err) {
      logger.error('Alpaca positions fetch failed', err as Error);
      return [];
    }
  }

  async getOrders(status: 'open' | 'closed' | 'all' = 'all'): Promise<AlpacaOrder[]> {
    try {
      const res = await fetch(`${this.baseUrl}/orders?status=${status}`, { headers: this.headers });
      if (!res.ok) return [];
      return await res.json() as AlpacaOrder[];
    } catch (err) {
      logger.error('Alpaca orders fetch failed', err as Error);
      return [];
    }
  }

  async placeOrder(params: {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type?: 'market' | 'limit' | 'stop' | 'stop_limit';
    time_in_force?: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
    limit_price?: number;
    stop_price?: number;
  }): Promise<AlpacaOrder | null> {
    try {
      const body = {
        symbol: params.symbol,
        qty: params.qty.toString(),
        side: params.side,
        type: params.type || 'market',
        time_in_force: params.time_in_force || 'day',
        ...(params.limit_price && { limit_price: params.limit_price.toString() }),
        ...(params.stop_price && { stop_price: params.stop_price.toString() }),
      };

      const res = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        logger.error('Alpaca order failed', { status: res.status, error } as any);
        return null;
      }

      return await res.json() as AlpacaOrder;
    } catch (err) {
      logger.error('Alpaca place order error', err as Error);
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      return res.status === 204 || res.ok;
    } catch (err) {
      logger.error('Alpaca cancel order error', err as Error);
      return false;
    }
  }

  async closePosition(symbol: string): Promise<AlpacaOrder | null> {
    try {
      const res = await fetch(`${this.baseUrl}/positions/${symbol}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (!res.ok) return null;
      return await res.json() as AlpacaOrder;
    } catch (err) {
      logger.error('Alpaca close position error', err as Error);
      return null;
    }
  }

  async closeAllPositions(): Promise<AlpacaOrder[]> {
    try {
      const res = await fetch(`${this.baseUrl}/positions`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (!res.ok) return [];
      return await res.json() as AlpacaOrder[];
    } catch (err) {
      logger.error('Alpaca close all positions error', err as Error);
      return [];
    }
  }

  isEnabled(): boolean {
    return USE_ALPACA;
  }
}

// ============================================================================
// Market Data Types
// ============================================================================

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
const NOVA_HUB_URL = process.env.NOVA_HUB_URL || 'http://localhost:3030';
const NOVA_HUB_INTERNAL_TOKEN = process.env.INTERNAL_DECISION_CARDS_TOKEN || process.env.NOVA_HUB_INTERNAL_TOKEN || '';

interface MarketQuote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  timestamp: string;
  source?: string;
}
type CandleIntegrity = {
  source_type: string;
  source_identifier: string;
  latency_class: string;
  confidence_score: number;
  timestamp_range: {
    start: string;
    end: string;
    expected: number;
    actual: number;
    missing: number;
    gapFill?: boolean;
    gapFillCount?: number;
  };
  note?: string;
};

interface MarketCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  integrity?: CandleIntegrity;
}

interface Indicators {
  rsi: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  vwap: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  asOf?: string | null;
  computedAt?: string;
  provider?: string;
  integrity?: CandleIntegrity;
}

interface ScannerResult {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  indicators: {
    rsi?: number;
    macd?: number;
    momentum?: number;
    volumeSpike?: boolean;
  };
  quote: MarketQuote;
  integrity?: CandleIntegrity;
}

interface ThesisCard {
  id: string;
  symbol: string;
  signal: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reasoning: string[];
  createdAt: string;
  expiresAt: string;
  dataIntegrity?: CandleIntegrity;
  decisionCardId?: string | null;
}

interface PaperTrade {
  id: string;
  thesisId: string;
  decisionCardId?: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  entryPriceRaw?: number;
  currentPrice?: number;
  exitPrice?: number;
  exitPriceRaw?: number;
  status: 'OPEN' | 'CLOSED' | 'STOPPED';
  pnl?: number;
  pnlPercent?: number;
  fees?: number;
  entryFees?: number;
  exitFees?: number;
  entrySlippageBps?: number;
  exitSlippageBps?: number;
  dataIntegrity?: CandleIntegrity;
  openedAt: string;
  closedAt?: string;
}

type ExecutionMode = 'live' | 'paper' | 'blocked';
type ExecutionGateResult = {
  mode: ExecutionMode;
  reasons: string[];
  signalConfidence: number;
  dataConfidence?: number;
  latencyClass?: string;
  sourceType?: string;
};

type DecisionCardScore = {
  model: string;
  score: number;
  signalConfidence: number;
  dataConfidence: number | null;
  expectedValue: number;
  riskRewardRatio: number;
  riskEnvelope: Record<string, unknown> | null;
  gate?: ExecutionGateResult;
  regime?: string | null;
  strategy?: Record<string, unknown>;
  computedAt: string;
  expiresAt?: string | null;
};

const LIVE_TRADE_MIN_CONFIDENCE = Number(process.env.LIVE_TRADE_MIN_CONFIDENCE || 0.7);
const PAPER_TRADE_MIN_CONFIDENCE = Number(process.env.PAPER_TRADE_MIN_CONFIDENCE || 0.3);
const LIVE_TRADE_MIN_DATA_CONFIDENCE = Number(process.env.LIVE_TRADE_MIN_DATA_CONFIDENCE || 0.7);
const LIVE_TRADE_ALLOWED_SOURCE_TYPES = (process.env.LIVE_TRADE_ALLOWED_SOURCE_TYPES || 'primary')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const LIVE_TRADE_MAX_LATENCY_CLASS = (process.env.LIVE_TRADE_MAX_LATENCY_CLASS || 'medium').toLowerCase();

const LATENCY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, stale: 3 };

function normalizeSignalConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function hasIntegrityFields(integrity?: CandleIntegrity | null): integrity is CandleIntegrity {
  return Boolean(
    integrity &&
      typeof integrity.source_type === 'string' &&
      typeof integrity.source_identifier === 'string' &&
      typeof integrity.latency_class === 'string' &&
      Number.isFinite(integrity.confidence_score) &&
      integrity.timestamp_range &&
      typeof integrity.timestamp_range.start === 'string' &&
      typeof integrity.timestamp_range.end === 'string'
  );
}

function isIntegrityFailure(error: unknown): error is Error & { details?: unknown; code?: string } {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: string; code?: string };
  return err.code === 'CANDLE_INTEGRITY_MISSING' || err.message === 'CANDLE_INTEGRITY_MISSING';
}

function respondIntegrityFailure(res: Response, error: unknown): Response {
  const details = (error as { details?: unknown })?.details;
  return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
    success: false,
    error: {
      code: 'INTEGRITY_MISSING',
      message: 'Market data integrity missing',
      details,
    },
  });
}

function evaluateExecutionGate(params: { signalConfidence: number; integrity?: CandleIntegrity | null }): ExecutionGateResult {
  const signalConfidence = normalizeSignalConfidence(params.signalConfidence);
  const reasons: string[] = [];

  if (!Number.isFinite(signalConfidence) || signalConfidence <= 0) {
    reasons.push('signal_confidence_missing');
  }

  const integrity = params.integrity ?? null;
  const hasIntegrity = hasIntegrityFields(integrity);

  if (!hasIntegrity) {
    reasons.push('integrity_missing');
  } else {
    const sourceType = integrity.source_type;
    const latencyClass = integrity.latency_class.toLowerCase();
    const latencyRank = LATENCY_RANK[latencyClass] ?? LATENCY_RANK.high;

    if (!LIVE_TRADE_ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      reasons.push(`source_type_${sourceType}`);
    }

    if (latencyRank > (LATENCY_RANK[LIVE_TRADE_MAX_LATENCY_CLASS] ?? LATENCY_RANK.medium)) {
      reasons.push(`latency_${integrity.latency_class}`);
    }

    if (integrity.confidence_score < LIVE_TRADE_MIN_DATA_CONFIDENCE) {
      reasons.push('data_confidence_low');
    }
  }

  if (signalConfidence < LIVE_TRADE_MIN_CONFIDENCE) {
    reasons.push('signal_confidence_low');
  }

  let mode: ExecutionMode = reasons.length === 0 ? 'live' : 'paper';
  if (signalConfidence < PAPER_TRADE_MIN_CONFIDENCE) {
    mode = 'blocked';
    reasons.push('paper_confidence_low');
  }

  return {
    mode,
    reasons,
    signalConfidence,
    dataConfidence: integrity?.confidence_score,
    latencyClass: integrity?.latency_class,
    sourceType: integrity?.source_type,
  };
}

function resolveStrategyTag(indicators?: Record<string, unknown>, override?: string): string | null {
  if (override && typeof override === 'string') return override;
  const fromIndicators = indicators?.strategyTag || indicators?.strategy || indicators?.strategy_name;
  return typeof fromIndicators === 'string' ? fromIndicators : null;
}

function applyStrategyPolicyToGate(gate: ExecutionGateResult, strategy?: Record<string, unknown> | null): ExecutionGateResult {
  if (!strategy || typeof strategy !== 'object') return gate;
  const statusRaw = typeof (strategy as any).status === 'string' ? (strategy as any).status : '';
  const driftStatus = typeof (strategy as any)?.drift?.status === 'string' ? (strategy as any).drift.status : '';
  const status = `${statusRaw || driftStatus}`.toUpperCase();
  if (status !== 'QUARANTINED') return gate;

  const reasons = gate.reasons.includes('strategy_quarantined') ? gate.reasons : [...gate.reasons, 'strategy_quarantined'];
  const mode = gate.mode === 'live' ? 'paper' : gate.mode;
  return { ...gate, mode, reasons };
}

function computeDecisionCardScore(
  card: NexusDecisionCard,
  gate?: ExecutionGateResult,
  regime?: string | null
): DecisionCardScore {
  const thesis = (card as any)?.thesis || {};
  const signalConfidence = normalizeSignalConfidence(thesis.confidence ?? (card as any)?.decision?.confidence ?? 0);
  const dataConfidence = typeof thesis?.dataIntegrity?.confidence_score === 'number'
    ? thesis.dataIntegrity.confidence_score
    : null;
  const rrRaw = typeof thesis.riskRewardRatio === 'number' && Number.isFinite(thesis.riskRewardRatio)
    ? thesis.riskRewardRatio
    : 0;
  const riskRewardRatio = rrRaw > 0
    ? rrRaw
    : (thesis.entryPrice && thesis.targetPrice && thesis.stopLoss)
      ? (() => {
        const denom = Math.abs(thesis.entryPrice - thesis.stopLoss);
        return denom > 0 ? Math.abs(thesis.targetPrice - thesis.entryPrice) / denom : 0;
      })()
      : 0;
  const reward = riskRewardRatio > 0 ? riskRewardRatio : 1;
  const expectedValue = (signalConfidence * reward) - ((1 - signalConfidence) * 1);
  const evNormalized = Math.max(-1, Math.min(1, expectedValue / Math.max(1, reward)));
  const confidenceComposite = (signalConfidence + (dataConfidence ?? signalConfidence)) / 2;
  const score = Math.round(((confidenceComposite * 0.7) + ((evNormalized + 1) / 2) * 0.3) * 100);

  return {
    model: 'nexus-v1',
    score,
    signalConfidence,
    dataConfidence,
    expectedValue: Math.round(expectedValue * 100) / 100,
    riskRewardRatio: Math.round((riskRewardRatio || 0) * 100) / 100,
    riskEnvelope: (card as any)?.risk?.envelope ?? null,
    gate,
    regime: regime ?? null,
    computedAt: nowTimestamp(),
    expiresAt: thesis.expiresAt ?? null,
  };
}

async function persistDecisionCard(payload: {
  card: NexusDecisionCard;
  score: DecisionCardScore;
  metadata: {
    strategyTag?: string | null;
    confidenceScore?: number;
    sourceType?: string | null;
    latencyClass?: string | null;
    regime?: string | null;
    status?: string;
    expiresAt?: string | null;
    gate?: ExecutionGateResult;
  };
}): Promise<{ id: string; strategy?: Record<string, unknown> | null } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (NOVA_HUB_INTERNAL_TOKEN) {
      headers['x-internal-decision-token'] = NOVA_HUB_INTERNAL_TOKEN;
    }

    const res = await fetch(`${NOVA_HUB_URL}/internal/decision-cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.text().catch(() => '');
      logger.warn('Decision card persistence failed', { status: res.status, error });
      return null;
    }

    const data = await res.json().catch(() => null) as any;
    const card = data?.data?.card;
    if (!data?.success || !card?.id) {
      logger.warn('Decision card persistence returned invalid response');
      return null;
    }
    return { id: card.id, strategy: card.score?.strategy ?? null };
    return { id: data.data.card.id };
  } catch (error) {
    logger.warn('Decision card persistence error', { error: (error as Error).message });
    return null;
  }
}

function buildPaperThesisFromNexus(thesis: {
  id?: string;
  symbol: string;
  signal: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  reasoning?: string | string[];
}, integrity?: CandleIntegrity | null): ThesisCard | null {
  if (thesis.signal !== 'BUY' && thesis.signal !== 'SELL') return null;
  const direction = thesis.signal === 'BUY' ? 'LONG' : 'SHORT';
  const entry = thesis.entryPrice || 0;
  const target = thesis.targetPrice || (direction === 'LONG' ? entry * 1.05 : entry * 0.95);
  const stop = thesis.stopLoss || (direction === 'LONG' ? entry * 0.97 : entry * 1.03);
  const rr = entry > 0 ? Math.abs(target - entry) / Math.abs(stop - entry) : 0;
  const confidence = Math.round(normalizeSignalConfidence(thesis.confidence) * 100);
  const reasoning = Array.isArray(thesis.reasoning)
    ? thesis.reasoning
    : thesis.reasoning
      ? [thesis.reasoning]
      : [];

  return {
    id: thesis.id || generateId(),
    symbol: thesis.symbol,
    signal: direction,
    entryPrice: entry,
    targetPrice: target,
    stopLoss: stop,
    riskRewardRatio: Number.isFinite(rr) ? Math.round(rr * 100) / 100 : 0,
    confidence,
    reasoning,
    createdAt: nowTimestamp(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    dataIntegrity: integrity || undefined,
  };
}

interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Market Data Client (calls marketdata service)
// ============================================================================

class MarketDataClient {
  private baseUrl: string;

  constructor(baseUrl: string = MARKETDATA_URL) {
    this.baseUrl = baseUrl;
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const sym = symbol.toUpperCase();

    try {
      const res = await fetch(`${this.baseUrl}/v1/market/quote/${sym}`);
      if (!res.ok) return null;

      const data = (await res.json()) as {
        success: boolean;
        data?: { quote?: Record<string, unknown> };
        error?: unknown;
      };

      const q = data.data?.quote as any;
      if (!data.success || !q) return null;

      const price = q.price;
      if (typeof price !== 'number' || !Number.isFinite(price)) return null;

      const change = typeof q.change === 'number' && Number.isFinite(q.change) ? q.change : null;
      const changePercent =
        typeof q.changePercent === 'number' && Number.isFinite(q.changePercent) ? q.changePercent : null;
      const volume = typeof q.volume === 'number' && Number.isFinite(q.volume) ? q.volume : null;
      const timestamp = typeof q.timestamp === 'string' ? q.timestamp : nowTimestamp();
      const source = typeof q.source === 'string' ? q.source : undefined;

      return {
        symbol: sym,
        price,
        change,
        changePercent,
        volume,
        timestamp,
        source,
      };
    } catch (err) {
      logger.warn('Marketdata quote request failed', { symbol: sym, error: (err as Error).message });
      return null;
    }
  }

  async getIndicators(symbol: string): Promise<Indicators | null> {
    const sym = symbol.toUpperCase();

    try {
      const res = await fetch(`${this.baseUrl}/v1/market/indicators/${sym}`);
      if (!res.ok) return null;

      const data = (await res.json()) as {
        success: boolean;
        data?: { indicators?: Record<string, unknown> };
        error?: unknown;
      };

      const ind = data.data?.indicators as any;
      if (!data.success || !ind) return null;

      const rsi = typeof ind.rsi === 'number' && Number.isFinite(ind.rsi) ? ind.rsi : null;
      const adx = typeof ind.adx === 'number' && Number.isFinite(ind.adx) ? ind.adx : null;
      const plusDI = typeof ind.plusDI === 'number' && Number.isFinite(ind.plusDI) ? ind.plusDI : null;
      const minusDI = typeof ind.minusDI === 'number' && Number.isFinite(ind.minusDI) ? ind.minusDI : null;
      const vwap = typeof ind.vwap === 'number' && Number.isFinite(ind.vwap) ? ind.vwap : null;
      const sma20 = typeof ind.sma20 === 'number' && Number.isFinite(ind.sma20) ? ind.sma20 : null;
      const sma50 = typeof ind.sma50 === 'number' && Number.isFinite(ind.sma50) ? ind.sma50 : null;
      const sma200 = typeof ind.sma200 === 'number' && Number.isFinite(ind.sma200) ? ind.sma200 : null;

      const macdRaw = ind.macd;
      const macd =
        macdRaw &&
        typeof macdRaw.value === 'number' &&
        Number.isFinite(macdRaw.value) &&
        typeof macdRaw.signal === 'number' &&
        Number.isFinite(macdRaw.signal) &&
        typeof macdRaw.histogram === 'number' &&
        Number.isFinite(macdRaw.histogram)
          ? { value: macdRaw.value, signal: macdRaw.signal, histogram: macdRaw.histogram }
          : null;

      const asOf = typeof ind.asOf === 'string' ? ind.asOf : null;
      const computedAt = typeof ind.computedAt === 'string' ? ind.computedAt : undefined;
      const provider = typeof ind.provider === 'string' ? ind.provider : undefined;
      const integrity = ind.integrity as CandleIntegrity | undefined;

      return {
        rsi,
        adx,
        plusDI,
        minusDI,
        macd,
        vwap,
        sma20,
        sma50,
        sma200,
        asOf,
        computedAt,
        provider,
        integrity,
      };
    } catch (err) {
      logger.warn('Marketdata indicators request failed', { symbol: sym, error: (err as Error).message });
      return null;
    }
  }

  async getCandles(symbol: string, interval: string = '1m', limit: number = 5): Promise<{ candles: MarketCandle[]; integrity?: CandleIntegrity } | null> {
    const sym = symbol.toUpperCase();
    try {
      const res = await fetch(`${this.baseUrl}/v1/market/candles/${sym}?interval=${encodeURIComponent(interval)}&limit=${limit}`);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        success: boolean;
        data?: { candles?: MarketCandle[]; integrity?: CandleIntegrity };
        error?: unknown;
      };
      if (!data.success || !Array.isArray(data.data?.candles)) return null;
      return { candles: data.data!.candles as MarketCandle[], integrity: data.data?.integrity };
    } catch (err) {
      logger.warn('Marketdata candles request failed', { symbol: sym, error: (err as Error).message });
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes = await Promise.all(symbols.map((s) => this.getQuote(s)));
    return quotes.filter((q): q is MarketQuote => q !== null);
  }
}

// ============================================================================
// Scanner Engine
// ============================================================================

class ScannerEngine {
  private marketData: MarketDataClient;

  constructor(marketData: MarketDataClient) {
    this.marketData = marketData;
  }

  private computeFee(notional: number): number {
    if (!Number.isFinite(notional) || notional <= 0) return 0;
    const fee = (notional * PAPER_TRADE_FEE_BPS) / 10000;
    return Math.round(fee * 100) / 100;
  }

  private applySlippage(price: number, side: 'BUY' | 'SELL', integrity?: CandleIntegrity): { price: number; slippageBps: number } {
    if (!Number.isFinite(price)) return { price, slippageBps: 0 };

    // ── ATE-driven adaptive slippage (volatility-scaled, non-linear) ──
    const ate = getAdaptiveEngine();
    let slippageBps = ate.getAdaptiveParams().slippageBps;

    // Add integrity-based adjustments on top of ATE baseline
    if (integrity) {
      const latency = integrity.latency_class.toLowerCase();
      if (latency === 'medium') slippageBps += 2;
      if (latency === 'high') slippageBps += 5;
      if (latency === 'stale') slippageBps += 8;
      if (integrity.confidence_score < 0.5) slippageBps += 3;
      if (integrity.confidence_score < 0.3) slippageBps += 5;
    }

    slippageBps = Math.min(PAPER_TRADE_MAX_SLIPPAGE_BPS, Math.max(0, slippageBps));
    const direction = side === 'BUY' ? 1 : -1;
    const slippage = price * (slippageBps / 10000) * direction;
    const adjusted = Math.round((price + slippage) * 100) / 100;
    return { price: adjusted, slippageBps };
  }

  private getOpenPositionValue(): number {
    let value = 0;
    for (const trade of this.trades.values()) {
      if (trade.status !== 'OPEN') continue;
      const price = Number.isFinite(trade.currentPrice) ? (trade.currentPrice as number) : trade.entryPrice;
      const direction = trade.side === 'BUY' ? 1 : -1;
      value += price * trade.quantity * direction;
    }
    return value;
  }

  private recordEquitySnapshot(): void {
    const equity = Math.round((this.portfolio.cash + this.getOpenPositionValue()) * 100) / 100;
    this.equityHistory.push({ ts: nowTimestamp(), equity });
    if (this.equityHistory.length > 5000) {
      this.equityHistory.shift();
    }
  }

  private async resolveMarketPrice(symbol: string): Promise<{ price: number; integrity?: CandleIntegrity }> {
    const data = await this.marketData.getCandles(symbol, '1m', 2);
    const candles = data?.candles || [];
    const last = candles[candles.length - 1];
    const integrity = data?.integrity ?? last?.integrity;

    if (!hasIntegrityFields(integrity)) {
      const err = new Error('CANDLE_INTEGRITY_MISSING');
      (err as any).code = 'CANDLE_INTEGRITY_MISSING';
      (err as any).details = [{ symbol: symbol.toUpperCase(), reason: 'integrity_missing' }];
      throw err;
    }

    if (last && Number.isFinite(last.close)) {
      return { price: last.close, integrity };
    }

    const quote = await this.marketData.getQuote(symbol);
    if (quote && Number.isFinite(quote.price)) {
      return { price: quote.price, integrity };
    }

    return { price: Number.NaN, integrity };
  }


  async scan(symbols: string[], filters?: { minScore?: number; signals?: string[] }): Promise<ScannerResult[]> {
    if (symbols.length === 0) return [];

    const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
    const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const mean = (arr: number[]): number | null => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
    const integrityFailures: Array<{ symbol: string; reason: string }> = [];

    const computeSmaCross = (indicators: Indicators | null): number | null => {
      if (!indicators) return null;

      const short = indicators.sma20;
      const long = indicators.sma50;
      if (!finite(short) || !finite(long) || long === 0) {
        return null;
      }

      // Relative MA spread, scaled so ~5% spread maps to +/-1.
      const raw = (short - long) / Math.abs(long);
      return clamp(raw / 0.05, -1, 1);
    };

    type Sample = {
      symbol: string;
      quote: MarketQuote;
      indicators: Indicators | null;
      integrity?: CandleIntegrity;
      rsi: number | null;
      macdVal: number | null;
      momentum: number | null;
      volumeSpike: boolean;
      smaCross: number | null;
    };

    // Fetch quotes/indicators first so we can infer a scan-level regime.
    const rawSamples = await Promise.all(
      symbols.map(async (symbol): Promise<Sample | null> => {
        const [quote, indicators] = await Promise.all([
          this.marketData.getQuote(symbol),
          this.marketData.getIndicators(symbol),
        ]);

        if (!quote) return null;
        if (!indicators || !hasIntegrityFields(indicators.integrity)) {
          integrityFailures.push({ symbol: quote.symbol, reason: 'integrity_missing' });
          return null;
        }

        const rsi = finite(indicators?.rsi) ? indicators!.rsi : null;
        const macdVal = finite(indicators?.macd?.value) ? indicators!.macd!.value : null;
        const momentum = finite(indicators?.macd?.histogram) ? indicators!.macd!.histogram * 20 : null;

        const volumeSpike = typeof quote.volume === 'number' && quote.volume > 5_000_000;
        const smaCross = computeSmaCross(indicators);

        // Feed price into ATE for volatility estimation
        try {
          const ate = getAdaptiveEngine();
          ate.ingestPrice(quote.price, quote.symbol);
        } catch { /* best-effort */ }

        return { symbol: quote.symbol, quote, indicators, integrity: indicators?.integrity, rsi, macdVal, momentum, volumeSpike, smaCross };
      })
    );

    const samples = rawSamples.filter((s): s is Sample => s !== null);

    if (integrityFailures.length > 0) {
      const err = new Error('CANDLE_INTEGRITY_MISSING');
      (err as any).details = integrityFailures;
      throw err;
    }

    if (samples.length === 0) {
      return [];
    }

    // Coarse regime snapshot (trend + volatility) from the scanned universe.
    const avgRsi = mean(samples.map((s) => s.rsi).filter(finite).map((v) => clamp(v, 0, 100)));
    const avgSmaCross = mean(samples.map((s) => s.smaCross).filter(finite));
    const avgTrendStrength = mean(samples.map((s) => s.smaCross).filter(finite).map((v) => Math.abs(v)));
    const avgAbsChangePct = mean(
      samples
        .map((s) => s.quote.changePercent)
        .filter(finite)
        .map((v) => Math.abs(v))
    );

    const atrPercentile =
      typeof avgAbsChangePct === 'number' ? clamp(avgAbsChangePct / 5, 0, 1) : undefined; // 5% avg move ~= 100th percentile proxy
    const adxApprox = typeof avgTrendStrength === 'number' ? clamp(avgTrendStrength * 100, 0, 50) : undefined;

    const snapshotConfidence = samples.length >= 8 ? 0.75 : samples.length >= 3 ? 0.65 : 0.6;

    let regimePrimary: RegimeType = RegimeType.UNKNOWN;
    let regimeSecondary: RegimeType | undefined;

    try {
      // Note: nexusTrader is declared below in the module; this runs only when scan() is invoked.
      const state = nexusTrader.updateRegimeFromMarketSnapshot({
        rsi: avgRsi ?? undefined,
        smaCross: avgSmaCross ?? undefined,
        adx: adxApprox,
        atrPercentile,
        confidence: snapshotConfidence,
      });

      regimePrimary = state.primary;
      regimeSecondary = state.secondary;
    } catch {
      // Regime classification is best-effort; scanning must remain functional even if it fails.
    }

    const activeRegimes = new Set<RegimeType>([regimePrimary, regimeSecondary].filter(Boolean) as RegimeType[]);

    const isHighVol = activeRegimes.has(RegimeType.HIGH_VOLATILITY)
      || activeRegimes.has(RegimeType.VOLATILITY_EXPANSION)
      || activeRegimes.has(RegimeType.CRISIS);

    const isLowVol = activeRegimes.has(RegimeType.LOW_VOLATILITY)
      || activeRegimes.has(RegimeType.VOLATILITY_CONTRACTION);

    const isBull = activeRegimes.has(RegimeType.BULL_STRONG)
      || activeRegimes.has(RegimeType.BULL_WEAK)
      || activeRegimes.has(RegimeType.EUPHORIA)
      || activeRegimes.has(RegimeType.BREAKOUT);

    const isBear = activeRegimes.has(RegimeType.BEAR_STRONG)
      || activeRegimes.has(RegimeType.BEAR_WEAK)
      || activeRegimes.has(RegimeType.CRISIS)
      || activeRegimes.has(RegimeType.BREAKDOWN);

    const isRanging = activeRegimes.has(RegimeType.RANGING);

    const isTrending = activeRegimes.has(RegimeType.TRENDING)
      || activeRegimes.has(RegimeType.BREAKOUT)
      || activeRegimes.has(RegimeType.BREAKDOWN);

    const isTransition = activeRegimes.has(RegimeType.TRANSITION)
      || regimePrimary === RegimeType.UNKNOWN;

    // Scoring profile: adjust weights/thresholds by regime without changing output shape.
    // ── ATE-driven baseline thresholds (replaces static defaults) ──
    const ate = getAdaptiveEngine();
    const ateParams = ate.getAdaptiveParams();

    let bullBias = 1;
    let bearBias = 1;
    let rsiWeight = 1;
    let momentumWeight = 1;
    let dampener = ateParams.scoreDampener;

    let buyThreshold = ateParams.signalThreshold;
    let sellThreshold = 100 - ateParams.signalThreshold; // Mirror

    if (isBull && !isBear) {
      bullBias *= 1.1;
      bearBias *= 0.85;
      buyThreshold = 63;
      sellThreshold = 30;
    }

    if (isBear && !isBull) {
      bullBias *= 0.85;
      bearBias *= 1.1;
      buyThreshold = 70;
      sellThreshold = 40;
    }

    if (isRanging) {
      rsiWeight *= 1.2;
      momentumWeight *= 0.85;
    }

    if (isTrending) {
      rsiWeight *= 0.9;
      momentumWeight *= 1.1;
    }

    if (isHighVol) {
      dampener *= 0.85;
      buyThreshold += 5;
      sellThreshold -= 5;
      rsiWeight *= 0.95;
      momentumWeight *= 0.95;
    }

    if (isLowVol) {
      momentumWeight *= 1.05;
      buyThreshold -= 1;
      sellThreshold += 1;
    }

    if (isTransition) {
      dampener *= 0.9;
      buyThreshold += 2;
      sellThreshold -= 2;
    }

    buyThreshold = clamp(buyThreshold, 55, 85);
    sellThreshold = clamp(sellThreshold, 15, 45);

    const results: ScannerResult[] = [];

    for (const s of samples) {
      const { symbol, quote, rsi, macdVal, momentum, volumeSpike, smaCross, integrity } = s;

      let bull = 0;
      let bear = 0;

      // Mean reversion: RSI extremes
      if (typeof rsi === 'number' && Number.isFinite(rsi)) {
        if (rsi < 35) bull += 15 * rsiWeight;
        if (rsi > 65) bear += 15 * rsiWeight;
      }

      // Momentum: MACD direction
      if (typeof macdVal === 'number' && Number.isFinite(macdVal)) {
        if (macdVal > 0.5) bull += 10 * momentumWeight;
        if (macdVal < -0.5) bear += 10 * momentumWeight;
      }

      // Momentum: derived momentum proxy (histogram-based)
      if (typeof momentum === 'number' && Number.isFinite(momentum)) {
        if (momentum > 3) bull += 10 * momentumWeight;
        if (momentum < -3) bear += 10 * momentumWeight;
      }

      // Trend: short-vs-long MA cross signal
      if (typeof smaCross === 'number' && Number.isFinite(smaCross)) {
        if (smaCross > 0.3) bull += 8 * momentumWeight;
        if (smaCross < -0.3) bear += 8 * momentumWeight;
      }

      const changePercent = quote.changePercent;
      if (typeof changePercent === 'number' && Number.isFinite(changePercent)) {
        // Volume spike as a (directional) confirmation
        if (volumeSpike) {
          if (changePercent >= 0) bull += 5 * momentumWeight;
          else bear += 5 * momentumWeight;
        }

        // Intraday move (directional)
        if (changePercent > 2) bull += 10 * momentumWeight;
        if (changePercent < -2) bear += 10 * momentumWeight;
      }

      bull *= bullBias;
      bear *= bearBias;

      let score = 50 + bull - bear;

      // In high-vol / transition regimes, compress toward neutral (HOLD) rather than over-signaling.
      score = 50 + (score - 50) * dampener;

      // Determine signal
      let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      if (score >= buyThreshold) signal = 'BUY';
      else if (score <= sellThreshold) signal = 'SELL';

      const result: ScannerResult = {
        symbol,
        signal,
        score: Math.min(100, Math.max(0, Math.round(score))),
        indicators: {
          ...(typeof rsi === 'number' && Number.isFinite(rsi) ? { rsi: Math.round(rsi * 10) / 10 } : {}),
          ...(typeof macdVal === 'number' && Number.isFinite(macdVal) ? { macd: macdVal } : {}),
          ...(typeof momentum === 'number' && Number.isFinite(momentum) ? { momentum } : {}),
          volumeSpike,
        },
        quote,
        integrity,
      };

      // Apply filters
      if (filters?.minScore && result.score < filters.minScore) continue;
      if (filters?.signals && !filters.signals.includes(result.signal)) continue;

      results.push(result);
    }

    return results.sort((a, b) => b.score - a.score);
  }
}

// ============================================================================
// Thesis Generator
// ============================================================================

class ThesisGenerator {
  generate(scanResult: ScannerResult): ThesisCard {
    const isLong = scanResult.signal === 'BUY';
    const entryPrice = scanResult.quote.price;
    const side: 'BUY' | 'SELL' = isLong ? 'BUY' : 'SELL';

    // ── Adaptive stops/targets from ATE (volatility-scaled, not fixed %) ──
    const ate = getAdaptiveEngine();
    const { stopLoss: ateStop, targetPrice: ateTarget } = ate.computeStopTarget(
      scanResult.symbol, entryPrice, side
    );

    const targetPrice = ateTarget;
    const stopLoss = ateStop;

    const potentialGain = Math.abs(targetPrice - entryPrice);
    const potentialLoss = Math.abs(stopLoss - entryPrice);
    const riskRewardRatio = potentialLoss > 0 ? Math.round((potentialGain / potentialLoss) * 100) / 100 : 2;

    const reasoning: string[] = [];
    if (scanResult.indicators.rsi !== undefined) {
      if (scanResult.indicators.rsi < 35) reasoning.push('RSI indicates oversold conditions');
      if (scanResult.indicators.rsi > 65) reasoning.push('RSI indicates overbought conditions');
    }
    if (scanResult.indicators.macd && scanResult.indicators.macd > 0.5) {
      reasoning.push('MACD showing bullish momentum');
    }
    if (scanResult.indicators.volumeSpike) {
      reasoning.push('Volume spike detected, potential breakout');
    }
    if (typeof scanResult.quote.changePercent === 'number' && scanResult.quote.changePercent > 2) {
      reasoning.push('Strong intraday momentum');
    }
    reasoning.push(`Technical score: ${scanResult.score}/100`);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      id: generateId(),
      symbol: scanResult.symbol,
      signal: isLong ? 'LONG' : 'SHORT',
      entryPrice,
      targetPrice,
      stopLoss,
      riskRewardRatio,
      confidence: Math.min(100, Math.max(0, Math.round(scanResult.score))),
      reasoning,
      createdAt: nowTimestamp(),
      expiresAt,
      dataIntegrity: scanResult.integrity,
    };
  }
}

// ============================================================================
// Paper Trading Simulator
// ============================================================================
const PAPER_TRADE_FEE_BPS = Number(process.env.PAPER_TRADE_FEE_BPS || 5); // 5 bps default
const PAPER_TRADE_BASE_SLIPPAGE_BPS = Number(process.env.PAPER_TRADE_SLIPPAGE_BPS || 3); // 3 bps default
const PAPER_TRADE_MAX_SLIPPAGE_BPS = Number(process.env.PAPER_TRADE_MAX_SLIPPAGE_BPS || 25);

class PaperTradingSimulator {
  private trades: Map<string, PaperTrade> = new Map();
  private portfolio: { cash: number; positions: Record<string, number> } = {
    cash: 100000,
    positions: {},
  };
  private marketData: MarketDataClient;
  private equityHistory: Array<{ ts: string; equity: number }> = [];

  constructor(marketData: MarketDataClient) {
    this.marketData = marketData;
  }

  async openTrade(thesis: ThesisCard, quantity: number): Promise<PaperTrade> {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    const { price: marketPrice, integrity } = await this.resolveMarketPrice(thesis.symbol);
    if (!Number.isFinite(marketPrice)) {
      throw new Error('Entry price unavailable (market data unavailable)');
    }

    const side: 'BUY' | 'SELL' = thesis.signal === 'LONG' ? 'BUY' : 'SELL';
    const { price: fillPrice, slippageBps } = this.applySlippage(marketPrice, side, integrity);
    const entryNotional = fillPrice * quantity;
    const entryFee = this.computeFee(entryNotional);

    if (side === 'BUY' && entryNotional + entryFee > this.portfolio.cash) {
      throw new Error('Insufficient funds');
    }

    const trade: PaperTrade = {
      id: generateId(),
      thesisId: thesis.id,
      decisionCardId: thesis.decisionCardId ?? null,
      symbol: thesis.symbol,
      side,
      quantity,
      entryPrice: fillPrice,
      entryPriceRaw: marketPrice,
      entrySlippageBps: slippageBps,
      entryFees: entryFee,
      fees: entryFee,
      currentPrice: marketPrice,
      status: 'OPEN',
      dataIntegrity: integrity,
      openedAt: nowTimestamp(),
    };

    this.trades.set(trade.id, trade);
    if (side === 'BUY') {
      this.portfolio.cash -= entryNotional + entryFee;
    } else {
      this.portfolio.cash += entryNotional - entryFee;
    }
    const positionDelta = side === 'BUY' ? quantity : -quantity;
    this.portfolio.positions[thesis.symbol] = (this.portfolio.positions[thesis.symbol] || 0) + positionDelta;
    this.recordEquitySnapshot();

    return trade;
  }

  async closeTrade(tradeId: string, exitPrice?: number): Promise<PaperTrade> {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'OPEN') throw new Error('Trade already closed');

    let marketPrice: number;
    let integrity: CandleIntegrity | undefined;
    if (typeof exitPrice === 'number' && Number.isFinite(exitPrice)) {
      marketPrice = exitPrice;
      integrity = trade.dataIntegrity;
    } else {
      const resolved = await this.resolveMarketPrice(trade.symbol);
      marketPrice = resolved.price;
      integrity = resolved.integrity;
    }

    if (!Number.isFinite(marketPrice)) {
      throw new Error('Exit price unavailable (market data unavailable)');
    }

    const exitSide: 'BUY' | 'SELL' = trade.side === 'BUY' ? 'SELL' : 'BUY';
    const { price: fillPrice, slippageBps } = this.applySlippage(marketPrice, exitSide, integrity);
    const exitNotional = fillPrice * trade.quantity;
    const exitFee = this.computeFee(exitNotional);

    trade.exitPrice = fillPrice;
    trade.exitPriceRaw = marketPrice;
    trade.exitSlippageBps = slippageBps;
    trade.exitFees = exitFee;
    trade.currentPrice = fillPrice;
    trade.dataIntegrity = integrity ?? trade.dataIntegrity;

    const priceDiff = trade.side === 'BUY'
      ? fillPrice - trade.entryPrice
      : trade.entryPrice - fillPrice;
    const grossPnl = priceDiff * trade.quantity;
    const totalFees = (trade.entryFees || 0) + exitFee;
    trade.fees = totalFees;
    trade.pnl = Math.round((grossPnl - totalFees) * 100) / 100;
    trade.pnlPercent = Math.round(((grossPnl - totalFees) / (trade.entryPrice * trade.quantity)) * 10000) / 100;
    trade.status = 'CLOSED';
    trade.closedAt = nowTimestamp();

    // ── Feed outcome back to ATE for adaptive learning ──
    try {
      const ate = getAdaptiveEngine();
      const volState = ate.getVolatilityState();
      const outcome: TradeOutcome = {
        symbol: trade.symbol,
        side: trade.side,
        entryPrice: trade.entryPrice,
        exitPrice: fillPrice,
        pnlPercent: trade.pnlPercent,
        holdingPeriodMs: Date.now() - new Date(trade.openedAt).getTime(),
        actualSlippageBps: (trade.entrySlippageBps || 0) + slippageBps,
        hitStop: exitPrice !== undefined && (
          (trade.side === 'BUY' && fillPrice <= trade.entryPrice * 0.97) ||
          (trade.side === 'SELL' && fillPrice >= trade.entryPrice * 1.03)
        ),
        hitTarget: exitPrice !== undefined && (
          (trade.side === 'BUY' && fillPrice >= trade.entryPrice * 1.05) ||
          (trade.side === 'SELL' && fillPrice <= trade.entryPrice * 0.95)
        ),
        volRegimeAtEntry: volState.regime as VolRegime,
        timestamp: Date.now(),
      };
      ate.recordOutcome(outcome);
    } catch { /* feedback is best-effort */ }

    if (trade.side === 'BUY') {
      this.portfolio.cash += exitNotional - exitFee;
    } else {
      this.portfolio.cash -= exitNotional + exitFee;
    }
    const positionDelta = trade.side === 'BUY' ? trade.quantity : -trade.quantity;
    this.portfolio.positions[trade.symbol] = (this.portfolio.positions[trade.symbol] || 0) - positionDelta;
    if (Math.abs(this.portfolio.positions[trade.symbol]) < 1e-8) {
      delete this.portfolio.positions[trade.symbol];
    }
    this.recordEquitySnapshot();

    return trade;
  }

  async updateTrade(tradeId: string, thesis?: ThesisCard): Promise<PaperTrade> {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'OPEN') return trade;

    const resolved = await this.resolveMarketPrice(trade.symbol);
    if (!Number.isFinite(resolved.price)) return trade;

    trade.currentPrice = resolved.price;
    trade.dataIntegrity = resolved.integrity ?? trade.dataIntegrity;

    // Check stop loss / target if thesis provided
    if (thesis) {
      if (trade.side === 'BUY') {
        if (resolved.price <= thesis.stopLoss) {
          return this.closeTrade(tradeId, thesis.stopLoss);
        }
        if (resolved.price >= thesis.targetPrice) {
          return this.closeTrade(tradeId, thesis.targetPrice);
        }
      } else {
        if (resolved.price >= thesis.stopLoss) {
          return this.closeTrade(tradeId, thesis.stopLoss);
        }
        if (resolved.price <= thesis.targetPrice) {
          return this.closeTrade(tradeId, thesis.targetPrice);
        }
      }
    }

    this.recordEquitySnapshot();
    return trade;
  }

  getOpenTrades(): PaperTrade[] {
    return Array.from(this.trades.values()).filter((t) => t.status === 'OPEN');
  }

  getAllTrades(): PaperTrade[] {
    return Array.from(this.trades.values());
  }

  getPortfolio(): typeof this.portfolio {
    return { ...this.portfolio };
  }

  async getStats(): Promise<{
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winRate: number;
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalFees: number;
    avgSlippageBps: number;
    maxDrawdown: number;
    portfolioValue: number | null;
  }> {
    const trades = this.getAllTrades();
    const closed = trades.filter((t) => t.status === 'CLOSED');
    const open = trades.filter((t) => t.status === 'OPEN');
    const wins = closed.filter((t) => (t.pnl || 0) > 0);

    let hasUnknownPositionValue = false;
    for (const trade of open) {
      const resolved = await this.resolveMarketPrice(trade.symbol);
      if (Number.isFinite(resolved.price)) {
        trade.currentPrice = resolved.price;
        trade.dataIntegrity = resolved.integrity ?? trade.dataIntegrity;
      } else {
        hasUnknownPositionValue = true;
      }
    }

    const realizedPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const unrealizedPnl = open.reduce((sum, t) => {
      if (!Number.isFinite(t.currentPrice)) return sum;
      const direction = t.side === 'BUY' ? 1 : -1;
      return sum + (((t.currentPrice as number) - t.entryPrice) * t.quantity * direction);
    }, 0);
    const totalPnl = realizedPnl + unrealizedPnl;

    const totalFees = trades.reduce((sum, t) => sum + (t.fees || 0), 0);
    const slippageValues: number[] = [];
    for (const trade of trades) {
      if (typeof trade.entrySlippageBps === 'number') slippageValues.push(trade.entrySlippageBps);
      if (typeof trade.exitSlippageBps === 'number') slippageValues.push(trade.exitSlippageBps);
    }
    const totalSlippage = slippageValues.reduce((sum, v) => sum + v, 0);
    const avgSlippageBps = slippageValues.length > 0 ? totalSlippage / slippageValues.length : 0;

    this.recordEquitySnapshot();
    let peak = -Infinity;
    let maxDrawdown = 0;
    for (const point of this.equityHistory) {
      if (point.equity > peak) peak = point.equity;
      if (peak > 0 && point.equity < peak) {
        const drawdown = (peak - point.equity) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }

    const portfolioValue = hasUnknownPositionValue
      ? null
      : Math.round((this.portfolio.cash + this.getOpenPositionValue()) * 100) / 100;

    return {
      totalTrades: trades.length,
      openTrades: open.length,
      closedTrades: closed.length,
      winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
      totalPnl: Math.round(totalPnl * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      avgSlippageBps: Math.round(avgSlippageBps * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
      portfolioValue,
    };
  }
}

// ============================================================================
// Watchlist Manager
// ============================================================================

class WatchlistManager {
  private watchlists: Map<string, Watchlist> = new Map();

  constructor() {
    // Initialize with default watchlist
    const defaultList: Watchlist = {
      id: 'default',
      name: 'Default Watchlist',
      symbols: ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'BRK_B'],
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    };
    this.watchlists.set(defaultList.id, defaultList);
  }

  create(name: string, symbols: string[]): Watchlist {
    const watchlist: Watchlist = {
      id: generateId(),
      name,
      symbols,
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    };
    this.watchlists.set(watchlist.id, watchlist);
    return watchlist;
  }

  get(id: string): Watchlist | undefined {
    return this.watchlists.get(id);
  }

  getAll(): Watchlist[] {
    return Array.from(this.watchlists.values());
  }

  addSymbol(id: string, symbol: string): Watchlist | undefined {
    const watchlist = this.watchlists.get(id);
    if (!watchlist) return undefined;
    if (!watchlist.symbols.includes(symbol)) {
      watchlist.symbols.push(symbol);
      watchlist.updatedAt = nowTimestamp();
    }
    return watchlist;
  }

  removeSymbol(id: string, symbol: string): Watchlist | undefined {
    const watchlist = this.watchlists.get(id);
    if (!watchlist) return undefined;
    watchlist.symbols = watchlist.symbols.filter((s) => s !== symbol);
    watchlist.updatedAt = nowTimestamp();
    return watchlist;
  }
}

// ============================================================================
// Initialize Components
// ============================================================================

const marketData = new MarketDataClient();
const scanner = new ScannerEngine(marketData);
const thesisGenerator = new ThesisGenerator();
const paperTrader = new PaperTradingSimulator(marketData);
const watchlistManager = new WatchlistManager();
const alpaca = new AlpacaClient();

async function resolveLatestIntegrity(symbol: string): Promise<CandleIntegrity | null> {
  const data = await marketData.getCandles(symbol, '1m', 2);
  if (data?.integrity && hasIntegrityFields(data.integrity)) {
    return data.integrity;
  }
  const candles = data?.candles || [];
  const last = candles[candles.length - 1];
  if (last?.integrity && hasIntegrityFields(last.integrity)) {
    return last.integrity;
  }
  return null;
}

// Active theses storage
const activeTheses: Map<string, ThesisCard> = new Map();

// ============================================================================
// Bot Client Setup
// ============================================================================

const botConfig = createBotConfig('tradebot', [
  { name: 'scanner', version: '1.0.0', description: 'Market scanner with technical indicators' },
  { name: 'thesis', version: '1.0.0', description: 'Thesis card generator' },
  { name: 'paper-trading', version: '1.0.0', description: 'Paper trading simulator' },
  { name: 'watchlist', version: '1.0.0', description: 'Watchlist management' },
], { orchestratorUrl: ORCHESTRATOR_URL });

const bot = new BotClient(botConfig);

// Register task handlers
bot.registerTaskHandler('SCAN_WATCHLIST', async (task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  const { watchlistId, filters } = task.inputJson;
  const watchlist = watchlistManager.get((watchlistId as string) || 'default');
  
  if (!watchlist) {
    return { success: false, error: 'Watchlist not found' };
  }

  ctx.logger.info('Scanning watchlist', { watchlistId: watchlist.id, symbols: watchlist.symbols.length });
  await ctx.reportProgress(10, 'Starting scan...');
  let results: ScannerResult[];
  try {
    results = await scanner.scan(watchlist.symbols, filters as any);
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return { success: false, error: 'CANDLE_INTEGRITY_MISSING' };
    }
    throw error;
  }
  await ctx.reportProgress(100, 'Scan complete');

  return {
    success: true,
    output: { watchlistId: watchlist.id, results, scannedAt: nowTimestamp() },
    metrics: { symbolsScanned: watchlist.symbols.length, signalsFound: results.length },
  };
});

bot.registerTaskHandler('GENERATE_THESIS', async (task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  const { symbol, watchlistId } = task.inputJson;
  
  let symbolToAnalyze = symbol as string;
  if (!symbolToAnalyze && watchlistId) {
    // Get top signal from watchlist scan
    const watchlist = watchlistManager.get(watchlistId as string);
    if (watchlist) {
      const results = await scanner.scan(watchlist.symbols, { minScore: 60 });
      if (results.length > 0) {
        symbolToAnalyze = results[0].symbol;
      }
    }
  }

  if (!symbolToAnalyze) {
    return { success: false, error: 'No symbol specified or found' };
  }

  ctx.logger.info('Generating thesis', { symbol: symbolToAnalyze });
  await ctx.reportProgress(20, 'Analyzing symbol...');
  let scanResults: ScannerResult[];
  try {
    scanResults = await scanner.scan([symbolToAnalyze]);
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return { success: false, error: 'CANDLE_INTEGRITY_MISSING' };
    }
    throw error;
  }
  if (scanResults.length === 0) {
    return { success: false, error: 'Could not analyze symbol' };
  }

  await ctx.reportProgress(60, 'Generating thesis card...');
  const thesis = thesisGenerator.generate(scanResults[0]);
  activeTheses.set(thesis.id, thesis);

  await ctx.reportProgress(100, 'Thesis generated');
  await ctx.emit('THESIS_GENERATED', { thesisId: thesis.id, symbol: thesis.symbol });

  return {
    success: true,
    output: { thesis },
    metrics: { confidence: thesis.confidence },
  };
});

bot.registerTaskHandler('EXECUTE_PAPER_TRADE', async (task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  const { thesisId, quantity } = task.inputJson;
  
  const thesis = activeTheses.get(thesisId as string);
  if (!thesis) {
    return { success: false, error: 'Thesis not found' };
  }

  ctx.logger.info('Executing paper trade', { thesisId, symbol: thesis.symbol });

  try {
    const trade = await paperTrader.openTrade(thesis, (quantity as number) || 10);
    await ctx.emit('PAPER_TRADE_OPENED', { tradeId: trade.id, thesisId, symbol: trade.symbol });

    return {
      success: true,
      output: { trade, portfolio: paperTrader.getPortfolio() },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

bot.registerTaskHandler('UPDATE_PAPER_TRADES', async (task: TaskDefinition, ctx: TaskContext): Promise<TaskResult> => {
  ctx.logger.info('Updating open paper trades');
  try {
    const openTrades = paperTrader.getOpenTrades();
    const updated: PaperTrade[] = [];

    for (const trade of openTrades) {
      const thesis = activeTheses.get(trade.thesisId);
      const updatedTrade = await paperTrader.updateTrade(trade.id, thesis);
      updated.push(updatedTrade);

      if (updatedTrade.status === 'CLOSED') {
        await ctx.emit('PAPER_TRADE_CLOSED', {
          tradeId: trade.id,
          pnl: updatedTrade.pnl,
          pnlPercent: updatedTrade.pnlPercent,
        });
      }
    }

    return {
      success: true,
      output: { updatedTrades: updated, stats: await paperTrader.getStats() },
      metrics: { tradesUpdated: updated.length },
    };
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return { success: false, error: 'CANDLE_INTEGRITY_MISSING' };
    }
    throw error;
  }
});

// ============================================================================
// Express Routes - Health & API
// ============================================================================

// Standalone liveness check - always returns 200 if service is running
// This is used by load balancers and monitoring systems
app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'tradebot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Primary health check - returns 200 with degraded status if orchestrator not connected
app.get('/health', (_req: Request, res: Response) => {
  const checks = {
    alpaca: USE_ALPACA ? 'enabled' : 'disabled',
    nexus: nexusTrader.isInitialized() ? 'initialized' : 'not_initialized',
    database: 'ok', // Would check DB if needed
  };
  
  res.json({
    status: 'healthy',
    service: 'tradebot',
    mode: USE_ALPACA ? 'live' : 'paper',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0',
  });
});

// Full readiness with orchestrator (optional)
const healthRoutes = createBotHealthRoutes({ bot });
app.get('/health/full', healthRoutes.healthHandler);
app.get('/ready', healthRoutes.readyHandler);
app.get('/metrics', healthRoutes.metricsHandler);

// Watchlist API
app.get('/api/watchlists', (_req: Request, res: Response) => {
  res.json({ success: true, data: { watchlists: watchlistManager.getAll() } });
});

app.get('/api/watchlists/:id', (req: Request, res: Response) => {
  const watchlist = watchlistManager.get(req.params.id);
  if (!watchlist) {
    return res.status(404).json({ success: false, error: 'Watchlist not found' });
  }
  res.json({ success: true, data: { watchlist } });
});

app.post('/api/watchlists', (req: Request, res: Response) => {
  const { name, symbols } = req.body;
  const watchlist = watchlistManager.create(name, symbols || []);
  res.status(201).json({ success: true, data: { watchlist } });
});

// Scanner API
app.post('/api/scan', async (req: Request, res: Response) => {
  const { watchlistId, symbols, filters } = req.body;
  
  let symbolsToScan: string[];
  if (symbols) {
    symbolsToScan = symbols;
  } else {
    const watchlist = watchlistManager.get(watchlistId || 'default');
    if (!watchlist) {
      return res.status(404).json({ success: false, error: 'Watchlist not found' });
    }
    symbolsToScan = watchlist.symbols;
  }

  try {
    const results = await scanner.scan(symbolsToScan, filters);
    res.json({ success: true, data: { results, scannedAt: nowTimestamp() } });
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    throw error;
  }
});

// AI Screener API - Real market scanning with OpenAI
app.get('/api/ai-screener/status', (_req: Request, res: Response) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const marketdataUrl = process.env.MARKETDATA_URL || 'http://localhost:3020';
  const hasMarketdata = !!marketdataUrl;
  res.json({
    success: true,
    data: {
      ready: hasMarketdata,
      openai: hasOpenAI,
      marketdata: hasMarketdata,
    },
  });
});

app.post('/api/ai-screener/scan', async (req: Request, res: Response) => {
  try {
    const { screenMarket } = await import('./ai-screener');
    const { maxStocks = 50, minConfidence = 65, signalType = 'all' } = req.body;
    
    const signals = await screenMarket({ maxStocks, minConfidence, signalType });
    
    res.json({
      success: true,
      data: {
        signals,
        scannedAt: new Date().toISOString(),
        count: signals.length,
      },
    });
  } catch (error) {
    logger.error('AI screener error', error as Error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.get('/api/ai-screener/top-movers', async (_req: Request, res: Response) => {
  try {
    const { scanTopMovers } = await import('./ai-screener');
    const signals = await scanTopMovers();
    
    res.json({
      success: true,
      data: {
        signals,
        scannedAt: new Date().toISOString(),
        count: signals.length,
      },
    });
  } catch (error) {
    logger.error('Top movers scan error', error as Error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/ai-screener/analyze', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'Symbol required' });
    }
    
    const screener = await import('./ai-screener');
    const stockData = await screener.default.getStockData(symbol.toUpperCase());
    
    if (!stockData) {
      return res.status(404).json({ success: false, error: 'Stock not found' });
    }
    
    const { indicators, provenance } = await screener.default.calculateIndicators(symbol.toUpperCase(), stockData.price);
    const aiResult = await screener.default.analyzeWithAI(stockData, indicators);
    const fallbackResult = aiResult ? null : screener.buildDeterministicSignal(stockData, indicators);

    const picked = aiResult?.signal || fallbackResult?.signal || null;
    const rawConfidence = aiResult?.rawConfidence ?? fallbackResult?.rawConfidence ?? (picked?.confidence ?? 0);

    if (picked) {
      const { adjusted, tag } = screener.applyProvenanceConfidence(rawConfidence, provenance);
      picked.confidence = adjusted;
      picked.rawConfidence = rawConfidence;
      picked.confidenceTag = tag;
      picked.provenance = {
        candles: provenance || null,
        quoteSource: stockData.quoteSource || null,
        model: aiResult ? 'openai:gpt-4o-mini' : 'deterministic',
      };
    }
    
    res.json({
      success: true,
      data: {
        stock: stockData,
        indicators,
        signal: picked,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Stock analysis error', error as Error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Thesis API
app.get('/api/theses', (_req: Request, res: Response) => {
  res.json({ success: true, data: { theses: Array.from(activeTheses.values()) } });
});

app.post('/api/theses', async (req: Request, res: Response) => {
  const {
    symbol,
    entryPrice,
    targetPrice,
    stopLoss,
    direction,
    signal,
    confidence,
    reasoning,
    decisionCardId,
  } = req.body;

  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Symbol required' });
  }

  const hasPrefill = [entryPrice, targetPrice, stopLoss, direction, signal, confidence, reasoning, decisionCardId]
    .some((v) => v !== undefined && v !== null && v !== '');

  if (hasPrefill) {
    const integrity = await resolveLatestIntegrity(symbol);
    if (!integrity) {
      const err = new Error('CANDLE_INTEGRITY_MISSING');
      (err as any).code = 'CANDLE_INTEGRITY_MISSING';
      (err as any).details = [{ symbol, reason: 'integrity_missing' }];
      return respondIntegrityFailure(res, err);
    }

    const quote = await marketData.getQuote(symbol);
    const entry = Number(entryPrice ?? quote?.price ?? 0);
    if (!Number.isFinite(entry) || entry <= 0) {
      return res.status(400).json({ success: false, error: 'Entry price unavailable' });
    }

    const dirRaw = String(direction || signal || 'LONG').toUpperCase();
    const thesisSignal: 'LONG' | 'SHORT' = dirRaw === 'SHORT' || dirRaw === 'SELL' || dirRaw === 'BEARISH' ? 'SHORT' : 'LONG';
    const target = Number(targetPrice ?? (thesisSignal === 'LONG' ? entry * 1.05 : entry * 0.95));
    const stop = Number(stopLoss ?? (thesisSignal === 'LONG' ? entry * 0.97 : entry * 1.03));
    const rrDenom = Math.abs(entry - stop);
    const rr = rrDenom > 0 ? Math.abs(target - entry) / rrDenom : 0;
    const confRaw = typeof confidence === 'number' ? confidence : 0;
    const conf = Math.max(0, Math.min(100, confRaw <= 1 ? Math.round(confRaw * 100) : Math.round(confRaw)));
    const reasoningArr = Array.isArray(reasoning) ? reasoning : typeof reasoning === 'string' ? [reasoning] : [];

    const thesis: ThesisCard = {
      id: generateId(),
      symbol: symbol.toUpperCase(),
      signal: thesisSignal,
      entryPrice: entry,
      targetPrice: Number.isFinite(target) ? target : entry,
      stopLoss: Number.isFinite(stop) ? stop : entry,
      riskRewardRatio: Number.isFinite(rr) ? Math.round(rr * 100) / 100 : 0,
      confidence: conf,
      reasoning: reasoningArr,
      createdAt: nowTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      dataIntegrity: integrity,
      decisionCardId: decisionCardId || null,
    };

    activeTheses.set(thesis.id, thesis);
    return res.status(201).json({ success: true, data: { thesis } });
  }

  let scanResults: ScannerResult[];
  try {
    scanResults = await scanner.scan([symbol]);
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    throw error;
  }
  
  if (scanResults.length === 0) {
    return res.status(400).json({ success: false, error: 'Could not analyze symbol' });
  }

  const thesis = thesisGenerator.generate(scanResults[0]);
  activeTheses.set(thesis.id, thesis);
  res.status(201).json({ success: true, data: { thesis } });
});

// Paper Trading API
app.get('/api/trades', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        trades: paperTrader.getAllTrades(),
        stats: await paperTrader.getStats(),
        portfolio: paperTrader.getPortfolio(),
      },
    });
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    throw error;
  }
});

app.post('/api/trades', async (req: Request, res: Response) => {
  const { thesisId, quantity } = req.body;
  const thesis = activeTheses.get(thesisId);
  
  if (!thesis) {
    return res.status(404).json({ success: false, error: 'Thesis not found' });
  }

  try {
    const trade = await paperTrader.openTrade(thesis, quantity || 10);
    res.status(201).json({ success: true, data: { trade } });
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/trades/:id/close', async (req: Request, res: Response) => {
  try {
    const trade = await paperTrader.closeTrade(req.params.id);
    res.json({ success: true, data: { trade } });
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Market Data API
app.get('/api/quotes/:symbol', async (req: Request, res: Response) => {
  const quote = await marketData.getQuote(req.params.symbol);
  if (!quote) {
    return res.status(503).json({ success: false, error: 'Market quote unavailable' });
  }
  res.json({ success: true, data: { quote } });
});

// ============================================================================
// TRADE Decision Card analysis (Sprint Zero T8) — universal nova_cards
// ============================================================================
app.post('/api/trade/analyze', async (req: Request, res: Response) => {
  const { symbol, sessionId } = req.body || {};
  if (!symbol || typeof symbol !== 'string') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'symbol is required' },
    });
  }

  const userId = (req.headers['x-user-id'] as string) || null;

  try {
    const card = await analyzeStock({
      symbol,
      userId,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });

    // Persist to the universal nova_cards table (best-effort).
    let persisted = false;
    try {
      const { text, values } = novaCardInsert(card);
      await query(text, values);
      persisted = true;
    } catch (err) {
      logger.warn('Trade card persistence failed (returning card anyway)', {
        error: (err as Error).message,
      });
    }

    res.json({ success: true, data: { card, persisted } });
  } catch (error) {
    logger.error('Trade analysis failed', error as Error);
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'TRADE_ANALYSIS_FAILED', message: 'Trade analysis unavailable' },
    });
  }
});

// ============================================================================
// Alpaca Trading API
// ============================================================================

app.get('/api/alpaca/status', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: alpaca.isEnabled(),
      endpoint: ALPACA_ENDPOINT,
    },
  });
});

app.get('/api/alpaca/account', async (_req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const account = await alpaca.getAccount();
  if (!account) {
    return res.status(500).json({ success: false, error: 'Failed to fetch Alpaca account' });
  }
  res.json({ success: true, data: { account } });
});

app.get('/api/alpaca/positions', async (_req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const positions = await alpaca.getPositions();
  res.json({ success: true, data: { positions } });
});

app.get('/api/alpaca/orders', async (req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const status = (req.query.status as 'open' | 'closed' | 'all') || 'all';
  const orders = await alpaca.getOrders(status);
  res.json({ success: true, data: { orders } });
});

app.post('/api/alpaca/orders', async (req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  
  const { symbol, qty, side, type, time_in_force, limit_price, stop_price } = req.body;
  
  if (!symbol || !qty || !side) {
    return res.status(400).json({ success: false, error: 'Missing required fields: symbol, qty, side' });
  }
  
  const order = await alpaca.placeOrder({
    symbol: symbol.toUpperCase(),
    qty: Number(qty),
    side,
    type,
    time_in_force,
    limit_price: limit_price ? Number(limit_price) : undefined,
    stop_price: stop_price ? Number(stop_price) : undefined,
  });
  
  if (!order) {
    return res.status(500).json({ success: false, error: 'Failed to place order' });
  }
  
  res.status(201).json({ success: true, data: { order } });
});

app.delete('/api/alpaca/orders/:orderId', async (req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const cancelled = await alpaca.cancelOrder(req.params.orderId);
  res.json({ success: cancelled, data: { cancelled } });
});

app.delete('/api/alpaca/positions/:symbol', async (req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const order = await alpaca.closePosition(req.params.symbol.toUpperCase());
  if (!order) {
    return res.status(500).json({ success: false, error: 'Failed to close position' });
  }
  res.json({ success: true, data: { order } });
});

app.delete('/api/alpaca/positions', async (_req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  const orders = await alpaca.closeAllPositions();
  res.json({ success: true, data: { orders } });
});

// Execute thesis via Alpaca (real paper trade)
app.post('/api/alpaca/execute-thesis', async (req: Request, res: Response) => {
  if (!alpaca.isEnabled()) {
    return res.status(400).json({ success: false, error: 'Alpaca not configured' });
  }
  
  const { thesisId, qty } = req.body;
  const thesis = activeTheses.get(thesisId);
  
  if (!thesis) {
    return res.status(404).json({ success: false, error: 'Thesis not found' });
  }
  
  const side = thesis.signal === 'LONG' ? 'buy' : 'sell';
  const order = await alpaca.placeOrder({
    symbol: thesis.symbol,
    qty: qty || 1,
    side,
    type: 'market',
    time_in_force: 'day',
  });
  
  if (!order) {
    return res.status(500).json({ success: false, error: 'Failed to execute thesis on Alpaca' });
  }
  
  res.status(201).json({ 
    success: true, 
    data: { 
      order, 
      thesis: { id: thesis.id, symbol: thesis.symbol, signal: thesis.signal } 
    } 
  });
});

// ============================================================================
// Alerts Manager (in-memory for MVP)
// ============================================================================

interface Alert {
  id: string;
  symbol: string;
  alertType: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'SCORE_ABOVE' | 'RSI_ABOVE' | 'RSI_BELOW';
  threshold: number;
  isTriggered: boolean;
  triggeredAt?: string;
  isActive: boolean;
  createdAt: string;
}

const alerts: Map<string, Alert> = new Map();

// ============================================================================
// Adaptive Threshold Engine — Diagnostics
// ============================================================================

app.get('/api/adaptive-thresholds', (_req: Request, res: Response) => {
  const ate = getAdaptiveEngine();
  res.json({ success: true, data: ate.getDiagnostics() });
});

app.get('/api/adaptive-thresholds/:symbol', (req: Request, res: Response) => {
  const ate = getAdaptiveEngine();
  const symbol = req.params.symbol.toUpperCase();
  const params = ate.getAdaptiveParams(symbol);
  const atr = ate.getATR(symbol);
  const vol = ate.getVolatilityState();
  res.json({ success: true, data: { symbol, params, atr, volatility: vol } });
});

app.get('/api/alerts', (_req: Request, res: Response) => {
  res.json({ success: true, data: { alerts: Array.from(alerts.values()) } });
});

app.post('/api/alerts', (req: Request, res: Response) => {
  const { symbol, alertType, threshold } = req.body;
  
  if (!symbol || !alertType || threshold === undefined) {
    return res.status(400).json({ success: false, error: 'Missing required fields: symbol, alertType, threshold' });
  }

  const alert: Alert = {
    id: generateId(),
    symbol: symbol.toUpperCase(),
    alertType,
    threshold: Number(threshold),
    isTriggered: false,
    isActive: true,
    createdAt: nowTimestamp(),
  };
  
  alerts.set(alert.id, alert);
  res.status(201).json({ success: true, data: { alert } });
});

app.delete('/api/alerts/:id', (req: Request, res: Response) => {
  const alert = alerts.get(req.params.id);
  if (!alert) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }
  alerts.delete(req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

// Check alerts (can be called periodically)
app.post('/api/alerts/check', async (_req: Request, res: Response) => {
  try {
    const triggered: Alert[] = [];
    
    for (const alert of alerts.values()) {
      if (!alert.isActive || alert.isTriggered) continue;
      
      try {
        const quote = await marketData.getQuote(alert.symbol);
        let shouldTrigger = false;

        switch (alert.alertType) {
          case 'PRICE_ABOVE': {
            if (quote) shouldTrigger = quote.price >= alert.threshold;
            break;
          }
          case 'PRICE_BELOW': {
            if (quote) shouldTrigger = quote.price <= alert.threshold;
            break;
          }
          case 'SCORE_ABOVE': {
            const results = await scanner.scan([alert.symbol]);
            if (results.length > 0) {
              shouldTrigger = results[0].score >= alert.threshold;
            }
            break;
          }
          case 'RSI_ABOVE':
          case 'RSI_BELOW': {
            const indicators = await marketData.getIndicators(alert.symbol);
            if (!indicators || !hasIntegrityFields(indicators.integrity)) {
              const err = new Error('CANDLE_INTEGRITY_MISSING');
              (err as any).code = 'CANDLE_INTEGRITY_MISSING';
              (err as any).details = [{ symbol: alert.symbol, reason: 'integrity_missing' }];
              throw err;
            }
            const rsi = indicators.rsi;
            if (typeof rsi === 'number' && Number.isFinite(rsi)) {
              shouldTrigger = alert.alertType === 'RSI_ABOVE' ? rsi >= alert.threshold : rsi <= alert.threshold;
            }
            break;
          }
        }
        
        if (shouldTrigger) {
          alert.isTriggered = true;
          alert.triggeredAt = nowTimestamp();
          triggered.push(alert);
        }
      } catch (err) {
        if (isIntegrityFailure(err)) {
          throw err;
        }
        logger.warn('Failed to check alert', { alertId: alert.id, error: (err as Error).message });
      }
    }
    
    res.json({ success: true, data: { triggered, checkedAt: nowTimestamp() } });
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    throw error;
  }
});

// ============================================================================
// CSV Export
// ============================================================================

app.get('/api/export/trades.csv', (_req: Request, res: Response) => {
  const trades = paperTrader.getAllTrades();
  
  const headers = ['id', 'symbol', 'side', 'quantity', 'entryPrice', 'exitPrice', 'status', 'pnl', 'pnlPercent', 'openedAt', 'closedAt'];
  const rows = trades.map(t => [
    t.id,
    t.symbol,
    t.side,
    t.quantity,
    t.entryPrice,
    t.exitPrice ?? '',
    t.status,
    t.pnl ?? '',
    t.pnlPercent ?? '',
    t.openedAt,
    t.closedAt ?? '',
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="trades-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

app.get('/api/export/scan.csv', async (req: Request, res: Response) => {
  const { watchlistId } = req.query;
  const watchlist = watchlistManager.get((watchlistId as string) || 'default');
  
  if (!watchlist) {
    return res.status(404).json({ success: false, error: 'Watchlist not found' });
  }
  
  let results: ScannerResult[];
  try {
    results = await scanner.scan(watchlist.symbols);
  } catch (error) {
    if (isIntegrityFailure(error)) {
      return respondIntegrityFailure(res, error);
    }
    throw error;
  }
  
  const headers = ['symbol', 'signal', 'score', 'price', 'change', 'changePercent', 'rsi', 'macd', 'volume'];
  const rows = results.map(r => [
    r.symbol,
    r.signal,
    r.score,
    r.quote.price,
    r.quote.change,
    r.quote.changePercent,
    r.indicators.rsi ?? '',
    r.indicators.macd ?? '',
    r.quote.volume,
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="scan-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

app.get('/api/export/theses.csv', (_req: Request, res: Response) => {
  const theses = Array.from(activeTheses.values());
  
  const headers = ['id', 'symbol', 'signal', 'entryPrice', 'targetPrice', 'stopLoss', 'riskRewardRatio', 'confidence', 'createdAt', 'expiresAt'];
  const rows = theses.map(t => [
    t.id,
    t.symbol,
    t.signal,
    t.entryPrice,
    t.targetPrice,
    t.stopLoss,
    t.riskRewardRatio,
    t.confidence.toFixed(1),
    t.createdAt,
    t.expiresAt,
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="theses-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

// ============================================================================
// Nova Nexus AI Integration
// ============================================================================

const nexusTrader = new NexusTrader();

// Initialize Nexus AI
app.post('/api/nexus/initialize', async (_req: Request, res: Response) => {
  try {
    await nexusTrader.initialize();
    res.json({
      success: true,
      data: {
        message: 'Nova Nexus AI initialized',
        status: nexusTrader.getStatus(),
      },
    });
  } catch (error) {
    logger.error('Failed to initialize Nexus', error as Error);
    res.status(500).json({
      success: false,
      error: { code: 'NEXUS_INIT_FAILED', message: 'Failed to initialize Nexus AI' },
    });
  }
});

// Get Nexus status
app.get('/api/nexus/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: nexusTrader.getStatus() },
  });
});

// Execute AI-governed trade analysis
app.post('/api/nexus/analyze', async (req: Request, res: Response) => {
  try {
    const { symbol, signal, price, indicators, confidence, strategyTag, strategy } = req.body;
    
    if (!symbol || !signal) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'symbol and signal required' },
      });
    }
    
    const integrity = await resolveLatestIntegrity(symbol);
    if (!integrity) {
      const err = new Error('CANDLE_INTEGRITY_MISSING');
      (err as any).code = 'CANDLE_INTEGRITY_MISSING';
      (err as any).details = [{ symbol, reason: 'integrity_missing' }];
      return respondIntegrityFailure(res, err);
    }
    const thesis = {
      id: `thesis-${Date.now()}`,
      symbol,
      signal,
      entryPrice: price || 0,
      targetPrice: 0,
      stopLoss: 0,
      riskRewardRatio: 2,
      confidence: confidence || 0.5,
      reasoning: 'AI Analysis',
      indicators: indicators || {},
      dataIntegrity: integrity,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const gate = evaluateExecutionGate({ signalConfidence: thesis.confidence, integrity });
    const { decision, card } = await nexusTrader.evaluateTradeCard(thesis);

    let regime: string | null = null;
    try {
      regime = (nexusTrader.getStatus().regime as any)?.currentRegime ?? null;
    } catch {
      regime = null;
    }

    const score = computeDecisionCardScore(card, gate, regime);
    const persisted = await persistDecisionCard({
      card,
      score,
      metadata: {
        strategyTag: resolveStrategyTag(indicators, strategyTag || strategy),
        confidenceScore: score.signalConfidence,
        sourceType: integrity.source_type,
        latencyClass: integrity.latency_class,
        regime,
        status: decision.approved ? 'ACTIVE' : 'REJECTED',
        expiresAt: thesis.expiresAt,
        gate,
      },
    });

    if (!persisted) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'DECISION_CARD_PERSIST_FAILED', message: 'Failed to persist decision card' },
      });
    }
    
    res.json({
      success: true,
      data: {
        decision,
        card,
        decisionCardId: persisted.id,
        message: decision.approved ? 'Trade approved by Nova Nexus' : 'Trade rejected by Nova Nexus',
      },
    });
  } catch (error) {
    logger.error('Nexus analysis failed', error as Error);
    res.status(500).json({
      success: false,
      error: { code: 'NEXUS_ANALYZE_FAILED', message: 'Nexus analysis failed' },
    });
  }
});

// Execute AI-governed trade
app.post('/api/nexus/execute', async (req: Request, res: Response) => {
  try {
    const { symbol, signal, price, indicators, confidence, autoExecute, strategyTag, strategy } = req.body;
    
    if (!symbol || !signal) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'symbol and signal required' },
      });
    }
    
    const integrity = await resolveLatestIntegrity(symbol);
    if (!integrity) {
      const err = new Error('CANDLE_INTEGRITY_MISSING');
      (err as any).code = 'CANDLE_INTEGRITY_MISSING';
      (err as any).details = [{ symbol, reason: 'integrity_missing' }];
      return respondIntegrityFailure(res, err);
    }
    const thesis = {
      id: `thesis-${Date.now()}`,
      symbol,
      signal,
      entryPrice: price || 0,
      targetPrice: price ? price * (signal === 'BUY' ? 1.05 : 0.95) : 0,
      stopLoss: price ? price * (signal === 'BUY' ? 0.98 : 1.02) : 0,
      riskRewardRatio: 2.5,
      confidence: confidence || 0.6,
      reasoning: 'AI-Governed Execution',
      indicators: indicators || {},
      dataIntegrity: integrity,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const gate = evaluateExecutionGate({ signalConfidence: thesis.confidence, integrity });
    const { decision, card } = await nexusTrader.evaluateTradeCard(thesis);

    let regime: string | null = null;
    try {
      regime = (nexusTrader.getStatus().regime as any)?.currentRegime ?? null;
    } catch {
      regime = null;
    }

    const score = computeDecisionCardScore(card, gate, regime);
    const persisted = await persistDecisionCard({
      card,
      score,
      metadata: {
        strategyTag: resolveStrategyTag(indicators, strategyTag || strategy),
        confidenceScore: score.signalConfidence,
        sourceType: integrity.source_type,
        latencyClass: integrity.latency_class,
        regime,
        status: decision.approved ? 'ACTIVE' : 'REJECTED',
        expiresAt: thesis.expiresAt,
        gate,
      },
    });

    if (!persisted) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'DECISION_CARD_PERSIST_FAILED', message: 'Failed to persist decision card' },
      });
    }
    const gateWithPolicy = applyStrategyPolicyToGate(gate, persisted.strategy ?? null);

    if (autoExecute !== false && gateWithPolicy.mode !== 'live') {
      if (gateWithPolicy.mode === 'paper') {
        const paperThesis = buildPaperThesisFromNexus(thesis, integrity);
        if (!paperThesis) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            error: { code: 'INVALID_THESIS', message: 'Paper demotion requires BUY or SELL signal' },
          });
        }
        const quantity = Math.max(1, Math.floor(1000 / Math.max(1, paperThesis.entryPrice)));
        let trade: PaperTrade;
        try {
          trade = await paperTrader.openTrade(paperThesis, quantity);
        } catch (error) {
          if (isIntegrityFailure(error)) {
            return respondIntegrityFailure(res, error);
          }
          throw error;
        }
        return res.status(HTTP_STATUS.ACCEPTED).json({
          success: true,
          data: {
            result: { executed: false, decision: { approved: false, reasoning: 'Demoted to paper execution', constraints: gateWithPolicy.reasons, tier: 'PAPER', confidence: gateWithPolicy.signalConfidence, timestamp: nowTimestamp() } },
            executionMode: 'paper',
            gate: gateWithPolicy,
            paperTrade: trade,
            decisionCardId: persisted.id,
            message: 'Execution demoted to paper trading due to data integrity or confidence gates.',
          },
        });
      }

      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        success: false,
        error: { code: 'EXECUTION_BLOCKED', message: 'Execution blocked by confidence gates', details: { gate: gateWithPolicy, decisionCardId: persisted.id } },
      });
    }

    const result = await nexusTrader.executeAITrade(thesis, autoExecute !== false, decision);
    
    res.json({
      success: true,
      data: {
        result,
        decisionCardId: persisted.id,
        executionMode: gateWithPolicy.mode,
        gate: gateWithPolicy,
        message: result.executed ? 'Trade executed by Nova Nexus' : result.decision.reasoning,
      },
    });
  } catch (error) {
    logger.error('Nexus execution failed', error as Error);
    res.status(500).json({
      success: false,
      error: { code: 'NEXUS_EXECUTE_FAILED', message: 'Nexus execution failed' },
    });
  }
});

// Get decision ledger
app.get('/api/nexus/ledger', (req: Request, res: Response) => {
  const { limit } = req.query;
  const ledger = nexusTrader.getDecisionLedger(limit ? parseInt(limit as string) : 50);
  res.json({ success: true, data: { ledger } });
});

// Run autonomous scan with Nexus AI
app.post('/api/nexus/autonomous-scan', async (req: Request, res: Response) => {
  try {
    const { watchlistId, maxTrades } = req.body;
    const watchlist = watchlistManager.get(watchlistId || 'default');
    
    if (!watchlist) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Watchlist not found' },
      });
    }
    
    // Scan market
    let scanResults: ScannerResult[];
    try {
      scanResults = await scanner.scan(watchlist.symbols);
    } catch (error) {
      if (isIntegrityFailure(error)) {
        return respondIntegrityFailure(res, error);
      }
      throw error;
    }
    
    // Filter strong signals
    const opportunities = scanResults.filter(r => 
      r.score >= 70 && (r.signal === 'BUY' || r.signal === 'SELL')
    );
    
    const executions = [];
    let regime: string | null = null;
    try {
      regime = (nexusTrader.getStatus().regime as any)?.currentRegime ?? null;
    } catch {
      regime = null;
    }
    const limit = maxTrades || 3;
    
    for (const opp of opportunities.slice(0, limit)) {
      if (!hasIntegrityFields(opp.integrity)) {
        const err = new Error('CANDLE_INTEGRITY_MISSING');
        (err as any).code = 'CANDLE_INTEGRITY_MISSING';
        (err as any).details = [{ symbol: opp.symbol, reason: 'integrity_missing' }];
        return respondIntegrityFailure(res, err);
      }

      const thesis = {
        id: `auto-${Date.now()}-${opp.symbol}`,
        symbol: opp.symbol,
        signal: opp.signal,
        entryPrice: opp.quote.price,
        targetPrice: opp.quote.price * (opp.signal === 'BUY' ? 1.05 : 0.95),
        stopLoss: opp.quote.price * (opp.signal === 'BUY' ? 0.97 : 1.03),
        riskRewardRatio: 2.5,
        confidence: opp.score / 100,
        reasoning: `Auto-scan: ${opp.signal} signal with score ${opp.score}`,
        indicators: opp.indicators,
        dataIntegrity: opp.integrity,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      };
      const gate = evaluateExecutionGate({ signalConfidence: thesis.confidence, integrity: opp.integrity });
      const { decision, card } = await nexusTrader.evaluateTradeCard(thesis);
      const score = computeDecisionCardScore(card, gate, regime);
      const persisted = await persistDecisionCard({
        card,
        score,
        metadata: {
          strategyTag: resolveStrategyTag(opp.indicators),
          confidenceScore: score.signalConfidence,
          sourceType: opp.integrity?.source_type ?? null,
          latencyClass: opp.integrity?.latency_class ?? null,
          regime,
          status: decision.approved ? 'ACTIVE' : 'REJECTED',
          expiresAt: thesis.expiresAt,
          gate,
        },
      });

      if (!persisted) {
        executions.push({
          symbol: opp.symbol,
          decision,
          executed: false,
          error: 'DECISION_CARD_PERSIST_FAILED',
          decisionCardId: null,
        });
        continue;
      }
      const gateWithPolicy = applyStrategyPolicyToGate(gate, persisted.strategy ?? null);

      if (gateWithPolicy.mode !== 'live') {
        if (gateWithPolicy.mode === 'paper') {
          const paperThesis = buildPaperThesisFromNexus(thesis, opp.integrity);
          if (!paperThesis) {
            executions.push({
              symbol: opp.symbol,
              decision,
              executed: false,
              error: 'INVALID_THESIS',
              decisionCardId: persisted.id,
            });
            continue;
          }
          const quantity = Math.max(1, Math.floor(1000 / Math.max(1, paperThesis.entryPrice)));
          let trade: PaperTrade;
          try {
            trade = await paperTrader.openTrade(paperThesis, quantity);
          } catch (error) {
            executions.push({
              symbol: opp.symbol,
              decision,
              executed: false,
              executionMode: 'paper',
              gate,
              error: (error as Error).message,
              decisionCardId: persisted.id,
            });
            continue;
          }
          executions.push({
            symbol: opp.symbol,
            decision: { approved: false, reasoning: 'Demoted to paper execution', constraints: gateWithPolicy.reasons, tier: 'PAPER', confidence: gateWithPolicy.signalConfidence, timestamp: nowTimestamp() },
            executed: false,
            executionMode: 'paper',
            gate: gateWithPolicy,
            paperTrade: trade,
            decisionCardId: persisted.id,
          });
          continue;
        }

        executions.push({
          symbol: opp.symbol,
          decision,
          executed: false,
          executionMode: gateWithPolicy.mode,
          gate: gateWithPolicy,
          error: 'EXECUTION_BLOCKED',
          decisionCardId: persisted.id,
        });
        continue;
      }

      const result = await nexusTrader.executeAITrade(thesis, true, decision);
      executions.push({ symbol: opp.symbol, ...result, decisionCardId: persisted.id });
    }
    
    res.json({
      success: true,
      data: {
        scanned: scanResults.length,
        opportunities: opportunities.length,
        executions,
      },
    });
  } catch (error) {
    logger.error('Autonomous scan failed', error as Error);
    res.status(500).json({
      success: false,
      error: { code: 'NEXUS_AUTONOMOUS_SCAN_FAILED', message: 'Autonomous scan failed' },
    });
  }
});

// Stop Nexus
app.post('/api/nexus/stop', async (_req: Request, res: Response) => {
  try {
    await nexusTrader.shutdown();
    res.json({
      success: true,
      data: { message: 'Nova Nexus AI stopped' },
    });
  } catch (error) {
    logger.error('Failed to stop Nexus', error as Error);
    res.status(500).json({
      success: false,
      error: { code: 'NEXUS_STOP_FAILED', message: 'Failed to stop Nexus AI' },
    });
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  try {
    // Start Express server first
    app.listen(PORT, () => {
      logger.info(`TradeBot API server started on port ${PORT}`);
    });

    // Try to connect to orchestrator (graceful if not available)
    try {
      await bot.start();
      logger.info('TradeBot connected to orchestrator');
    } catch (error) {
      logger.warn('Could not connect to orchestrator, running in standalone mode', { error });
    }
  } catch (error) {
    logger.error('Failed to start TradeBot', error as Error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await bot.stop();
  process.exit(0);
});

main();

export default app;

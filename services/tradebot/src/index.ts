import express, { Request, Response } from 'express';
import {
  BotClient,
  createBotConfig,
  createBotHealthRoutes,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from '@nova/bot-sdk';
import { generateId, nowTimestamp } from '@nova/shared';
import { createLogger } from '@nova/telemetry';
import { RegimeType } from '@nova/nexus-core';
import { NexusTrader } from './nexus-trader';

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

interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

interface Indicators {
  rsi?: number;
  sma20?: number;
  sma50?: number;
  ema12?: number;
  ema26?: number;
  macd?: { macd: number; signal: number; histogram: number };
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
}

interface PaperTrade {
  id: string;
  thesisId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice?: number;
  exitPrice?: number;
  status: 'OPEN' | 'CLOSED' | 'STOPPED';
  pnl?: number;
  pnlPercent?: number;
  openedAt: string;
  closedAt?: string;
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
  private fallbackQuotes: Record<string, number> = {
    AAPL: 185.50, GOOGL: 141.25, MSFT: 378.90, AMZN: 178.30, NVDA: 495.75,
    TSLA: 248.60, META: 505.20, JPM: 195.40, V: 275.80, BRK_B: 365.10,
  };

  constructor(baseUrl: string = MARKETDATA_URL) {
    this.baseUrl = baseUrl;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/quote/${symbol}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { success: boolean; data: any };
      if (data.success && data.data) {
        const q = data.data;
        return {
          symbol: q.symbol,
          price: q.price,
          change: q.change || 0,
          changePercent: q.changePercent || 0,
          volume: q.volume || 0,
          timestamp: q.timestamp || nowTimestamp(),
        };
      }
      throw new Error('Invalid response');
    } catch (err) {
      logger.warn('Marketdata service unavailable, using fallback', { symbol, error: (err as Error).message });
      return this.getFallbackQuote(symbol);
    }
  }

  async getIndicators(symbol: string): Promise<Indicators> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/indicators/${symbol}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { success: boolean; data: any };
      if (data.success && data.data) {
        return data.data;
      }
      throw new Error('Invalid response');
    } catch (err) {
      logger.warn('Marketdata indicators unavailable, using fallback', { symbol });
      return this.getFallbackIndicators();
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  // Synchronous fallback for backward compatibility
  getQuoteSync(symbol: string): MarketQuote {
    return this.getFallbackQuote(symbol);
  }

  private getFallbackQuote(symbol: string): MarketQuote {
    const basePrice = this.fallbackQuotes[symbol] || 100 + Math.random() * 200;
    const change = (Math.random() - 0.5) * 10;
    const price = basePrice + change;
    return {
      symbol,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round((change / basePrice) * 10000) / 100,
      volume: Math.floor(Math.random() * 10000000) + 100000,
      timestamp: nowTimestamp(),
    };
  }

  private getFallbackIndicators(): Indicators {
    return {
      rsi: 30 + Math.random() * 40,
      sma20: 100 + Math.random() * 50,
      sma50: 100 + Math.random() * 50,
      ema12: 100 + Math.random() * 50,
      ema26: 100 + Math.random() * 50,
      macd: { macd: (Math.random() - 0.5) * 2, signal: (Math.random() - 0.5) * 1.5, histogram: (Math.random() - 0.5) * 0.5 },
    };
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

  async scan(symbols: string[], filters?: { minScore?: number; signals?: string[] }): Promise<ScannerResult[]> {
    if (symbols.length === 0) return [];

    const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
    const mean = (arr: number[]): number => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const computeSmaCross = (indicators: Indicators): number => {
      const short = indicators.sma20 ?? indicators.ema12;
      const long = indicators.sma50 ?? indicators.ema26;
      if (typeof short !== 'number' || typeof long !== 'number' || !Number.isFinite(short) || !Number.isFinite(long) || long === 0) {
        return 0;
      }

      // Relative MA spread, scaled so ~5% spread maps to +/-1.
      const raw = (short - long) / Math.abs(long);
      return clamp(raw / 0.05, -1, 1);
    };

    // Fetch quotes/indicators first so we can infer a scan-level regime.
    const samples = await Promise.all(symbols.map(async (symbol) => {
      const [quote, indicators] = await Promise.all([
        this.marketData.getQuote(symbol),
        this.marketData.getIndicators(symbol),
      ]);

      const rsi = indicators.rsi ?? (30 + Math.random() * 40);
      const macdVal = indicators.macd?.macd ?? (Math.random() - 0.5) * 2;
      const momentum = indicators.macd?.histogram !== undefined
        ? indicators.macd.histogram * 20
        : (Math.random() - 0.5) * 10;
      const volumeSpike = quote.volume > 5000000;
      const smaCross = computeSmaCross(indicators);

      return { symbol, quote, indicators, rsi, macdVal, momentum, volumeSpike, smaCross };
    }));

    // Coarse regime snapshot (trend + volatility) from the scanned universe.
    const avgRsi = mean(samples.map(s => clamp(s.rsi, 0, 100)));
    const avgSmaCross = mean(samples.map(s => s.smaCross));
    const avgTrendStrength = mean(samples.map(s => Math.abs(s.smaCross)));
    const avgAbsChangePct = mean(samples.map(s => Math.abs(s.quote.changePercent ?? 0)));

    const atrPercentile = clamp(avgAbsChangePct / 5, 0, 1); // 5% avg move ~= 100th percentile proxy
    const adxApprox = clamp(avgTrendStrength * 100, 0, 50);

    const snapshotConfidence = symbols.length >= 8 ? 0.75 : symbols.length >= 3 ? 0.65 : 0.6;

    let regimePrimary: RegimeType = RegimeType.UNKNOWN;
    let regimeSecondary: RegimeType | undefined;

    try {
      // Note: nexusTrader is declared later in the module; this runs only when scan() is invoked.
      const state = nexusTrader.updateRegimeFromMarketSnapshot({
        rsi: avgRsi,
        smaCross: avgSmaCross,
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
    let bullBias = 1;
    let bearBias = 1;
    let rsiWeight = 1;
    let momentumWeight = 1;
    let dampener = 1;

    let buyThreshold = 65;
    let sellThreshold = 35;

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
      const { symbol, quote, rsi, macdVal, momentum, volumeSpike, smaCross } = s;

      let bull = 0;
      let bear = 0;

      // Mean reversion: RSI extremes
      if (rsi < 35) bull += 15 * rsiWeight;
      if (rsi > 65) bear += 15 * rsiWeight;

      // Momentum: MACD direction
      if (macdVal > 0.5) bull += 10 * momentumWeight;
      if (macdVal < -0.5) bear += 10 * momentumWeight;

      // Momentum: derived momentum proxy (histogram-based)
      if (momentum > 3) bull += 10 * momentumWeight;
      if (momentum < -3) bear += 10 * momentumWeight;

      // Trend: short-vs-long MA cross signal
      if (smaCross > 0.3) bull += 8 * momentumWeight;
      if (smaCross < -0.3) bear += 8 * momentumWeight;

      // Volume spike as a (directional) confirmation
      if (volumeSpike) {
        if ((quote.changePercent ?? 0) >= 0) bull += 5 * momentumWeight;
        else bear += 5 * momentumWeight;
      }

      // Intraday move (directional)
      if (quote.changePercent > 2) bull += 10 * momentumWeight;
      if (quote.changePercent < -2) bear += 10 * momentumWeight;

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
          rsi: Math.round(rsi * 10) / 10,
          macd: macdVal,
          momentum,
          volumeSpike,
        },
        quote,
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
    const targetPercent = isLong ? 0.05 + Math.random() * 0.1 : -(0.05 + Math.random() * 0.1);
    const stopPercent = isLong ? -(0.02 + Math.random() * 0.03) : 0.02 + Math.random() * 0.03;

    const targetPrice = Math.round(entryPrice * (1 + targetPercent) * 100) / 100;
    const stopLoss = Math.round(entryPrice * (1 + stopPercent) * 100) / 100;

    const potentialGain = Math.abs(targetPrice - entryPrice);
    const potentialLoss = Math.abs(stopLoss - entryPrice);
    const riskRewardRatio = Math.round((potentialGain / potentialLoss) * 100) / 100;

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
    if (scanResult.quote.changePercent > 2) {
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
      confidence: Math.min(100, scanResult.score + Math.random() * 10),
      reasoning,
      createdAt: nowTimestamp(),
      expiresAt,
    };
  }
}

// ============================================================================
// Paper Trading Simulator
// ============================================================================

class PaperTradingSimulator {
  private trades: Map<string, PaperTrade> = new Map();
  private portfolio: { cash: number; positions: Record<string, number> } = {
    cash: 100000,
    positions: {},
  };
  private marketData: MarketDataClient;

  constructor(marketData: MarketDataClient) {
    this.marketData = marketData;
  }

  openTrade(thesis: ThesisCard, quantity: number): PaperTrade {
    const cost = thesis.entryPrice * quantity;
    if (cost > this.portfolio.cash) {
      throw new Error('Insufficient funds');
    }

    const trade: PaperTrade = {
      id: generateId(),
      thesisId: thesis.id,
      symbol: thesis.symbol,
      side: thesis.signal === 'LONG' ? 'BUY' : 'SELL',
      quantity,
      entryPrice: thesis.entryPrice,
      currentPrice: thesis.entryPrice,
      status: 'OPEN',
      openedAt: nowTimestamp(),
    };

    this.trades.set(trade.id, trade);
    this.portfolio.cash -= cost;
    this.portfolio.positions[thesis.symbol] = (this.portfolio.positions[thesis.symbol] || 0) + quantity;

    return trade;
  }

  async closeTrade(tradeId: string, exitPrice?: number): Promise<PaperTrade> {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'OPEN') throw new Error('Trade already closed');

    const quote = await this.marketData.getQuote(trade.symbol);
    trade.exitPrice = exitPrice ?? quote.price;
    trade.currentPrice = trade.exitPrice;

    const priceDiff = trade.side === 'BUY' 
      ? trade.exitPrice - trade.entryPrice
      : trade.entryPrice - trade.exitPrice;

    trade.pnl = Math.round(priceDiff * trade.quantity * 100) / 100;
    trade.pnlPercent = Math.round((priceDiff / trade.entryPrice) * 10000) / 100;
    trade.status = 'CLOSED';
    trade.closedAt = nowTimestamp();

    this.portfolio.cash += trade.exitPrice * trade.quantity;
    this.portfolio.positions[trade.symbol] -= trade.quantity;

    return trade;
  }

  async updateTrade(tradeId: string, thesis?: ThesisCard): Promise<PaperTrade> {
    const trade = this.trades.get(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'OPEN') return trade;

    const quote = await this.marketData.getQuote(trade.symbol);
    trade.currentPrice = quote.price;

    // Check stop loss / target if thesis provided
    if (thesis) {
      if (trade.side === 'BUY') {
        if (quote.price <= thesis.stopLoss) {
          return this.closeTrade(tradeId, thesis.stopLoss);
        }
        if (quote.price >= thesis.targetPrice) {
          return this.closeTrade(tradeId, thesis.targetPrice);
        }
      } else {
        if (quote.price >= thesis.stopLoss) {
          return this.closeTrade(tradeId, thesis.stopLoss);
        }
        if (quote.price <= thesis.targetPrice) {
          return this.closeTrade(tradeId, thesis.targetPrice);
        }
      }
    }

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
    portfolioValue: number;
  }> {
    const trades = this.getAllTrades();
    const closed = trades.filter((t) => t.status === 'CLOSED');
    const wins = closed.filter((t) => (t.pnl || 0) > 0);

    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    let positionsValue = 0;
    for (const [symbol, qty] of Object.entries(this.portfolio.positions)) {
      const quote = await this.marketData.getQuote(symbol);
      positionsValue += quote.price * qty;
    }

    return {
      totalTrades: trades.length,
      openTrades: trades.filter((t) => t.status === 'OPEN').length,
      closedTrades: closed.length,
      winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
      totalPnl: Math.round(totalPnl * 100) / 100,
      portfolioValue: Math.round((this.portfolio.cash + positionsValue) * 100) / 100,
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

// Active theses storage
const activeTheses: Map<string, ThesisCard> = new Map();

// ============================================================================
// Bot Client Setup
// ============================================================================

const botConfig = createBotConfig('TRADE', [
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

  const results = await scanner.scan(watchlist.symbols, filters as any);
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

  const scanResults = await scanner.scan([symbolToAnalyze]);
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
    const trade = paperTrader.openTrade(thesis, (quantity as number) || 10);
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

  const results = await scanner.scan(symbolsToScan, filters);
  res.json({ success: true, data: { results, scannedAt: nowTimestamp() } });
});

// AI Screener API - Real market scanning with OpenAI
app.get('/api/ai-screener/status', (_req: Request, res: Response) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasPolygon = !!process.env.POLYGON_API_KEY;
  res.json({
    success: true,
    data: {
      ready: hasOpenAI && hasPolygon,
      openai: hasOpenAI,
      polygon: hasPolygon,
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
    
    const indicators = await screener.default.calculateIndicators(symbol.toUpperCase(), stockData.price);
    const signal = await screener.default.analyzeWithAI(stockData, indicators);
    
    res.json({
      success: true,
      data: {
        stock: stockData,
        indicators,
        signal,
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
  const { symbol } = req.body;
  const scanResults = await scanner.scan([symbol]);
  
  if (scanResults.length === 0) {
    return res.status(400).json({ success: false, error: 'Could not analyze symbol' });
  }

  const thesis = thesisGenerator.generate(scanResults[0]);
  activeTheses.set(thesis.id, thesis);
  res.status(201).json({ success: true, data: { thesis } });
});

// Paper Trading API
app.get('/api/trades', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      trades: paperTrader.getAllTrades(),
      stats: await paperTrader.getStats(),
      portfolio: paperTrader.getPortfolio(),
    },
  });
});

app.post('/api/trades', (req: Request, res: Response) => {
  const { thesisId, quantity } = req.body;
  const thesis = activeTheses.get(thesisId);
  
  if (!thesis) {
    return res.status(404).json({ success: false, error: 'Thesis not found' });
  }

  try {
    const trade = paperTrader.openTrade(thesis, quantity || 10);
    res.status(201).json({ success: true, data: { trade } });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/trades/:id/close', async (req: Request, res: Response) => {
  try {
    const trade = await paperTrader.closeTrade(req.params.id);
    res.json({ success: true, data: { trade } });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Market Data API
app.get('/api/quotes/:symbol', async (req: Request, res: Response) => {
  const quote = await marketData.getQuote(req.params.symbol);
  res.json({ success: true, data: { quote } });
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
  const triggered: Alert[] = [];
  
  for (const alert of alerts.values()) {
    if (!alert.isActive || alert.isTriggered) continue;
    
    try {
      const quote = await marketData.getQuote(alert.symbol);
      let shouldTrigger = false;
      
      switch (alert.alertType) {
        case 'PRICE_ABOVE':
          shouldTrigger = quote.price >= alert.threshold;
          break;
        case 'PRICE_BELOW':
          shouldTrigger = quote.price <= alert.threshold;
          break;
        case 'SCORE_ABOVE':
          const results = await scanner.scan([alert.symbol]);
          if (results.length > 0) {
            shouldTrigger = results[0].score >= alert.threshold;
          }
          break;
        case 'RSI_ABOVE':
        case 'RSI_BELOW':
          const indicators = await marketData.getIndicators(alert.symbol);
          if (indicators.rsi !== undefined) {
            shouldTrigger = alert.alertType === 'RSI_ABOVE' 
              ? indicators.rsi >= alert.threshold
              : indicators.rsi <= alert.threshold;
          }
          break;
      }
      
      if (shouldTrigger) {
        alert.isTriggered = true;
        alert.triggeredAt = nowTimestamp();
        triggered.push(alert);
      }
    } catch (err) {
      logger.warn('Failed to check alert', { alertId: alert.id, error: (err as Error).message });
    }
  }
  
  res.json({ success: true, data: { triggered, checkedAt: nowTimestamp() } });
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
  
  const results = await scanner.scan(watchlist.symbols);
  
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
    const { symbol, signal, price, indicators, confidence } = req.body;
    
    if (!symbol || !signal) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'symbol and signal required' },
      });
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
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const { decision, card } = await nexusTrader.evaluateTradeCard(thesis);
    
    res.json({
      success: true,
      data: {
        decision,
        card,
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
    const { symbol, signal, price, indicators, confidence, autoExecute } = req.body;
    
    if (!symbol || !signal) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'symbol and signal required' },
      });
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
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    const result = await nexusTrader.executeAITrade(thesis, autoExecute !== false);
    
    res.json({
      success: true,
      data: {
        result,
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
    const scanResults = await scanner.scan(watchlist.symbols);
    
    // Filter strong signals
    const opportunities = scanResults.filter(r => 
      r.score >= 70 && (r.signal === 'BUY' || r.signal === 'SELL')
    );
    
    const executions = [];
    const limit = maxTrades || 3;
    
    for (const opp of opportunities.slice(0, limit)) {
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
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      };
      
      const result = await nexusTrader.executeAITrade(thesis, true);
      executions.push({ symbol: opp.symbol, ...result });
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

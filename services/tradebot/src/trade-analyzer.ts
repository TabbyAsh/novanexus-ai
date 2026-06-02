/**
 * TradeBot Analyzer — the Entropy Refiner for Markets.
 *
 * Produces a real TRADE Decision Card from live marketdata (Alpaca / Yahoo /
 * Polygon / Finnhub via the marketdata service). Paper-only: governance stays
 * in RECOMMEND mode and no orders are placed here.
 *
 * Doctrine: NVX-DOCTRINE-001 Sprint Zero, Task T8 + Section 07 pipeline.
 * Technical Law 01 — unavailable indicators are null, never fabricated.
 */

import { buildDecisionCard, nowTimestamp } from '@nova/shared';
import type { DecisionCard, TradeMetrics, DataSource, RecommendedAction, RiskLevel } from '@nova/shared';
import { createLogger } from '@nova/telemetry';

const logger = createLogger('tradebot-analyzer');

const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

export interface TradeAnalyzeInput {
  symbol: string;
  userId?: string | null;
  sessionId?: string;
}

interface QuoteDTO {
  price: number;
  volume: number | null;
  source?: string;
  timestamp?: string;
}

interface IndicatorsDTO {
  rsi: number | null;
  adx: number | null;
  vwap: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  provider?: string;
  computedAt?: string;
}

async function fetchQuote(symbol: string): Promise<QuoteDTO | null> {
  try {
    const res = await fetch(`${MARKETDATA_URL}/v1/market/quote/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; data?: { quote?: any } };
    const q = data.data?.quote;
    if (!data.success || !q || typeof q.price !== 'number') return null;
    return {
      price: q.price,
      volume: typeof q.volume === 'number' ? q.volume : null,
      source: q.source,
      timestamp: q.timestamp,
    };
  } catch (err) {
    logger.warn('quote fetch failed', { symbol, error: (err as Error).message });
    return null;
  }
}

async function fetchIndicators(symbol: string): Promise<IndicatorsDTO | null> {
  try {
    const res = await fetch(`${MARKETDATA_URL}/v1/market/indicators/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; data?: { indicators?: any } };
    const i = data.data?.indicators;
    if (!data.success || !i) return null;
    return {
      rsi: typeof i.rsi === 'number' ? i.rsi : null,
      adx: typeof i.adx === 'number' ? i.adx : null,
      vwap: typeof i.vwap === 'number' ? i.vwap : null,
      macd:
        i.macd && typeof i.macd.value === 'number' && typeof i.macd.histogram === 'number'
          ? { value: i.macd.value, signal: i.macd.signal, histogram: i.macd.histogram }
          : null,
      provider: i.provider,
      computedAt: i.computedAt,
    };
  } catch (err) {
    logger.warn('indicators fetch failed', { symbol, error: (err as Error).message });
    return null;
  }
}

/**
 * Analyze a stock symbol into a real TRADE Decision Card.
 * Confidence is computed from the fraction of *available* signals that pass —
 * unknown inputs are excluded, never assumed.
 */
export async function analyzeStock(input: TradeAnalyzeInput): Promise<DecisionCard> {
  const symbol = input.symbol.trim().toUpperCase();
  const [quote, indicators] = await Promise.all([fetchQuote(symbol), fetchIndicators(symbol)]);

  const reasoning: string[] = [`Analyzing ${symbol}.`];
  const missing: string[] = [];
  const warnings: string[] = [];
  const dataUsed: DataSource[] = [];

  // Fundamentals are not yet wired (marketdata returns 501) — declare honestly.
  missing.push('float', 'shares outstanding', 'EPS', 'P/E', 'short interest', 'average volume', 'news catalyst');

  if (!quote) {
    warnings.push('No live quote available; cannot evaluate.');
    return buildDecisionCard({
      card_type: 'TRADE',
      user_id: input.userId ?? null,
      session_id: input.sessionId,
      observation: { source: 'market_scan', raw_input: { symbol }, context: { symbol } },
      analysis: { confidence: null, reasoning, data_used: dataUsed, missing, warnings },
      recommendation: {
        action: 'INVESTIGATE',
        summary: `Unavailable — no live market data for ${symbol}.`,
        details: 'Market data provider returned no quote. Confidence is null.',
        risk_level: 'HIGH',
      },
      metrics: null,
    });
  }

  dataUsed.push({
    name: `MarketData (${quote.source || 'provider'})`,
    endpoint: `${MARKETDATA_URL}/v1/market/quote/${symbol}`,
    fetchedAt: quote.timestamp || nowTimestamp(),
  });
  if (indicators) {
    dataUsed.push({
      name: `MarketData indicators (${indicators.provider || 'provider'})`,
      endpoint: `${MARKETDATA_URL}/v1/market/indicators/${symbol}`,
      fetchedAt: indicators.computedAt || nowTimestamp(),
    });
  }

  const rsi = indicators?.rsi ?? null;
  const adx = indicators?.adx ?? null;
  const vwap = indicators?.vwap ?? null;
  const macd = indicators?.macd ?? null;

  // Build a checklist from ONLY the signals we can actually measure.
  const checks: Array<{ name: string; passed: boolean }> = [];
  if (rsi !== null) checks.push({ name: `RSI ${rsi} not overbought (<65)`, passed: rsi < 65 });
  if (adx !== null) checks.push({ name: `ADX ${adx} trending (>20)`, passed: adx > 20 });
  if (vwap !== null) checks.push({ name: `Price ${quote.price} vs VWAP ${vwap}`, passed: quote.price > vwap });
  if (macd !== null) checks.push({ name: `MACD histogram ${macd.histogram} positive`, passed: macd.histogram > 0 });

  if (adx === null) missing.push('ADX (not computed by provider)');

  const available = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  checks.forEach((c) => reasoning.push(`${c.passed ? '✓' : '✗'} ${c.name}`));

  // Confidence: fraction of available signals passed. Null if too few signals.
  const confidence = available >= 2 ? Math.round((passed / available) * 100) / 100 : null;
  if (available < 2) {
    warnings.push('Too few computable indicators to score confidence.');
  }
  warnings.push('Paper-only analysis. No live order is placed (RECOMMEND mode).');

  let action: RecommendedAction;
  let riskLevel: RiskLevel;
  let summary: string;

  if (confidence === null) {
    action = 'INVESTIGATE';
    riskLevel = 'HIGH';
    summary = `${symbol}: insufficient indicator data to form a view.`;
  } else if (confidence >= 0.66) {
    action = 'BUY';
    riskLevel = 'MEDIUM';
    summary = `${symbol}: ${passed}/${available} bullish signals at $${quote.price} (paper).`;
  } else if (confidence >= 0.4) {
    action = 'WATCH';
    riskLevel = 'MEDIUM';
    summary = `${symbol}: mixed signals (${passed}/${available}). Watch for confirmation.`;
  } else {
    action = 'SKIP';
    riskLevel = 'HIGH';
    summary = `${symbol}: weak signals (${passed}/${available}). Skip for now.`;
  }

  const metrics: TradeMetrics = {
    symbol,
    entryPrice: quote.price,
    targetPrice: null, // not fabricated — requires a strategy/levels engine
    stopLoss: null,
    riskRewardRatio: null,
    positionSize: null,
    rsi,
    adx,
    adxRising: null, // requires ADX series; not available
    vwap,
    macd,
    volume: quote.volume,
    avgVolume: null,
    float: null,
    shortPercent: null,
    eps: null,
    pe: null,
  };

  return buildDecisionCard({
    card_type: 'TRADE',
    user_id: input.userId ?? null,
    session_id: input.sessionId,
    observation: {
      source: 'market_scan',
      raw_input: { symbol },
      context: { symbol, provider: quote.source ?? null },
    },
    analysis: { confidence, reasoning, data_used: dataUsed, missing, warnings },
    recommendation: {
      action,
      summary,
      details: 'Computed from live quote + technical indicators. Targets/stops require a levels engine and are intentionally null.',
      risk_level: riskLevel,
    },
    metrics,
  });
}

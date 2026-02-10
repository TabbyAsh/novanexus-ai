import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS } from '@nova/shared';

const app = express();
const logger = createLogger('marketdata-service');
const PORT = process.env.PORT || SERVICE_PORTS.MARKETDATA;

// Polygon API configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Finnhub API configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
// Alpaca Market Data configuration
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';
const ALPACA_DATA_BASE_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
const ALPACA_DATA_FEED = (process.env.ALPACA_DATA_FEED || 'iex').toLowerCase();

const USE_POLYGON = !!POLYGON_API_KEY;
const USE_FINNHUB = !!FINNHUB_API_KEY;
const USE_ALPACA = !!ALPACA_API_KEY && !!ALPACA_SECRET_KEY;
const USE_REAL_DATA = USE_POLYGON || USE_FINNHUB || USE_ALPACA;

// ============================================
// Cache Implementation
// ============================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

type CandleProvider = 'polygon' | 'finnhub' | 'alpaca' | 'synthetic';

type CandleProvenance = {
  source: CandleProvider;
  method: 'primary' | 'fallback' | 'synthetic';
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  note?: string;
};
type CandleSourceType = 'primary' | 'fallback' | 'synthetic' | 'gap_fill' | 'last_good';
type LatencyClass = 'low' | 'medium' | 'high' | 'stale';
type TimestampRange = {
  start: string;
  end: string;
  expected: number;
  actual: number;
  missing: number;
  gapFill?: boolean;
  gapFillCount?: number;
};

type CandleIntegrity = {
  source_type: CandleSourceType;
  source_identifier: string;
  latency_class: LatencyClass;
  confidence_score: number;
  timestamp_range: TimestampRange;
  note?: string;
};

type ProviderHealthStatus = 'healthy' | 'degraded' | 'down' | 'open' | 'half_open';
type ProviderHealth = {
  provider: CandleProvider;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  circuitOpenUntil?: number;
  lastGoodAt?: string;
};

const PROVIDER_FAILURE_THRESHOLD = Number(process.env.CANDLE_PROVIDER_FAILURE_THRESHOLD || 3);
const PROVIDER_COOLDOWN_MS = Number(process.env.CANDLE_PROVIDER_COOLDOWN_MS || 60_000);

const providerHealth: Record<CandleProvider, ProviderHealth> = {
  polygon: { provider: 'polygon', status: 'healthy', consecutiveFailures: 0 },
  finnhub: { provider: 'finnhub', status: 'healthy', consecutiveFailures: 0 },
  alpaca: { provider: 'alpaca', status: 'healthy', consecutiveFailures: 0 },
  synthetic: { provider: 'synthetic', status: 'healthy', consecutiveFailures: 0 },
};

const lastGoodCandles = new Map<string, { candles: Candle[]; provider: CandleProvider; capturedAt: string }>();

function getProviderPriority(): CandleProvider[] {
  const raw = process.env.CANDLE_PROVIDER_PRIORITY;
  const fallback = ['alpaca', 'polygon', 'finnhub'];
  const list = raw
    ? raw
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
    : fallback;

  return list
    .map((p) => (p === 'alpaca' || p === 'polygon' || p === 'finnhub' ? (p as CandleProvider) : null))
    .filter((p): p is CandleProvider => Boolean(p));
}

function isProviderEnabled(provider: CandleProvider): boolean {
  if (provider === 'alpaca') return USE_ALPACA;
  if (provider === 'polygon') return USE_POLYGON;
  if (provider === 'finnhub') return USE_FINNHUB;
  return true;
}

function markProviderSuccess(provider: CandleProvider) {
  const health = providerHealth[provider];
  health.status = 'healthy';
  health.consecutiveFailures = 0;
  health.lastSuccessAt = new Date().toISOString();
  health.lastFailureReason = undefined;
  health.circuitOpenUntil = undefined;
}

function markProviderFailure(provider: CandleProvider, reason: string) {
  const health = providerHealth[provider];
  health.consecutiveFailures += 1;
  health.lastFailureAt = new Date().toISOString();
  health.lastFailureReason = reason;

  if (health.consecutiveFailures >= PROVIDER_FAILURE_THRESHOLD) {
    health.status = 'open';
    health.circuitOpenUntil = Date.now() + PROVIDER_COOLDOWN_MS;
  } else {
    health.status = 'degraded';
  }
}

function isProviderAvailable(provider: CandleProvider): boolean {
  if (!isProviderEnabled(provider)) return false;
  const health = providerHealth[provider];
  if (health.status === 'open') {
    if (health.circuitOpenUntil && Date.now() < health.circuitOpenUntil) {
      return false;
    }
    health.status = 'half_open';
  }
  return true;
}

function classifyLatency(intervalKey: string, lastTimestamp: string, sourceType: CandleSourceType): LatencyClass {
  if (sourceType === 'synthetic' || sourceType === 'last_good') return 'stale';
  const stepMs = intervalToMs(intervalKey);
  const lastTs = Date.parse(lastTimestamp);
  if (!Number.isFinite(lastTs)) return 'high';
  const lagMs = Date.now() - lastTs;
  if (lagMs <= stepMs * 2) return 'low';
  if (lagMs <= stepMs * 10) return 'medium';
  return 'high';
}

function buildIntegrity(params: {
  sourceType: CandleSourceType;
  sourceIdentifier: string;
  intervalKey: string;
  expected: number;
  actual: number;
  gapFillCount?: number;
  start: string;
  end: string;
  note?: string;
}): CandleIntegrity {
  const { sourceType } = params;
  const confidence_score =
    sourceType === 'primary'
      ? 0.95
      : sourceType === 'fallback'
        ? 0.75
        : sourceType === 'gap_fill'
          ? 0.5
          : sourceType === 'last_good'
            ? 0.55
            : 0.25;

  const latency_class = classifyLatency(params.intervalKey, params.end, sourceType);
  const missing = Math.max(0, params.expected - params.actual);

  return {
    source_type: sourceType,
    source_identifier: params.sourceIdentifier,
    latency_class,
    confidence_score,
    timestamp_range: {
      start: params.start,
      end: params.end,
      expected: params.expected,
      actual: params.actual,
      missing,
      gapFill: (params.gapFillCount || 0) > 0,
      gapFillCount: params.gapFillCount || 0,
    },
    note: params.note,
  };
}

function buildProvenanceFromIntegrity(integrity: CandleIntegrity): CandleProvenance {
  const method: CandleProvenance['method'] =
    integrity.source_type === 'fallback' ? 'fallback' : integrity.source_type === 'synthetic' ? 'synthetic' : 'primary';
  const confidence: CandleProvenance['confidence'] =
    integrity.confidence_score >= 0.85 ? 'high' : integrity.confidence_score >= 0.6 ? 'medium' : 'low';

  return {
    source: (integrity.source_identifier as CandleProvider) || 'synthetic',
    method,
    confidence,
    confidenceScore: integrity.confidence_score,
    note: integrity.note,
  };
}

function attachIntegrity(candles: Candle[], integrity: CandleIntegrity): Candle[] {
  const provenance = buildProvenanceFromIntegrity(integrity);
  return candles.map((c) => ({ ...c, integrity, provenance }));
}

function hasIntegrity(integrity?: CandleIntegrity): boolean {
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

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed: number): () => number {
  let state = seed % 233280;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function syntheticBasePrice(symbol: string): number {
  const hash = hashString(symbol);
  return 20 + (hash % 200) + (hash % 100) / 100;
}

function intervalToMs(intervalKey: string): number {
  const intervalMsMap: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
  };
  return intervalMsMap[intervalKey] || intervalMsMap['1d'];
}

function generateSyntheticCandles(symbol: string, intervalKey: string, limit: number, basePrice?: number): Candle[] {
  const seed = hashString(`${symbol}-${intervalKey}-${new Date().toISOString().split('T')[0]}`);
  const rand = createSeededRandom(seed);
  const stepMs = intervalToMs(intervalKey);
  const now = Date.now();
  const start = now - (limit - 1) * stepMs;
  const candles: Candle[] = [];

  let price = basePrice && Number.isFinite(basePrice) ? basePrice : syntheticBasePrice(symbol);

  for (let i = 0; i < limit; i++) {
    const drift = (rand() - 0.5) * 0.02; // +/-1% swing
    const open = price;
    const close = Math.max(0.01, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rand() * 0.005);
    const low = Math.min(open, close) * (1 - rand() * 0.005);
    const volume = Math.round((1000 + rand() * 9000) * 100);

    candles.push({
      timestamp: new Date(start + i * stepMs).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return candles;
}
function generateGapFillCandles(params: {
  symbol: string;
  startMs: number;
  count: number;
  stepMs: number;
  basePrice: number;
  seedKey: string;
}): Candle[] {
  const rand = createSeededRandom(hashString(`${params.symbol}-${params.seedKey}-${params.startMs}`));
  const candles: Candle[] = [];
  let price = params.basePrice;

  for (let i = 0; i < params.count; i++) {
    const drift = (rand() - 0.5) * 0.015;
    const open = price;
    const close = Math.max(0.01, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rand() * 0.004);
    const low = Math.min(open, close) * (1 - rand() * 0.004);
    const volume = Math.round((800 + rand() * 5000) * 100);

    candles.push({
      timestamp: new Date(params.startMs + i * params.stepMs).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
    price = close;
  }

  return candles;
}

function normalizeCandles(candles: Candle[]): Candle[] {
  return candles
    .filter((c) => c && typeof c.timestamp === 'string' && Number.isFinite(Date.parse(c.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function ensureCandleContinuity(params: {
  symbol: string;
  intervalKey: string;
  limit: number;
  candles: Candle[];
}): { candles: Candle[]; gapFillCount: number } {
  const stepMs = intervalToMs(params.intervalKey);
  const sorted = normalizeCandles(params.candles);
  if (sorted.length === 0) return { candles: [], gapFillCount: 0 };

  const filled: Candle[] = [sorted[0]];
  let gapFillCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = filled[filled.length - 1];
    const prevTs = Date.parse(prev.timestamp);
    const next = sorted[i];
    const nextTs = Date.parse(next.timestamp);
    const gap = Math.round((nextTs - prevTs) / stepMs) - 1;

    if (gap > 0 && Number.isFinite(prevTs) && Number.isFinite(nextTs)) {
      const gapCandles = generateGapFillCandles({
        symbol: params.symbol,
        startMs: prevTs + stepMs,
        count: gap,
        stepMs,
        basePrice: prev.close,
        seedKey: `${params.intervalKey}-gap`,
      });
      filled.push(...gapCandles);
      gapFillCount += gapCandles.length;
    }
    filled.push(next);
  }

  // Ensure we have exactly the requested limit (most recent N candles).
  let trimmed = filled;
  if (filled.length > params.limit) {
    trimmed = filled.slice(filled.length - params.limit);
  } else if (filled.length < params.limit) {
    const missing = params.limit - filled.length;
    const first = filled[0];
    const firstTs = Date.parse(first.timestamp);
    const startMs = Number.isFinite(firstTs) ? firstTs - missing * stepMs : Date.now() - params.limit * stepMs;
    const prepend = generateGapFillCandles({
      symbol: params.symbol,
      startMs,
      count: missing,
      stepMs,
      basePrice: first.open,
      seedKey: `${params.intervalKey}-prepend`,
    });
    trimmed = [...prepend, ...filled];
    gapFillCount += prepend.length;
  }

  return { candles: trimmed, gapFillCount };
}

async function getFallbackQuotePrice(symbol: string): Promise<number | null> {
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  const cached = quoteCache.get<Quote>(cacheKey);
  if (cached && Number.isFinite(cached.price)) return cached.price;

  if (USE_ALPACA) {
    const quote = await fetchAlpacaQuote(symbol);
    if (quote && Number.isFinite(quote.price)) return quote.price;
  }
  if (USE_POLYGON) {
    const quote = await fetchPolygonQuote(symbol);
    if (quote && Number.isFinite(quote.price)) return quote.price;
  }
  if (USE_FINNHUB) {
    const quote = await fetchFinnhubQuote(symbol);
    if (quote && Number.isFinite(quote.price)) return quote.price;
  }

  return null;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }
  
  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

const quoteCache = new SimpleCache();
const candleCache = new SimpleCache();
const indicatorCache = new SimpleCache();
const symbolCache = new SimpleCache();

const CACHE_TTL = {
  QUOTE: 5,        // 5 seconds for real-time quotes
  CANDLES: 60,     // 1 minute for candles
  INDICATORS: 30,  // 30 seconds for indicators
  FUNDAMENTALS: 3600, // 1 hour for fundamentals
  SYMBOLS: 86400,  // 24 hours for symbol universe
};

// ============================================
// Rate Limiter
// ============================================

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;
  
  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  async acquire(): Promise<boolean> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  getRemaining(): number {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

// Polygon free tier: 5 requests/minute
const rateLimiter = new RateLimiter(5, 60000);
// Alpaca data (IEX) is generous but still rate-limited; keep modest guardrail.
const alpacaRateLimiter = new RateLimiter(200, 60000);

// ============================================
// Polygon API Client
// ============================================

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  backoff = 1000
): Promise<globalThis.Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = backoff * Math.pow(2, i);
        logger.warn(`Rate limited, waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      const waitTime = backoff * Math.pow(2, i);
      logger.warn(`Request failed, retrying in ${waitTime}ms`, { error: (error as Error).message });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

async function polygonRequest<T>(endpoint: string): Promise<T | null> {
  if (!USE_POLYGON) return null;
  
  const canProceed = await rateLimiter.acquire();
  if (!canProceed) {
    logger.warn('Rate limit exceeded for Polygon API');
    return null;
  }
  
  const url = `${POLYGON_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${POLYGON_API_KEY}`;
  
  try {
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      logger.error(`Polygon API error: ${response.status}`, { endpoint } as any);
      return null;
    }
    
    const data = await response.json();
    return data as T;
  } catch (error) {
    logger.error('Polygon API request failed', error as Error, { endpoint });
    return null;
  }
}

// ============================================
// Types
// ============================================

interface Quote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: string;
  source: 'polygon' | 'finnhub' | 'alpaca';
}

interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provenance?: CandleProvenance;
  integrity?: CandleIntegrity;
}

interface Indicators {
  symbol: string;
  rsi: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  vwap: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  asOf: string | null;
  computedAt: string;
  provider: CandleProvider;
  integrity?: CandleIntegrity;
}

// ============================================
// Indicator Calculations
// ============================================

function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  // Use the most recent (period + 1) closes.
  const start = closes.length - (period + 1);

  let gains = 0;
  let losses = 0;

  for (let i = start + 1; i < start + 1 + period; i++) {
    const change = closes[i] - closes[i - 1];
    if (!Number.isFinite(change)) return null;
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  if (!Number.isFinite(sum)) return null;
  return sum / period;
}

function calculateEMASeries(values: number[], period: number): number[] | null {
  if (values.length < period) return null;

  const k = 2 / (period + 1);
  const series = new Array(values.length).fill(Number.NaN);

  const seedSlice = values.slice(0, period);
  const seed = seedSlice.reduce((acc, v) => acc + v, 0) / period;
  if (!Number.isFinite(seed)) return null;

  let ema = seed;
  series[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return null;
    ema = v * k + ema * (1 - k);
    series[i] = ema;
  }

  return series;
}

function calculateMACD(closes: number[]): { value: number; signal: number; histogram: number } | null {
  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);
  if (!ema12 || !ema26) return null;

  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const a = ema12[i];
    const b = ema26[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    macdSeries.push(a - b);
  }

  if (macdSeries.length < 9) return null;

  const signalSeries = calculateEMASeries(macdSeries, 9);
  if (!signalSeries) return null;

  const value = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  if (!Number.isFinite(value) || !Number.isFinite(signal)) return null;

  const histogram = value - signal;
  return {
    value: round(value, 2),
    signal: round(signal, 2),
    histogram: round(histogram, 2),
  };
}

function calculateIndicatorsFromCandles(candles: Candle[]): {
  rsi: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  vwap: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  asOf: string | null;
} {
  if (!candles.length) {
    return {
      rsi: null,
      adx: null,
      plusDI: null,
      minusDI: null,
      macd: null,
      vwap: null,
      sma20: null,
      sma50: null,
      sma200: null,
      asOf: null,
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const asOf = candles[candles.length - 1]?.timestamp ?? null;

  // VWAP over the most recent 20 candles (or fewer if not available).
  const vwapPeriod = Math.min(20, candles.length);
  let vwapNum = 0;
  let vwapDen = 0;
  for (let i = candles.length - vwapPeriod; i < candles.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes[i];
    if (!Number.isFinite(typicalPrice) || !Number.isFinite(vol)) {
      vwapNum = Number.NaN;
      vwapDen = Number.NaN;
      break;
    }
    vwapNum += typicalPrice * vol;
    vwapDen += vol;
  }

  const vwap = Number.isFinite(vwapNum) && Number.isFinite(vwapDen) && vwapDen > 0 ? vwapNum / vwapDen : null;

  const rsi = calculateRSI(closes, 14);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const macd = calculateMACD(closes);

  // ADX / DI are not returned until implemented deterministically.
  const adx = null;
  const plusDI = null;
  const minusDI = null;

  return {
    rsi: typeof rsi === 'number' ? round(rsi, 1) : null,
    adx,
    plusDI,
    minusDI,
    macd,
    vwap: typeof vwap === 'number' ? round(vwap, 2) : null,
    sma20: typeof sma20 === 'number' ? round(sma20, 2) : null,
    sma50: typeof sma50 === 'number' ? round(sma50, 2) : null,
    sma200: typeof sma200 === 'number' ? round(sma200, 2) : null,
    asOf,
  };
}

// ============================================
// Provider fallback policy
// ============================================
// NOTE: This service must not fabricate market data.
// Configure POLYGON_API_KEY and/or FINNHUB_API_KEY and/or ALPACA_API_KEY/ALPACA_SECRET_KEY.

// ============================================
// Finnhub API Client
// ============================================

const finnhubRateLimiter = new RateLimiter(30, 60000); // 30 req/min for free tier

async function finnhubRequest<T>(endpoint: string): Promise<T | null> {
  if (!USE_FINNHUB) return null;
  
  const canProceed = await finnhubRateLimiter.acquire();
  if (!canProceed) {
    logger.warn('Rate limit exceeded for Finnhub API');
    return null;
  }
  
  const url = `${FINNHUB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${FINNHUB_API_KEY}`;
  
  try {
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      logger.error(`Finnhub API error: ${response.status}`, { endpoint } as any);
      return null;
    }
    
    const data = await response.json();
    return data as T;
  } catch (error) {
    logger.error('Finnhub API request failed', error as Error, { endpoint });
    return null;
  }
}

async function fetchFinnhubQuote(symbol: string): Promise<Quote | null> {
  interface FinnhubQuoteResponse {
    c: number;  // Current price
    d: number;  // Change
    dp: number; // Percent change
    h: number;  // High price of the day
    l: number;  // Low price of the day
    o: number;  // Open price of the day
    pc: number; // Previous close price
    t: number;  // Timestamp
  }
  
  const data = await finnhubRequest<FinnhubQuoteResponse>(`/quote?symbol=${symbol.toUpperCase()}`);
  
  if (!data || data.c === 0) return null;
  
  return {
    symbol: symbol.toUpperCase(),
    price: Math.round(data.c * 100) / 100,
    change: Number.isFinite(data.d) ? Math.round(data.d * 100) / 100 : null,
    changePercent: Number.isFinite(data.dp) ? Math.round(data.dp * 100) / 100 : null,
    volume: null, // Finnhub quote doesn't include volume
    bid: null,
    ask: null,
    timestamp: new Date(data.t * 1000).toISOString(),
    source: 'finnhub',
  };
}

async function fetchFinnhubCandles(
  symbol: string,
  resolution: string,
  from: number,
  to: number
): Promise<Candle[] | null> {
  interface FinnhubCandlesResponse {
    c: number[];  // Close prices
    h: number[];  // High prices
    l: number[];  // Low prices
    o: number[];  // Open prices
    t: number[];  // Timestamps
    v: number[];  // Volume
    s: string;    // Status
  }
  
  const data = await finnhubRequest<FinnhubCandlesResponse>(
    `/stock/candle?symbol=${symbol.toUpperCase()}&resolution=${resolution}&from=${from}&to=${to}`
  );
  
  if (!data || data.s !== 'ok' || !data.c) return null;
  
  return data.c.map((close, i) => ({
    timestamp: new Date(data.t[i] * 1000).toISOString(),
    open: Math.round(data.o[i] * 100) / 100,
    high: Math.round(data.h[i] * 100) / 100,
    low: Math.round(data.l[i] * 100) / 100,
    close: Math.round(close * 100) / 100,
    volume: data.v[i],
  }));
}
// ============================================
// Alpaca Market Data Fetchers
// ============================================

const ALPACA_TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '1h': '1Hour',
  '1d': '1Day',
};

async function alpacaRequest<T>(path: string, params: Record<string, string>): Promise<T | null> {
  if (!USE_ALPACA) return null;

  const canProceed = await alpacaRateLimiter.acquire();
  if (!canProceed) {
    logger.warn('Rate limit exceeded for Alpaca data API');
    return null;
  }

  const query = new URLSearchParams({ ...params, feed: ALPACA_DATA_FEED });
  const url = `${ALPACA_DATA_BASE_URL}${path}?${query.toString()}`;

  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      },
    });

    if (!response.ok) {
      logger.error(`Alpaca API error: ${response.status}`, { path, params } as any);
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    logger.error('Alpaca API request failed', error as Error, { path, params });
    return null;
  }
}

async function fetchAlpacaQuote(symbol: string): Promise<Quote | null> {
  const sym = symbol.toUpperCase();
  type AlpacaSnapshot = {
    latestTrade?: { p: number; t: string };
    dailyBar?: { c: number; v: number };
    prevDailyBar?: { c: number };
  };

  const data = await alpacaRequest<AlpacaSnapshot>(`/v2/stocks/${sym}/snapshot`, {});
  if (!data) return null;

  const price =
    (typeof data.latestTrade?.p === 'number' && Number.isFinite(data.latestTrade.p) ? data.latestTrade.p : null) ??
    (typeof data.dailyBar?.c === 'number' && Number.isFinite(data.dailyBar.c) ? data.dailyBar.c : null) ??
    (typeof data.prevDailyBar?.c === 'number' && Number.isFinite(data.prevDailyBar.c) ? data.prevDailyBar.c : null);

  if (typeof price !== 'number') return null;

  const prevClose =
    typeof data.prevDailyBar?.c === 'number' && Number.isFinite(data.prevDailyBar.c) ? data.prevDailyBar.c : null;

  const change = typeof prevClose === 'number' ? price - prevClose : null;
  const changePercent =
    typeof prevClose === 'number' && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
  const volume = typeof data.dailyBar?.v === 'number' && Number.isFinite(data.dailyBar.v) ? data.dailyBar.v : null;
  const ts = data.latestTrade?.t;

  return {
    symbol: sym,
    price: Math.round(price * 100) / 100,
    change: typeof change === 'number' ? Math.round(change * 100) / 100 : null,
    changePercent: typeof changePercent === 'number' ? Math.round(changePercent * 100) / 100 : null,
    volume,
    bid: null,
    ask: null,
    timestamp: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    source: 'alpaca',
  };
}

async function fetchAlpacaCandles(symbol: string, intervalKey: string, limit: number): Promise<Candle[] | null> {
  const timeframe = ALPACA_TIMEFRAME_MAP[intervalKey];
  if (!timeframe) return null;

  type AlpacaBarsResponse = {
    bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
  };

  const data = await alpacaRequest<AlpacaBarsResponse>(`/v2/stocks/${symbol.toUpperCase()}/bars`, {
    timeframe,
    limit: String(limit),
    adjustment: 'raw',
  });

  const bars = data?.bars;
  if (!Array.isArray(bars) || bars.length === 0) return null;

  return bars.map((b) => ({
    timestamp: new Date(b.t).toISOString(),
    open: Math.round(b.o * 100) / 100,
    high: Math.round(b.h * 100) / 100,
    low: Math.round(b.l * 100) / 100,
    close: Math.round(b.c * 100) / 100,
    volume: b.v,
  }));
}

// ============================================
// Polygon Data Fetchers
// ============================================

async function fetchPolygonQuote(symbol: string): Promise<Quote | null> {
  interface PolygonTickerResponse {
    status: string;
    ticker: {
      ticker: string;
      todaysChange: number;
      todaysChangePerc: number;
      day: { o: number; h: number; l: number; c: number; v: number };
      min: { o: number; h: number; l: number; c: number; v: number };
      prevDay: { c: number };
    };
  }
  
  const data = await polygonRequest<PolygonTickerResponse>(
    `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol.toUpperCase()}`
  );
  
  if (!data || data.status !== 'OK' || !data.ticker) return null;
  
  const t = data.ticker;

  const currentPriceCandidate = [t.min?.c, t.day?.c, t.prevDay?.c].find(
    (v) => typeof v === 'number' && Number.isFinite(v)
  );

  if (typeof currentPriceCandidate !== 'number') return null;

  const prevClose = typeof t.prevDay?.c === 'number' && Number.isFinite(t.prevDay.c) ? t.prevDay.c : null;

  const changeRaw =
    typeof t.todaysChange === 'number' && Number.isFinite(t.todaysChange)
      ? t.todaysChange
      : typeof prevClose === 'number'
        ? currentPriceCandidate - prevClose
        : null;

  const changePercentRaw =
    typeof t.todaysChangePerc === 'number' && Number.isFinite(t.todaysChangePerc)
      ? t.todaysChangePerc
      : typeof changeRaw === 'number' && typeof prevClose === 'number' && prevClose !== 0
        ? (changeRaw / prevClose) * 100
        : null;

  const volumeRaw = typeof t.day?.v === 'number' && Number.isFinite(t.day.v) ? t.day.v : null;

  return {
    symbol: t.ticker,
    price: Math.round(currentPriceCandidate * 100) / 100,
    change: typeof changeRaw === 'number' ? Math.round(changeRaw * 100) / 100 : null,
    changePercent: typeof changePercentRaw === 'number' ? Math.round(changePercentRaw * 100) / 100 : null,
    volume: volumeRaw,
    bid: null,
    ask: null,
    timestamp: new Date().toISOString(),
    source: 'polygon',
  };
}

async function fetchPolygonCandles(
  symbol: string,
  multiplier: number,
  timespan: string,
  limit: number
): Promise<Candle[] | null> {
  interface PolygonAggResponse {
    status: string;
    resultsCount: number;
    results: Array<{
      t: number; o: number; h: number; l: number; c: number; v: number;
    }>;
  }
  
  const to = new Date();
  const from = new Date(to.getTime() - limit * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];
  
  const data = await polygonRequest<PolygonAggResponse>(
    `/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=${limit}`
  );
  
  if (!data || data.status !== 'OK' || !data.results) return null;
  
  return data.results.map(r => ({
    timestamp: new Date(r.t).toISOString(),
    open: Math.round(r.o * 100) / 100,
    high: Math.round(r.h * 100) / 100,
    low: Math.round(r.l * 100) / 100,
    close: Math.round(r.c * 100) / 100,
    volume: r.v,
  }));
}
async function fetchProviderCandles(params: {
  provider: CandleProvider;
  symbol: string;
  intervalKey: string;
  limit: number;
  intervalConfig: { multiplier: number; timespan: string };
  resolution: string;
  from: number;
  to: number;
}): Promise<{ candles: Candle[] | null; error?: string }> {
  const { provider, symbol, intervalKey, limit, intervalConfig, resolution, from, to } = params;
  try {
    if (provider === 'alpaca') {
      const candles = await fetchAlpacaCandles(symbol, intervalKey, limit);
      return { candles: candles && candles.length > 0 ? candles : null, error: candles ? undefined : 'empty' };
    }
    if (provider === 'polygon') {
      const candles = await fetchPolygonCandles(symbol, intervalConfig.multiplier, intervalConfig.timespan, limit);
      return { candles: candles && candles.length > 0 ? candles : null, error: candles ? undefined : 'empty' };
    }
    if (provider === 'finnhub') {
      const candles = await fetchFinnhubCandles(symbol, resolution, from, to);
      return { candles: candles && candles.length > 0 ? candles : null, error: candles ? undefined : 'empty' };
    }
  } catch (error) {
    return { candles: null, error: (error as Error).message || 'error' };
  }
  return { candles: null, error: 'unsupported' };
}

// ============================================
// Middleware
// ============================================

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, { requestId });
  }
  next();
});
// ============================================
// Symbol Universe Endpoint
// ============================================

app.get('/v1/market/symbols', async (_req: Request, res: Response) => {
  const cacheKey = 'symbols:us';
  const cached = symbolCache.get<SymbolInfo[]>(cacheKey);
  if (cached) {
    return res.json({ success: true, data: { symbols: cached }, cached: true });
  }

  if (!USE_POLYGON && !USE_FINNHUB && !USE_ALPACA) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY.',
      },
    });
  }

  let symbols: SymbolInfo[] | null = null;

  // Finnhub supports full US symbol universe
  if (USE_FINNHUB) {
    symbols = await fetchFinnhubSymbols();
  }

  if (!symbols) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Symbol universe unavailable from configured providers.',
        details: { providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB } },
      },
    });
  }

  symbolCache.set(cacheKey, symbols, CACHE_TTL.SYMBOLS);
  res.json({ success: true, data: { symbols }, cached: false });
});

// ============================================
// Health Check
// ============================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'marketdata',
    timestamp: new Date().toISOString(),
    providers: {
      polygon: USE_POLYGON,
      finnhub: USE_FINNHUB,
      alpaca: USE_ALPACA,
    },
    providerHealth,
    cacheSize: quoteCache.size() + candleCache.size() + indicatorCache.size(),
    rateLimitRemaining: rateLimiter.getRemaining(),
  });
});

// ============================================
// Quote Endpoint
// ============================================

app.get('/v1/market/quote/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  
  // Check cache first
  const cached = quoteCache.get<Quote>(cacheKey);
  if (cached) {
    return res.json({ success: true, data: { quote: cached }, cached: true });
  }
  
  if (!USE_POLYGON && !USE_FINNHUB && !USE_ALPACA) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY and/or ALPACA_API_KEY/ALPACA_SECRET_KEY.',
        details: { symbol: symbol.toUpperCase() },
      },
    });
  }

  let quote: Quote | null = null;

  if (USE_POLYGON) {
    quote = await fetchPolygonQuote(symbol);
  }

  if (!quote && USE_FINNHUB) {
    quote = await fetchFinnhubQuote(symbol);
  }
  if (!quote && USE_ALPACA) {
    quote = await fetchAlpacaQuote(symbol);
  }

  if (!quote) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market quote unavailable from configured providers.',
        details: {
          symbol: symbol.toUpperCase(),
          providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB, alpaca: USE_ALPACA },
        },
      },
    });
  }

  // Cache the result
  quoteCache.set(cacheKey, quote, CACHE_TTL.QUOTE);

  res.json({ success: true, data: { quote }, cached: false });
});

// ============================================
// Candles Endpoint
// ============================================
const INTERVAL_MAP: Record<string, { multiplier: number; timespan: string }> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '1d': { multiplier: 1, timespan: 'day' },
  '1w': { multiplier: 1, timespan: 'week' },
};

const FINNHUB_RESOLUTION_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '1d': 'D',
  '1w': 'W',
};

const SECONDS_PER_CANDLE_MAP: Record<string, number> = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
};

async function resolveCandlesWithRouter(params: {
  symbol: string;
  intervalKey: string;
  limit: number;
}): Promise<{ candles: Candle[]; provider: CandleProvider; integrity: CandleIntegrity }> {
  const { symbol, intervalKey, limit } = params;
  const intervalConfig = INTERVAL_MAP[intervalKey] || INTERVAL_MAP['1d'];

  const resolution = FINNHUB_RESOLUTION_MAP[intervalKey] || 'D';
  const secondsPerCandle = SECONDS_PER_CANDLE_MAP[intervalKey] || 24 * 60 * 60;
  const to = Math.floor(Date.now() / 1000);
  const from = to - secondsPerCandle * limit;

  const priority = getProviderPriority();
  const firstProvider = priority[0];

  for (const provider of priority) {
    if (!isProviderAvailable(provider)) continue;
    const result = await fetchProviderCandles({
      provider,
      symbol,
      intervalKey,
      limit,
      intervalConfig,
      resolution,
      from,
      to,
    });

    if (result.candles && result.candles.length > 0) {
      markProviderSuccess(provider);
      const { candles: normalized, gapFillCount } = ensureCandleContinuity({
        symbol,
        intervalKey,
        limit,
        candles: result.candles,
      });

      const sourceType: CandleSourceType =
        gapFillCount > 0 ? 'gap_fill' : provider === firstProvider ? 'primary' : 'fallback';

      const start = normalized[0]?.timestamp || new Date().toISOString();
      const end = normalized[normalized.length - 1]?.timestamp || start;

      const integrity = buildIntegrity({
        sourceType,
        sourceIdentifier: provider,
        intervalKey,
        expected: limit,
        actual: normalized.length,
        gapFillCount,
        start,
        end,
        note: gapFillCount > 0 ? 'Gap-fill applied to maintain continuity' : undefined,
      });

      const candlesWithIntegrity = attachIntegrity(normalized, integrity);

      providerHealth[provider].lastGoodAt = new Date().toISOString();
      lastGoodCandles.set(`candles:${symbol.toUpperCase()}:${intervalKey}:${limit}`, {
        candles: normalized,
        provider,
        capturedAt: new Date().toISOString(),
      });

      return { candles: candlesWithIntegrity, provider, integrity };
    }

    markProviderFailure(provider, result.error || 'empty');
  }

  const lastGood = lastGoodCandles.get(`candles:${symbol.toUpperCase()}:${intervalKey}:${limit}`);
  if (lastGood && lastGood.candles.length > 0) {
    const { candles: normalized, gapFillCount } = ensureCandleContinuity({
      symbol,
      intervalKey,
      limit,
      candles: lastGood.candles,
    });
    const start = normalized[0]?.timestamp || new Date().toISOString();
    const end = normalized[normalized.length - 1]?.timestamp || start;

    const integrity = buildIntegrity({
      sourceType: 'last_good',
      sourceIdentifier: lastGood.provider,
      intervalKey,
      expected: limit,
      actual: normalized.length,
      gapFillCount,
      start,
      end,
      note: 'Serving last-known-good candles (provider unavailable)',
    });
    const candlesWithIntegrity = attachIntegrity(normalized, integrity);
    return { candles: candlesWithIntegrity, provider: lastGood.provider, integrity };
  }

  const basePrice = await getFallbackQuotePrice(symbol);
  const synthetic = generateSyntheticCandles(symbol, intervalKey, limit, basePrice ?? undefined);
  const start = synthetic[0]?.timestamp || new Date().toISOString();
  const end = synthetic[synthetic.length - 1]?.timestamp || start;
  const integrity = buildIntegrity({
    sourceType: 'synthetic',
    sourceIdentifier: 'synthetic',
    intervalKey,
    expected: limit,
    actual: synthetic.length,
    gapFillCount: 0,
    start,
    end,
    note: 'Synthetic fallback candles (no providers available)',
  });
  const candlesWithIntegrity = attachIntegrity(synthetic, integrity);
  return { candles: candlesWithIntegrity, provider: 'synthetic', integrity };
}

app.get('/v1/market/candles/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const { interval = '1d', limit = '30' } = req.query;
  const limitNum = Math.min(Number(limit) || 30, 365);

  const intervalKey = String(interval);
  const cacheKey = `candles:${symbol.toUpperCase()}:${intervalKey}:${limitNum}`;

  // Check cache
  const cached = candleCache.get<{ candles: Candle[]; provider: CandleProvider; integrity: CandleIntegrity }>(cacheKey);
  if (cached) {
    const priority = getProviderPriority();
    const primaryProvider = priority[0];
    const integrity = cached.integrity;
    const hasCachedIntegrity = integrity && hasIntegrity(integrity);
    const cachedProviderHealthy = cached.provider ? isProviderAvailable(cached.provider) : false;
    const primaryHealthy = primaryProvider ? isProviderAvailable(primaryProvider) : false;
    const isFallbackCached = integrity?.source_type && integrity.source_type !== 'primary';
    const isStaleCached = integrity?.latency_class === 'stale';

    const shouldBypassCache =
      !hasCachedIntegrity ||
      !cachedProviderHealthy ||
      (isFallbackCached && primaryHealthy) ||
      isStaleCached;

    if (!shouldBypassCache) {
      return res.json({
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          interval: intervalKey,
          candles: cached.candles,
          provider: cached.provider,
          provenance: cached.candles[0]?.provenance,
          integrity: cached.integrity,
        },
        cached: true,
      });
    }

    logger.warn('Candle cache bypassed', {
      symbol: symbol.toUpperCase(),
      interval: intervalKey,
      provider: cached.provider,
      sourceType: integrity?.source_type,
      latency: integrity?.latency_class,
      cachedProviderHealthy,
      primaryProvider,
      primaryHealthy,
    });
  }

  const { candles, provider, integrity } = await resolveCandlesWithRouter({
    symbol,
    intervalKey,
    limit: limitNum,
  });

  // Cache result
  candleCache.set(cacheKey, { candles, provider, integrity }, CACHE_TTL.CANDLES);

  res.json({
    success: true,
    data: {
      symbol: symbol.toUpperCase(),
      interval: intervalKey,
      candles,
      provider,
      provenance: candles[0]?.provenance,
      integrity,
    },
    cached: false,
  });
});

// ============================================
// Indicators Endpoint (Calculated from candles)
// ============================================


// ============================================
// Symbol Universe
// ============================================

type SymbolInfo = {
  symbol: string;
  description: string;
  exchange: string;
  type: string;
  currency: string;
};

async function fetchFinnhubSymbols(): Promise<SymbolInfo[] | null> {
  if (!USE_FINNHUB) return null;
  const data = await finnhubRequest<SymbolInfo[]>('/stock/symbol?exchange=US');
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.map((s) => ({
    symbol: s.symbol,
    description: s.description,
    exchange: s.exchange,
    type: s.type,
    currency: s.currency,
  }));
}
app.get('/v1/market/indicators/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const cacheKey = `indicators:${symbol.toUpperCase()}`;
  
  // Check cache
  const cached = indicatorCache.get<Indicators>(cacheKey);
  if (cached) {
    return res.json({ success: true, data: { indicators: cached }, cached: true });
  }


  // Get candles to calculate indicators
  const candlesCacheKey = `candlesForIndicators:${symbol.toUpperCase()}:1d:200`;
  const cachedCandles = candleCache.get<{ provider: CandleProvider; candles: Candle[]; integrity?: CandleIntegrity }>(candlesCacheKey);

  let candles: Candle[] | null = cachedCandles?.candles ?? null;
  let provider: CandleProvider | null = cachedCandles?.provider ?? null;
  let integrity: CandleIntegrity | null = cachedCandles?.integrity ?? null;

  if (!candles || candles.length === 0 || !provider || !integrity) {
    const resolved = await resolveCandlesWithRouter({ symbol, intervalKey: '1d', limit: 200 });
    candles = resolved.candles;
    provider = resolved.provider;
    integrity = resolved.integrity;
    candleCache.set(candlesCacheKey, { provider, candles, integrity }, CACHE_TTL.CANDLES);
  }

  if (!integrity || !hasIntegrity(integrity) || candles.some((c) => !hasIntegrity(c.integrity))) {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      error: {
        code: 'CANDLE_INTEGRITY_MISSING',
        message: 'Candle integrity metadata is required for indicator computation.',
        details: { symbol: symbol.toUpperCase() },
      },
    });
  }

  if (!candles || candles.length === 0 || !provider) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market indicators unavailable from configured providers.',
        details: {
          symbol: symbol.toUpperCase(),
          providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB, alpaca: USE_ALPACA },
        },
      },
    });
  }

  const calculated = calculateIndicatorsFromCandles(candles);
  const indicators: Indicators = {
    symbol: symbol.toUpperCase(),
    ...calculated,
    computedAt: new Date().toISOString(),
    provider,
    integrity,
  };

  indicatorCache.set(cacheKey, indicators, CACHE_TTL.INDICATORS);

  res.json({ success: true, data: { indicators }, cached: false });
});

// ============================================
// Fundamentals Endpoint
// ============================================

app.get('/v1/market/fundamentals/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;

  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Fundamentals are not implemented yet.',
      details: { symbol: symbol.toUpperCase() },
    },
  });
});

// ============================================
// Batch Quote Endpoint
// ============================================

app.post('/v1/market/quotes', async (req: Request, res: Response) => {
  const { symbols } = req.body;
  
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'symbols array required' },
    });
  }

  if (!USE_POLYGON && !USE_FINNHUB) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY and/or ALPACA_API_KEY/ALPACA_SECRET_KEY.',
        details: { requestedCount: symbols.length },
      },
    });
  }

  const quotes: Quote[] = [];
  const unavailableSymbols: string[] = [];

  for (const rawSymbol of symbols.slice(0, 20)) {
    const sym = String(rawSymbol).toUpperCase();
    const cacheKey = `quote:${sym}`;

    let quote = quoteCache.get<Quote>(cacheKey);

    if (!quote) {
      if (USE_POLYGON) {
        quote = await fetchPolygonQuote(sym);
      }

      if (!quote && USE_FINNHUB) {
        quote = await fetchFinnhubQuote(sym);
      }
      if (!quote && USE_ALPACA) {
        quote = await fetchAlpacaQuote(sym);
      }

      if (quote) {
        quoteCache.set(cacheKey, quote, CACHE_TTL.QUOTE);
      }
    }

    if (quote) {
      quotes.push(quote);
    } else {
      unavailableSymbols.push(sym);
    }
  }

  if (quotes.length === 0) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market quotes unavailable from configured providers.',
        details: { unavailableSymbols },
      },
    });
  }

  res.json({ success: true, data: { quotes, unavailableSymbols } });
});

// ============================================
// Ingest Endpoint (for CSV import)
// ============================================

app.post('/v1/market/ingest', async (req: Request, res: Response) => {
  const { source, data } = req.body;
  logger.info('Market data ingested', { source, records: data?.length || 0 });
  res.json({ success: true, data: { ingested: data?.length || 0 } });
});

// ============================================
// Cache Management (Internal)
// ============================================

app.post('/internal/cache/clear', (_req: Request, res: Response) => {
  quoteCache.clear();
  candleCache.clear();
  indicatorCache.clear();
  logger.info('Cache cleared');
  res.json({ success: true, data: { message: 'Cache cleared' } });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  logger.info(`MarketData service started on port ${PORT}`, {
    providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB, alpaca: USE_ALPACA },
  });
});

export default app;

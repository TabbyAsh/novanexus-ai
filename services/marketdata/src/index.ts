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

const USE_POLYGON = !!POLYGON_API_KEY;
const USE_FINNHUB = !!FINNHUB_API_KEY;
const USE_REAL_DATA = USE_POLYGON || USE_FINNHUB;

// ============================================
// Cache Implementation
// ============================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
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
  source: 'polygon' | 'finnhub';
}

interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  provider: 'polygon' | 'finnhub';
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
// Configure POLYGON_API_KEY and/or FINNHUB_API_KEY.

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

  if (!USE_POLYGON && !USE_FINNHUB) {
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
    },
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
  
  if (!USE_POLYGON && !USE_FINNHUB) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY.',
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

  if (!quote) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market quote unavailable from configured providers.',
        details: {
          symbol: symbol.toUpperCase(),
          providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB },
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

app.get('/v1/market/candles/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const { interval = '1d', limit = '30' } = req.query;
  const limitNum = Math.min(Number(limit) || 30, 365);

  if (!USE_POLYGON && !USE_FINNHUB) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY.',
        details: { symbol: symbol.toUpperCase() },
      },
    });
  }

  const intervalKey = String(interval);

  // Map interval to Polygon timespan
  const intervalMap: Record<string, { multiplier: number; timespan: string }> = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '1d': { multiplier: 1, timespan: 'day' },
    '1w': { multiplier: 1, timespan: 'week' },
  };

  const intervalConfig = intervalMap[intervalKey] || intervalMap['1d'];
  const cacheKey = `candles:${symbol.toUpperCase()}:${intervalKey}:${limitNum}`;

  // Check cache
  const cached = candleCache.get<Candle[]>(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: { symbol: symbol.toUpperCase(), interval: intervalKey, candles: cached },
      cached: true,
    });
  }

  // Finnhub expects unix timestamps (seconds)
  const finnhubResolutionMap: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1h': '60',
    '1d': 'D',
    '1w': 'W',
  };

  const secondsPerCandleMap: Record<string, number> = {
    '1m': 60,
    '5m': 5 * 60,
    '15m': 15 * 60,
    '1h': 60 * 60,
    '1d': 24 * 60 * 60,
    '1w': 7 * 24 * 60 * 60,
  };

  const resolution = finnhubResolutionMap[intervalKey] || 'D';
  const secondsPerCandle = secondsPerCandleMap[intervalKey] || 24 * 60 * 60;
  const to = Math.floor(Date.now() / 1000);
  const from = to - secondsPerCandle * limitNum;

  let candles: Candle[] | null = null;
  let provider: 'polygon' | 'finnhub' | null = null;

  if (USE_POLYGON) {
    candles = await fetchPolygonCandles(symbol, intervalConfig.multiplier, intervalConfig.timespan, limitNum);
    if (candles && candles.length > 0) provider = 'polygon';
  }

  if ((!candles || candles.length === 0) && USE_FINNHUB) {
    candles = await fetchFinnhubCandles(symbol, resolution, from, to);
    if (candles && candles.length > 0) provider = 'finnhub';
  }

  if (!candles || candles.length === 0 || !provider) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market candles unavailable from configured providers.',
        details: {
          symbol: symbol.toUpperCase(),
          interval: intervalKey,
          providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB },
        },
      },
    });
  }

  // Cache result
  candleCache.set(cacheKey, candles, CACHE_TTL.CANDLES);

  res.json({
    success: true,
    data: { symbol: symbol.toUpperCase(), interval: intervalKey, candles, provider },
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

  if (!USE_POLYGON && !USE_FINNHUB) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_NOT_CONFIGURED',
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY.',
        details: { symbol: symbol.toUpperCase() },
      },
    });
  }

  // Get candles to calculate indicators
  const candlesCacheKey = `candlesForIndicators:${symbol.toUpperCase()}:1d:200`;
  const cachedCandles = candleCache.get<{ provider: 'polygon' | 'finnhub'; candles: Candle[] }>(candlesCacheKey);

  let candles: Candle[] | null = cachedCandles?.candles ?? null;
  let provider: 'polygon' | 'finnhub' | null = cachedCandles?.provider ?? null;

  if (!candles || candles.length === 0 || !provider) {
    if (USE_POLYGON) {
      candles = await fetchPolygonCandles(symbol, 1, 'day', 200);
      if (candles && candles.length > 0) provider = 'polygon';
    }

    if ((!candles || candles.length === 0) && USE_FINNHUB) {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 200 * 24 * 60 * 60;
      candles = await fetchFinnhubCandles(symbol, 'D', from, to);
      if (candles && candles.length > 0) provider = 'finnhub';
    }

    if (!candles || candles.length === 0 || !provider) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: {
          code: 'MARKETDATA_UNAVAILABLE',
          message: 'Market indicators unavailable from configured providers.',
          details: {
            symbol: symbol.toUpperCase(),
            providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB },
          },
        },
      });
    }

    candleCache.set(candlesCacheKey, { provider, candles }, CACHE_TTL.CANDLES);
  }

  if (!candles || candles.length === 0 || !provider) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'MARKETDATA_UNAVAILABLE',
        message: 'Market indicators unavailable from configured providers.',
        details: {
          symbol: symbol.toUpperCase(),
          providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB },
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
        message: 'No market data providers configured. Set POLYGON_API_KEY and/or FINNHUB_API_KEY.',
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
    providers: { polygon: USE_POLYGON, finnhub: USE_FINNHUB },
  });
});

export default app;

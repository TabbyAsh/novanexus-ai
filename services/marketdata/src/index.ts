import express, { Request, Response, NextFunction } from 'express';
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

const CACHE_TTL = {
  QUOTE: 5,        // 5 seconds for real-time quotes
  CANDLES: 60,     // 1 minute for candles
  INDICATORS: 30,  // 30 seconds for indicators
  FUNDAMENTALS: 3600, // 1 hour for fundamentals
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
  if (!USE_REAL_DATA) return null;
  
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
  change: number;
  changePercent: number;
  volume: number;
  bid: number;
  ask: number;
  timestamp: string;
  source: 'polygon' | 'stub';
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
  rsi: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  macd: { value: number; signal: number; histogram: number };
  vwap: number;
  sma20: number;
  sma50: number;
  sma200: number;
  source: 'calculated' | 'stub';
}

// ============================================
// Indicator Calculations
// ============================================

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  const slice = closes.slice(0, period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return calculateSMA(closes, closes.length);
  
  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(closes.slice(0, period), period);
  
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateMACD(closes: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  
  // Signal line (9-period EMA of MACD)
  const signal = macdLine * 0.2 + (closes.length > 9 ? calculateEMA(closes.slice(0, 9), 9) : macdLine) * 0.8;
  
  return {
    value: Math.round(macdLine * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round((macdLine - signal) * 100) / 100,
  };
}

function calculateIndicatorsFromCandles(candles: Candle[]): Omit<Indicators, 'symbol' | 'source'> {
  const closes = candles.map(c => c.close).reverse(); // Most recent first
  const volumes = candles.map(c => c.volume).reverse();
  const highs = candles.map(c => c.high).reverse();
  const lows = candles.map(c => c.low).reverse();
  
  // Calculate VWAP (simplified - using last 20 candles)
  const vwapPeriod = Math.min(20, candles.length);
  let vwapNum = 0;
  let vwapDen = 0;
  for (let i = 0; i < vwapPeriod; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    vwapNum += typicalPrice * volumes[i];
    vwapDen += volumes[i];
  }
  const vwap = vwapDen > 0 ? vwapNum / vwapDen : closes[0];
  
  // Calculate ADX (simplified)
  const adx = 25 + Math.random() * 20; // Placeholder - full ADX is complex
  const plusDI = 20 + Math.random() * 15;
  const minusDI = 15 + Math.random() * 15;
  
  return {
    rsi: Math.round(calculateRSI(closes) * 10) / 10,
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(plusDI * 10) / 10,
    minusDI: Math.round(minusDI * 10) / 10,
    macd: calculateMACD(closes),
    vwap: Math.round(vwap * 100) / 100,
    sma20: Math.round(calculateSMA(closes, 20) * 100) / 100,
    sma50: Math.round(calculateSMA(closes, 50) * 100) / 100,
    sma200: Math.round(calculateSMA(closes, 200) * 100) / 100,
  };
}

// ============================================
// Stub Data Generators (Fallback)
// ============================================

const STUB_PRICES: Record<string, number> = {
  AAPL: 185.50, GOOGL: 141.25, MSFT: 378.90, AMZN: 178.30,
  NVDA: 495.75, TSLA: 248.60, META: 505.20, JPM: 195.40,
  V: 275.80, 'BRK.B': 365.10, SPY: 475.00, QQQ: 405.00,
};

function generateStubQuote(symbol: string): Quote {
  const basePrice = STUB_PRICES[symbol.toUpperCase()] || 100 + Math.random() * 200;
  const change = (Math.random() - 0.5) * basePrice * 0.03;
  
  return {
    symbol: symbol.toUpperCase(),
    price: Math.round((basePrice + change) * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round((change / basePrice) * 10000) / 100,
    volume: Math.floor(Math.random() * 50000000) + 1000000,
    bid: Math.round((basePrice + change - 0.05) * 100) / 100,
    ask: Math.round((basePrice + change + 0.05) * 100) / 100,
    timestamp: new Date().toISOString(),
    source: 'stub',
  };
}

function generateStubCandles(symbol: string, limit: number): Candle[] {
  const basePrice = STUB_PRICES[symbol.toUpperCase()] || 150;
  const candles: Candle[] = [];
  let price = basePrice * 0.95;
  const now = Date.now();
  
  for (let i = limit - 1; i >= 0; i--) {
    const open = price;
    const change = (Math.random() - 0.48) * price * 0.02;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    
    candles.push({
      timestamp: new Date(now - i * 86400000).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 50000000) + 1000000,
    });
    
    price = close;
  }
  
  return candles;
}

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
    change: Math.round(data.d * 100) / 100,
    changePercent: Math.round(data.dp * 100) / 100,
    volume: 0, // Finnhub quote doesn't include volume
    bid: Math.round((data.c - 0.01) * 100) / 100,
    ask: Math.round((data.c + 0.01) * 100) / 100,
    timestamp: new Date(data.t * 1000).toISOString(),
    source: 'polygon', // Keep as polygon for compatibility
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
  const currentPrice = t.min?.c || t.day?.c || t.prevDay?.c || 0;
  
  return {
    symbol: t.ticker,
    price: Math.round(currentPrice * 100) / 100,
    change: Math.round((t.todaysChange || 0) * 100) / 100,
    changePercent: Math.round((t.todaysChangePerc || 0) * 100) / 100,
    volume: t.day?.v || 0,
    bid: Math.round((currentPrice - 0.01) * 100) / 100,
    ask: Math.round((currentPrice + 0.01) * 100) / 100,
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
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, { requestId });
  }
  next();
});

// ============================================
// Health Check
// ============================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'marketdata',
    timestamp: new Date().toISOString(),
    polygonConfigured: USE_REAL_DATA,
    cacheSize: quoteCache.size() + candleCache.size(),
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
  
  // Try Polygon API
  let quote = await fetchPolygonQuote(symbol);
  
  // Fallback to stub if API fails
  if (!quote) {
    quote = generateStubQuote(symbol);
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
  
  // Map interval to Polygon timespan
  const intervalMap: Record<string, { multiplier: number; timespan: string }> = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '1d': { multiplier: 1, timespan: 'day' },
    '1w': { multiplier: 1, timespan: 'week' },
  };
  
  const intervalConfig = intervalMap[interval as string] || intervalMap['1d'];
  const cacheKey = `candles:${symbol.toUpperCase()}:${interval}:${limitNum}`;
  
  // Check cache
  const cached = candleCache.get<Candle[]>(cacheKey);
  if (cached) {
    return res.json({ 
      success: true, 
      data: { symbol: symbol.toUpperCase(), interval, candles: cached },
      cached: true,
    });
  }
  
  // Try Polygon API
  let candles = await fetchPolygonCandles(
    symbol,
    intervalConfig.multiplier,
    intervalConfig.timespan,
    limitNum
  );
  
  // Fallback to stub
  if (!candles || candles.length === 0) {
    candles = generateStubCandles(symbol, limitNum);
  }
  
  // Cache result
  candleCache.set(cacheKey, candles, CACHE_TTL.CANDLES);
  
  res.json({ 
    success: true, 
    data: { symbol: symbol.toUpperCase(), interval, candles },
    cached: false,
  });
});

// ============================================
// Indicators Endpoint (Calculated from candles)
// ============================================

app.get('/v1/market/indicators/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const cacheKey = `indicators:${symbol.toUpperCase()}`;
  
  // Check cache
  const cached = indicatorCache.get<Indicators>(cacheKey);
  if (cached) {
    return res.json({ success: true, data: { indicators: cached }, cached: true });
  }
  
  // Get candles to calculate indicators
  const candleCacheKey = `candles:${symbol.toUpperCase()}:1d:200`;
  let candles = candleCache.get<Candle[]>(candleCacheKey);
  
  if (!candles) {
    candles = await fetchPolygonCandles(symbol, 1, 'day', 200);
    if (!candles || candles.length === 0) {
      candles = generateStubCandles(symbol, 200);
    }
    candleCache.set(candleCacheKey, candles, CACHE_TTL.CANDLES);
  }
  
  const calculated = calculateIndicatorsFromCandles(candles);
  const indicators: Indicators = {
    symbol: symbol.toUpperCase(),
    ...calculated,
    source: USE_REAL_DATA && candles.length > 0 ? 'calculated' : 'stub',
  };
  
  indicatorCache.set(cacheKey, indicators, CACHE_TTL.INDICATORS);
  
  res.json({ success: true, data: { indicators }, cached: false });
});

// ============================================
// Fundamentals Endpoint
// ============================================

app.get('/v1/market/fundamentals/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  // TODO: Implement real fundamentals from Polygon when available
  // For MVP, return reasonable estimates based on symbol
  const fundamentals = {
    symbol: symbol.toUpperCase(),
    marketCap: 2850000000000,
    pe: 28.5,
    eps: 6.52,
    sharesOutstanding: 15400000000,
    float: 15200000000,
    shortInterest: 0.085,
    beta: 1.25,
    dividendYield: 0.005,
    source: 'stub' as const,
  };
  
  res.json({ success: true, data: { fundamentals } });
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
  
  const quotes: Quote[] = [];
  
  for (const symbol of symbols.slice(0, 20)) { // Limit to 20 symbols
    const cacheKey = `quote:${symbol.toUpperCase()}`;
    let quote = quoteCache.get<Quote>(cacheKey);
    
    if (!quote) {
      quote = await fetchPolygonQuote(symbol) || generateStubQuote(symbol);
      quoteCache.set(cacheKey, quote, CACHE_TTL.QUOTE);
    }
    
    quotes.push(quote);
  }
  
  res.json({ success: true, data: { quotes } });
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
    polygonConfigured: USE_REAL_DATA,
  });
});

export default app;

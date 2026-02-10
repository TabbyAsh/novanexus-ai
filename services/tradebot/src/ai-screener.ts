import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';

type CandleProvider = 'polygon' | 'finnhub' | 'alpaca' | 'synthetic';

type CandleProvenance = {
  source: CandleProvider;
  method: 'primary' | 'fallback' | 'synthetic';
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  note?: string;
};

type SignalProvenance = {
  candles?: CandleProvenance | null;
  quoteSource?: string | null;
  model?: string;
};

type ConfidenceTag = 'high' | 'medium' | 'low';

interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap?: number;
  provenance?: CandleProvenance | null;
  quoteSource?: string | null;
}

interface TechnicalIndicators {
  rsi: number;
  sma20: number;
  sma50: number;
  sma200: number;
  volumeRatio: number;
  atr: number;
  priceVsSma20: number;
  priceVsSma50: number;
}

interface AISignal {
  symbol: string;
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  pattern: string;
  confidence: number;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
  timeframe: string;
  indicators: TechnicalIndicators;
  timestamp: Date;
  provenance?: SignalProvenance;
  confidenceTag?: ConfidenceTag;
  rawConfidence?: number;
}

const DEFAULT_TICKERS = [
  // Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
  'ORCL', 'ADBE', 'NFLX', 'PYPL', 'SQ', 'SHOP', 'SNOW', 'PLTR', 'UBER', 'ABNB',
  // Finance
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'V', 'MA', 'BLK',
  // Healthcare
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'BMY',
  // Consumer
  'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'COST', 'LOW', 'DIS', 'CMCSA',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL',
  // Industrial
  'BA', 'CAT', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'DE', 'UNP',
  // ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'ARKK', 'VTI',
];

function getUniverse(): string[] {
  const raw = process.env.AI_SCREENER_UNIVERSE;
  if (!raw) return DEFAULT_TICKERS;
  return raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getQuote(symbol: string): Promise<{ quote: StockData | null; source?: string | null }> {
  const sym = symbol.toUpperCase();
  const data = await fetchJson<{ success: boolean; data?: { quote?: any } }>(`${MARKETDATA_URL}/v1/market/quote/${sym}`);
  const q = data?.data?.quote;
  if (!data?.success || !q || typeof q.price !== 'number') {
    return { quote: null, source: null };
  }

  const price = q.price as number;
  const change = typeof q.change === 'number' ? q.change : 0;
  const changePercent = typeof q.changePercent === 'number' ? q.changePercent : 0;
  const volume = typeof q.volume === 'number' ? q.volume : 0;

  return {
    quote: {
      symbol: sym,
      name: sym,
      price,
      change,
      changePercent,
      volume,
      avgVolume: volume,
      high: price,
      low: price,
      open: price - change,
      prevClose: price - change,
    },
    source: typeof q.source === 'string' ? q.source : null,
  };
}

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };

async function getCandles(symbol: string, limit: number): Promise<{ candles: Candle[]; provenance: CandleProvenance | null; provider: CandleProvider | null }> {
  const sym = symbol.toUpperCase();
  const data = await fetchJson<{ success: boolean; data?: { candles?: Candle[]; provenance?: CandleProvenance; provider?: CandleProvider } }>(
    `${MARKETDATA_URL}/v1/market/candles/${sym}?interval=1d&limit=${limit}`
  );
  if (!data?.success || !Array.isArray(data?.data?.candles)) {
    return { candles: [], provenance: null, provider: null };
  }
  return {
    candles: data.data?.candles || [],
    provenance: data.data?.provenance || null,
    provider: data.data?.provider || null,
  };
}

async function getStockData(symbol: string): Promise<StockData | null> {
  const { quote, source } = await getQuote(symbol);
  if (quote) {
    return { ...quote, quoteSource: source || null };
  }

  const { candles, provenance } = await getCandles(symbol, 2);
  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!latest) return null;

  const price = latest.close;
  const prevClose = prev?.close ?? latest.open ?? latest.close;
  const change = price - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    price,
    change,
    changePercent,
    volume: latest.volume ?? 0,
    avgVolume: latest.volume ?? 0,
    high: latest.high ?? price,
    low: latest.low ?? price,
    open: latest.open ?? price,
    prevClose,
    provenance,
    quoteSource: null,
  };
}

async function getHistoricalCandles(symbol: string, days: number = 60): Promise<{ candles: Candle[]; provenance: CandleProvenance | null }> {
  const { candles, provenance } = await getCandles(symbol, days);
  return { candles, provenance };
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period || closes.length < period + 1) return 0;

  let atr = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const prevClose = closes[i - 1] ?? closes[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose)
    );
    atr += tr;
  }
  return atr / period;
}

async function calculateIndicators(symbol: string, currentPrice: number): Promise<{ indicators: TechnicalIndicators; provenance: CandleProvenance | null }> {
  const { candles, provenance } = await getHistoricalCandles(symbol, 220);
  const prices = candles.map((c) => c.close).filter((v) => Number.isFinite(v));
  const highs = candles.map((c) => c.high).filter((v) => Number.isFinite(v));
  const lows = candles.map((c) => c.low).filter((v) => Number.isFinite(v));
  const volumes = candles.map((c) => c.volume).filter((v) => Number.isFinite(v));

  const rsi = calculateRSI(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const sma200 = calculateSMA(prices, 200);
  const avgVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const lastVolume = volumes.length ? volumes[volumes.length - 1] : 0;

  const indicators: TechnicalIndicators = {
    rsi,
    sma20,
    sma50,
    sma200,
    volumeRatio: avgVolume > 0 ? lastVolume / avgVolume : 1,
    atr: calculateATR(highs, lows, prices, 14) || Math.abs(currentPrice * 0.02),
    priceVsSma20: sma20 ? ((currentPrice - sma20) / sma20) * 100 : 0,
    priceVsSma50: sma50 ? ((currentPrice - sma50) / sma50) * 100 : 0,
  };

  return { indicators, provenance };
}

function confidenceTag(score: number): ConfidenceTag {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

export function applyProvenanceConfidence(raw: number, provenance?: CandleProvenance | null): { adjusted: number; tag: ConfidenceTag } {
  const multiplier = provenance?.confidenceScore ?? 1;
  const adjusted = Math.min(100, Math.max(0, Math.round(raw * multiplier)));
  return { adjusted, tag: confidenceTag(adjusted) };
}

export function buildDeterministicSignal(stock: StockData, indicators: TechnicalIndicators): { signal: AISignal; rawConfidence: number } {
  let score = 50;
  const reasons: string[] = [];

  if (indicators.rsi < 30) {
    score += 15;
    reasons.push('RSI indicates oversold conditions');
  } else if (indicators.rsi > 70) {
    score -= 15;
    reasons.push('RSI indicates overbought conditions');
  }

  if (indicators.priceVsSma20 > 0) {
    score += 10;
    reasons.push('Price above 20-day SMA');
  } else {
    score -= 10;
    reasons.push('Price below 20-day SMA');
  }

  if (indicators.priceVsSma50 > 0) {
    score += 8;
    reasons.push('Price above 50-day SMA');
  } else {
    score -= 8;
    reasons.push('Price below 50-day SMA');
  }

  if (indicators.volumeRatio > 1.2) {
    score += 5;
    reasons.push('Volume above average');
  }

  const signalType: AISignal['type'] = score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
  const confidence = Math.round(Math.min(100, Math.max(0, score)));

  const entry = stock.price;
  const target = signalType === 'bullish' ? entry * 1.06 : signalType === 'bearish' ? entry * 0.94 : entry * 1.02;
  const stopLoss = signalType === 'bullish' ? entry * 0.97 : signalType === 'bearish' ? entry * 1.03 : entry * 0.99;
  const riskReward = Math.abs(target - entry) / Math.max(0.01, Math.abs(entry - stopLoss));

  return {
    rawConfidence: confidence,
    signal: {
      symbol: stock.symbol,
      name: stock.name,
      type: signalType,
      pattern: signalType === 'bullish' ? 'Momentum Upside' : signalType === 'bearish' ? 'Momentum Downside' : 'Neutral Setup',
      confidence,
      entry: Number(entry.toFixed(2)),
      target: Number(target.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      riskReward: Number(riskReward.toFixed(2)),
      reasoning: reasons.length ? reasons.join('; ') : 'Rule-based signal derived from indicators',
      timeframe: '1-3 weeks',
      indicators,
      timestamp: new Date(),
    },
  };
}

async function analyzeWithAI(
  stock: StockData,
  indicators: TechnicalIndicators
): Promise<{ signal: AISignal; rawConfidence: number } | null> {
  if (!openai) return null;

  try {
    const prompt = `You are an expert technical analyst. Analyze this stock and provide a trading signal.\n\nStock: ${stock.symbol} (${stock.name})\nCurrent Price: $${stock.price.toFixed(2)}\nDaily Change: ${stock.changePercent.toFixed(2)}%\nVolume: ${stock.volume.toLocaleString()}\n\nTechnical Indicators:\n- RSI(14): ${indicators.rsi.toFixed(1)}\n- Price vs 20 SMA: ${indicators.priceVsSma20.toFixed(2)}%\n- Price vs 50 SMA: ${indicators.priceVsSma50.toFixed(2)}%\n- 20 SMA: $${indicators.sma20.toFixed(2)}\n- 50 SMA: $${indicators.sma50.toFixed(2)}\n- 200 SMA: $${indicators.sma200.toFixed(2)}\n\nBased on this data, provide your analysis in this exact JSON format:\n{\n  \"signal\": \"bullish\" | \"bearish\" | \"neutral\",\n  \"confidence\": 0-100,\n  \"pattern\": \"pattern name\",\n  \"entry\": price,\n  \"target\": price,\n  \"stopLoss\": price,\n  \"reasoning\": \"brief explanation\",\n  \"timeframe\": \"1-2 weeks\" etc\n}\n\nOnly respond with valid JSON, no other text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const analysis = JSON.parse(content);
    const riskReward = Math.abs(analysis.target - analysis.entry) / Math.abs(analysis.entry - analysis.stopLoss);

    const signal: AISignal = {
      symbol: stock.symbol,
      name: stock.name,
      type: analysis.signal,
      pattern: analysis.pattern,
      confidence: analysis.confidence,
      entry: analysis.entry,
      target: analysis.target,
      stopLoss: analysis.stopLoss,
      riskReward,
      reasoning: analysis.reasoning,
      timeframe: analysis.timeframe,
      indicators,
      timestamp: new Date(),
    };

    return { signal, rawConfidence: analysis.confidence };
  } catch (error) {
    console.error(`Error analyzing ${stock.symbol} with AI:`, error);
    return null;
  }
}

// Main screening function - scans all stocks in parallel
export async function screenMarket(options: {
  maxStocks?: number;
  minConfidence?: number;
  signalType?: 'bullish' | 'bearish' | 'all';
}): Promise<AISignal[]> {
  const { maxStocks = 100, minConfidence = 65, signalType = 'all' } = options;

  console.log('Starting market screening...');
  const allTickers = getUniverse();
  const tickersToScan = allTickers.slice(0, maxStocks);
  console.log(`Scanning ${tickersToScan.length} stocks...`);

  const batchSize = 10;
  const signals: AISignal[] = [];

  for (let i = 0; i < tickersToScan.length; i += batchSize) {
    const batch = tickersToScan.slice(i, i + batchSize);

    const batchPromises = batch.map(async (symbol) => {
      try {
        const stockData = await getStockData(symbol);
        if (!stockData) return null;

        const { indicators, provenance } = await calculateIndicators(symbol, stockData.price);
        const aiResult = await analyzeWithAI(stockData, indicators);
        const fallbackResult = aiResult ? null : buildDeterministicSignal(stockData, indicators);

        const picked = aiResult?.signal || fallbackResult?.signal;
        const rawConfidence = aiResult?.rawConfidence ?? fallbackResult?.rawConfidence ?? picked?.confidence ?? 0;

        if (picked) {
          const { adjusted, tag } = applyProvenanceConfidence(rawConfidence, provenance);
          picked.confidence = adjusted;
          picked.rawConfidence = rawConfidence;
          picked.confidenceTag = tag;
          picked.provenance = {
            candles: provenance || null,
            quoteSource: stockData.quoteSource || null,
            model: aiResult ? 'openai:gpt-4o-mini' : 'deterministic',
          };

          if (picked.confidence >= minConfidence) {
            if (signalType === 'all' || picked.type === signalType) {
              return picked;
            }
          }
        }
        return null;
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    signals.push(...batchResults.filter((s): s is AISignal => s !== null));

    await new Promise((resolve) => setTimeout(resolve, 300));
    console.log(`Processed ${Math.min(i + batchSize, tickersToScan.length)}/${tickersToScan.length} stocks, found ${signals.length} signals`);
  }

  signals.sort((a, b) => b.confidence - a.confidence);
  console.log(`Screening complete. Found ${signals.length} high-confidence signals.`);
  return signals;
}

// Quick scan for top movers
export async function scanTopMovers(): Promise<AISignal[]> {
  try {
    const universe = getUniverse().slice(0, 50);
    const quotes = await Promise.all(universe.map(async (symbol) => getStockData(symbol)));

    const movers = quotes
      .filter((q): q is StockData => !!q && Number.isFinite(q.changePercent))
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 12);

    const signals: AISignal[] = [];
    for (const mover of movers) {
      const { indicators, provenance } = await calculateIndicators(mover.symbol, mover.price);
      const aiResult = await analyzeWithAI(mover, indicators);
      const fallbackResult = aiResult ? null : buildDeterministicSignal(mover, indicators);

      const picked = aiResult?.signal || fallbackResult?.signal;
      const rawConfidence = aiResult?.rawConfidence ?? fallbackResult?.rawConfidence ?? picked?.confidence ?? 0;
      if (!picked) continue;

      const { adjusted, tag } = applyProvenanceConfidence(rawConfidence, provenance);
      picked.confidence = adjusted;
      picked.rawConfidence = rawConfidence;
      picked.confidenceTag = tag;
      picked.provenance = {
        candles: provenance || null,
        quoteSource: mover.quoteSource || null,
        model: aiResult ? 'openai:gpt-4o-mini' : 'deterministic',
      };

      if (picked.confidence >= 60) signals.push(picked);
    }

    return signals.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error('Error scanning top movers:', error);
    return [];
  }
}

export default {
  screenMarket,
  scanTopMovers,
  getStockData,
  calculateIndicators,
  analyzeWithAI,
  buildDeterministicSignal,
  applyProvenanceConfidence,
};

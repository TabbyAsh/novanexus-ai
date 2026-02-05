import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

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
}

// Get all US stock tickers from Polygon
async function getAllTickers(): Promise<string[]> {
  try {
    const response = await axios.get(
      `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${POLYGON_API_KEY}`
    );
    return response.data.results?.map((t: any) => t.ticker) || [];
  } catch (error) {
    console.error('Error fetching tickers:', error);
    // Fallback to a diverse list of stocks across sectors
    return [
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
  }
}

// Get stock quote data from Polygon
async function getStockData(symbol: string): Promise<StockData | null> {
  try {
    // Get previous day's data
    const prevResponse = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );
    
    // Get ticker details
    const detailsResponse = await axios.get(
      `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`
    );
    
    const prevData = prevResponse.data.results?.[0];
    const details = detailsResponse.data.results;
    
    if (!prevData) return null;
    
    return {
      symbol,
      name: details?.name || symbol,
      price: prevData.c,
      change: prevData.c - prevData.o,
      changePercent: ((prevData.c - prevData.o) / prevData.o) * 100,
      volume: prevData.v,
      avgVolume: prevData.v, // Would need historical data for true avg
      high: prevData.h,
      low: prevData.l,
      open: prevData.o,
      prevClose: prevData.c,
      marketCap: details?.market_cap,
    };
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    return null;
  }
}

// Get historical data for technical analysis
async function getHistoricalData(symbol: string, days: number = 60): Promise<number[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const response = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
    );
    
    return response.data.results?.map((d: any) => d.c) || [];
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return [];
  }
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
  if (highs.length < period) return 0;
  
  let atr = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atr += tr;
  }
  return atr / period;
}

// Calculate technical indicators
async function calculateIndicators(symbol: string, currentPrice: number): Promise<TechnicalIndicators> {
  const prices = await getHistoricalData(symbol, 220);
  
  const rsi = calculateRSI(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const sma200 = calculateSMA(prices, 200);
  
  return {
    rsi,
    sma20,
    sma50,
    sma200,
    volumeRatio: 1, // Would need volume data
    atr: Math.abs(currentPrice * 0.02), // Simplified
    priceVsSma20: ((currentPrice - sma20) / sma20) * 100,
    priceVsSma50: ((currentPrice - sma50) / sma50) * 100,
  };
}

// Use OpenAI to analyze stock and generate signal
async function analyzeWithAI(
  stock: StockData,
  indicators: TechnicalIndicators
): Promise<AISignal | null> {
  try {
    const prompt = `You are an expert technical analyst. Analyze this stock and provide a trading signal.

Stock: ${stock.symbol} (${stock.name})
Current Price: $${stock.price.toFixed(2)}
Daily Change: ${stock.changePercent.toFixed(2)}%
Volume: ${stock.volume.toLocaleString()}

Technical Indicators:
- RSI(14): ${indicators.rsi.toFixed(1)}
- Price vs 20 SMA: ${indicators.priceVsSma20.toFixed(2)}%
- Price vs 50 SMA: ${indicators.priceVsSma50.toFixed(2)}%
- 20 SMA: $${indicators.sma20.toFixed(2)}
- 50 SMA: $${indicators.sma50.toFixed(2)}
- 200 SMA: $${indicators.sma200.toFixed(2)}

Based on this data, provide your analysis in this exact JSON format:
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0-100,
  "pattern": "pattern name",
  "entry": price,
  "target": price,
  "stopLoss": price,
  "reasoning": "brief explanation",
  "timeframe": "1-2 weeks" etc
}

Only respond with valid JSON, no other text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Parse the JSON response
    const analysis = JSON.parse(content);
    
    // Only return if confidence is above threshold
    if (analysis.confidence < 60) return null;

    const riskReward = Math.abs(analysis.target - analysis.entry) / Math.abs(analysis.entry - analysis.stopLoss);

    return {
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
  
  // Get all tickers
  const allTickers = await getAllTickers();
  const tickersToScan = allTickers.slice(0, maxStocks);
  
  console.log(`Scanning ${tickersToScan.length} stocks...`);
  
  // Fetch stock data in parallel batches
  const batchSize = 10;
  const signals: AISignal[] = [];
  
  for (let i = 0; i < tickersToScan.length; i += batchSize) {
    const batch = tickersToScan.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (symbol) => {
      try {
        const stockData = await getStockData(symbol);
        if (!stockData) return null;
        
        const indicators = await calculateIndicators(symbol, stockData.price);
        const signal = await analyzeWithAI(stockData, indicators);
        
        if (signal && signal.confidence >= minConfidence) {
          if (signalType === 'all' || signal.type === signalType) {
            return signal;
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
    
    // Rate limiting - be nice to APIs
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Processed ${Math.min(i + batchSize, tickersToScan.length)}/${tickersToScan.length} stocks, found ${signals.length} signals`);
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`Screening complete. Found ${signals.length} high-confidence signals.`);
  
  return signals;
}

// Quick scan for top movers
export async function scanTopMovers(): Promise<AISignal[]> {
  try {
    // Get gainers from Polygon
    const gainersResponse = await axios.get(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`
    );
    
    // Get losers from Polygon  
    const losersResponse = await axios.get(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/losers?apiKey=${POLYGON_API_KEY}`
    );
    
    const gainers = gainersResponse.data.tickers?.slice(0, 10) || [];
    const losers = losersResponse.data.tickers?.slice(0, 10) || [];
    
    const movers = [...gainers, ...losers];
    const signals: AISignal[] = [];
    
    for (const mover of movers) {
      try {
        const stockData: StockData = {
          symbol: mover.ticker,
          name: mover.ticker,
          price: mover.day?.c || mover.prevDay?.c || 0,
          change: mover.todaysChange || 0,
          changePercent: mover.todaysChangePerc || 0,
          volume: mover.day?.v || 0,
          avgVolume: mover.day?.v || 0,
          high: mover.day?.h || 0,
          low: mover.day?.l || 0,
          open: mover.day?.o || 0,
          prevClose: mover.prevDay?.c || 0,
        };
        
        const indicators = await calculateIndicators(mover.ticker, stockData.price);
        const signal = await analyzeWithAI(stockData, indicators);
        
        if (signal && signal.confidence >= 60) {
          signals.push(signal);
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing mover ${mover.ticker}:`, error);
      }
    }
    
    return signals.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error('Error scanning top movers:', error);
    return [];
  }
}

// Export for use in API routes
export default {
  screenMarket,
  scanTopMovers,
  getStockData,
  calculateIndicators,
  analyzeWithAI,
};

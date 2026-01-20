import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, TRADING_DEFAULTS } from '@nova/shared';
import type { 
  ApiResponse, Signal, PaperTrade, Strategy, BotRunInput, BotRunOutput,
  SignalRationale, ChecklistItem, TradeSide 
} from '@nova/shared';

const app = express();
const logger = createLogger('tradebot-service');
const PORT = process.env.PORT || SERVICE_PORTS.TRADEBOT;

// In-memory stores (replace with DB)
const signals: Map<string, Signal> = new Map();
const paperTrades: Map<string, PaperTrade> = new Map();
const strategies: Map<string, Strategy> = new Map();

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'tradebot',
    timestamp: new Date().toISOString() 
  });
});

// ============================================
// Bot Standard Interface
// ============================================

// POST /internal/bot/run - Standard bot execution endpoint
app.post('/internal/bot/run', async (req: Request, res: Response) => {
  try {
    const input: BotRunInput = req.body;
    
    logger.info('TradeBot task received', { taskId: input.taskId, type: input.type });
    
    let output: BotRunOutput;
    
    switch (input.type) {
      case 'trade.scan':
        output = await handleScan(input);
        break;
      case 'trade.score':
        output = await handleScore(input);
        break;
      case 'trade.backtest':
        output = await handleBacktest(input);
        break;
      case 'trade.paper.execute':
        output = await handlePaperExecute(input);
        break;
      default:
        output = {
          status: 'FAILED',
          output: { error: 'Unknown task type' },
          events: [],
        };
    }
    
    res.json(output);
  } catch (error) {
    logger.error('Bot execution failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: 'FAILED',
      output: { error: (error as Error).message },
      events: [],
    });
  }
});

// ============================================
// Scan Routes
// ============================================

// POST /v1/trade/scan - Execute scanner with filters
app.post('/v1/trade/scan', async (req: Request, res: Response) => {
  try {
    const { filters } = req.body;
    
    // TODO: Implement real market data scanning
    // This is a stub that returns sample data
    const results = [
      { symbol: 'AAPL', price: 185.50, volume: 52000000, change: 2.3, score: 78 },
      { symbol: 'NVDA', price: 875.25, volume: 45000000, change: 4.1, score: 85 },
      { symbol: 'TSLA', price: 245.80, volume: 98000000, change: -1.2, score: 62 },
    ];
    
    const response: ApiResponse<{ results: typeof results }> = {
      success: true,
      data: { results },
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Scan failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'SCAN_FAILED', message: 'Scan execution failed' },
    });
  }
});

// ============================================
// Score/Checklist Routes
// ============================================

// POST /v1/trade/score - Score a symbol against checklist
app.post('/v1/trade/score', async (req: Request, res: Response) => {
  try {
    const { symbol, strategyVersion } = req.body;
    
    // TODO: Implement real checklist scoring
    const checklist: ChecklistItem[] = [
      { name: 'Price > $5', passed: true, value: 185.50, threshold: 5, weight: 10 },
      { name: 'Volume > 1M', passed: true, value: 52000000, threshold: 1000000, weight: 15 },
      { name: 'Float < 100M', passed: true, value: 45000000, threshold: 100000000, weight: 10 },
      { name: 'ADX > 25', passed: true, value: 32, threshold: 25, weight: 20 },
      { name: '+DI > -DI', passed: true, value: '+DI: 28, -DI: 18', weight: 15 },
      { name: 'RSI < 70', passed: true, value: 58, threshold: 70, weight: 10 },
      { name: 'Short Interest < 20%', passed: true, value: 8.5, threshold: 20, weight: 10 },
      { name: 'Above VWAP', passed: false, value: 'Below', weight: 10 },
    ];
    
    const passedWeight = checklist.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
    const totalWeight = checklist.reduce((sum, c) => sum + c.weight, 0);
    const score = Math.round((passedWeight / totalWeight) * 100);
    
    const rationale: SignalRationale = {
      checklist,
      summary: `${symbol} scores ${score}/100. Strong trend momentum with ${checklist.filter(c => c.passed).length}/${checklist.length} criteria passing.`,
      confidence: score >= TRADING_DEFAULTS.MIN_SCORE_FOR_SIGNAL ? 0.8 : 0.4,
    };
    
    const signal: Signal = {
      id: crypto.randomUUID(),
      orgId: req.headers['x-org-id'] as string || 'default-org',
      symbol,
      strategyVersion: strategyVersion || 'v1.0',
      score,
      rationale,
      ts: new Date().toISOString(),
    };
    
    signals.set(signal.id, signal);
    
    res.json({ success: true, data: { signal } });
  } catch (error) {
    logger.error('Score failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'SCORE_FAILED', message: 'Scoring failed' },
    });
  }
});

// ============================================
// Backtest Routes
// ============================================

// POST /v1/trade/backtest - Run backtest
app.post('/v1/trade/backtest', async (req: Request, res: Response) => {
  try {
    const { strategyVersion, startDate, endDate, symbols } = req.body;
    
    // TODO: Implement real backtesting with historical data
    const results = {
      strategyVersion,
      period: { startDate, endDate },
      metrics: {
        totalTrades: 47,
        winRate: 0.62,
        profitFactor: 1.85,
        sharpeRatio: 1.42,
        maxDrawdown: 0.12,
        avgWin: 245.50,
        avgLoss: -132.20,
        totalPnL: 3847.25,
      },
      trades: [
        { symbol: 'AAPL', entry: 175.20, exit: 182.50, pnl: 730, holdingDays: 3 },
        { symbol: 'NVDA', entry: 820.00, exit: 875.00, pnl: 1100, holdingDays: 5 },
      ],
    };
    
    res.json({ success: true, data: { results } });
  } catch (error) {
    logger.error('Backtest failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'BACKTEST_FAILED', message: 'Backtest failed' },
    });
  }
});

// ============================================
// Paper Trading Routes
// ============================================

// POST /v1/trade/paper/execute - Execute paper trade
app.post('/v1/trade/paper/execute', async (req: Request, res: Response) => {
  try {
    const { symbol, side, qty, price, stopLoss, takeProfit } = req.body;
    
    const trade: PaperTrade = {
      id: crypto.randomUUID(),
      orgId: req.headers['x-org-id'] as string || 'default-org',
      symbol,
      side: side as TradeSide,
      qty,
      entryPrice: price,
      entryTs: new Date().toISOString(),
      meta: { stopLoss, takeProfit },
    };
    
    paperTrades.set(trade.id, trade);
    
    logger.info('Paper trade opened', { tradeId: trade.id, symbol, side });
    
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { trade } });
  } catch (error) {
    logger.error('Paper trade failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'PAPER_TRADE_FAILED', message: 'Paper trade execution failed' },
    });
  }
});

// POST /v1/trade/paper/:id/close - Close paper trade
app.post('/v1/trade/paper/:id/close', async (req: Request, res: Response) => {
  try {
    const trade = paperTrades.get(req.params.id);
    
    if (!trade) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Trade not found' },
      });
    }
    
    const { exitPrice } = req.body;
    
    trade.exitPrice = exitPrice;
    trade.exitTs = new Date().toISOString();
    trade.pnl = (exitPrice - trade.entryPrice) * trade.qty * (trade.side === 'LONG' ? 1 : -1);
    
    logger.info('Paper trade closed', { tradeId: trade.id, pnl: trade.pnl });
    
    res.json({ success: true, data: { trade } });
  } catch (error) {
    logger.error('Close trade failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'CLOSE_FAILED', message: 'Failed to close trade' },
    });
  }
});

// GET /v1/trade/paper/history - Get paper trade history
app.get('/v1/trade/paper/history', async (req: Request, res: Response) => {
  const trades = Array.from(paperTrades.values());
  const closed = trades.filter(t => t.exitTs);
  
  const stats = {
    totalTrades: closed.length,
    winRate: closed.length > 0 
      ? closed.filter(t => (t.pnl || 0) > 0).length / closed.length 
      : 0,
    totalPnL: closed.reduce((sum, t) => sum + (t.pnl || 0), 0),
    avgPnL: closed.length > 0 
      ? closed.reduce((sum, t) => sum + (t.pnl || 0), 0) / closed.length 
      : 0,
  };
  
  res.json({ success: true, data: { trades, stats } });
});

// ============================================
// Strategy Routes
// ============================================

// POST /v1/trade/strategies - Create/update strategy
app.post('/v1/trade/strategies', async (req: Request, res: Response) => {
  const strategy: Strategy = {
    id: crypto.randomUUID(),
    orgId: req.headers['x-org-id'] as string || 'default-org',
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  
  strategies.set(strategy.id, strategy);
  
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { strategy } });
});

// GET /v1/trade/strategies - List strategies
app.get('/v1/trade/strategies', async (req: Request, res: Response) => {
  const strategyList = Array.from(strategies.values());
  res.json({ success: true, data: { strategies: strategyList } });
});

// ============================================
// Signal Routes
// ============================================

// GET /v1/trade/signals - List signals
app.get('/v1/trade/signals', async (req: Request, res: Response) => {
  const signalList = Array.from(signals.values())
    .sort((a, b) => b.ts.localeCompare(a.ts));
  res.json({ success: true, data: { signals: signalList } });
});

// ============================================
// Internal Handlers
// ============================================

async function handleScan(input: BotRunInput): Promise<BotRunOutput> {
  const filters = input.input.filters as Record<string, unknown> || {};
  
  // Stub implementation
  return {
    status: 'DONE',
    output: {
      symbols: ['AAPL', 'NVDA', 'TSLA'],
      scannedAt: new Date().toISOString(),
    },
    events: [
      { type: 'trade.scan.executed', payload: { filters } },
    ],
  };
}

async function handleScore(input: BotRunInput): Promise<BotRunOutput> {
  const symbol = input.input.symbol as string;
  
  return {
    status: 'DONE',
    output: {
      symbol,
      score: 78,
      recommendation: 'WATCH',
    },
    events: [
      { type: 'trade.signal.generated', payload: { symbol, score: 78 } },
    ],
  };
}

async function handleBacktest(input: BotRunInput): Promise<BotRunOutput> {
  return {
    status: 'DONE',
    output: {
      winRate: 0.62,
      profitFactor: 1.85,
      totalTrades: 47,
    },
    events: [
      { type: 'trade.backtest.run', payload: input.input },
    ],
  };
}

async function handlePaperExecute(input: BotRunInput): Promise<BotRunOutput> {
  // Check if live execution is allowed
  const allowedActions = input.constraints.allowedActions || [];
  
  if (!allowedActions.includes('trade.paper.execute' as any)) {
    return {
      status: 'NEEDS_APPROVAL',
      output: { reason: 'Paper trading requires approval' },
      events: [],
      requiredApproval: {
        role: 'OWNER',
        reason: 'Paper trade execution requested',
      },
    };
  }
  
  return {
    status: 'DONE',
    output: {
      tradeId: crypto.randomUUID(),
      executed: true,
    },
    events: [
      { type: 'trade.paper.opened', payload: input.input },
    ],
  };
}

// Start server
app.listen(PORT, () => {
  logger.info(`TradeBot service started on port ${PORT}`);
});

export default app;

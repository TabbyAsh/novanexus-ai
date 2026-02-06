import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  query,
  queryOne,
  transaction,
  verifyToken,
  nowTimestamp,
  generateId,
} from '@nova/shared';

const app = express();
const logger = createLogger('nova-hub');
const PORT = process.env.PORT || 3030;

// External service URLs
const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
const BILLING_URL = process.env.BILLING_URL || 'http://localhost:3006';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ============================================
// Middleware
// ============================================

app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, { requestId });
  }
  next();
});

// Auth middleware
interface AuthenticatedRequest extends Request {
  user?: { userId: string; orgId: string; role: string; scopes: string[] };
}

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Missing authorization' },
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload || payload.type !== 'access') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid or expired token' },
    });
  }

  req.user = {
    userId: payload.userId,
    orgId: payload.orgId,
    role: payload.role,
    scopes: payload.scopes,
  };

  next();
}

// ============================================
// Plan & Quota Helpers
// ============================================

interface PlanLimits {
  daily_journal_entries: number;
  daily_backtests: number;
  max_watchlists: number;
  max_alerts: number;
  max_paper_trades: number;
  ai_thesis_daily: number;
  csv_export: boolean;
  pdf_reports: boolean;
}

async function getUserPlan(userId: string): Promise<{ plan: string; limits: PlanLimits }> {
  const entitlement = await queryOne<{ plan: string }>(
    'SELECT plan FROM entitlements WHERE user_id = $1',
    [userId]
  );
  
  const plan = entitlement?.plan || 'FREE';
  
  const config = await queryOne<{ limits_json: string }>(
    'SELECT limits_json FROM plan_configs WHERE plan = $1',
    [plan]
  );
  
  const limits = config?.limits_json ? JSON.parse(config.limits_json) : {
    daily_journal_entries: 3,
    daily_backtests: 1,
    max_watchlists: 1,
    max_alerts: 5,
    max_paper_trades: 10,
    ai_thesis_daily: 0,
    csv_export: false,
    pdf_reports: false,
  };
  
  return { plan, limits };
}

async function checkQuota(userId: string, quotaType: string): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const { plan, limits } = await getUserPlan(userId);
  
  // Get today's usage
  const today = new Date().toISOString().split('T')[0];
  let usage = await queryOne<{ journal_entries_count: number; backtests_count: number; ai_thesis_count: number }>(
    'SELECT journal_entries_count, backtests_count, ai_thesis_count FROM usage_tracking WHERE user_id = $1 AND usage_date = $2',
    [userId, today]
  );
  
  if (!usage) {
    // Create usage record for today
    await query(
      'INSERT INTO usage_tracking (user_id, usage_date) VALUES ($1, $2) ON CONFLICT (user_id, usage_date) DO NOTHING',
      [userId, today]
    );
    usage = { journal_entries_count: 0, backtests_count: 0, ai_thesis_count: 0 };
  }
  
  let limit: number;
  let current: number;
  
  switch (quotaType) {
    case 'journal':
      limit = limits.daily_journal_entries;
      current = usage.journal_entries_count;
      break;
    case 'backtest':
      limit = limits.daily_backtests;
      current = usage.backtests_count;
      break;
    case 'ai_thesis':
      limit = limits.ai_thesis_daily;
      current = usage.ai_thesis_count;
      break;
    default:
      return { allowed: true, remaining: -1 };
  }
  
  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, remaining: -1 };
  }
  
  const remaining = limit - current;
  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      message: `Daily ${quotaType} limit reached. Upgrade to ${plan === 'FREE' ? 'Lite' : 'Pro'} for more.`,
    };
  }
  
  return { allowed: true, remaining };
}

async function incrementUsage(userId: string, quotaType: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const column = quotaType === 'journal' ? 'journal_entries_count'
    : quotaType === 'backtest' ? 'backtests_count'
    : quotaType === 'ai_thesis' ? 'ai_thesis_count'
    : null;
    
  if (column) {
    await query(
      `INSERT INTO usage_tracking (user_id, usage_date, ${column}) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE SET ${column} = usage_tracking.${column} + 1`,
      [userId, today]
    );
  }
}

// ============================================
// Market Data Client
// ============================================

type HubQuote = {
  price: number;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
};

type HistoricalBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function getQuote(symbol: string): Promise<HubQuote | null> {
  const sym = symbol.toUpperCase();

  try {
    const res = await fetch(`${MARKETDATA_URL}/v1/market/quote/${encodeURIComponent(sym)}`);
    const data = (await res.json().catch(() => null)) as any;

    const quote = data?.data?.quote;
    if (!res.ok || !data?.success || !quote) {
      return null;
    }

    if (typeof quote.price !== 'number' || !Number.isFinite(quote.price)) {
      return null;
    }

    const change = typeof quote.change === 'number' && Number.isFinite(quote.change) ? quote.change : null;
    const changePercent =
      typeof quote.changePercent === 'number' && Number.isFinite(quote.changePercent) ? quote.changePercent : null;
    const volume = typeof quote.volume === 'number' && Number.isFinite(quote.volume) ? quote.volume : null;

    return {
      price: quote.price,
      change,
      changePercent,
      volume,
    };
  } catch (err) {
    logger.warn('Market quote unavailable', { symbol: sym, error: (err as Error).message });
    return null;
  }
}

async function getHistoricalData(symbol: string, startDate: string, endDate: string): Promise<HistoricalBar[]> {
  const sym = symbol.toUpperCase();

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error('Invalid start/end date range');
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay) + 1);

  // Pull a bit more than requested to account for weekends/holidays.
  const limit = Math.min(365, Math.max(5, diffDays + 10));

  const url = `${MARKETDATA_URL}/v1/market/candles/${encodeURIComponent(sym)}?interval=1d&limit=${limit}`;

  const res = await fetch(url);
  const data = (await res.json().catch(() => null)) as any;

  const candles: any[] | undefined = data?.data?.candles;
  if (!res.ok || !data?.success || !Array.isArray(candles)) {
    const msg = data?.error?.message || 'Historical market data unavailable';
    throw new Error(msg);
  }

  const startKey = startDate;
  const endKey = endDate;

  return candles
    .map((c) => {
      const date = typeof c?.timestamp === 'string' ? new Date(c.timestamp).toISOString().split('T')[0] : null;
      if (!date) return null;

      return {
        date,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      } satisfies HistoricalBar;
    })
    .filter((b): b is HistoricalBar => !!b)
    .filter((b) => b.date >= startKey && b.date <= endKey);
}

// ============================================
// Health Check
// ============================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'healthy', service: 'nova-hub', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', service: 'nova-hub' });
  }
});

// ============================================
// Journal API
// ============================================

// Get journal entries
app.get('/v1/journal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, status, strategy, limit = '50', offset = '0' } = req.query;
  
  let whereClause = 'WHERE user_id = $1';
  const params: (string | number)[] = [userId];
  let paramIndex = 2;
  
  if (symbol) {
    whereClause += ` AND symbol = $${paramIndex++}`;
    params.push(symbol as string);
  }
  if (status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(status as string);
  }
  if (strategy) {
    whereClause += ` AND strategy_tag = $${paramIndex++}`;
    params.push(strategy as string);
  }
  
  params.push(parseInt(limit as string), parseInt(offset as string));
  
  const result = await query<{
    id: string;
    symbol: string;
    direction: string;
    entry_price: string;
    exit_price: string | null;
    position_size: string;
    entry_date: string;
    exit_date: string | null;
    status: string;
    thesis: string | null;
    notes: string | null;
    strategy_tag: string | null;
    pnl: string | null;
    pnl_percent: string | null;
    created_at: string;
  }>(
    `SELECT id, symbol, direction, entry_price, exit_price, position_size, entry_date, exit_date, 
            status, thesis, notes, strategy_tag, pnl, pnl_percent, created_at
     FROM journal_entries ${whereClause}
     ORDER BY entry_date DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );
  
  // Get metrics
  const metrics = await queryOne<{
    total_trades: string;
    winning_trades: string;
    total_pnl: string;
    avg_pnl_percent: string;
  }>(
    `SELECT 
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
      COALESCE(SUM(pnl), 0) as total_pnl,
      COALESCE(AVG(pnl_percent) FILTER (WHERE status = 'CLOSED'), 0) as avg_pnl_percent
     FROM journal_entries WHERE user_id = $1`,
    [userId]
  );
  
  const entries = result.rows.map(row => ({
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    entryPrice: parseFloat(row.entry_price),
    exitPrice: row.exit_price ? parseFloat(row.exit_price) : null,
    positionSize: parseFloat(row.position_size),
    entryDate: row.entry_date,
    exitDate: row.exit_date,
    status: row.status,
    thesis: row.thesis,
    notes: row.notes,
    strategyTag: row.strategy_tag,
    pnl: row.pnl ? parseFloat(row.pnl) : null,
    pnlPercent: row.pnl_percent ? parseFloat(row.pnl_percent) : null,
    createdAt: row.created_at,
  }));
  
  res.json({
    success: true,
    data: {
      entries,
      metrics: {
        totalTrades: parseInt(metrics?.total_trades || '0'),
        winningTrades: parseInt(metrics?.winning_trades || '0'),
        winRate: metrics && parseInt(metrics.total_trades) > 0 
          ? Math.round((parseInt(metrics.winning_trades) / parseInt(metrics.total_trades)) * 100) 
          : 0,
        totalPnl: parseFloat(metrics?.total_pnl || '0'),
        avgPnlPercent: parseFloat(metrics?.avg_pnl_percent || '0'),
      },
    },
  });
});

// Create journal entry
app.post('/v1/journal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  
  // Check quota
  const quota = await checkQuota(userId, 'journal');
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: quota.message },
    });
  }
  
  const { symbol, direction, entryPrice, exitPrice, positionSize, entryDate, exitDate, thesis, notes, strategyTag, paperTradeId } = req.body;
  
  if (!symbol || !direction || !entryPrice || !positionSize || !entryDate) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields' },
    });
  }
  
  // Calculate P/L if closed
  let pnl: number | null = null;
  let pnlPercent: number | null = null;
  let status = 'OPEN';
  
  if (exitPrice) {
    status = 'CLOSED';
    const entryValue = entryPrice * positionSize;
    const exitValue = exitPrice * positionSize;
    
    if (direction === 'BUY' || direction === 'LONG') {
      pnl = exitValue - entryValue;
    } else {
      pnl = entryValue - exitValue;
    }
    pnlPercent = (pnl / entryValue) * 100;
  }
  
  const result = await queryOne<{ id: string; created_at: string }>(
    `INSERT INTO journal_entries (user_id, org_id, symbol, direction, entry_price, exit_price, position_size, 
                                  entry_date, exit_date, status, thesis, notes, strategy_tag, pnl, pnl_percent, paper_trade_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id, created_at`,
    [userId, orgId, symbol.toUpperCase(), direction, entryPrice, exitPrice || null, positionSize, 
     entryDate, exitDate || null, status, thesis || null, notes || null, strategyTag || null, pnl, pnlPercent, paperTradeId || null]
  );
  
  await incrementUsage(userId, 'journal');
  
  // Update streak
  await updateJournalStreak(userId);
  
  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      entry: {
        id: result!.id,
        symbol,
        direction,
        entryPrice,
        exitPrice,
        positionSize,
        entryDate,
        exitDate,
        status,
        thesis,
        notes,
        strategyTag,
        pnl,
        pnlPercent,
        createdAt: result!.created_at,
      },
    },
  });
});

// Update journal entry
app.put('/v1/journal/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;
  const updates = req.body;
  
  // Verify ownership
  const existing = await queryOne<{ id: string; entry_price: string; position_size: string; direction: string }>(
    'SELECT id, entry_price, position_size, direction FROM journal_entries WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  
  if (!existing) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Entry not found' },
    });
  }
  
  // Calculate P/L if closing
  let pnl = updates.pnl;
  let pnlPercent = updates.pnlPercent;
  let status = updates.status;
  
  if (updates.exitPrice && !pnl) {
    status = 'CLOSED';
    const entryPrice = parseFloat(existing.entry_price);
    const positionSize = parseFloat(existing.position_size);
    const entryValue = entryPrice * positionSize;
    const exitValue = updates.exitPrice * positionSize;
    
    if (existing.direction === 'BUY' || existing.direction === 'LONG') {
      pnl = exitValue - entryValue;
    } else {
      pnl = entryValue - exitValue;
    }
    pnlPercent = (pnl / entryValue) * 100;
  }
  
  await query(
    `UPDATE journal_entries SET
      exit_price = COALESCE($1, exit_price),
      exit_date = COALESCE($2, exit_date),
      status = COALESCE($3, status),
      notes = COALESCE($4, notes),
      strategy_tag = COALESCE($5, strategy_tag),
      pnl = COALESCE($6, pnl),
      pnl_percent = COALESCE($7, pnl_percent)
     WHERE id = $8`,
    [updates.exitPrice, updates.exitDate, status, updates.notes, updates.strategyTag, pnl, pnlPercent, id]
  );
  
  res.json({ success: true, data: { updated: true } });
});

// Export journal as CSV
app.get('/v1/journal/export.csv', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  
  const { plan } = await getUserPlan(userId);
  if (plan === 'FREE') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'FEATURE_LOCKED', message: 'CSV export requires Lite or Pro plan' },
    });
  }
  
  const result = await query<{
    symbol: string;
    direction: string;
    entry_price: string;
    exit_price: string | null;
    position_size: string;
    entry_date: string;
    exit_date: string | null;
    status: string;
    pnl: string | null;
    pnl_percent: string | null;
    strategy_tag: string | null;
    notes: string | null;
  }>(
    `SELECT symbol, direction, entry_price, exit_price, position_size, entry_date, exit_date, 
            status, pnl, pnl_percent, strategy_tag, notes
     FROM journal_entries WHERE user_id = $1
     ORDER BY entry_date DESC`,
    [userId]
  );
  
  const headers = ['Symbol', 'Direction', 'Entry Price', 'Exit Price', 'Position Size', 'Entry Date', 'Exit Date', 'Status', 'P/L', 'P/L %', 'Strategy', 'Notes'];
  const rows = result.rows.map(r => [
    r.symbol,
    r.direction,
    r.entry_price,
    r.exit_price || '',
    r.position_size,
    r.entry_date,
    r.exit_date || '',
    r.status,
    r.pnl || '',
    r.pnl_percent || '',
    r.strategy_tag || '',
    `"${(r.notes || '').replace(/"/g, '""')}"`,
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="nova-journal-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

async function updateJournalStreak(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  let streak = await queryOne<{ journal_streak: number; last_journal_date: string; longest_streak: number; total_journal_days: number }>(
    'SELECT journal_streak, last_journal_date, longest_streak, total_journal_days FROM user_streaks WHERE user_id = $1',
    [userId]
  );
  
  if (!streak) {
    await query(
      'INSERT INTO user_streaks (user_id, journal_streak, last_journal_date, longest_streak, total_journal_days) VALUES ($1, 1, $2, 1, 1)',
      [userId, today]
    );
    return;
  }
  
  const lastDate = streak.last_journal_date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  let newStreak = streak.journal_streak;
  let newTotal = streak.total_journal_days;
  
  if (lastDate === today) {
    // Already journaled today, no change
    return;
  } else if (lastDate === yesterdayStr) {
    // Continuing streak
    newStreak++;
    newTotal++;
  } else {
    // Streak broken
    newStreak = 1;
    newTotal++;
  }
  
  const longestStreak = Math.max(streak.longest_streak, newStreak);
  
  await query(
    'UPDATE user_streaks SET journal_streak = $1, last_journal_date = $2, longest_streak = $3, total_journal_days = $4 WHERE user_id = $5',
    [newStreak, today, longestStreak, newTotal, userId]
  );
}

// Get streak info
app.get('/v1/journal/streak', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  
  const streak = await queryOne<{ journal_streak: number; longest_streak: number; total_journal_days: number }>(
    'SELECT journal_streak, longest_streak, total_journal_days FROM user_streaks WHERE user_id = $1',
    [userId]
  );
  
  res.json({
    success: true,
    data: {
      currentStreak: streak?.journal_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      totalDays: streak?.total_journal_days || 0,
    },
  });
});

// ============================================
// Backtesting API
// ============================================

interface BacktestParams {
  symbol: string;
  strategyType: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  params?: Record<string, number>;
}

interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  side: 'LONG' | 'SHORT';
  pnl: number;
  pnlPercent: number;
}

interface BacktestResult {
  id: string;
  name: string;
  symbol: string;
  strategyType: string;
  params: Record<string, number>;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; value: number }>;
}

async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const { symbol, strategyType, startDate, endDate, initialCapital = 100000, params: strategyParams = {} } = params;
  
  // Get historical data
  const history = await getHistoricalData(symbol, startDate, endDate);
  
  if (history.length < 50) {
    throw new Error('Insufficient historical data for backtest');
  }
  
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ date: string; value: number }> = [];
  let capital = initialCapital;
  let position: { side: 'LONG' | 'SHORT'; entryPrice: number; entryDate: string; size: number } | null = null;
  let maxCapital = initialCapital;
  let maxDrawdown = 0;
  
  // Simple strategy implementations
  const sma = (data: number[], period: number) => {
    if (data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  };
  
  const prices = history.map(d => d.close);
  
  for (let i = 50; i < history.length; i++) {
    const currentPrice = history[i].close;
    const currentDate = history[i].date;
    
    // Calculate indicators based on strategy
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    
    if (strategyType === 'sma_crossover') {
      const fastPeriod = strategyParams.fastPeriod || 20;
      const slowPeriod = strategyParams.slowPeriod || 50;
      
      const fastSma = sma(prices.slice(0, i + 1), fastPeriod);
      const slowSma = sma(prices.slice(0, i + 1), slowPeriod);
      const prevFastSma = sma(prices.slice(0, i), fastPeriod);
      const prevSlowSma = sma(prices.slice(0, i), slowPeriod);
      
      if (fastSma && slowSma && prevFastSma && prevSlowSma) {
        if (prevFastSma <= prevSlowSma && fastSma > slowSma) signal = 'BUY';
        if (prevFastSma >= prevSlowSma && fastSma < slowSma) signal = 'SELL';
      }
    } else if (strategyType === 'mean_reversion') {
      const period = strategyParams.period || 20;
      const threshold = strategyParams.threshold || 2;
      
      const mean = sma(prices.slice(0, i + 1), period);
      const stdDev = Math.sqrt(
        prices.slice(i - period + 1, i + 1).reduce((sum, p) => sum + Math.pow(p - mean!, 2), 0) / period
      );
      
      if (mean && stdDev) {
        const zScore = (currentPrice - mean) / stdDev;
        if (zScore < -threshold) signal = 'BUY';
        if (zScore > threshold) signal = 'SELL';
      }
    } else if (strategyType === 'momentum') {
      const period = strategyParams.period || 14;
      const buyThreshold = strategyParams.buyThreshold || 0.03;
      const sellThreshold = strategyParams.sellThreshold || -0.03;
      
      if (i >= period) {
        const momentum = (currentPrice - prices[i - period]) / prices[i - period];
        if (momentum > buyThreshold) signal = 'BUY';
        if (momentum < sellThreshold) signal = 'SELL';
      }
    }
    
    // Execute trades based on signals
    if (signal === 'BUY' && !position) {
      const size = Math.floor(capital / currentPrice);
      if (size > 0) {
        position = { side: 'LONG', entryPrice: currentPrice, entryDate: currentDate, size };
      }
    } else if (signal === 'SELL' && position?.side === 'LONG') {
      const pnl = (currentPrice - position.entryPrice) * position.size;
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      trades.push({
        entryDate: position.entryDate,
        exitDate: currentDate,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        side: 'LONG',
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
      });
      
      capital += pnl;
      position = null;
    }
    
    // Track equity curve
    const currentValue = position 
      ? capital + (currentPrice - position.entryPrice) * position.size
      : capital;
    
    equityCurve.push({ date: currentDate, value: Math.round(currentValue * 100) / 100 });
    
    // Track max drawdown
    if (currentValue > maxCapital) maxCapital = currentValue;
    const drawdown = (maxCapital - currentValue) / maxCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Close any open position at end
  if (position) {
    const finalPrice = history[history.length - 1].close;
    const pnl = (finalPrice - position.entryPrice) * position.size;
    trades.push({
      entryDate: position.entryDate,
      exitDate: history[history.length - 1].date,
      entryPrice: position.entryPrice,
      exitPrice: finalPrice,
      side: 'LONG',
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(((finalPrice - position.entryPrice) / position.entryPrice) * 100 * 100) / 100,
    });
    capital += pnl;
  }
  
  // Calculate stats
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0 
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
    : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;
  
  // Simple Sharpe ratio calculation (annualized)
  const returns = equityCurve.map((e, i) => i > 0 ? (e.value - equityCurve[i-1].value) / equityCurve[i-1].value : 0);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
  
  return {
    id: generateId(),
    name: `${strategyType} on ${symbol}`,
    symbol,
    strategyType,
    params: strategyParams,
    startDate,
    endDate,
    initialCapital,
    finalCapital: Math.round(capital * 100) / 100,
    totalReturn: Math.round((capital - initialCapital) * 100) / 100,
    totalReturnPct: Math.round(((capital - initialCapital) / initialCapital) * 10000) / 100,
    maxDrawdown: Math.round(maxDrawdown * initialCapital * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdown * 10000) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    winRate: trades.length > 0 ? Math.round((winningTrades.length / trades.length) * 10000) / 100 : 0,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    trades,
    equityCurve,
  };
}

// Run backtest
app.post('/v1/backtest', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  
  // Check quota
  const quota = await checkQuota(userId, 'backtest');
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: quota.message },
    });
  }
  
  const { symbol, strategyType, startDate, endDate, initialCapital, params, name } = req.body;
  
  if (!symbol || !strategyType || !startDate || !endDate) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields: symbol, strategyType, startDate, endDate' },
    });
  }
  
  try {
    const result = await runBacktest({ symbol, strategyType, startDate, endDate, initialCapital, params });
    
    // Save to database
    await query(
      `INSERT INTO backtest_results (id, user_id, org_id, name, symbol, strategy_type, strategy_params, 
                                     start_date, end_date, initial_capital, final_capital, total_return, 
                                     total_return_pct, max_drawdown, max_drawdown_pct, sharpe_ratio, win_rate,
                                     total_trades, winning_trades, losing_trades, avg_win, avg_loss, profit_factor,
                                     trades_json, equity_curve_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 'COMPLETED')`,
      [result.id, userId, orgId, name || result.name, result.symbol, result.strategyType, JSON.stringify(result.params),
       result.startDate, result.endDate, result.initialCapital, result.finalCapital, result.totalReturn,
       result.totalReturnPct, result.maxDrawdown, result.maxDrawdownPct, result.sharpeRatio, result.winRate,
       result.totalTrades, result.winningTrades, result.losingTrades, result.avgWin, result.avgLoss, result.profitFactor,
       JSON.stringify(result.trades), JSON.stringify(result.equityCurve)]
    );
    
    await incrementUsage(userId, 'backtest');
    
    res.json({
      success: true,
      data: {
        result,
        disclaimer: 'Backtested performance is hypothetical and not a guarantee of future results. Past performance does not indicate future returns.',
      },
    });
  } catch (error) {
    logger.error('Backtest failed', error as Error);
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'BACKTEST_FAILED', message: (error as Error).message },
    });
  }
});

// Get backtest results
app.get('/v1/backtest', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  
  const result = await query<{
    id: string;
    name: string;
    symbol: string;
    strategy_type: string;
    total_return_pct: string;
    win_rate: string;
    sharpe_ratio: string;
    total_trades: number;
    created_at: string;
  }>(
    `SELECT id, name, symbol, strategy_type, total_return_pct, win_rate, sharpe_ratio, total_trades, created_at
     FROM backtest_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  
  res.json({
    success: true,
    data: {
      results: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        symbol: r.symbol,
        strategyType: r.strategy_type,
        totalReturnPct: parseFloat(r.total_return_pct),
        winRate: parseFloat(r.win_rate),
        sharpeRatio: parseFloat(r.sharpe_ratio),
        totalTrades: r.total_trades,
        createdAt: r.created_at,
      })),
    },
  });
});

// Get specific backtest
app.get('/v1/backtest/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;
  
  const result = await queryOne<{
    id: string;
    name: string;
    symbol: string;
    strategy_type: string;
    strategy_params: string;
    start_date: string;
    end_date: string;
    initial_capital: string;
    final_capital: string;
    total_return: string;
    total_return_pct: string;
    max_drawdown: string;
    max_drawdown_pct: string;
    sharpe_ratio: string;
    win_rate: string;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    avg_win: string;
    avg_loss: string;
    profit_factor: string;
    trades_json: string;
    equity_curve_json: string;
    created_at: string;
  }>(
    'SELECT * FROM backtest_results WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  
  if (!result) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Backtest not found' },
    });
  }
  
  res.json({
    success: true,
    data: {
      result: {
        id: result.id,
        name: result.name,
        symbol: result.symbol,
        strategyType: result.strategy_type,
        params: JSON.parse(result.strategy_params),
        startDate: result.start_date,
        endDate: result.end_date,
        initialCapital: parseFloat(result.initial_capital),
        finalCapital: parseFloat(result.final_capital),
        totalReturn: parseFloat(result.total_return),
        totalReturnPct: parseFloat(result.total_return_pct),
        maxDrawdown: parseFloat(result.max_drawdown),
        maxDrawdownPct: parseFloat(result.max_drawdown_pct),
        sharpeRatio: parseFloat(result.sharpe_ratio),
        winRate: parseFloat(result.win_rate),
        totalTrades: result.total_trades,
        winningTrades: result.winning_trades,
        losingTrades: result.losing_trades,
        avgWin: parseFloat(result.avg_win),
        avgLoss: parseFloat(result.avg_loss),
        profitFactor: parseFloat(result.profit_factor),
        trades: JSON.parse(result.trades_json),
        equityCurve: JSON.parse(result.equity_curve_json),
        createdAt: result.created_at,
      },
      disclaimer: 'Backtested performance is hypothetical and not a guarantee of future results.',
    },
  });
});

// Get available strategies
app.get('/v1/backtest/strategies', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      strategies: [
        {
          id: 'sma_crossover',
          name: 'SMA Crossover',
          description: 'Buy when fast SMA crosses above slow SMA, sell on cross below',
          params: [
            { name: 'fastPeriod', label: 'Fast Period', default: 20, min: 5, max: 50 },
            { name: 'slowPeriod', label: 'Slow Period', default: 50, min: 20, max: 200 },
          ],
        },
        {
          id: 'mean_reversion',
          name: 'Mean Reversion',
          description: 'Buy when price drops below mean - X std devs, sell above',
          params: [
            { name: 'period', label: 'Lookback Period', default: 20, min: 5, max: 50 },
            { name: 'threshold', label: 'Std Dev Threshold', default: 2, min: 1, max: 3 },
          ],
        },
        {
          id: 'momentum',
          name: 'Momentum',
          description: 'Buy when momentum exceeds threshold, sell when negative',
          params: [
            { name: 'period', label: 'Momentum Period', default: 14, min: 5, max: 30 },
            { name: 'buyThreshold', label: 'Buy Threshold', default: 0.03, min: 0.01, max: 0.1 },
            { name: 'sellThreshold', label: 'Sell Threshold', default: -0.03, min: -0.1, max: -0.01 },
          ],
        },
      ],
    },
  });
});

// ============================================
// AI Thesis Generator
// ============================================

app.post('/v1/thesis/generate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  
  // Check quota
  const quota = await checkQuota(userId, 'ai_thesis');
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: quota.message },
    });
  }
  
  const { symbol, context } = req.body;
  
  if (!symbol) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Symbol is required' },
    });
  }
  
  try {
    // Get market data (real only)
    const quote = await getQuote(symbol);
    if (!quote) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: {
          code: 'MARKETDATA_UNAVAILABLE',
          message: 'Market quote unavailable',
          details: { symbol: String(symbol).toUpperCase() },
        },
      });
    }

    const changePercentText =
      typeof quote.changePercent === 'number' && Number.isFinite(quote.changePercent)
        ? `${quote.changePercent}%`
        : 'Unavailable';

    const volumeText =
      typeof quote.volume === 'number' && Number.isFinite(quote.volume)
        ? quote.volume.toLocaleString()
        : 'Unavailable';

    let thesisText = '';
    let reasoning: string[] = [];
    let direction: 'LONG' | 'SHORT' = 'LONG';
    let confidence = 60;
    
    if (OPENAI_API_KEY) {
      // Use OpenAI for thesis generation
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a trading research analyst. Generate a trade thesis based on the provided market data. 
                        Be objective and balanced. Include clear reasoning. NEVER guarantee profits.
                        Output JSON with: direction (LONG/SHORT), confidence (0-100), thesis (detailed text), reasoning (array of key points), 
                        entryPrice, targetPrice, stopLoss.`,
            },
            {
              role: 'user',
              content: `Generate a trade thesis for ${symbol}. Current price: $${quote.price}.
                        Change: ${changePercentText}. Volume: ${volumeText}.
                        Additional context: ${context || 'None provided'}
                        Consider risk management and position sizing recommendations.`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        }),
      });
      
      if (response.ok) {
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        const aiResult = JSON.parse(data.choices[0].message.content);
        
        direction = aiResult.direction || 'LONG';
        confidence = aiResult.confidence || 60;
        thesisText = aiResult.thesis || '';
        reasoning = aiResult.reasoning || [];
        
        // Save thesis
        const entryPrice = aiResult.entryPrice || quote.price;
        const targetPrice = aiResult.targetPrice || (direction === 'LONG' ? entryPrice * 1.05 : entryPrice * 0.95);
        const stopLoss = aiResult.stopLoss || (direction === 'LONG' ? entryPrice * 0.97 : entryPrice * 1.03);
        const riskRewardRatio = Math.abs(targetPrice - entryPrice) / Math.abs(stopLoss - entryPrice);
        
        const result = await queryOne<{ id: string }>(
          `INSERT INTO trade_theses (user_id, org_id, symbol, direction, entry_price, target_price, stop_loss,
                                     risk_reward_ratio, confidence_score, thesis_text, reasoning_json, 
                                     market_context_json, ai_generated, ai_model, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, 'gpt-4o-mini', 'ACTIVE', $13)
           RETURNING id`,
          [userId, orgId, symbol.toUpperCase(), direction, entryPrice, targetPrice, stopLoss,
           Math.round(riskRewardRatio * 100) / 100, confidence, thesisText, JSON.stringify(reasoning),
           JSON.stringify({ price: quote.price, change: quote.changePercent, volume: quote.volume }),
           new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
        );
        
        await incrementUsage(userId, 'ai_thesis');
        
        return res.json({
          success: true,
          data: {
            thesis: {
              id: result!.id,
              symbol: symbol.toUpperCase(),
              direction,
              entryPrice,
              targetPrice,
              stopLoss,
              riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
              confidence,
              thesisText,
              reasoning,
              aiGenerated: true,
              marketContext: { price: quote.price, change: quote.changePercent, volume: quote.volume },
            },
            disclaimer: 'This AI-generated thesis is for educational purposes only. It is NOT financial advice. Always do your own research.',
          },
        });
      }
    }
    
    // Fallback: Generate basic thesis without AI
    const cp = quote.changePercent;

    direction = typeof cp === 'number' && Number.isFinite(cp) ? (cp > 0 ? 'LONG' : 'SHORT') : 'LONG';
    confidence = typeof cp === 'number' && Number.isFinite(cp) ? 50 + Math.abs(cp) * 5 : 50;

    thesisText = `Based on current market conditions, ${symbol} shows ${direction === 'LONG' ? 'bullish' : 'bearish'} momentum.
                  Current price: $${quote.price} with ${typeof cp === 'number' && Number.isFinite(cp) ? `${cp >= 0 ? '+' : ''}${cp}%` : 'unavailable change %'}.`;

    reasoning = [
      typeof cp === 'number' && Number.isFinite(cp)
        ? `Price ${cp > 0 ? 'up' : 'down'} ${Math.abs(cp)}%`
        : 'Price change percent unavailable',
      quote.volume !== null ? `Volume: ${quote.volume.toLocaleString()}` : 'Volume: Unavailable',
      'Further analysis recommended before trading',
    ];
    
    const entryPrice = quote.price;
    const targetPrice = direction === 'LONG' ? entryPrice * 1.05 : entryPrice * 0.95;
    const stopLoss = direction === 'LONG' ? entryPrice * 0.97 : entryPrice * 1.03;
    const riskRewardRatio = Math.abs(targetPrice - entryPrice) / Math.abs(stopLoss - entryPrice);
    
    const result = await queryOne<{ id: string }>(
      `INSERT INTO trade_theses (user_id, org_id, symbol, direction, entry_price, target_price, stop_loss,
                                 risk_reward_ratio, confidence_score, thesis_text, reasoning_json, 
                                 market_context_json, ai_generated, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, 'ACTIVE', $13)
       RETURNING id`,
      [userId, orgId, symbol.toUpperCase(), direction, entryPrice, targetPrice, stopLoss,
       Math.round(riskRewardRatio * 100) / 100, Math.round(confidence), thesisText, JSON.stringify(reasoning),
       JSON.stringify({ price: quote.price, change: quote.changePercent, volume: quote.volume }),
       new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
    );
    
    await incrementUsage(userId, 'ai_thesis');
    
    res.json({
      success: true,
      data: {
        thesis: {
          id: result!.id,
          symbol: symbol.toUpperCase(),
          direction,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
          confidence: Math.round(confidence),
          thesisText,
          reasoning,
          aiGenerated: false,
          marketContext: { price: quote.price, change: quote.changePercent, volume: quote.volume },
        },
        disclaimer: 'This thesis is for educational purposes only. It is NOT financial advice.',
      },
    });
  } catch (error) {
    logger.error('Thesis generation failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'THESIS_FAILED', message: 'Failed to generate thesis' },
    });
  }
});

// Get theses
app.get('/v1/thesis', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { status } = req.query;
  
  let whereClause = 'WHERE user_id = $1';
  const params: string[] = [userId];
  
  if (status) {
    whereClause += ' AND status = $2';
    params.push(status as string);
  }
  
  const result = await query<{
    id: string;
    symbol: string;
    direction: string;
    entry_price: string;
    target_price: string;
    stop_loss: string;
    risk_reward_ratio: string;
    confidence_score: number;
    thesis_text: string;
    reasoning_json: string;
    ai_generated: boolean;
    status: string;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT id, symbol, direction, entry_price, target_price, stop_loss, risk_reward_ratio, 
            confidence_score, thesis_text, reasoning_json, ai_generated, status, created_at, expires_at
     FROM trade_theses ${whereClause} ORDER BY created_at DESC LIMIT 50`,
    params
  );
  
  res.json({
    success: true,
    data: {
      theses: result.rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        entryPrice: parseFloat(r.entry_price),
        targetPrice: parseFloat(r.target_price),
        stopLoss: parseFloat(r.stop_loss),
        riskRewardRatio: parseFloat(r.risk_reward_ratio),
        confidence: r.confidence_score,
        thesisText: r.thesis_text,
        reasoning: JSON.parse(r.reasoning_json || '[]'),
        aiGenerated: r.ai_generated,
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
    },
  });
});

// Create manual thesis
app.post('/v1/thesis', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, direction, entryPrice, targetPrice, stopLoss, thesisText, reasoning } = req.body;
  
  if (!symbol || !direction || !entryPrice || !thesisText) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields' },
    });
  }
  
  const target = targetPrice || (direction === 'LONG' ? entryPrice * 1.05 : entryPrice * 0.95);
  const stop = stopLoss || (direction === 'LONG' ? entryPrice * 0.97 : entryPrice * 1.03);
  const riskRewardRatio = Math.abs(target - entryPrice) / Math.abs(stop - entryPrice);
  
  const result = await queryOne<{ id: string }>(
    `INSERT INTO trade_theses (user_id, org_id, symbol, direction, entry_price, target_price, stop_loss,
                               risk_reward_ratio, thesis_text, reasoning_json, ai_generated, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, 'ACTIVE', $11)
     RETURNING id`,
    [userId, orgId, symbol.toUpperCase(), direction, entryPrice, target, stop,
     Math.round(riskRewardRatio * 100) / 100, thesisText, JSON.stringify(reasoning || []),
     new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
  );
  
  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      thesis: {
        id: result!.id,
        symbol: symbol.toUpperCase(),
        direction,
        entryPrice,
        targetPrice: target,
        stopLoss: stop,
        riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
        thesisText,
        reasoning: reasoning || [],
        aiGenerated: false,
        status: 'ACTIVE',
      },
    },
  });
});

// ============================================
// Portfolio API
// ============================================

app.get('/v1/portfolio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  
  let portfolio = await queryOne<{
    id: string;
    current_cash: string;
    total_value: string;
    total_pnl: string;
    total_pnl_pct: string;
    initial_cash: string;
  }>(
    'SELECT id, current_cash, total_value, total_pnl, total_pnl_pct, initial_cash FROM user_portfolios WHERE user_id = $1 AND is_default = true',
    [userId]
  );
  
  if (!portfolio) {
    // Create default portfolio
    const result = await queryOne<{ id: string }>(
      'INSERT INTO user_portfolios (user_id, org_id, name, initial_cash, current_cash, total_value) VALUES ($1, $2, $3, 100000, 100000, 100000) RETURNING id',
      [userId, orgId, 'Main Portfolio']
    );
    portfolio = { id: result!.id, current_cash: '100000', total_value: '100000', total_pnl: '0', total_pnl_pct: '0', initial_cash: '100000' };
  }
  
  // Get open trades
  const openTrades = await query<{
    id: string;
    symbol: string;
    side: string;
    qty: string;
    entry_price: string;
    entry_ts: string;
  }>(
    'SELECT id, symbol, side, qty, entry_price, entry_ts FROM paper_trades WHERE org_id = $1 AND exit_ts IS NULL',
    [orgId]
  );
  
  // Calculate positions with current prices
  const positions: Array<{ symbol: string; quantity: number; entryPrice: number; currentPrice: number; pnl: number; pnlPercent: number }> = [];
  let positionsValue = 0;
  
  for (const trade of openTrades.rows) {
    const quote = await getQuote(trade.symbol);
    const quantity = parseFloat(trade.qty);
    const entryPrice = parseFloat(trade.entry_price);
    const currentPrice = quote.price;
    const pnl = (currentPrice - entryPrice) * quantity * (trade.side === 'LONG' ? 1 : -1);
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100 * (trade.side === 'LONG' ? 1 : -1);
    
    positionsValue += currentPrice * quantity;
    positions.push({
      symbol: trade.symbol,
      quantity,
      entryPrice,
      currentPrice,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
    });
  }
  
  const cash = parseFloat(portfolio.current_cash);
  const totalValue = cash + positionsValue;
  const initialCash = parseFloat(portfolio.initial_cash);
  const totalPnl = totalValue - initialCash;
  const totalPnlPct = (totalPnl / initialCash) * 100;
  
  // Update portfolio values
  await query(
    'UPDATE user_portfolios SET total_value = $1, total_pnl = $2, total_pnl_pct = $3 WHERE id = $4',
    [totalValue, totalPnl, totalPnlPct, portfolio.id]
  );
  
  res.json({
    success: true,
    data: {
      portfolio: {
        id: portfolio.id,
        cash: Math.round(cash * 100) / 100,
        positionsValue: Math.round(positionsValue * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPct: Math.round(totalPnlPct * 100) / 100,
      },
      positions,
    },
  });
});

// ============================================
// Alerts API
// ============================================

app.get('/v1/alerts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { unreadOnly } = req.query;
  
  let whereClause = 'WHERE user_id = $1';
  if (unreadOnly === 'true') {
    whereClause += ' AND is_read = false';
  }
  
  const result = await query<{
    id: string;
    alert_type: string;
    symbol: string | null;
    message: string;
    is_read: boolean;
    triggered_at: string | null;
    created_at: string;
  }>(
    `SELECT id, alert_type, symbol, message, is_read, triggered_at, created_at
     FROM user_alerts ${whereClause} ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  
  res.json({
    success: true,
    data: {
      alerts: result.rows.map(r => ({
        id: r.id,
        type: r.alert_type,
        symbol: r.symbol,
        message: r.message,
        isRead: r.is_read,
        triggeredAt: r.triggered_at,
        createdAt: r.created_at,
      })),
    },
  });
});

app.post('/v1/alerts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { type, symbol, condition, targetPrice, message } = req.body;
  
  if (!type || !message) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Type and message are required' },
    });
  }
  
  const result = await queryOne<{ id: string }>(
    `INSERT INTO user_alerts (user_id, org_id, alert_type, symbol, condition, target_price, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, orgId, type, symbol || null, condition || null, targetPrice || null, message]
  );
  
  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: { alert: { id: result!.id, type, symbol, message } },
  });
});

app.put('/v1/alerts/:id/read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;
  
  await query('UPDATE user_alerts SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
  
  res.json({ success: true, data: { marked: true } });
});

// ============================================
// Dashboard Stats API
// ============================================

app.get('/v1/dashboard/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  
  // Get various stats
  const [journalStats, portfolio, streakData, recentAlerts, todayUsage, entitlement] = await Promise.all([
    queryOne<{ total: string; wins: string; total_pnl: string }>(
      `SELECT COUNT(*) as total, 
              COUNT(*) FILTER (WHERE pnl > 0) as wins,
              COALESCE(SUM(pnl), 0) as total_pnl
       FROM journal_entries WHERE user_id = $1 AND status = 'CLOSED'`,
      [userId]
    ),
    queryOne<{ total_value: string; total_pnl: string; total_pnl_pct: string }>(
      'SELECT total_value, total_pnl, total_pnl_pct FROM user_portfolios WHERE user_id = $1 AND is_default = true',
      [userId]
    ),
    queryOne<{ journal_streak: number; longest_streak: number }>(
      'SELECT journal_streak, longest_streak FROM user_streaks WHERE user_id = $1',
      [userId]
    ),
    query<{ id: string; message: string; created_at: string }>(
      'SELECT id, message, created_at FROM user_alerts WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 5',
      [userId]
    ),
    queryOne<{ journal_entries_count: number; backtests_count: number; ai_thesis_count: number }>(
      'SELECT journal_entries_count, backtests_count, ai_thesis_count FROM usage_tracking WHERE user_id = $1 AND usage_date = $2',
      [userId, new Date().toISOString().split('T')[0]]
    ),
    queryOne<{ plan: string; status: string }>(
      'SELECT plan, status FROM entitlements WHERE user_id = $1',
      [userId]
    ),
  ]);
  
  const { plan, limits } = await getUserPlan(userId);
  
  res.json({
    success: true,
    data: {
      trading: {
        totalTrades: parseInt(journalStats?.total || '0'),
        winRate: journalStats && parseInt(journalStats.total) > 0 
          ? Math.round((parseInt(journalStats.wins) / parseInt(journalStats.total)) * 100) 
          : 0,
        totalPnl: parseFloat(journalStats?.total_pnl || '0'),
      },
      portfolio: {
        value: parseFloat(portfolio?.total_value || '100000'),
        pnl: parseFloat(portfolio?.total_pnl || '0'),
        pnlPercent: parseFloat(portfolio?.total_pnl_pct || '0'),
      },
      streak: {
        current: streakData?.journal_streak || 0,
        longest: streakData?.longest_streak || 0,
      },
      alerts: recentAlerts.rows.map(a => ({ id: a.id, message: a.message, createdAt: a.created_at })),
      usage: {
        journalEntries: { used: todayUsage?.journal_entries_count || 0, limit: limits.daily_journal_entries },
        backtests: { used: todayUsage?.backtests_count || 0, limit: limits.daily_backtests },
        aiThesis: { used: todayUsage?.ai_thesis_count || 0, limit: limits.ai_thesis_daily },
      },
      plan: {
        name: plan,
        status: entitlement?.status || 'ACTIVE',
      },
    },
  });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  logger.info(`Nova Hub service started on port ${PORT}`);
});

export default app;

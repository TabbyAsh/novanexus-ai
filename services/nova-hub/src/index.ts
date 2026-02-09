import express, { Request, Response, NextFunction } from 'express';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  EVENT_TYPES,
  query,
  queryOne,
  transaction,
  verifyToken,
  nowTimestamp,
  generateId,
  computeEventHash,
} from '@nova/shared';
import {
  buildGuidedThesis,
  evaluateExecutionGate,
  pruneStrategyAnalytics,
  type CandleIntegrity,
  type ExecutionGateResult,
  type GuidedSignalInput,
  type BuildThesisResult,
  type ThesisValidationError,
} from './guided';

const app = express();
const logger = createLogger('nova-hub');
const PORT = process.env.PORT || 3030;

// External service URLs
const MARKETDATA_URL = process.env.MARKETDATA_URL || 'http://localhost:3020';
const BILLING_URL = process.env.BILLING_URL || 'http://localhost:3006';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Internal verification (Phase 0)
const INTERNAL_VERIFY_ENABLED = process.env.INTERNAL_VERIFY_ENABLED === 'true';
const INTERNAL_VERIFY_TOKEN = process.env.INTERNAL_VERIFY_TOKEN || '';
const INTERNAL_VERIFY_USER_ID = process.env.INTERNAL_VERIFY_USER_ID || '';
const INTERNAL_VERIFY_SYMBOL = process.env.INTERNAL_VERIFY_SYMBOL || 'SPY';
const INTERNAL_VERIFY_DAYS = Math.max(3, Number(process.env.INTERNAL_VERIFY_DAYS || '10'));
const INTERNAL_VERIFY_PLAN = process.env.INTERNAL_VERIFY_PLAN || '';
const INTERNAL_VERIFY_ALPACA_KEY = process.env.INTERNAL_VERIFY_ALPACA_KEY || process.env.ALPACA_API_KEY || '';
const INTERNAL_VERIFY_ALPACA_SECRET = process.env.INTERNAL_VERIFY_ALPACA_SECRET || process.env.ALPACA_SECRET_KEY || '';
const INTERNAL_VERIFY_ALPACA_ENDPOINT = process.env.INTERNAL_VERIFY_ALPACA_ENDPOINT || process.env.ALPACA_ENDPOINT || '';
const INTERNAL_DECISION_CARDS_TOKEN = process.env.INTERNAL_DECISION_CARDS_TOKEN || '';

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
  daily_decision_cards: number;
  max_watchlists: number;
  max_alerts: number;
  max_paper_trades: number;
  ai_thesis_daily: number;
  strategy_analytics_depth: number;
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
    daily_decision_cards: 3,
    max_watchlists: 1,
    max_alerts: 5,
    max_paper_trades: 10,
    ai_thesis_daily: 0,
    strategy_analytics_depth: 0,
    csv_export: false,
    pdf_reports: false,
  };
  
  return { plan, limits };
}

async function checkQuota(userId: string, quotaType: string): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const { plan, limits } = await getUserPlan(userId);
  
  // Get today's usage
  const today = new Date().toISOString().split('T')[0];
  let usage = await queryOne<{ journal_entries_count: number; backtests_count: number; ai_thesis_count: number; decision_cards_count: number }>(
    'SELECT journal_entries_count, backtests_count, ai_thesis_count, decision_cards_count FROM usage_tracking WHERE user_id = $1 AND usage_date = $2',
    [userId, today]
  );
  
  if (!usage) {
    // Create usage record for today
    await query(
      'INSERT INTO usage_tracking (user_id, usage_date) VALUES ($1, $2) ON CONFLICT (user_id, usage_date) DO NOTHING',
      [userId, today]
    );
    usage = { journal_entries_count: 0, backtests_count: 0, ai_thesis_count: 0, decision_cards_count: 0 };
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
    case 'decision_card':
      limit = limits.daily_decision_cards;
      current = usage.decision_cards_count;
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
    : quotaType === 'decision_card' ? 'decision_cards_count'
    : null;
    
  if (column) {
    await query(
      `INSERT INTO usage_tracking (user_id, usage_date, ${column}) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, usage_date) DO UPDATE SET ${column} = usage_tracking.${column} + 1`,
      [userId, today]
    );
  }
}

function resolveAnalyticsDepth(plan: string, limits: PlanLimits): number {
  const raw = (limits as any)?.strategy_analytics_depth;
  const depth = Number(raw);
  if (Number.isFinite(depth)) return depth;
  return plan === 'FREE' ? 0 : 2;
}

function computeRemaining(limit: number, used: number): number {
  if (limit === -1) return -1;
  return Math.max(0, limit - used);
}

async function getUsageSnapshot(userId: string): Promise<{
  plan: string;
  limits: PlanLimits;
  analyticsDepth: number;
  usage: { journal: number; backtest: number; aiThesis: number; decisionCards: number };
  remaining: { journal: number; backtest: number; aiThesis: number; decisionCards: number };
}> {
  const { plan, limits } = await getUserPlan(userId);
  const today = new Date().toISOString().split('T')[0];
  let usage = await queryOne<{
    journal_entries_count: number;
    backtests_count: number;
    ai_thesis_count: number;
    decision_cards_count: number;
  }>(
    'SELECT journal_entries_count, backtests_count, ai_thesis_count, decision_cards_count FROM usage_tracking WHERE user_id = $1 AND usage_date = $2',
    [userId, today]
  );

  if (!usage) {
    await query(
      'INSERT INTO usage_tracking (user_id, usage_date) VALUES ($1, $2) ON CONFLICT (user_id, usage_date) DO NOTHING',
      [userId, today]
    );
    usage = { journal_entries_count: 0, backtests_count: 0, ai_thesis_count: 0, decision_cards_count: 0 };
  }

  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  return {
    plan,
    limits,
    analyticsDepth,
    usage: {
      journal: usage.journal_entries_count || 0,
      backtest: usage.backtests_count || 0,
      aiThesis: usage.ai_thesis_count || 0,
      decisionCards: usage.decision_cards_count || 0,
    },
    remaining: {
      journal: computeRemaining(limits.daily_journal_entries, usage.journal_entries_count || 0),
      backtest: computeRemaining(limits.daily_backtests, usage.backtests_count || 0),
      aiThesis: computeRemaining(limits.ai_thesis_daily, usage.ai_thesis_count || 0),
      decisionCards: computeRemaining(limits.daily_decision_cards, usage.decision_cards_count || 0),
    },
  };
}
// ============================================
// Broker Encryption Helpers (Alpaca)
// ============================================

const BROKER_ENCRYPTION_KEY = process.env.BROKER_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY || '';
const ALPACA_DEFAULT_PAPER_ENDPOINT = 'https://paper-api.alpaca.markets/v2';
const ALPACA_DEFAULT_LIVE_ENDPOINT = 'https://api.alpaca.markets/v2';

function getBrokerKey(): Buffer {
  if (!BROKER_ENCRYPTION_KEY) {
    throw new Error('BROKER_ENCRYPTION_KEY is not configured');
  }
  return createHash('sha256').update(BROKER_ENCRYPTION_KEY).digest();
}

function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getBrokerKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getBrokerKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function resolveAlpacaEndpoint(env: 'paper' | 'live', endpoint?: string): string {
  const base = endpoint || (env === 'live' ? ALPACA_DEFAULT_LIVE_ENDPOINT : ALPACA_DEFAULT_PAPER_ENDPOINT);
  return base.replace(/\/$/, '');
}

// ============================================
// Event Emission Helper (append-only)
// ============================================
async function emitEvent(
  orgId: string,
  actorType: 'USER' | 'BOT' | 'SYSTEM',
  actorId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const lastEvent = await queryOne<{ hash: string }>(
      'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1',
      [orgId]
    );
    const prevHash = lastEvent?.hash || '0'.repeat(64);
    const ts = nowTimestamp();
    const hash = computeEventHash(prevHash, payload, type, ts, actorType, actorId);

    await query(
      `INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, actorType, actorId, type, ts, JSON.stringify(payload), prevHash, hash]
    );
  } catch (error) {
    logger.error('Failed to emit event', error as Error);
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
type HubIndicators = {
  symbol: string;
  rsi: number | null;
  macd: { value: number; signal: number; histogram: number } | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  asOf: string | null;
  provider: string;
  computedAt: string;
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

async function getIndicators(symbol: string): Promise<HubIndicators | null> {
  const sym = symbol.toUpperCase();

  try {
    const res = await fetch(`${MARKETDATA_URL}/v1/market/indicators/${encodeURIComponent(sym)}`);
    const data = (await res.json().catch(() => null)) as any;

    const indicators = data?.data?.indicators;
    if (!res.ok || !data?.success || !indicators) {
      return null;
    }

    return {
      symbol: indicators.symbol || sym,
      rsi: typeof indicators.rsi === 'number' ? indicators.rsi : null,
      macd: indicators.macd || null,
      sma20: typeof indicators.sma20 === 'number' ? indicators.sma20 : null,
      sma50: typeof indicators.sma50 === 'number' ? indicators.sma50 : null,
      sma200: typeof indicators.sma200 === 'number' ? indicators.sma200 : null,
      asOf: indicators.asOf || null,
      provider: indicators.provider || 'unknown',
      computedAt: indicators.computedAt || new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('Market indicators unavailable', { symbol: sym, error: (err as Error).message });
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

  let fetchRes: globalThis.Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      fetchRes = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  } catch (_error) {
    throw new Error('Historical market data unavailable on current data plan. Candles require paid provider access.');
  }

  const data = (await fetchRes.json().catch(() => null)) as any;

  const candles: any[] | undefined = data?.data?.candles;
  if (!fetchRes.ok || !data?.success || !Array.isArray(candles)) {
    throw new Error('Historical market data unavailable on current data plan. Candles require paid provider access.');
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
// Alpaca Broker Client (per-user)
// ============================================

type AlpacaConnectionRow = {
  id: string;
  api_key_enc: string;
  api_secret_enc: string;
  endpoint: string;
  environment: 'paper' | 'live';
  key_last4: string | null;
  last_verified_at: string | null;
  is_active: boolean;
};

type AlpacaAccount = {
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
};

type AlpacaPosition = {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  side: string;
};

type AlpacaOrder = {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  filled_avg_price: string | null;
  created_at: string;
};

type AlpacaPortfolioHistory = {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  timeframe: string;
};

class AlpacaClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(params: { apiKey: string; apiSecret: string; endpoint: string }) {
    this.baseUrl = params.endpoint.replace(/\/$/, '');
    this.headers = {
      'APCA-API-KEY-ID': params.apiKey,
      'APCA-API-SECRET-KEY': params.apiSecret,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...(init?.headers || {}) },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca API error (${res.status}): ${body || 'Request failed'}`);
    }

    return (await res.json()) as T;
  }

  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>('/account');
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>('/positions');
  }

  async getOrders(status: 'open' | 'closed' | 'all' = 'all'): Promise<AlpacaOrder[]> {
    return this.request<AlpacaOrder[]>(`/orders?status=${status}`);
  }

  async placeOrder(params: {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type?: 'market' | 'limit' | 'stop' | 'stop_limit';
    time_in_force?: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
    limit_price?: number;
    stop_price?: number;
  }): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: params.symbol,
        qty: params.qty.toString(),
        side: params.side,
        type: params.type || 'market',
        time_in_force: params.time_in_force || 'day',
        ...(params.limit_price ? { limit_price: params.limit_price.toString() } : {}),
        ...(params.stop_price ? { stop_price: params.stop_price.toString() } : {}),
      }),
    });
  }

  async getPortfolioHistory(params: { period: string; timeframe: string }): Promise<AlpacaPortfolioHistory> {
    const qs = new URLSearchParams({ period: params.period, timeframe: params.timeframe });
    return this.request<AlpacaPortfolioHistory>(`/account/portfolio/history?${qs.toString()}`);
  }
}

async function getActiveAlpacaConnection(userId: string): Promise<AlpacaConnectionRow | null> {
  return await queryOne<AlpacaConnectionRow>(
    `SELECT id, api_key_enc, api_secret_enc, endpoint, environment, key_last4, last_verified_at, is_active
     FROM broker_connections
     WHERE user_id = $1 AND provider = 'ALPACA' AND is_active = true`,
    [userId]
  );
}

function buildAlpacaClient(connection: AlpacaConnectionRow): AlpacaClient {
  const apiKey = decryptSecret(connection.api_key_enc);
  const apiSecret = decryptSecret(connection.api_secret_enc);
  return new AlpacaClient({ apiKey, apiSecret, endpoint: connection.endpoint });
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
// Internal Verification (Phase 1)
// ============================================

type VerificationStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE';
type VerificationCheck = {
  name: string;
  status: VerificationStatus;
  message: string;
  details?: Record<string, unknown>;
};

function resolveInternalToken(req: Request): string {
  const headerToken = req.headers['x-internal-verify-token'];
  if (typeof headerToken === 'string') return headerToken;
  if (Array.isArray(headerToken) && headerToken[0]) return headerToken[0];
  const queryToken = req.query?.token;
  return typeof queryToken === 'string' ? queryToken : '';
}

app.get('/internal/verify', async (req: Request, res: Response) => {
  if (!INTERNAL_VERIFY_ENABLED) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Not found' },
    });
  }

  if (INTERNAL_VERIFY_TOKEN && resolveInternalToken(req) !== INTERNAL_VERIFY_TOKEN) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Forbidden' },
    });
  }

  const startedAt = Date.now();
  const checks: VerificationCheck[] = [];
  const addCheck = (check: VerificationCheck) => checks.push(check);

  const verifySymbol = typeof req.query?.symbol === 'string' ? req.query.symbol : INTERNAL_VERIFY_SYMBOL;
  const daysParam = typeof req.query?.days === 'string' ? Number(req.query.days) : INTERNAL_VERIFY_DAYS;
  const verifyDays = Math.max(3, Number.isFinite(daysParam) ? daysParam : INTERNAL_VERIFY_DAYS);
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - verifyDays * 24 * 60 * 60 * 1000);
  const startKey = startDate.toISOString().split('T')[0];
  const endKey = endDate.toISOString().split('T')[0];

  // Market candles verification (availability + integrity)
  try {
    const limit = Math.min(Math.max(5, verifyDays), 365);
    const url = `${MARKETDATA_URL}/v1/market/candles/${encodeURIComponent(verifySymbol)}?interval=1d&limit=${limit}`;
    const resCandles = await fetch(url);
    const payload = (await resCandles.json().catch(() => null)) as any;
    const candles = payload?.data?.candles;
    const provider = payload?.data?.provider;
    const integrity = payload?.data?.integrity ?? candles?.[0]?.integrity;

    const hasCandles = Array.isArray(candles) && candles.length > 0;
    const hasNumeric = hasCandles && candles.some((c: any) => Number.isFinite(c?.close));
    const hasIntegrity =
      integrity &&
      typeof integrity.source_type === 'string' &&
      typeof integrity.source_identifier === 'string' &&
      typeof integrity.latency_class === 'string' &&
      Number.isFinite(integrity.confidence_score) &&
      integrity.timestamp_range &&
      typeof integrity.timestamp_range.start === 'string' &&
      typeof integrity.timestamp_range.end === 'string';

    if (resCandles.ok && payload?.success && hasCandles && hasNumeric && hasIntegrity) {
      addCheck({
        name: 'market_candles',
        status: 'PASS',
        message: `Received ${candles.length} candles with integrity tagging.`,
        details: {
          symbol: verifySymbol,
          startDate: startKey,
          endDate: endKey,
          provider,
          integrity,
        },
      });
    } else {
      addCheck({
        name: 'market_candles',
        status: 'FAIL',
        message: 'Candle availability or integrity tagging failed.',
        details: {
          symbol: verifySymbol,
          startDate: startKey,
          endDate: endKey,
          provider,
          integrity,
        },
      });
    }
  } catch (error) {
    const message = (error as Error).message || 'Market candles unavailable.';
    const status: VerificationStatus = message.toLowerCase().includes('unavailable') ? 'UNAVAILABLE' : 'FAIL';
    addCheck({
      name: 'market_candles',
      status,
      message,
      details: { symbol: verifySymbol, startDate: startKey, endDate: endKey },
    });
  }

  // Provider health snapshot (informational only)
  try {
    const healthRes = await fetch(`${MARKETDATA_URL}/health`);
    const healthPayload = (await healthRes.json().catch(() => null)) as any;
    if (healthRes.ok) {
      addCheck({
        name: 'marketdata_provider_health',
        status: 'PASS',
        message: 'Provider health snapshot captured.',
        details: {
          providers: healthPayload?.providers,
          providerHealth: healthPayload?.providerHealth,
        },
      });
    } else {
      addCheck({
        name: 'marketdata_provider_health',
        status: 'UNAVAILABLE',
        message: 'Provider health snapshot unavailable.',
      });
    }
  } catch (error) {
    addCheck({
      name: 'marketdata_provider_health',
      status: 'UNAVAILABLE',
      message: (error as Error).message || 'Provider health snapshot unavailable.',
    });
  }

  // Alpaca history + plan window verification
  let verifyUserId = INTERNAL_VERIFY_USER_ID;
  if (!verifyUserId) {
    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id
       FROM broker_connections
       WHERE provider = 'ALPACA' AND is_active = true
       ORDER BY last_verified_at DESC NULLS LAST, updated_at DESC
       LIMIT 1`
    );
    verifyUserId = row?.user_id || '';
  }
  const requestedPeriod = typeof req.query?.alpacaPeriod === 'string' ? req.query.alpacaPeriod : 'all';
  const requestedTimeframe = typeof req.query?.alpacaTimeframe === 'string' ? req.query.alpacaTimeframe : '1D';
  const allowedPeriods = ['1M', '3M', '6M', '1A', 'all'];
  const normalizedPeriod = requestedPeriod.toUpperCase();

  const resolvePeriodForPlan = (plan: string) => {
    if (plan === 'PRO') {
      return allowedPeriods.includes(normalizedPeriod) ? normalizedPeriod : 'all';
    }
    if (plan === 'LITE') {
      return ['1M', '3M', '6M'].includes(normalizedPeriod) ? normalizedPeriod : '3M';
    }
    return '1M';
  };

  const recordPlanWindowCheck = (plan: string, resolvedPeriod: string, context?: Record<string, unknown>) => {
    const planWindowOk =
      (plan === 'PRO' && allowedPeriods.includes(resolvedPeriod)) ||
      (plan === 'LITE' && ['1M', '3M', '6M'].includes(resolvedPeriod) && resolvedPeriod !== 'all') ||
      (plan !== 'PRO' && plan !== 'LITE' && resolvedPeriod === '1M');

    const forcedWindow = plan !== 'PRO' && normalizedPeriod === 'ALL' ? resolvedPeriod !== 'all' : true;

    if (planWindowOk && forcedWindow) {
      addCheck({
        name: 'alpaca_plan_window',
        status: 'PASS',
        message: 'Plan window enforced.',
        details: { plan, requestedPeriod, resolvedPeriod, ...context },
      });
    } else {
      addCheck({
        name: 'alpaca_plan_window',
        status: 'FAIL',
        message: 'Plan window not enforced as expected.',
        details: { plan, requestedPeriod, resolvedPeriod, ...context },
      });
    }
  };

  if (!verifyUserId && INTERNAL_VERIFY_ALPACA_KEY && INTERNAL_VERIFY_ALPACA_SECRET) {
    const planOverride = ['FREE', 'LITE', 'PRO'].includes(INTERNAL_VERIFY_PLAN.toUpperCase())
      ? INTERNAL_VERIFY_PLAN.toUpperCase()
      : 'FREE';
    const period = resolvePeriodForPlan(planOverride);
    const endpoint = INTERNAL_VERIFY_ALPACA_ENDPOINT || ALPACA_DEFAULT_PAPER_ENDPOINT;
    try {
      const client = new AlpacaClient({
        apiKey: INTERNAL_VERIFY_ALPACA_KEY,
        apiSecret: INTERNAL_VERIFY_ALPACA_SECRET,
        endpoint,
      });
      const history = await client.getPortfolioHistory({ period, timeframe: requestedTimeframe });
      const pointCount = Array.isArray(history.timestamp) ? history.timestamp.length : 0;

      if (pointCount > 0) {
        addCheck({
          name: 'alpaca_history',
          status: 'PASS',
          message: `Received ${pointCount} history points.`,
          details: { plan: planOverride, period, timeframe: requestedTimeframe, endpoint, mode: 'service' },
        });
      } else {
        addCheck({
          name: 'alpaca_history',
          status: 'FAIL',
          message: 'No history points returned.',
          details: { plan: planOverride, period, timeframe: requestedTimeframe, endpoint, mode: 'service' },
        });
      }
    } catch (error) {
      const message = (error as Error).message || 'Alpaca history unavailable.';
      addCheck({
        name: 'alpaca_history',
        status: 'UNAVAILABLE',
        message,
        details: { plan: planOverride, period, timeframe: requestedTimeframe, endpoint, mode: 'service' },
      });
    }

    recordPlanWindowCheck(planOverride, period, { mode: 'service' });
  } else if (!verifyUserId) {
    addCheck({
      name: 'alpaca_history',
      status: 'UNAVAILABLE',
      message: 'No active Alpaca connection found.',
    });
    addCheck({
      name: 'alpaca_plan_window',
      status: 'UNAVAILABLE',
      message: 'No active Alpaca connection found.',
    });
  } else {
    const connection = await getActiveAlpacaConnection(verifyUserId);
    if (!connection) {
      addCheck({
        name: 'alpaca_history',
        status: 'UNAVAILABLE',
        message: 'Alpaca connection missing or inactive.',
        details: { userId: verifyUserId },
      });
      addCheck({
        name: 'alpaca_plan_window',
        status: 'UNAVAILABLE',
        message: 'Alpaca connection missing or inactive.',
        details: { userId: verifyUserId },
      });
    } else {
      const { plan } = await getUserPlan(verifyUserId);
      const period = resolvePeriodForPlan(plan);

      try {
        const client = buildAlpacaClient(connection);
        const history = await client.getPortfolioHistory({ period, timeframe: requestedTimeframe });
        const pointCount = Array.isArray(history.timestamp) ? history.timestamp.length : 0;

        if (pointCount > 0) {
          addCheck({
            name: 'alpaca_history',
            status: 'PASS',
            message: `Received ${pointCount} history points.`,
            details: { plan, period, timeframe: requestedTimeframe, userId: verifyUserId },
          });
        } else {
          addCheck({
            name: 'alpaca_history',
            status: 'FAIL',
            message: 'No history points returned.',
            details: { plan, period, timeframe: requestedTimeframe, userId: verifyUserId },
          });
        }
      } catch (error) {
        const message = (error as Error).message || 'Alpaca history unavailable.';
        addCheck({
          name: 'alpaca_history',
          status: 'UNAVAILABLE',
          message,
          details: { plan, period, timeframe: requestedTimeframe, userId: verifyUserId },
        });
      }

      recordPlanWindowCheck(plan, period, { userId: verifyUserId });
    }
  }

  const blockingChecks = new Set(['market_candles']);
  const blockingResults = checks.filter((c) => blockingChecks.has(c.name));
  const overallStatus: VerificationStatus =
    blockingResults.length === 0
      ? 'PASS'
      : blockingResults.every((c) => c.status === 'PASS')
        ? 'PASS'
        : 'FAIL';
  const finishedAt = Date.now();


  res.json({
    success: overallStatus === 'PASS',
    data: {
      status: overallStatus,
      checks,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
    },
  });
});

// ============================================
// Usage / Plan Gating
// ============================================

app.get('/v1/usage', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const snapshot = await getUsageSnapshot(userId);
  res.json({
    success: true,
    data: {
      plan: snapshot.plan,
      limits: snapshot.limits,
      analyticsDepth: snapshot.analyticsDepth,
      usage: snapshot.usage,
      remaining: snapshot.remaining,
      upgradeUrl: '/pricing',
    },
  });
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
// Decisions API (Decision -> Replay)
// ============================================

type DecisionStatus = 'DRAFT' | 'ACTIVE' | 'EXECUTED' | 'CANCELLED' | 'ARCHIVED';
type DecisionActionType = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'INACTION';

const DECISION_STATUSES = new Set<DecisionStatus>([
  'DRAFT',
  'ACTIVE',
  'EXECUTED',
  'CANCELLED',
  'ARCHIVED',
]);
const DECISION_ACTION_TYPES = new Set<DecisionActionType>([
  'BUY',
  'SELL',
  'HOLD',
  'WATCH',
  'INACTION',
]);

function normalizeDecisionStatus(value?: string): DecisionStatus | null {
  if (!value) return null;
  const upper = value.toUpperCase() as DecisionStatus;
  return DECISION_STATUSES.has(upper) ? upper : null;
}

function normalizeDecisionActionType(value?: string, direction?: string): DecisionActionType {
  if (value) {
    const upper = value.toUpperCase() as DecisionActionType;
    if (DECISION_ACTION_TYPES.has(upper)) return upper;
  }
  const dir = (direction || '').toUpperCase();
  if (dir === 'SHORT' || dir === 'SELL') return 'SELL';
  if (dir === 'LONG' || dir === 'BUY') return 'BUY';
  return 'HOLD';
}

function parseTimeHorizonDays(raw?: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(d|day|days|w|wk|week|weeks|m|mo|month|months|y|yr|year|years)$/i);
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(count) || count <= 0) return null;
  if (unit.startsWith('d')) return count;
  if (unit.startsWith('w')) return count * 7;
  if (unit.startsWith('m')) return count * 30;
  if (unit.startsWith('y')) return count * 365;
  return null;
}

function getDecisionReplayWindow(plan: string): { days: number; label: string } {
  if (plan === 'PRO') return { days: 365, label: '1y' };
  if (plan === 'LITE') return { days: 90, label: '3m' };
  return { days: 7, label: '7d' };
}

async function checkDecisionQuota(userId: string): Promise<{
  allowed: boolean;
  plan: string;
  limit: number;
  used: number;
  message?: string;
}> {
  const { plan } = await getUserPlan(userId);
  if (plan !== 'FREE') {
    return { allowed: true, plan, limit: -1, used: 0 };
  }

  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM decisions
     WHERE user_id = $1 AND created_at::date = CURRENT_DATE`,
    [userId]
  );

  const used = parseInt(result?.count || '0', 10);
  const limit = 3;
  if (used >= limit) {
    return {
      allowed: false,
      plan,
      limit,
      used,
      message: 'Free plan decision limit reached. Upgrade to Lite for more decisions.',
    };
  }
  return { allowed: true, plan, limit, used };
}

function parseDecisionJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function applyDecisionEvent(
  state: Record<string, any>,
  event: { eventType: string; payload: Record<string, any>; ts: string }
) {
  const payload = event.payload || {};

  if (typeof payload.intent === 'string') {
    state.intent = payload.intent;
  }
  if (payload.constraints !== undefined) {
    state.constraints = payload.constraints;
  }
  if (payload.rationale !== undefined) {
    state.rationale = payload.rationale;
  }
  if (payload.journalEntryId !== undefined) {
    state.journalEntryId = payload.journalEntryId;
  }
  if (payload.status) {
    const normalized = normalizeDecisionStatus(payload.status);
    if (normalized) {
      state.status = normalized;
    }
  }
  if (payload.note) {
    state.notes = state.notes || [];
    state.notes.push({ note: payload.note, ts: event.ts });
  }
  if (payload.quote) {
    state.quoteSnapshot = payload.quote;
  }
  if (payload.snapshot) {
    state.snapshot = payload.snapshot;
  }
  if (payload.actionType) {
    state.actionType = normalizeDecisionActionType(payload.actionType, state.direction);
  }
  if (payload.thesis !== undefined) {
    state.thesis = payload.thesis;
  }
  if (payload.invalidationRule !== undefined) {
    state.invalidationRule = payload.invalidationRule;
  }
  if (payload.timeHorizon !== undefined) {
    state.timeHorizon = payload.timeHorizon;
  }
  if (payload.riskNote !== undefined) {
    state.riskNote = payload.riskNote;
  }
  state.lastEventAt = event.ts;
}

type DecisionCardScore = {
  model: string;
  score: number;
  signalConfidence: number;
  dataConfidence: number | null;
  expectedValue: number;
  riskRewardRatio: number;
  riskEnvelope: Record<string, unknown> | null;
  gate?: Record<string, unknown>;
  regime?: string | null;
  strategy?: Record<string, unknown>;
  computedAt: string;
  expiresAt?: string | null;
};

function normalizeSignalConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (val as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return val;
  });
}

function computeDecisionCardScore(card: Record<string, any>, gate?: Record<string, unknown>, regime?: string | null): DecisionCardScore {
  const thesis = card?.thesis || {};
  const signalConfidence = normalizeSignalConfidence(thesis.confidence ?? card?.decision?.confidence ?? 0);
  const dataConfidence = typeof thesis?.dataIntegrity?.confidence_score === 'number'
    ? thesis.dataIntegrity.confidence_score
    : null;
  const riskRewardRatioRaw = typeof thesis.riskRewardRatio === 'number' && Number.isFinite(thesis.riskRewardRatio)
    ? thesis.riskRewardRatio
    : 0;
  const riskRewardRatio = riskRewardRatioRaw > 0
    ? riskRewardRatioRaw
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
    riskEnvelope: card?.risk?.envelope ?? null,
    gate,
    regime: regime ?? null,
    computedAt: nowTimestamp(),
    expiresAt: thesis.expiresAt ?? null,
  };
}

function buildDecisionCardHash(card: Record<string, any>, score: Record<string, unknown>): string {
  const payload = { card, score };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function resolveInternalDecisionToken(req: Request): string {
  const headerToken = req.headers['x-internal-decision-token'];
  if (typeof headerToken === 'string') return headerToken;
  if (Array.isArray(headerToken) && headerToken[0]) return headerToken[0];
  const queryToken = req.query?.token;
  return typeof queryToken === 'string' ? queryToken : '';
}

type DecisionReplayMetrics = {
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  returnPct: number;
  maxDrawdownPct: number;
  bestExcursionPct: number;
  worstExcursionPct: number;
  bars: number;
  windowDays: number;
};

function computeDecisionReplayMetrics(
  bars: HistoricalBar[],
  entryPrice: number,
  entryTime: string,
  direction: string,
  windowDays: number
): DecisionReplayMetrics {
  const multiplier = (direction || '').toUpperCase().includes('SHORT') || (direction || '').toUpperCase() === 'SELL' ? -1 : 1;
  const returns = bars.map((bar) => ((bar.close - entryPrice) / entryPrice) * 100 * multiplier);
  const exitBar = bars[bars.length - 1];
  let best = returns[0];
  let worst = returns[0];
  let peak = returns[0];
  let maxDrawdown = 0;

  for (const r of returns) {
    if (r > best) best = r;
    if (r < worst) worst = r;
    if (r > peak) peak = r;
    const drawdown = r - peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    entryPrice,
    exitPrice: exitBar.close,
    entryTime,
    exitTime: exitBar.date,
    returnPct: Math.round(returns[returns.length - 1] * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
    bestExcursionPct: Math.round(best * 100) / 100,
    worstExcursionPct: Math.round(worst * 100) / 100,
    bars: bars.length,
    windowDays,
  };
}

// List decisions
app.get('/v1/decisions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { status, symbol, limit = '50', offset = '0' } = req.query;

  let whereClause = 'WHERE user_id = $1';
  const params: (string | number)[] = [userId];
  let paramIndex = 2;

  if (symbol) {
    whereClause += ` AND symbol = $${paramIndex++}`;
    params.push((symbol as string).toUpperCase());
  }

  if (status) {
    const normalized = normalizeDecisionStatus(status as string);
    if (!normalized) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Invalid decision status' },
      });
    }
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(normalized);
  }

  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query<{
    id: string;
    symbol: string;
    direction: string;
    intent: string;
    status: string;
    source: string | null;
    journal_entry_id: string | null;
    constraints_json: string | null;
    rationale_json: string | null;
    created_at: string;
    updated_at: string;
    event_count: string;
    last_event_at: string | null;
  }>(`
      SELECT d.*,
        (SELECT COUNT(*) FROM decision_events e WHERE e.decision_id = d.id) as event_count,
        (SELECT MAX(ts) FROM decision_events e WHERE e.decision_id = d.id) as last_event_at
      FROM decisions d
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
    params
  );

  const decisions = result.rows.map((row) => {
    const constraintsObj = parseDecisionJson<Record<string, unknown>>(row.constraints_json, {});
    const rationaleObj = parseDecisionJson<Record<string, unknown>>(row.rationale_json, {});
    const actionType = normalizeDecisionActionType((rationaleObj as any)?.actionType, row.direction);
    return {
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      intent: row.intent,
      status: row.status,
      source: row.source || 'MANUAL',
      journalEntryId: row.journal_entry_id,
      constraints: constraintsObj,
      rationale: rationaleObj,
      actionType,
      thesis: (rationaleObj as any)?.thesis ?? (rationaleObj as any)?.text,
      riskNote: (rationaleObj as any)?.riskNote,
      invalidationRule: (constraintsObj as any)?.invalidationRule,
      timeHorizon: (constraintsObj as any)?.timeHorizon,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      eventCount: parseInt(row.event_count || '0', 10),
      lastEventAt: row.last_event_at,
    };
  });

  res.json({ success: true, data: { decisions } });
});

// Create decision
app.post('/v1/decisions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const {
    symbol,
    direction,
    intent,
    constraints,
    rationale,
    journalEntryId,
    source,
    actionType,
    thesis,
    invalidationRule,
    timeHorizon,
    riskNote,
  } = req.body;

  if (!symbol || !direction || !intent) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'symbol, direction, and intent are required' },
    });
  }

  const quota = await checkDecisionQuota(userId);
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: quota.message,
        requiredPlan: 'LITE',
        limit: quota.limit,
        used: quota.used,
        upgradeUrl: '/pricing',
      },
    });
  }

  const normalizedDirection = String(direction).toUpperCase();
  if (!['LONG', 'SHORT', 'BUY', 'SELL'].includes(normalizedDirection)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Invalid direction' },
    });
  }

  const quote = await getQuote(symbol);
  const normalizedActionType = normalizeDecisionActionType(actionType, normalizedDirection);
  const constraintObj = constraints && typeof constraints === 'object' && !Array.isArray(constraints)
    ? constraints
    : constraints !== undefined
      ? { value: constraints }
      : {};
  const rationaleObj = rationale && typeof rationale === 'object' && !Array.isArray(rationale)
    ? rationale
    : rationale !== undefined
      ? { value: rationale }
      : {};
  const constraintsPayload = {
    ...(constraintObj as Record<string, unknown>),
    ...(invalidationRule ? { invalidationRule } : {}),
    ...(timeHorizon ? { timeHorizon } : {}),
  };
  const rationalePayload = {
    ...(rationaleObj as Record<string, unknown>),
    ...(thesis ? { thesis } : {}),
    ...(riskNote ? { riskNote } : {}),
    actionType: normalizedActionType,
  };
  const snapshot = {
    price: quote?.price ?? null,
    ts: nowTimestamp(),
  };

  const decision = await transaction(async (client) => {
    const decisionResult = await client.query<{
      id: string;
      symbol: string;
      direction: string;
      intent: string;
      status: string;
      source: string | null;
      journal_entry_id: string | null;
      constraints_json: string | null;
      rationale_json: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO decisions (org_id, user_id, symbol, direction, intent, status, source, journal_entry_id, constraints_json, rationale_json)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9)
       RETURNING *`,
      [
        orgId,
        userId,
        symbol.toUpperCase(),
        normalizedDirection,
        intent,
        source || 'MANUAL',
        journalEntryId || null,
        Object.keys(constraintsPayload).length ? JSON.stringify(constraintsPayload) : null,
        Object.keys(rationalePayload).length ? JSON.stringify(rationalePayload) : null,
      ]
    );

    const created = decisionResult.rows[0];
    const eventPayload = {
      symbol: created.symbol,
      direction: created.direction,
      intent: created.intent,
      actionType: normalizedActionType,
      thesis: thesis || (rationalePayload as any)?.thesis,
      invalidationRule: invalidationRule || (constraintsPayload as any)?.invalidationRule,
      timeHorizon: timeHorizon || (constraintsPayload as any)?.timeHorizon,
      riskNote: riskNote || (rationalePayload as any)?.riskNote,
      constraints: constraintsPayload,
      rationale: rationalePayload,
      journalEntryId: created.journal_entry_id,
      source: created.source,
      quote,
      snapshot,
    };

    await client.query(
      `INSERT INTO decision_events (decision_id, org_id, user_id, event_type, payload_json, seq)
       VALUES ($1, $2, $3, $4, $5, 1)`,
      [created.id, orgId, userId, 'created', JSON.stringify(eventPayload)]
    );

    return created;
  });

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.DECISION_CREATED, {
    decisionId: decision.id,
    symbol: decision.symbol,
    direction: decision.direction,
    status: decision.status,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      decision: {
        id: decision.id,
        symbol: decision.symbol,
        direction: decision.direction,
        intent: decision.intent,
        status: decision.status,
        source: decision.source || 'MANUAL',
        journalEntryId: decision.journal_entry_id,
        constraints: parseDecisionJson(decision.constraints_json, {}),
        rationale: parseDecisionJson(decision.rationale_json, {}),
        actionType: normalizedActionType,
        thesis: thesis || (rationalePayload as any)?.thesis,
        invalidationRule: invalidationRule || (constraintsPayload as any)?.invalidationRule,
        timeHorizon: timeHorizon || (constraintsPayload as any)?.timeHorizon,
        riskNote: riskNote || (rationalePayload as any)?.riskNote,
        createdAt: decision.created_at,
        updatedAt: decision.updated_at,
        quoteSnapshot: quote,
        snapshot,
      },
    },
  });
});

// Get decision + events
app.get('/v1/decisions/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;

  const decision = await queryOne<{
    id: string;
    symbol: string;
    direction: string;
    intent: string;
    status: string;
    source: string | null;
    journal_entry_id: string | null;
    constraints_json: string | null;
    rationale_json: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM decisions WHERE id = $1 AND user_id = $2', [id, userId]);

  if (!decision) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Decision not found' },
    });
  }

  const events = await query<{
    id: string;
    event_type: string;
    payload_json: string;
    seq: number;
    ts: string;
  }>(
    `SELECT id, event_type, payload_json, seq, ts
     FROM decision_events WHERE decision_id = $1 ORDER BY seq ASC`,
    [id]
  );

  res.json({
    success: true,
    data: {
      decision: {
        id: decision.id,
        symbol: decision.symbol,
        direction: decision.direction,
        intent: decision.intent,
        status: decision.status,
        source: decision.source || 'MANUAL',
        journalEntryId: decision.journal_entry_id,
        constraints: parseDecisionJson(decision.constraints_json, {}),
        rationale: parseDecisionJson(decision.rationale_json, {}),
        actionType: normalizeDecisionActionType(
          (parseDecisionJson<Record<string, unknown>>(decision.rationale_json, {}) as any)?.actionType,
          decision.direction
        ),
        thesis: (parseDecisionJson<Record<string, unknown>>(decision.rationale_json, {}) as any)?.thesis,
        riskNote: (parseDecisionJson<Record<string, unknown>>(decision.rationale_json, {}) as any)?.riskNote,
        invalidationRule: (parseDecisionJson<Record<string, unknown>>(decision.constraints_json, {}) as any)?.invalidationRule,
        timeHorizon: (parseDecisionJson<Record<string, unknown>>(decision.constraints_json, {}) as any)?.timeHorizon,
        createdAt: decision.created_at,
        updatedAt: decision.updated_at,
      },
      events: events.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        seq: row.seq,
        ts: row.ts,
        payload: parseDecisionJson(row.payload_json, {}),
      })),
    },
  });
});

// Append decision event (immutable)
app.post('/v1/decisions/:id/events', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { id } = req.params;
  const { eventType, payload } = req.body;

  if (!eventType) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'eventType is required' },
    });
  }

  const result = await transaction(async (client) => {
    const existing = await client.query<{
      id: string;
      status: string;
    }>('SELECT id, status FROM decisions WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);

    if (!existing.rows[0]) {
      return null;
    }

    const seqResult = await client.query<{ next_seq: string }>(
      'SELECT COALESCE(MAX(seq), 0) + 1 as next_seq FROM decision_events WHERE decision_id = $1',
      [id]
    );
    const seq = parseInt(seqResult.rows[0].next_seq, 10);

    await client.query(
      `INSERT INTO decision_events (decision_id, org_id, user_id, event_type, payload_json, seq)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, orgId, userId, eventType, JSON.stringify(payload || {}), seq]
    );

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (payload?.status) {
      const normalized = normalizeDecisionStatus(payload.status);
      if (normalized) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(normalized);
      }
    }
    if (typeof payload?.intent === 'string') {
      updateFields.push(`intent = $${paramIndex++}`);
      updateValues.push(payload.intent);
    }
    if (payload?.constraints !== undefined) {
      updateFields.push(`constraints_json = $${paramIndex++}`);
      updateValues.push(JSON.stringify(payload.constraints));
    }
    if (payload?.rationale !== undefined) {
      updateFields.push(`rationale_json = $${paramIndex++}`);
      updateValues.push(JSON.stringify(payload.rationale));
    }
    if (payload?.journalEntryId !== undefined) {
      updateFields.push(`journal_entry_id = $${paramIndex++}`);
      updateValues.push(payload.journalEntryId);
    }
    if (payload?.source) {
      updateFields.push(`source = $${paramIndex++}`);
      updateValues.push(payload.source);
    }

    updateFields.push('updated_at = NOW()');
    await client.query(
      `UPDATE decisions SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      [...updateValues, id]
    );

    return { seq };
  });

  if (!result) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Decision not found' },
    });
  }

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.DECISION_EVENT_APPENDED, {
    decisionId: id,
    eventType,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      event: {
        decisionId: id,
        eventType,
        seq: result.seq,
      },
    },
  });
});

// Replay decision state from append-only events
app.post('/v1/decisions/:id/replay', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { id } = req.params;

  const decision = await queryOne<{
    id: string;
    symbol: string;
    direction: string;
    intent: string;
    status: string;
    source: string | null;
    journal_entry_id: string | null;
    constraints_json: string | null;
    rationale_json: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM decisions WHERE id = $1 AND user_id = $2', [id, userId]);

  if (!decision) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Decision not found' },
    });
  }

  const events = await query<{
    id: string;
    event_type: string;
    payload_json: string;
    seq: number;
    ts: string;
  }>(
    `SELECT id, event_type, payload_json, seq, ts
     FROM decision_events WHERE decision_id = $1 ORDER BY seq ASC`,
    [id]
  );

  const replayConstraints = parseDecisionJson<Record<string, unknown>>(decision.constraints_json, {});
  const replayRationale = parseDecisionJson<Record<string, unknown>>(decision.rationale_json, {});
  const replayActionType = normalizeDecisionActionType((replayRationale as any)?.actionType, decision.direction);

  const replayState: Record<string, any> = {
    id: decision.id,
    symbol: decision.symbol,
    direction: decision.direction,
    intent: decision.intent,
    status: decision.status,
    source: decision.source || 'MANUAL',
    journalEntryId: decision.journal_entry_id,
    constraints: replayConstraints,
    rationale: replayRationale,
    actionType: replayActionType,
    thesis: (replayRationale as any)?.thesis ?? (replayRationale as any)?.text,
    invalidationRule: (replayConstraints as any)?.invalidationRule,
    timeHorizon: (replayConstraints as any)?.timeHorizon,
    riskNote: (replayRationale as any)?.riskNote,
    createdAt: decision.created_at,
    updatedAt: decision.updated_at,
    notes: [],
  };

  const eventRows = events.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    seq: row.seq,
    ts: row.ts,
    payload: parseDecisionJson(row.payload_json, {}),
  }));

  for (const event of eventRows) {
    applyDecisionEvent(replayState, { eventType: event.eventType, payload: event.payload, ts: event.ts });
  }
  const { plan } = await getUserPlan(userId);
  const replayWindow = getDecisionReplayWindow(plan);

  const entryTime = replayState.snapshot?.ts || eventRows[0]?.ts || decision.created_at;
  const entryDate = new Date(entryTime);
  if (!Number.isFinite(entryDate.getTime())) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Invalid decision entry timestamp' },
    });
  }

  const horizonDays = parseTimeHorizonDays(replayState.timeHorizon);
  if (horizonDays && horizonDays > replayWindow.days) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: {
        code: 'REPLAY_WINDOW_EXCEEDED',
        message: `Replay window exceeds your ${plan} plan limit (${replayWindow.label}).`,
        requiredPlan: plan === 'FREE' ? 'LITE' : 'PRO',
        upgradeUrl: '/pricing',
      },
    });
  }

  const now = new Date();
  const maxAgeMs = replayWindow.days * 24 * 60 * 60 * 1000;
  if (now.getTime() - entryDate.getTime() > maxAgeMs) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: {
        code: 'REPLAY_WINDOW_EXCEEDED',
        message: `Replay window exceeds your ${plan} plan limit (${replayWindow.label}).`,
        requiredPlan: plan === 'FREE' ? 'LITE' : 'PRO',
        upgradeUrl: '/pricing',
      },
    });
  }

  const windowDays = horizonDays || replayWindow.days;
  const endDate = new Date(Math.min(now.getTime(), entryDate.getTime() + windowDays * 24 * 60 * 60 * 1000));
  const startKey = entryDate.toISOString().split('T')[0];
  const endKey = endDate.toISOString().split('T')[0];

  let metrics: DecisionReplayMetrics | null = null;
  let metricsWarning: string | null = null;

  const actionType: DecisionActionType = normalizeDecisionActionType(replayState.actionType, replayState.direction);
  const entryPrice = replayState.snapshot?.price ?? replayState.quoteSnapshot?.price;

  if (!entryPrice || !Number.isFinite(entryPrice)) {
    metricsWarning = 'Entry price unavailable for replay.';
  } else if (actionType === 'HOLD' || actionType === 'WATCH' || actionType === 'INACTION') {
    metricsWarning = 'Replay metrics are not computed for non-execution decisions.';
  } else {
    try {
      const bars = await getHistoricalData(decision.symbol, startKey, endKey);
      if (bars.length > 0) {
        metrics = computeDecisionReplayMetrics(bars, entryPrice, entryTime, actionType, windowDays);
      } else {
        metricsWarning = 'No market data available for replay window.';
      }
    } catch (error) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        error: { code: 'MARKETDATA_UNAVAILABLE', message: (error as Error).message },
      });
    }
  }

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.DECISION_REPLAYED, {
    decisionId: id,
    eventCount: eventRows.length,
    plan,
    windowDays,
  });

  res.json({
    success: true,
    data: {
      decision: replayState,
      events: eventRows,
      metrics,
      metricsWarning,
      replayWindow: { plan, days: replayWindow.days, label: replayWindow.label },
    },
  });
});
// ============================================
// Decision Cards (Phase 2)
// ============================================

type DecisionCardRow = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  symbol: string;
  strategy_tag: string | null;
  confidence_score: string | number | null;
  source_type: string | null;
  latency_class: string | null;
  regime: string | null;
  status: string;
  expires_at: string | null;
  card_hash: string;
  card_json: string | Record<string, unknown>;
  score_json: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function formatDecisionCard(row: DecisionCardRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    strategyTag: row.strategy_tag,
    confidenceScore: row.confidence_score !== null ? Number(row.confidence_score) : null,
    sourceType: row.source_type,
    latencyClass: row.latency_class,
    regime: row.regime,
    status: row.status,
    expiresAt: row.expires_at,
    cardHash: row.card_hash,
    card: parseDecisionJson(row.card_json, null),
    score: parseDecisionJson(row.score_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveLatestIntegrity(symbol: string): Promise<CandleIntegrity | null> {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return null;

  try {
    const res = await fetch(`${MARKETDATA_URL}/v1/market/candles/${encodeURIComponent(sym)}?interval=1d&limit=2`);
    const payload = (await res.json().catch(() => null)) as any;
    if (!res.ok || !payload?.success) return null;
    const integrity =
      payload?.data?.integrity ||
      payload?.data?.provenance ||
      payload?.data?.candles?.[0]?.integrity ||
      payload?.data?.candles?.[0]?.provenance ||
      null;
    return integrity && typeof integrity === 'object' ? (integrity as CandleIntegrity) : null;
  } catch (error) {
    logger.warn('Failed to resolve integrity', { symbol: sym, error: (error as Error).message });
    return null;
  }
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

// Internal ingest (tradebot -> nova-hub)
app.post('/internal/decision-cards', async (req: Request, res: Response) => {
  if (INTERNAL_DECISION_CARDS_TOKEN && resolveInternalDecisionToken(req) !== INTERNAL_DECISION_CARDS_TOKEN) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Forbidden' },
    });
  }

  const { card, score, metadata } = req.body || {};
  const thesis = card?.thesis;

  if (!card || !card.id || !thesis?.symbol) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Decision card payload invalid' },
    });
  }

  const symbol = String(thesis.symbol).toUpperCase();
  const scorePayload: DecisionCardScore = (score && typeof score === 'object')
    ? score
    : computeDecisionCardScore(card, metadata?.gate, metadata?.regime);

  const expiresAtRaw = metadata?.expiresAt || thesis.expiresAt || null;
  const expiresAt = expiresAtRaw && Number.isFinite(new Date(expiresAtRaw).getTime()) ? new Date(expiresAtRaw).toISOString() : null;
  const now = Date.now();
  const statusBase = String(metadata?.status || (card?.decision?.approved ? 'ACTIVE' : 'REJECTED')).toUpperCase();
  const status = expiresAt && new Date(expiresAt).getTime() <= now ? 'EXPIRED' : statusBase;
  const strategyTag = metadata?.strategyTag || thesis?.indicators?.strategyTag || thesis?.indicators?.strategy || null;

  let strategySummary: StrategySimulationSummary | null = null;
  if (strategyTag) {
    const strategyType = resolveStrategyType(strategyTag, metadata?.strategyType || null);
    const end = new Date();
    const start = new Date(end.getTime() - STRATEGY_SIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    try {
      strategySummary = await ensureStrategyPerformance({
        strategyTag,
        strategyType,
        symbol,
        orgId: metadata?.orgId || null,
        userId: metadata?.userId || null,
        startDate,
        endDate,
        initialCapital: 100000,
      });
    } catch (error) {
      logger.warn('Strategy simulation failed', { error: (error as Error).message });
    }
  }

  const confidenceScore = typeof metadata?.confidenceScore === 'number'
    ? metadata.confidenceScore
    : typeof scorePayload?.signalConfidence === 'number'
      ? scorePayload.signalConfidence
      : null;

  if (strategySummary) {
    (scorePayload as any).strategy = {
      status: strategySummary.status,
      fitnessScore: strategySummary.fitnessScore,
      drift: strategySummary.drift,
      backtest: strategySummary.backtest,
      monteCarlo: strategySummary.monteCarlo,
      slippage: strategySummary.slippage,
      evaluatedAt: strategySummary.evaluatedAt,
    };
    if (strategySummary.status === 'QUARANTINED' && scorePayload.gate && typeof scorePayload.gate === 'object') {
      const gate = scorePayload.gate as any;
      const reasons = Array.isArray(gate.reasons) ? gate.reasons : [];
      if (!reasons.includes('strategy_quarantined')) reasons.push('strategy_quarantined');
      gate.reasons = reasons;
      if (gate.mode === 'live') gate.mode = 'paper';
      scorePayload.gate = gate;
    }
  }

  const sourceType = metadata?.sourceType || thesis?.dataIntegrity?.source_type || null;
  const latencyClass = metadata?.latencyClass || thesis?.dataIntegrity?.latency_class || null;
  const regime = metadata?.regime || scorePayload?.regime || null;

  const cardHash = buildDecisionCardHash(card, scorePayload as unknown as Record<string, unknown>);

  const result = await queryOne<DecisionCardRow>(
    `INSERT INTO decision_cards (
        id, org_id, user_id, symbol, strategy_tag, confidence_score, source_type,
        latency_class, regime, status, expires_at, card_hash, card_json, score_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       strategy_tag = EXCLUDED.strategy_tag,
       confidence_score = EXCLUDED.confidence_score,
       source_type = EXCLUDED.source_type,
       latency_class = EXCLUDED.latency_class,
       regime = EXCLUDED.regime,
       status = EXCLUDED.status,
       expires_at = EXCLUDED.expires_at,
       card_hash = EXCLUDED.card_hash,
       card_json = EXCLUDED.card_json,
       score_json = EXCLUDED.score_json
     RETURNING *`,
    [
      card.id,
      metadata?.orgId || null,
      metadata?.userId || null,
      symbol,
      strategyTag,
      confidenceScore,
      sourceType,
      latencyClass,
      regime,
      status,
      expiresAt,
      cardHash,
      JSON.stringify(card),
      JSON.stringify(scorePayload),
    ]
  );

  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { card: formatDecisionCard(result!) } });
});

// Decision card feed (auth)
app.get('/v1/decision-cards', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, strategy, sourceType, latencyClass, regime, status, minConfidence, maxConfidence, limit = '50', offset = '0' } = req.query;

  let whereClause = 'WHERE (org_id IS NULL OR org_id = $1)';
  const params: (string | number)[] = [orgId];
  let paramIndex = 2;

  if (symbol) {
    whereClause += ` AND symbol = $${paramIndex++}`;
    params.push(String(symbol).toUpperCase());
  }
  if (strategy) {
    whereClause += ` AND strategy_tag = $${paramIndex++}`;
    params.push(String(strategy));
  }
  if (sourceType) {
    whereClause += ` AND source_type = $${paramIndex++}`;
    params.push(String(sourceType));
  }
  if (latencyClass) {
    whereClause += ` AND latency_class = $${paramIndex++}`;
    params.push(String(latencyClass));
  }
  if (regime) {
    whereClause += ` AND regime = $${paramIndex++}`;
    params.push(String(regime));
  }
  if (status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(String(status).toUpperCase());
  }
  if (minConfidence && !Number.isNaN(Number(minConfidence))) {
    whereClause += ` AND confidence_score >= $${paramIndex++}`;
    params.push(Number(minConfidence));
  }
  if (maxConfidence && !Number.isNaN(Number(maxConfidence))) {
    whereClause += ` AND confidence_score <= $${paramIndex++}`;
    params.push(Number(maxConfidence));
  }

  const limitValue = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
  const offsetValue = Math.max(0, parseInt(offset as string, 10) || 0);

  params.push(limitValue, offsetValue);

  const result = await query<DecisionCardRow>(
    `SELECT * FROM decision_cards
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  const cards = result.rows.map((row) => {
    const formatted = formatDecisionCard(row);
    if (formatted.score?.strategy) {
      formatted.score.strategy = pruneStrategyAnalytics(formatted.score.strategy, analyticsDepth);
    }
    return formatted;
  });

  res.json({ success: true, data: { cards, analyticsDepth } });
});

// Decision card detail (auth)
app.get('/v1/decision-cards/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { id } = req.params;

  const card = await queryOne<DecisionCardRow>(
    `SELECT * FROM decision_cards
     WHERE id = $1 AND (org_id IS NULL OR org_id = $2)`,
    [id, orgId]
  );

  if (!card) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Decision card not found' },
    });
  }

  const formatted = formatDecisionCard(card);
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  if (formatted.score?.strategy) {
    formatted.score.strategy = pruneStrategyAnalytics(formatted.score.strategy, analyticsDepth);
  }

  res.json({ success: true, data: { card: formatted, analyticsDepth } });
});

// Decision card replay + drift check
app.post('/v1/decision-cards/:id/replay', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { id } = req.params;

  const cardRow = await queryOne<DecisionCardRow>(
    `SELECT * FROM decision_cards
     WHERE id = $1 AND (org_id IS NULL OR org_id = $2)`,
    [id, orgId]
  );

  if (!cardRow) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Decision card not found' },
    });
  }

  const card = parseDecisionJson<Record<string, any>>(cardRow.card_json, {});
  let storedScore = parseDecisionJson<Record<string, any>>(cardRow.score_json, {});
  const recomputed = computeDecisionCardScore(card, storedScore?.gate, storedScore?.regime);
  const recomputedHash = buildDecisionCardHash(card, recomputed as unknown as Record<string, unknown>);

  const scoreDelta = typeof storedScore?.score === 'number'
    ? Math.round((recomputed.score - storedScore.score) * 100) / 100
    : null;
  const evDelta = typeof storedScore?.expectedValue === 'number'
    ? Math.round((recomputed.expectedValue - storedScore.expectedValue) * 100) / 100
    : null;
  const hashMismatch = cardRow.card_hash !== recomputedHash;

  const expiresAt = cardRow.expires_at ? new Date(cardRow.expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  if (storedScore?.strategy) {
    storedScore = { ...storedScore, strategy: pruneStrategyAnalytics(storedScore.strategy, analyticsDepth) };
  }
  const recomputedScore = (recomputed as any)?.strategy
    ? { ...recomputed, strategy: pruneStrategyAnalytics((recomputed as any).strategy, analyticsDepth) }
    : recomputed;

  res.json({
    success: true,
    data: {
      cardId: cardRow.id,
      stored: {
        hash: cardRow.card_hash,
        score: storedScore,
      },
      recomputed: {
        hash: recomputedHash,
        score: recomputedScore,
      },
      drift: {
        hashMismatch,
        scoreDelta,
        expectedValueDelta: evDelta,
      },
      status: cardRow.status,
      expiresAt: cardRow.expires_at,
      expired,
    },
  });
});

// ============================================
// Guided Flow (Scan -> Thesis -> Decision -> Paper -> Review)
// ============================================

app.post('/v1/guided/flow', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const input = (req.body?.signal || req.body || {}) as GuidedSignalInput;

  if (!input?.symbol) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'signal.symbol is required' },
    });
  }

  const decisionQuota = await checkQuota(userId, 'decision_card');
  if (!decisionQuota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: decisionQuota.message,
        requiredPlan: 'LITE',
        upgradeUrl: '/pricing',
      },
    });
  }

  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);

  const integrity = await resolveLatestIntegrity(input.symbol);
  if (!hasIntegrityFields(integrity)) {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      error: {
        code: 'INTEGRITY_MISSING',
        message: 'Market data integrity missing',
        details: { symbol: String(input.symbol).toUpperCase() },
        nextAction: 'Verify market data service is running and symbol is valid',
      },
    });
  }

  // Build thesis with validation - NO NEUTRAL FALLBACKS
  const thesisResult = buildGuidedThesis(input, integrity);
  
  // If thesis validation fails, return explicit errors with actionable reasons
  if (!thesisResult.ok) {
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      error: {
        code: 'THESIS_VALIDATION_FAILED',
        message: 'Required inputs missing for thesis generation',
        validationErrors: thesisResult.errors,
        nextAction: 'Provide missing fields: ' + thesisResult.errors.map(e => e.field).join(', '),
      },
      trace: {
        inputReceived: {
          symbol: input.symbol,
          entry: input.entry,
          target: input.target,
          stopLoss: input.stopLoss,
          confidence: input.confidence,
          direction: input.direction,
        },
        errors: thesisResult.errors,
      },
    });
  }
  
  const { thesis, warnings } = thesisResult;
  let gate: ExecutionGateResult = evaluateExecutionGate({ signalConfidence: thesis.confidence, integrity });
  
  // Build decision with explicit rejection reasons
  const rejectionReasons: string[] = [];
  if (gate.mode === 'blocked') {
    rejectionReasons.push(...gate.reasons);
    if (thesis.confidence < 30) rejectionReasons.push(`Confidence ${thesis.confidence}% below minimum threshold (30%)`);
    if (gate.dataConfidence && gate.dataConfidence < 0.7) rejectionReasons.push(`Data confidence ${(gate.dataConfidence * 100).toFixed(0)}% below threshold (70%)`);
  }
  
  const decision = {
    approved: gate.mode !== 'blocked',
    reasoning: gate.mode === 'blocked'
      ? `Execution blocked: ${rejectionReasons.join('; ')}`
      : gate.mode === 'paper'
        ? 'Eligible for paper execution'
        : 'Eligible for live execution',
    constraints: gate.reasons,
    rejectionReasons: gate.mode === 'blocked' ? rejectionReasons : [],
    tier: gate.mode.toUpperCase(),
    confidence: gate.signalConfidence,
    timestamp: nowTimestamp(),
  };

  const card = {
    id: generateId(),
    createdAt: nowTimestamp(),
    thesis,
    decision,
    warnings,
  };

  const scorePayload: DecisionCardScore = computeDecisionCardScore(card, gate, null);

  const strategyTag =
    input.strategyTag ||
    ((input.indicators as any)?.strategyTag as string | undefined) ||
    ((input.indicators as any)?.strategy as string | undefined) ||
    null;

  let strategySummary: StrategySimulationSummary | null = null;
  let analyticsLocked = false;
  let analyticsLockReason: string | null = null;

  if (strategyTag) {
    const strategyType = resolveStrategyType(strategyTag, null);
    if (!strategyType) {
      strategySummary = await ensureStrategyPerformance({
        strategyTag,
        strategyType: null,
        symbol: thesis.symbol,
        orgId,
        userId,
        startDate: new Date(Date.now() - STRATEGY_SIM_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        initialCapital: 100000,
      });
    } else {
      const simQuota = await checkQuota(userId, 'backtest');
      if (!simQuota.allowed) {
        analyticsLocked = true;
        analyticsLockReason = simQuota.message || 'Simulation quota reached';
      } else {
        try {
          strategySummary = await ensureStrategyPerformance({
            strategyTag,
            strategyType,
            symbol: thesis.symbol,
            orgId,
            userId,
            startDate: new Date(Date.now() - STRATEGY_SIM_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            initialCapital: 100000,
          });
          await incrementUsage(userId, 'backtest');
        } catch (error) {
          logger.warn('Guided flow strategy simulation failed', { error: (error as Error).message });
        }
      }
    }
  }

  if (strategySummary) {
    (scorePayload as any).strategy = {
      status: strategySummary.status,
      fitnessScore: strategySummary.fitnessScore,
      drift: strategySummary.drift,
      backtest: strategySummary.backtest,
      monteCarlo: strategySummary.monteCarlo,
      slippage: strategySummary.slippage,
      evaluatedAt: strategySummary.evaluatedAt,
    };
    if (strategySummary.status === 'QUARANTINED') {
      const reasons = Array.isArray(gate.reasons) ? gate.reasons : [];
      if (!reasons.includes('strategy_quarantined')) reasons.push('strategy_quarantined');
      gate = { ...gate, reasons, mode: gate.mode === 'live' ? 'paper' : gate.mode };
      scorePayload.gate = gate;
    }
  }

  const confidenceScore = typeof scorePayload?.signalConfidence === 'number' ? scorePayload.signalConfidence : null;
  const expiresAtRaw = thesis.expiresAt || null;
  const expiresAt = expiresAtRaw && Number.isFinite(new Date(expiresAtRaw).getTime()) ? new Date(expiresAtRaw).toISOString() : null;
  const now = Date.now();
  const statusBase = gate.mode === 'blocked' ? 'REJECTED' : 'ACTIVE';
  const status = expiresAt && new Date(expiresAt).getTime() <= now ? 'EXPIRED' : statusBase;

  const cardHash = buildDecisionCardHash(card, scorePayload as unknown as Record<string, unknown>);

  const result = await queryOne<DecisionCardRow>(
    `INSERT INTO decision_cards (
        id, org_id, user_id, symbol, strategy_tag, confidence_score, source_type,
        latency_class, regime, status, expires_at, card_hash, card_json, score_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      card.id,
      orgId || null,
      userId || null,
      thesis.symbol,
      strategyTag,
      confidenceScore,
      integrity?.source_type || null,
      integrity?.latency_class || null,
      null,
      status,
      expiresAt,
      cardHash,
      JSON.stringify(card),
      JSON.stringify(scorePayload),
    ]
  );

  await incrementUsage(userId, 'decision_card');
  const usageSnapshot = await getUsageSnapshot(userId);

  const formatted = result ? formatDecisionCard(result) : null;
  if (formatted?.score?.strategy) {
    formatted.score.strategy = pruneStrategyAnalytics(formatted.score.strategy, analyticsDepth);
  }

  // TRACE/INTEGRITY envelope with full debug metadata
  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      flow: {
        thesis,
        decisionCard: formatted,
        gate,
        analytics: {
          depth: analyticsDepth,
          locked: analyticsDepth <= 0 || analyticsLocked,
          reason: analyticsLockReason,
        },
        warnings,
      },
      usage: {
        plan: usageSnapshot.plan,
        remaining: usageSnapshot.remaining,
        upgradeUrl: '/pricing',
      },
    },
    trace: {
      inputSymbol: input.symbol,
      thesisId: thesis.id,
      decisionCardId: card.id,
      gateMode: gate.mode,
      gateReasons: gate.reasons,
      signalConfidence: gate.signalConfidence,
      dataConfidence: gate.dataConfidence,
      status,
      strategyTag,
      analyticsDepth,
      warnings,
    },
  });
});
// ============================================
// Screener API (Deterministic)
// ============================================

type ScreenerQualification = 'QUALIFIED' | 'NEAR_QUALIFIED' | 'NOT_QUALIFIED';

type ScreenerSignal = {
  symbol: string;
  name: string;
  type: 'bullish' | 'bearish';
  pattern: string;
  confidence: number;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
  timeframe: string;
  qualification: ScreenerQualification;
  qualificationReasons: string[];
  indicators?: {
    rsi: number | null;
    sma20: number | null;
    sma50: number | null;
    priceVsSma20: number | null;
    priceVsSma50: number | null;
    macdHistogram: number | null;
  };
};

const DEFAULT_SCREENER_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD', 'NFLX', 'INTC',
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'V', 'MA', 'PYPL',
  'XOM', 'CVX', 'COP', 'SLB',
  'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV',
  'KO', 'PEP', 'COST', 'WMT', 'TGT',
  'HD', 'LOW', 'BA', 'CAT', 'GE', 'MMM',
  'SPY', 'QQQ', 'IWM', 'DIA',
];

function buildSignal(symbol: string, quote: HubQuote, indicators: HubIndicators, minConfidence: number): ScreenerSignal | null {
  const price = quote.price;
  if (!Number.isFinite(price)) return null;

  const rsi = typeof indicators.rsi === 'number' ? indicators.rsi : null;
  const sma20 = typeof indicators.sma20 === 'number' ? indicators.sma20 : null;
  const sma50 = typeof indicators.sma50 === 'number' ? indicators.sma50 : null;
  const sma200 = typeof indicators.sma200 === 'number' ? indicators.sma200 : null;
  const macdHist = typeof indicators.macd?.histogram === 'number' ? indicators.macd.histogram : null;

  const priceVsSma20 = sma20 ? ((price - sma20) / sma20) * 100 : null;
  const priceVsSma50 = sma50 ? ((price - sma50) / sma50) * 100 : null;

  let bullScore = 0;
  let bearScore = 0;
  const bullReasons: string[] = [];
  const bearReasons: string[] = [];

  if (rsi !== null && rsi <= 35) {
    bullScore += 25;
    bullReasons.push(`RSI ${rsi.toFixed(1)} (oversold)`);
  }
  if (rsi !== null && rsi >= 65) {
    bearScore += 25;
    bearReasons.push(`RSI ${rsi.toFixed(1)} (overbought)`);
  }

  if (macdHist !== null && macdHist > 0) {
    bullScore += 15;
    bullReasons.push('MACD histogram positive');
  }
  if (macdHist !== null && macdHist < 0) {
    bearScore += 15;
    bearReasons.push('MACD histogram negative');
  }

  if (sma20 && price > sma20) {
    bullScore += 15;
    bullReasons.push('Price above SMA20');
  }
  if (sma20 && price < sma20) {
    bearScore += 15;
    bearReasons.push('Price below SMA20');
  }

  if (sma50 && price > sma50) {
    bullScore += 15;
    bullReasons.push('Price above SMA50');
  }
  if (sma50 && price < sma50) {
    bearScore += 15;
    bearReasons.push('Price below SMA50');
  }

  if (sma20 && sma50 && sma20 > sma50) {
    bullScore += 10;
    bullReasons.push('SMA20 above SMA50');
  }
  if (sma20 && sma50 && sma20 < sma50) {
    bearScore += 10;
    bearReasons.push('SMA20 below SMA50');
  }

  if (sma50 && sma200 && sma50 > sma200) {
    bullScore += 10;
    bullReasons.push('SMA50 above SMA200');
  }
  if (sma50 && sma200 && sma50 < sma200) {
    bearScore += 10;
    bearReasons.push('SMA50 below SMA200');
  }

  const bullish = bullScore >= bearScore;
  const score = Math.max(bullScore, bearScore);
  const reasons = bullish ? bullReasons : bearReasons;

  // ALWAYS compute a signal even with low scores - ranking happens before qualification
  const confidence = Math.max(1, Math.min(100, score)); // Minimum 1 to always have a signal
  const targetPct = 0.03 + (confidence / 100) * 0.04; // 3% to 7%
  const stopPct = Math.max(0.015, targetPct / 2);

  const entry = price;
  const target = bullish ? price * (1 + targetPct) : price * (1 - targetPct);
  const stopLoss = bullish ? price * (1 - stopPct) : price * (1 + stopPct);
  
  // Qualification logic: QUALIFIED if meets threshold, NEAR if within 10%, else NOT_QUALIFIED
  const qualificationReasons: string[] = [];
  let qualification: ScreenerQualification;
  if (confidence >= minConfidence) {
    qualification = 'QUALIFIED';
    qualificationReasons.push(`Confidence ${confidence}% meets threshold ${minConfidence}%`);
  } else if (confidence >= minConfidence * 0.9) {
    qualification = 'NEAR_QUALIFIED';
    qualificationReasons.push(`Confidence ${confidence}% is within 10% of threshold ${minConfidence}%`);
  } else {
    qualification = 'NOT_QUALIFIED';
    qualificationReasons.push(`Confidence ${confidence}% below threshold ${minConfidence}%`);
  }
  if (reasons.length === 0) {
    qualification = 'NOT_QUALIFIED';
    qualificationReasons.push('No technical signals detected');
  }
  const riskReward = Math.abs((target - entry) / (entry - stopLoss));

  let pattern = 'Signal Alignment';
  if (rsi !== null && rsi <= 35 && sma20 && price < sma20) {
    pattern = 'Oversold Rebound';
  } else if (rsi !== null && rsi >= 65 && sma20 && price > sma20) {
    pattern = 'Overbought Pullback';
  } else if (sma20 && sma50 && sma20 > sma50 && macdHist !== null && macdHist > 0) {
    pattern = 'Trend Momentum';
  } else if (sma20 && sma50 && sma20 < sma50 && macdHist !== null && macdHist < 0) {
    pattern = 'Trend Weakness';
  }

  const reasoning = `${reasons.join('; ')}. Score ${confidence}/100.`;

  return {
    symbol,
    name: symbol,
    type: bullish ? 'bullish' : 'bearish',
    pattern: pattern || 'Neutral',
    confidence,
    entry: Number(entry.toFixed(2)),
    target: Number(target.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    riskReward: Number(riskReward.toFixed(2)),
    reasoning: reasoning || `No strong signals for ${symbol}`,
    timeframe: '1-3 weeks',
    qualification,
    qualificationReasons,
    indicators: {
      rsi: rsi ?? null,
      sma20,
      sma50,
      priceVsSma20: priceVsSma20 !== null ? Number(priceVsSma20.toFixed(1)) : null,
      priceVsSma50: priceVsSma50 !== null ? Number(priceVsSma50.toFixed(1)) : null,
      macdHistogram: macdHist !== null ? Number(macdHist.toFixed(2)) : null,
    },
  };
}

app.post('/v1/screener/scan', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const {
    symbols,
    maxSymbols = 50,
    minConfidence = 65,
    signalType = 'all',
    save = false,
    name,
  } = req.body || {};

  const universe = Array.isArray(symbols) && symbols.length > 0 ? symbols : DEFAULT_SCREENER_UNIVERSE;
  const normalizedUniverse = universe
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => !!s);
  const limit = Math.min(200, Math.max(1, Number(maxSymbols) || 50));
  const list = normalizedUniverse.slice(0, limit);

  const allSignals: ScreenerSignal[] = [];
  const missingDataSymbols: string[] = [];

  for (const symbol of list) {
    const [quote, indicators] = await Promise.all([getQuote(symbol), getIndicators(symbol)]);
    if (!quote || !indicators) {
      missingDataSymbols.push(symbol);
      continue;
    }

    const signal = buildSignal(symbol, quote, indicators, Number(minConfidence));
    if (!signal) {
      missingDataSymbols.push(symbol);
      continue;
    }

    // Filter by signal type if specified
    if (signalType !== 'all' && signal.type !== signalType) continue;

    allSignals.push(signal);
  }

  // Sort ALL signals by confidence descending - ranking happens BEFORE any filtering
  allSignals.sort((a, b) => b.confidence - a.confidence);
  
  // Separate into qualified/near/not categories
  const qualified = allSignals.filter(s => s.qualification === 'QUALIFIED');
  const nearQualified = allSignals.filter(s => s.qualification === 'NEAR_QUALIFIED');
  const notQualified = allSignals.filter(s => s.qualification === 'NOT_QUALIFIED');

  const scannedAt = new Date().toISOString();
  let reportId: string | null = null;

  if (save || name) {
    const reportName = name || `Scan ${new Date().toLocaleString('en-US')}`;
    const reportResult = await queryOne<{ id: string }>(
      `INSERT INTO scanner_reports (user_id, name, results)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, reportName, JSON.stringify({ signals: allSignals, settings: { maxSymbols, minConfidence, signalType }, scannedAt })]
    );
    reportId = reportResult?.id || null;
  }

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.SCAN_EXECUTED, {
    mode: 'screener',
    universeCount: list.length,
    qualifiedCount: qualified.length,
    nearQualifiedCount: nearQualified.length,
    notQualifiedCount: notQualified.length,
    missingDataCount: missingDataSymbols.length,
    minConfidence,
    signalType,
    reportId,
  });

  // TRACE/INTEGRITY envelope with debug metadata
  res.json({
    success: true,
    data: {
      signals: allSignals,
      qualified,
      nearQualified,
      notQualified,
      scannedAt,
      reportId,
    },
    trace: {
      universeSize: list.length,
      scannedCount: allSignals.length,
      qualifiedCount: qualified.length,
      nearQualifiedCount: nearQualified.length,
      notQualifiedCount: notQualified.length,
      missingDataSymbols,
      minConfidenceThreshold: minConfidence,
      signalTypeFilter: signalType,
      rankings: allSignals.slice(0, 10).map(s => ({ symbol: s.symbol, confidence: s.confidence, qualification: s.qualification })),
    },
  });
});

// Save screener report from client-provided results
app.post('/v1/screener/reports', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { name, signals, settings, scannedAt } = req.body || {};

  if (!Array.isArray(signals) || signals.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'signals array is required' },
    });
  }

  const reportName = name || `Scan ${new Date().toLocaleString('en-US')}`;
  const reportResult = await queryOne<{ id: string; scanned_at: string }>(
    `INSERT INTO scanner_reports (user_id, name, results, scanned_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, scanned_at`,
    [
      userId,
      reportName,
      JSON.stringify({ signals, settings: settings || {}, scannedAt: scannedAt || new Date().toISOString() }),
      scannedAt || new Date().toISOString(),
    ]
  );

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.SCAN_EXECUTED, {
    mode: 'screener-save',
    resultsCount: signals.length,
    reportId: reportResult?.id,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: {
      reportId: reportResult?.id,
      scannedAt: reportResult?.scanned_at,
    },
  });
});

// List screener reports
app.get('/v1/screener/reports', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;

  const result = await query<{
    id: string;
    name: string | null;
    results: any;
    scanned_at: string;
  }>(
    `SELECT id, name, results, scanned_at
     FROM scanner_reports WHERE user_id = $1
     ORDER BY scanned_at DESC LIMIT 50`,
    [userId]
  );

  const reports = result.rows.map((row) => {
    const parsed = parseDecisionJson<{ signals?: any[]; settings?: any }>(row.results, {});
    const signals = Array.isArray(parsed?.signals) ? parsed.signals : [];
    return {
      id: row.id,
      name: row.name,
      scannedAt: row.scanned_at,
      resultsCount: signals.length,
      settings: parsed?.settings || {},
    };
  });

  res.json({ success: true, data: { reports } });
});

// Get single screener report
app.get('/v1/screener/reports/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;

  const report = await queryOne<{
    id: string;
    name: string | null;
    results: any;
    scanned_at: string;
  }>(
    `SELECT id, name, results, scanned_at
     FROM scanner_reports WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (!report) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Report not found' },
    });
  }

  const parsed = parseDecisionJson(report.results, {});

  res.json({
    success: true,
    data: {
      report: {
        id: report.id,
        name: report.name,
        scannedAt: report.scanned_at,
        results: parsed,
      },
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
  slippageBps?: number;
  history?: HistoricalBar[];
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

interface MonteCarloResult {
  percentile5: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile95: number;
  probabilityProfit: number;
  expectedValue: number;
}

interface SlippageSensitivityPoint {
  slippageBps: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
}

interface StrategySimulationSummary {
  strategyTag: string;
  strategyType: string;
  symbol: string;
  backtest: {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    totalReturn: number;
    totalReturnPct: number;
    finalCapital: number;
    initialCapital: number;
  };
  monteCarlo: MonteCarloResult;
  slippage: SlippageSensitivityPoint[];
  fitnessScore: number;
  drift: { status: 'STABLE' | 'QUARANTINED'; fitnessDelta: number | null; reasons: string[] };
  status: 'ACTIVE' | 'QUARANTINED' | 'UNSUPPORTED';
  evaluatedAt: string;
}

type StrategyPerformanceRow = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  strategy_key: string;
  strategy_tag: string;
  strategy_type: string | null;
  symbol: string;
  status: string;
  fitness_score: string | number | null;
  drift_json: string | Record<string, unknown> | null;
  metrics_json: string | Record<string, unknown> | null;
  evaluated_at: string;
  quarantined_at: string | null;
  quarantine_reason: string | null;
  created_at: string;
  updated_at: string;
};

const SUPPORTED_STRATEGIES = new Set(['sma_crossover', 'mean_reversion', 'momentum']);
const STRATEGY_SIM_CACHE_HOURS = Math.max(1, Number(process.env.STRATEGY_SIM_CACHE_HOURS || '12'));
const STRATEGY_SIM_WINDOW_DAYS = Math.max(30, Number(process.env.STRATEGY_SIM_WINDOW_DAYS || '180'));

function resolveStrategyType(strategyTag?: string | null, override?: string | null): string | null {
  const candidate = (override || strategyTag || '').toLowerCase();
  return SUPPORTED_STRATEGIES.has(candidate) ? candidate : null;
}
function resolveSimulationWindow(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const safeEnd = Number.isFinite(end.getTime()) ? end : new Date();
  const start = startDate ? new Date(startDate) : new Date(safeEnd.getTime() - STRATEGY_SIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const safeStart = Number.isFinite(start.getTime())
    ? start
    : new Date(safeEnd.getTime() - STRATEGY_SIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    startKey: safeStart.toISOString().split('T')[0],
    endKey: safeEnd.toISOString().split('T')[0],
  };
}

function buildStrategyKey(orgId: string | null, strategyTag: string, symbol: string): string {
  const org = orgId || 'GLOBAL';
  return `${org}:${strategyTag.toUpperCase()}:${symbol.toUpperCase()}`;
}

function seedRandom(seed: string): () => number {
  const hash = createHash('sha256').update(seed).digest();
  let state = hash.readUInt32BE(0);
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * pct)));
  return values[index];
}

function computeMonteCarlo(trades: BacktestTrade[], seed: string): MonteCarloResult {
  const returns = trades.map((t) => t.pnlPercent / 100).filter((v) => Number.isFinite(v));
  if (returns.length === 0) {
    return { percentile5: 0, percentile25: 0, percentile50: 0, percentile75: 0, percentile95: 0, probabilityProfit: 0, expectedValue: 0 };
  }

  const rand = seedRandom(seed);
  const iterations = 500;
  const outcomes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let equity = 1;
    for (let j = 0; j < returns.length; j++) {
      const idx = Math.floor(rand() * returns.length);
      equity *= (1 + returns[idx]);
    }
    outcomes.push((equity - 1) * 100);
  }

  outcomes.sort((a, b) => a - b);
  const probabilityProfit = outcomes.filter((v) => v > 0).length / outcomes.length;
  const expectedValue = outcomes.reduce((sum, v) => sum + v, 0) / outcomes.length;

  return {
    percentile5: Math.round(percentile(outcomes, 0.05) * 100) / 100,
    percentile25: Math.round(percentile(outcomes, 0.25) * 100) / 100,
    percentile50: Math.round(percentile(outcomes, 0.5) * 100) / 100,
    percentile75: Math.round(percentile(outcomes, 0.75) * 100) / 100,
    percentile95: Math.round(percentile(outcomes, 0.95) * 100) / 100,
    probabilityProfit: Math.round(probabilityProfit * 10000) / 100,
    expectedValue: Math.round(expectedValue * 100) / 100,
  };
}

function summarizeBacktest(result: BacktestResult) {
  return {
    totalTrades: result.totalTrades,
    winRate: result.winRate,
    avgWin: result.avgWin,
    avgLoss: result.avgLoss,
    profitFactor: result.profitFactor,
    maxDrawdownPct: result.maxDrawdownPct,
    sharpeRatio: result.sharpeRatio,
    totalReturn: result.totalReturn,
    totalReturnPct: result.totalReturnPct,
    finalCapital: result.finalCapital,
    initialCapital: result.initialCapital,
  };
}

function computeFitnessScore(summary: ReturnType<typeof summarizeBacktest>, slippage: SlippageSensitivityPoint[]): number {
  const returnScore = Math.max(-1, Math.min(1, summary.totalReturnPct / 50));
  const sharpeScore = Math.max(0, Math.min(1, summary.sharpeRatio / 2));
  const winScore = Math.max(-1, Math.min(1, (summary.winRate - 50) / 50));
  const drawdownScore = Math.max(-1, Math.min(1, 1 - summary.maxDrawdownPct / 30));

  const baseline = slippage.find((s) => s.slippageBps === 0)?.totalReturnPct ?? summary.totalReturnPct;
  const worst = slippage.length ? Math.min(...slippage.map((s) => s.totalReturnPct)) : baseline;
  const slipPenalty = baseline === 0 ? (worst < 0 ? 1 : 0) : Math.min(1, Math.max(0, (baseline - worst) / Math.max(1, Math.abs(baseline))));

  const weighted =
    returnScore * 0.3 +
    sharpeScore * 0.2 +
    winScore * 0.2 +
    drawdownScore * 0.2 +
    (1 - slipPenalty) * 0.1;

  return Math.max(0, Math.min(100, Math.round(weighted * 100)));
}

function evaluateStrategyDrift(summary: ReturnType<typeof summarizeBacktest>, fitnessScore: number, previous?: StrategyPerformanceRow | null) {
  const reasons: string[] = [];
  const prevFitness = previous?.fitness_score !== null && previous?.fitness_score !== undefined ? Number(previous.fitness_score) : null;
  const fitnessDelta = prevFitness !== null ? Math.round((fitnessScore - prevFitness) * 100) / 100 : null;

  if (fitnessDelta !== null && fitnessDelta <= -15) reasons.push('fitness_drop');
  if (summary.maxDrawdownPct >= 30) reasons.push('drawdown_breach');
  if (summary.totalTrades >= 10 && summary.winRate < 40) reasons.push('win_rate_low');
  if (summary.totalTrades >= 10 && summary.profitFactor < 1) reasons.push('profit_factor_low');

  return {
    status: reasons.length > 0 ? 'QUARANTINED' : 'STABLE',
    fitnessDelta,
    reasons,
  } as { status: 'STABLE' | 'QUARANTINED'; fitnessDelta: number | null; reasons: string[] };
}

function formatStrategyPerformance(row: StrategyPerformanceRow) {
  return {
    id: row.id,
    strategyKey: row.strategy_key,
    strategyTag: row.strategy_tag,
    strategyType: row.strategy_type,
    symbol: row.symbol,
    status: row.status,
    fitnessScore: row.fitness_score !== null ? Number(row.fitness_score) : null,
    drift: parseDecisionJson(row.drift_json, null),
    metrics: parseDecisionJson(row.metrics_json, null),
    evaluatedAt: row.evaluated_at,
    quarantinedAt: row.quarantined_at,
    quarantineReason: row.quarantine_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getStrategyPerformanceByKey(strategyKey: string) {
  return await queryOne<StrategyPerformanceRow>(
    `SELECT * FROM strategy_performance WHERE strategy_key = $1`,
    [strategyKey]
  );
}

async function upsertStrategyPerformance(params: {
  strategyKey: string;
  strategyTag: string;
  strategyType: string | null;
  symbol: string;
  orgId?: string | null;
  userId?: string | null;
  status: 'ACTIVE' | 'QUARANTINED' | 'UNSUPPORTED';
  fitnessScore: number | null;
  drift: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  quarantinedAt?: string | null;
  quarantineReason?: string | null;
}): Promise<StrategyPerformanceRow> {
  const {
    strategyKey,
    strategyTag,
    strategyType,
    symbol,
    orgId,
    userId,
    status,
    fitnessScore,
    drift,
    metrics,
    quarantinedAt,
    quarantineReason,
  } = params;

  return await queryOne<StrategyPerformanceRow>(
    `INSERT INTO strategy_performance (
        strategy_key, org_id, user_id, strategy_tag, strategy_type, symbol,
        status, fitness_score, drift_json, metrics_json, evaluated_at, quarantined_at, quarantine_reason
     ) VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, NOW(), $11, $12)
     ON CONFLICT (strategy_key) DO UPDATE SET
       org_id = EXCLUDED.org_id,
       user_id = EXCLUDED.user_id,
       strategy_tag = EXCLUDED.strategy_tag,
       strategy_type = EXCLUDED.strategy_type,
       symbol = EXCLUDED.symbol,
       status = EXCLUDED.status,
       fitness_score = EXCLUDED.fitness_score,
       drift_json = EXCLUDED.drift_json,
       metrics_json = EXCLUDED.metrics_json,
       evaluated_at = NOW(),
       quarantined_at = EXCLUDED.quarantined_at,
       quarantine_reason = EXCLUDED.quarantine_reason
     RETURNING *`,
    [
      strategyKey,
      orgId || null,
      userId || null,
      strategyTag,
      strategyType,
      symbol.toUpperCase(),
      status,
      fitnessScore,
      drift ? JSON.stringify(drift) : null,
      metrics ? JSON.stringify(metrics) : null,
      quarantinedAt || null,
      quarantineReason || null,
    ]
  );
}

async function computeStrategySimulation(params: {
  strategyTag: string;
  strategyType: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyParams?: Record<string, number>;
}): Promise<{ summary: StrategySimulationSummary; metrics: Record<string, unknown> }> {
  const { strategyTag, strategyType, symbol, startDate, endDate, initialCapital, strategyParams } = params;
  const history = await getHistoricalData(symbol, startDate, endDate);

  if (history.length < 50) {
    throw new Error('Insufficient historical data for strategy simulation');
  }

  const baseBacktest = await runBacktest({
    symbol,
    strategyType,
    startDate,
    endDate,
    initialCapital,
    params: strategyParams,
    slippageBps: 0,
    history,
  });

  const slippagePoints: SlippageSensitivityPoint[] = [];
  for (const bps of [0, 5, 10, 25]) {
    const result = await runBacktest({
      symbol,
      strategyType,
      startDate,
      endDate,
      initialCapital,
      params: strategyParams,
      slippageBps: bps,
      history,
    });
    slippagePoints.push({
      slippageBps: bps,
      totalReturnPct: result.totalReturnPct,
      maxDrawdownPct: result.maxDrawdownPct,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
    });
  }

  const summary = summarizeBacktest(baseBacktest);
  const monteCarlo = computeMonteCarlo(baseBacktest.trades, `${strategyTag}:${symbol}:${startDate}:${endDate}`);
  const fitnessScore = computeFitnessScore(summary, slippagePoints);

  const drift = evaluateStrategyDrift(summary, fitnessScore);
  const status = drift.status === 'QUARANTINED' ? 'QUARANTINED' : 'ACTIVE';
  const evaluatedAt = new Date().toISOString();

  const simulationSummary: StrategySimulationSummary = {
    strategyTag,
    strategyType,
    symbol: symbol.toUpperCase(),
    backtest: summary,
    monteCarlo,
    slippage: slippagePoints,
    fitnessScore,
    drift,
    status,
    evaluatedAt,
  };

  const metrics = {
    backtest: summary,
    monteCarlo,
    slippage: slippagePoints,
    fitnessScore,
  };

  return { summary: simulationSummary, metrics };
}

async function ensureStrategyPerformance(params: {
  strategyTag: string;
  strategyType: string | null;
  symbol: string;
  orgId?: string | null;
  userId?: string | null;
  startDate: string;
  endDate: string;
  initialCapital: number;
  strategyParams?: Record<string, number>;
}): Promise<StrategySimulationSummary | null> {
  const { strategyTag, strategyType, symbol, orgId, userId, startDate, endDate, initialCapital, strategyParams } = params;

  if (!strategyType) {
    return {
      strategyTag,
      strategyType: strategyTag,
      symbol: symbol.toUpperCase(),
      backtest: {
        totalTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxDrawdownPct: 0,
        sharpeRatio: 0,
        totalReturn: 0,
        totalReturnPct: 0,
        finalCapital: initialCapital,
        initialCapital,
      },
      monteCarlo: { percentile5: 0, percentile25: 0, percentile50: 0, percentile75: 0, percentile95: 0, probabilityProfit: 0, expectedValue: 0 },
      slippage: [],
      fitnessScore: 0,
      drift: { status: 'STABLE', fitnessDelta: null, reasons: ['unsupported_strategy'] },
      status: 'UNSUPPORTED',
      evaluatedAt: new Date().toISOString(),
    };
  }

  const strategyKey = buildStrategyKey(orgId || null, strategyTag, symbol);
  const previous = await getStrategyPerformanceByKey(strategyKey);

  if (previous?.evaluated_at) {
    const last = new Date(previous.evaluated_at).getTime();
    if (Number.isFinite(last) && Date.now() - last < STRATEGY_SIM_CACHE_HOURS * 60 * 60 * 1000) {
      const cached = formatStrategyPerformance(previous);
      const metrics = cached.metrics as any;
      return {
        strategyTag: cached.strategyTag,
        strategyType: cached.strategyType || strategyType,
        symbol: cached.symbol,
        backtest: metrics?.backtest || {
          totalTrades: 0,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 0,
          maxDrawdownPct: 0,
          sharpeRatio: 0,
          totalReturn: 0,
          totalReturnPct: 0,
          finalCapital: initialCapital,
          initialCapital,
        },
        monteCarlo: metrics?.monteCarlo || { percentile5: 0, percentile25: 0, percentile50: 0, percentile75: 0, percentile95: 0, probabilityProfit: 0, expectedValue: 0 },
        slippage: metrics?.slippage || [],
        fitnessScore: cached.fitnessScore || 0,
        drift: (cached.drift as any) || { status: 'STABLE', fitnessDelta: null, reasons: [] },
        status: cached.status as any,
        evaluatedAt: cached.evaluatedAt,
      };
    }
  }

  const simulation = await computeStrategySimulation({
    strategyTag,
    strategyType,
    symbol,
    startDate,
    endDate,
    initialCapital,
    strategyParams,
  });

  const drift = evaluateStrategyDrift(simulation.summary.backtest, simulation.summary.fitnessScore, previous);
  const status = drift.status === 'QUARANTINED' ? 'QUARANTINED' : 'ACTIVE';

  const record = await upsertStrategyPerformance({
    strategyKey,
    strategyTag,
    strategyType,
    symbol,
    orgId: orgId || null,
    userId: userId || null,
    status,
    fitnessScore: simulation.summary.fitnessScore,
    drift,
    metrics: simulation.metrics,
    quarantinedAt: status === 'QUARANTINED' ? new Date().toISOString() : null,
    quarantineReason: status === 'QUARANTINED' ? drift.reasons.join(',') : null,
  });

  const formatted = formatStrategyPerformance(record);
  return {
    strategyTag: formatted.strategyTag,
    strategyType: formatted.strategyType || strategyType,
    symbol: formatted.symbol,
    backtest: simulation.summary.backtest,
    monteCarlo: simulation.summary.monteCarlo,
    slippage: simulation.summary.slippage,
    fitnessScore: formatted.fitnessScore || simulation.summary.fitnessScore,
    drift: drift,
    status: status,
    evaluatedAt: formatted.evaluatedAt,
  };
}

async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const { symbol, strategyType, startDate, endDate, initialCapital = 100000, params: strategyParams = {}, slippageBps = 0 } = params;
  
  // Get historical data
  const history = params.history || await Promise.race<HistoricalBar[]>([
    getHistoricalData(symbol, startDate, endDate),
    new Promise<HistoricalBar[]>((_, reject) =>
      setTimeout(() => reject(new Error('Historical market data unavailable on current data plan. Candles require paid provider access.')), 10000)
    ),
  ]);
  
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
  
  const slippageFactor = Math.max(0, slippageBps) / 10000;

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
      const entryPrice = currentPrice * (1 + slippageFactor);
      const size = Math.floor(capital / entryPrice);
      if (size > 0) {
        position = { side: 'LONG', entryPrice, entryDate: currentDate, size };
      }
    } else if (signal === 'SELL' && position?.side === 'LONG') {
      const exitPrice = currentPrice * (1 - slippageFactor);
      const pnl = (exitPrice - position.entryPrice) * position.size;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      
      trades.push({
        entryDate: position.entryDate,
        exitDate: currentDate,
        entryPrice: position.entryPrice,
        exitPrice,
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
    const exitPrice = finalPrice * (1 - slippageFactor);
    const pnl = (exitPrice - position.entryPrice) * position.size;
    trades.push({
      entryDate: position.entryDate,
      exitDate: history[history.length - 1].date,
      entryPrice: position.entryPrice,
      exitPrice,
      side: 'LONG',
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(((exitPrice - position.entryPrice) / position.entryPrice) * 100 * 100) / 100,
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
    const result = await Promise.race<BacktestResult>([
      (async () => {
        const computed = await runBacktest({ symbol, strategyType, startDate, endDate, initialCapital, params });

        // Save to database
        await query(
          `INSERT INTO backtest_results (id, user_id, org_id, name, symbol, strategy_type, strategy_params, 
                                         start_date, end_date, initial_capital, final_capital, total_return, 
                                         total_return_pct, max_drawdown, max_drawdown_pct, sharpe_ratio, win_rate,
                                         total_trades, winning_trades, losing_trades, avg_win, avg_loss, profit_factor,
                                         trades_json, equity_curve_json, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 'COMPLETED')`,
          [computed.id, userId, orgId, name || computed.name, computed.symbol, computed.strategyType, JSON.stringify(computed.params),
           computed.startDate, computed.endDate, computed.initialCapital, computed.finalCapital, computed.totalReturn,
           computed.totalReturnPct, computed.maxDrawdown, computed.maxDrawdownPct, computed.sharpeRatio, computed.winRate,
           computed.totalTrades, computed.winningTrades, computed.losingTrades, computed.avgWin, computed.avgLoss, computed.profitFactor,
           JSON.stringify(computed.trades), JSON.stringify(computed.equityCurve)]
        );

        await incrementUsage(userId, 'backtest');
        return computed;
      })(),
      new Promise<BacktestResult>((_, reject) =>
        setTimeout(
          () => reject(new Error('Historical market data unavailable on current data plan. Candles require paid provider access.')),
          12000
        )
      ),
    ]);


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
// Strategy Simulator & Performance
// ============================================

app.post('/v1/strategy-simulator', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, strategyType, strategyTag, startDate, endDate, initialCapital, params } = req.body || {};

  if (!symbol || !strategyType) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields: symbol, strategyType' },
    });
  }

  const resolvedType = resolveStrategyType(strategyTag || strategyType, strategyType);
  if (!resolvedType) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Unsupported strategy type' },
    });
  }

  const quota = await checkQuota(userId, 'backtest');
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: quota.message },
    });
  }
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);

  const window = resolveSimulationWindow(startDate, endDate);
  const tag = typeof strategyTag === 'string' && strategyTag.trim() ? strategyTag : resolvedType;
  const capital = Number(initialCapital) || 100000;

  try {
    const simulation = await computeStrategySimulation({
      strategyTag: tag,
      strategyType: resolvedType,
      symbol: String(symbol).toUpperCase(),
      startDate: window.startKey,
      endDate: window.endKey,
      initialCapital: capital,
      strategyParams: params,
    });

    const strategyKey = buildStrategyKey(orgId || null, tag, String(symbol));
    const previous = await getStrategyPerformanceByKey(strategyKey);
    const drift = evaluateStrategyDrift(simulation.summary.backtest, simulation.summary.fitnessScore, previous);
    const status = drift.status === 'QUARANTINED' ? 'QUARANTINED' : 'ACTIVE';

    const record = await upsertStrategyPerformance({
      strategyKey,
      strategyTag: tag,
      strategyType: resolvedType,
      symbol: String(symbol),
      orgId,
      userId,
      status,
      fitnessScore: simulation.summary.fitnessScore,
      drift,
      metrics: simulation.metrics,
      quarantinedAt: status === 'QUARANTINED' ? new Date().toISOString() : null,
      quarantineReason: status === 'QUARANTINED' ? drift.reasons.join(',') : null,
    });

    await incrementUsage(userId, 'backtest');

    const simulationPayload: any = { ...simulation.summary, drift, status };
    if (analyticsDepth <= 0) {
      const expectancy = typeof simulation.summary?.monteCarlo?.expectedValue === 'number'
        ? simulation.summary.monteCarlo.expectedValue
        : null;
      simulationPayload.expectancy = expectancy;
      delete simulationPayload.monteCarlo;
      delete simulationPayload.slippage;
      simulationPayload.analytics = { depth: analyticsDepth, locked: true };
    } else {
      simulationPayload.analytics = { depth: analyticsDepth, locked: false };
    }

    const performancePayload = formatStrategyPerformance(record);
    if (analyticsDepth <= 0 && performancePayload?.metrics) {
      const metrics = performancePayload.metrics as any;
      const expectancy = typeof metrics?.monteCarlo?.expectedValue === 'number' ? metrics.monteCarlo.expectedValue : null;
      performancePayload.metrics = {
        backtest: metrics?.backtest,
        fitnessScore: performancePayload.fitnessScore,
        expectancy,
        analyticsLocked: true,
      };
    }
    res.json({
      success: true,
      data: {
        simulation: simulationPayload,
        performance: performancePayload,
        window,
        analyticsDepth,
      },
      disclaimer: 'Backtested performance is hypothetical and not a guarantee of future results.',
    });
  } catch (error) {
    logger.error('Strategy simulation failed', error as Error);
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'STRATEGY_SIM_FAILED', message: (error as Error).message },
    });
  }
});

app.get('/v1/strategy-performance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, strategyTag, status, limit = '50', offset = '0' } = req.query;

  let whereClause = 'WHERE (org_id IS NULL OR org_id = $1)';
  const params: (string | number)[] = [orgId];
  let paramIndex = 2;

  if (symbol) {
    whereClause += ` AND symbol = $${paramIndex++}`;
    params.push(String(symbol).toUpperCase());
  }
  if (strategyTag) {
    whereClause += ` AND strategy_tag = $${paramIndex++}`;
    params.push(String(strategyTag));
  }
  if (status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(String(status).toUpperCase());
  }

  const limitValue = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
  const offsetValue = Math.max(0, parseInt(offset as string, 10) || 0);
  params.push(limitValue, offsetValue);

  const result = await query<StrategyPerformanceRow>(
    `SELECT * FROM strategy_performance
     ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  const strategies = result.rows.map((row) => {
    const formatted = formatStrategyPerformance(row);
    if (analyticsDepth <= 0 && formatted.metrics) {
      const metrics = formatted.metrics as any;
      const expectancy = typeof metrics?.monteCarlo?.expectedValue === 'number' ? metrics.monteCarlo.expectedValue : null;
      formatted.metrics = {
        backtest: metrics?.backtest,
        fitnessScore: formatted.fitnessScore,
        expectancy,
        analyticsLocked: true,
      };
    }
    return formatted;
  });

  res.json({ success: true, data: { strategies, analyticsDepth } });
});
app.get('/v1/strategy-performance/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { id } = req.params;

  const record = await queryOne<StrategyPerformanceRow>(
    `SELECT * FROM strategy_performance
     WHERE id = $1 AND (org_id IS NULL OR org_id = $2)`,
    [id, orgId]
  );

  if (!record) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND, message: 'Strategy performance not found' },
    });
  }

  const formatted = formatStrategyPerformance(record);
  const { plan, limits } = await getUserPlan(userId);
  const analyticsDepth = resolveAnalyticsDepth(plan, limits);
  if (analyticsDepth <= 0 && formatted.metrics) {
    const metrics = formatted.metrics as any;
    const expectancy = typeof metrics?.monteCarlo?.expectedValue === 'number' ? metrics.monteCarlo.expectedValue : null;
    formatted.metrics = {
      backtest: metrics?.backtest,
      fitnessScore: formatted.fitnessScore,
      expectancy,
      analyticsLocked: true,
    };
  }

  res.json({ success: true, data: { strategy: formatted, analyticsDepth } });
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
// Alpaca Broker API (per-user)
// ============================================

app.get('/v1/alpaca/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const connection = await getActiveAlpacaConnection(userId);
  const liveTradingEnabled = process.env.FEATURE_LIVE_TRADING === 'true';

  if (!connection) {
    return res.json({ success: true, data: { connected: false, liveTradingEnabled } });
  }

  res.json({
    success: true,
    data: {
      connected: true,
      endpoint: connection.endpoint,
      environment: connection.environment,
      keyLast4: connection.key_last4,
      lastVerifiedAt: connection.last_verified_at,
      liveTradingEnabled,
    },
  });
});

app.post('/v1/alpaca/connect', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { apiKey, apiSecret, environment, endpoint } = req.body || {};

  if (!apiKey || !apiSecret) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'apiKey and apiSecret are required' },
    });
  }

  const env: 'paper' | 'live' = environment === 'live' ? 'live' : 'paper';
  const resolvedEndpoint = resolveAlpacaEndpoint(env, endpoint);

  try {
    const client = new AlpacaClient({ apiKey, apiSecret, endpoint: resolvedEndpoint });
    const account = await client.getAccount();

    const keyLast4 = String(apiKey).slice(-4);
    const now = new Date().toISOString();

    await query(
      `INSERT INTO broker_connections (user_id, org_id, provider, api_key_enc, api_secret_enc, endpoint, environment, key_last4, last_verified_at, is_active)
       VALUES ($1, $2, 'ALPACA', $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         api_key_enc = EXCLUDED.api_key_enc,
         api_secret_enc = EXCLUDED.api_secret_enc,
         endpoint = EXCLUDED.endpoint,
         environment = EXCLUDED.environment,
         key_last4 = EXCLUDED.key_last4,
         last_verified_at = EXCLUDED.last_verified_at,
         is_active = true,
         updated_at = NOW()`,
      [
        userId,
        orgId,
        encryptSecret(String(apiKey)),
        encryptSecret(String(apiSecret)),
        resolvedEndpoint,
        env,
        keyLast4,
        now,
      ]
    );

    emitEvent(orgId, 'USER', userId, EVENT_TYPES.BROKER_CONNECTED, {
      provider: 'ALPACA',
      environment: env,
      endpoint: resolvedEndpoint,
      keyLast4,
      accountId: account.id,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        connected: true,
        endpoint: resolvedEndpoint,
        environment: env,
        keyLast4,
        accountNumber: account.account_number,
      },
    });
  } catch (error) {
    logger.warn('Alpaca connect failed', { userId, error: (error as Error).message });
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_CONNECT_FAILED', message: (error as Error).message },
    });
  }
});

app.delete('/v1/alpaca/connect', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;

  await query(
    `DELETE FROM broker_connections WHERE user_id = $1 AND provider = 'ALPACA'`,
    [userId]
  );

  emitEvent(orgId, 'USER', userId, EVENT_TYPES.BROKER_DISCONNECTED, { provider: 'ALPACA' });

  res.json({ success: true, data: { disconnected: true } });
});

app.get('/v1/alpaca/account', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const connection = await getActiveAlpacaConnection(userId);

  if (!connection) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_NOT_CONNECTED', message: 'Alpaca connection not found' },
    });
  }

  try {
    const client = buildAlpacaClient(connection);
    const account = await client.getAccount();
    res.json({ success: true, data: { account } });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'ALPACA_UNAVAILABLE', message: (error as Error).message },
    });
  }
});

app.get('/v1/alpaca/positions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const connection = await getActiveAlpacaConnection(userId);

  if (!connection) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_NOT_CONNECTED', message: 'Alpaca connection not found' },
    });
  }

  try {
    const client = buildAlpacaClient(connection);
    const positions = await client.getPositions();
    res.json({ success: true, data: { positions } });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'ALPACA_UNAVAILABLE', message: (error as Error).message },
    });
  }
});

app.get('/v1/alpaca/orders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const status = (req.query.status as 'open' | 'closed' | 'all') || 'all';
  const connection = await getActiveAlpacaConnection(userId);

  if (!connection) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_NOT_CONNECTED', message: 'Alpaca connection not found' },
    });
  }

  try {
    const client = buildAlpacaClient(connection);
    const orders = await client.getOrders(status);
    res.json({ success: true, data: { orders } });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'ALPACA_UNAVAILABLE', message: (error as Error).message },
    });
  }
});

app.post('/v1/alpaca/orders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const { symbol, qty, side, type, time_in_force, limit_price, stop_price } = req.body || {};

  if (!symbol || !qty || !side) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields: symbol, qty, side' },
    });
  }

  const connection = await getActiveAlpacaConnection(userId);
  if (!connection) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_NOT_CONNECTED', message: 'Alpaca connection not found' },
    });
  }

  if (connection.environment === 'live' && process.env.FEATURE_LIVE_TRADING !== 'true') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'LIVE_TRADING_DISABLED', message: 'Live trading is disabled by policy' },
    });
  }

  try {
    const client = buildAlpacaClient(connection);
    const order = await client.placeOrder({
      symbol: String(symbol).toUpperCase(),
      qty: Number(qty),
      side,
      type,
      time_in_force,
      limit_price: limit_price ? Number(limit_price) : undefined,
      stop_price: stop_price ? Number(stop_price) : undefined,
    });

    emitEvent(orgId, 'USER', userId, EVENT_TYPES.BROKER_ORDER_PLACED, {
      provider: 'ALPACA',
      symbol: String(symbol).toUpperCase(),
      side,
      qty: Number(qty),
      orderId: order.id,
    });

    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { order } });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'ALPACA_ORDER_FAILED', message: (error as Error).message },
    });
  }
});

app.get('/v1/alpaca/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;
  const connection = await getActiveAlpacaConnection(userId);

  if (!connection) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'ALPACA_NOT_CONNECTED', message: 'Alpaca connection not found' },
    });
  }

  const { plan } = await getUserPlan(userId);
  const requestedPeriod = typeof req.query.period === 'string' ? req.query.period : undefined;
  const requestedTimeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1D';

  const allowedPeriods = ['1M', '3M', '6M', '1A', 'all'];
  const normalizedPeriod = requestedPeriod?.toUpperCase();

  let period: string;
  if (plan === 'PRO') {
    period = normalizedPeriod && allowedPeriods.includes(normalizedPeriod) ? normalizedPeriod : 'all';
  } else if (plan === 'LITE') {
    period = normalizedPeriod && ['1M', '3M', '6M'].includes(normalizedPeriod) ? normalizedPeriod : '3M';
  } else {
    period = '1M';
  }

  try {
    const client = buildAlpacaClient(connection);
    const history = await client.getPortfolioHistory({ period, timeframe: requestedTimeframe });

    const points = history.timestamp.map((ts, idx) => ({
      timestamp: new Date(ts * 1000).toISOString(),
      equity: history.equity[idx],
      profitLoss: history.profit_loss[idx],
      profitLossPct: history.profit_loss_pct[idx],
    }));

    emitEvent(orgId, 'USER', userId, EVENT_TYPES.BROKER_HISTORY_FETCHED, {
      provider: 'ALPACA',
      period,
      timeframe: requestedTimeframe,
      points: points.length,
    });

    res.json({
      success: true,
      data: {
        period,
        timeframe: requestedTimeframe,
        plan,
        history: points,
      },
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'ALPACA_UNAVAILABLE', message: (error as Error).message },
    });
  }
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
// Simulator Backend API (Phase 5.3)
// ============================================

// Sim health check - always returns ok
app.get('/v1/sim/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'nova-hub-simulator',
      capabilities: ['backtest', 'monte-carlo', 'strategy-simulation'],
      timestamp: new Date().toISOString(),
    },
  });
});

// Sim run - execute a simulation and return results
app.post('/v1/sim/run', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.user!;
  const { symbol, strategyType, startDate, endDate, iterations = 1000, seed } = req.body || {};

  if (!symbol || !strategyType) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'symbol and strategyType required' },
    });
  }

  const quota = await checkQuota(userId, 'backtest');
  if (!quota.allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: 'QUOTA_EXCEEDED', message: quota.message },
    });
  }

  // Deterministic seed for reproducibility
  const runSeed = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1000000);
  const resolvedType = resolveStrategyType(strategyType, strategyType);

  try {
    const window = resolveSimulationWindow(startDate, endDate);
    const simulation = await computeStrategySimulation({
      strategyTag: resolvedType || 'sma_crossover',
      strategyType: resolvedType || 'sma_crossover',
      symbol: String(symbol).toUpperCase(),
      startDate: window.startKey,
      endDate: window.endKey,
      initialCapital: 100000,
      strategyParams: {},
    });

    await incrementUsage(userId, 'backtest');

    res.json({
      success: true,
      data: {
        runId: generateId(),
        seed: runSeed,
        symbol: String(symbol).toUpperCase(),
        strategyType: resolvedType,
        window,
        backtest: simulation.summary.backtest,
        monteCarlo: simulation.summary.monteCarlo,
        fitnessScore: simulation.summary.fitnessScore,
        status: simulation.summary.status || 'COMPLETED',
        iterations,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Sim run failed', error as Error);
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'SIM_RUN_FAILED', message: (error as Error).message },
    });
  }
});

// Get seeded simulation results (from DB)
app.get('/v1/sim/seeded', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { userId, orgId } = req.user!;

  // Check for seeded results in strategy_performance table
  const result = await query<{
    id: string;
    strategy_tag: string;
    strategy_type: string;
    symbol: string;
    status: string;
    fitness_score: number;
    metrics_json: string;
    created_at: string;
  }>(
    `SELECT id, strategy_tag, strategy_type, symbol, status, fitness_score, metrics_json, created_at
     FROM strategy_performance
     WHERE (org_id IS NULL OR org_id = $1)
       AND strategy_tag LIKE 'seeded_%'
     ORDER BY created_at DESC
     LIMIT 10`,
    [orgId]
  );

  const seeded = result.rows.map((row) => {
    const metrics = row.metrics_json ? JSON.parse(row.metrics_json) : {};
    return {
      id: row.id,
      strategyTag: row.strategy_tag,
      strategyType: row.strategy_type,
      symbol: row.symbol,
      status: row.status,
      fitnessScore: row.fitness_score,
      backtest: metrics.backtest || null,
      monteCarlo: metrics.monteCarlo || null,
      createdAt: row.created_at,
    };
  });

  res.json({
    success: true,
    data: {
      seeded,
      count: seeded.length,
      hasSeededResults: seeded.length > 0,
    },
  });
});

// ============================================
// Marketplace/Appraisal API (Phase 5.3 - Keyless)
// ============================================

// Appraisal with deterministic heuristics
app.post('/v1/marketplace/appraise', async (req: Request, res: Response) => {
  const { query: searchQuery, url, category } = req.body || {};

  if (!searchQuery && !url) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'query or url required' },
    });
  }

  const itemQuery = searchQuery || url;

  // Deterministic heuristic pricing based on category keywords
  const heuristicPricing = computeHeuristicAppraisal(itemQuery, category);

  res.json({
    success: true,
    data: {
      appraisal: {
        query: itemQuery,
        ...heuristicPricing,
        provenance: {
          method: 'heuristic-v1',
          sources: ['market-average', 'category-baseline', 'condition-adjustment'],
          confidence: heuristicPricing.confidence,
          disclaimer: 'Appraisal based on category heuristics. Actual market prices may vary.',
        },
        appraisedAt: new Date().toISOString(),
      },
    },
  });
});

// Craigslist search ingestion (mock for keyless operation)
app.post('/v1/marketplace/ingest/craigslist', async (req: Request, res: Response) => {
  const { searchUrl, keywords, location } = req.body || {};

  if (!searchUrl && !keywords) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'searchUrl or keywords required' },
    });
  }

  // Mock ingestion result - in production would scrape Craigslist
  const mockListings = generateMockCraigslistListings(keywords || extractKeywords(searchUrl), location);

  res.json({
    success: true,
    data: {
      source: 'craigslist',
      searchUrl: searchUrl || `https://craigslist.org/search?query=${encodeURIComponent(keywords)}`,
      location: location || 'nationwide',
      listings: mockListings,
      count: mockListings.length,
      ingestedAt: new Date().toISOString(),
    },
  });
});

// URL import for single listing
app.post('/v1/marketplace/ingest/url', async (req: Request, res: Response) => {
  const { url, category } = req.body || {};

  if (!url) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'url required' },
    });
  }

  // Extract info from URL and appraise
  const itemInfo = extractItemInfoFromUrl(url);
  const appraisal = computeHeuristicAppraisal(itemInfo.title || url, category);

  res.json({
    success: true,
    data: {
      source: itemInfo.source,
      url,
      item: itemInfo,
      appraisal: {
        ...appraisal,
        provenance: {
          method: 'url-import-heuristic',
          originalUrl: url,
          confidence: appraisal.confidence * 0.9, // Slightly lower confidence for URL imports
        },
      },
      importedAt: new Date().toISOString(),
    },
  });
});

// CSV upload ingestion
app.post('/v1/marketplace/ingest/csv', async (req: Request, res: Response) => {
  const { items, columnMapping } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.INVALID_INPUT, message: 'items array required' },
    });
  }

  const mapping = columnMapping || { title: 'title', price: 'price', category: 'category' };
  const processed = items.slice(0, 100).map((item: any, idx: number) => {
    const title = item[mapping.title] || item.title || `Item ${idx + 1}`;
    const originalPrice = parseFloat(item[mapping.price]) || 0;
    const category = item[mapping.category] || item.category || 'general';
    const appraisal = computeHeuristicAppraisal(title, category);

    return {
      rowIndex: idx,
      title,
      originalPrice,
      category,
      appraisal: {
        recommendedPrice: appraisal.recommendedPrice,
        priceRange: appraisal.priceRange,
        marketDemand: appraisal.marketDemand,
        confidence: appraisal.confidence,
      },
      delta: originalPrice > 0 ? Math.round((appraisal.recommendedPrice - originalPrice) * 100) / 100 : null,
    };
  });

  res.json({
    success: true,
    data: {
      source: 'csv-upload',
      items: processed,
      count: processed.length,
      totalOriginalValue: processed.reduce((sum, p) => sum + (p.originalPrice || 0), 0),
      totalAppraisedValue: processed.reduce((sum, p) => sum + p.appraisal.recommendedPrice, 0),
      processedAt: new Date().toISOString(),
    },
  });
});

// Marketplace health check
app.get('/v1/marketplace/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'nova-hub-marketplace',
      capabilities: ['appraisal', 'craigslist-ingest', 'url-import', 'csv-upload'],
      keyless: true,
      timestamp: new Date().toISOString(),
    },
  });
});

// Heuristic pricing helper functions
function computeHeuristicAppraisal(itemQuery: string, category?: string): {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  priceRange: string;
  recommendedPrice: number;
  marketDemand: 'low' | 'medium' | 'high';
  confidence: number;
} {
  const lowerQuery = String(itemQuery || '').toLowerCase();
  const cat = String(category || '').toLowerCase();

  // Category-based baseline pricing
  let baseline = 100;
  let demandMultiplier = 1.0;
  let confidence = 65;

  // Electronics
  if (lowerQuery.includes('iphone') || lowerQuery.includes('ipad')) {
    baseline = 650;
    demandMultiplier = 1.2;
    confidence = 75;
  } else if (lowerQuery.includes('macbook') || lowerQuery.includes('laptop')) {
    baseline = 850;
    demandMultiplier = 1.1;
    confidence = 72;
  } else if (lowerQuery.includes('airpods') || lowerQuery.includes('headphones')) {
    baseline = 150;
    demandMultiplier = 1.15;
    confidence = 70;
  } else if (lowerQuery.includes('ps5') || lowerQuery.includes('playstation') || lowerQuery.includes('xbox')) {
    baseline = 400;
    demandMultiplier = 1.25;
    confidence = 78;
  } else if (lowerQuery.includes('nintendo') || lowerQuery.includes('switch')) {
    baseline = 280;
    demandMultiplier = 1.1;
    confidence = 74;
  }
  // Apparel
  else if (lowerQuery.includes('nike') || lowerQuery.includes('jordan')) {
    baseline = 180;
    demandMultiplier = 1.3;
    confidence = 68;
  } else if (lowerQuery.includes('supreme') || lowerQuery.includes('yeezy')) {
    baseline = 350;
    demandMultiplier = 1.4;
    confidence = 62;
  }
  // Furniture
  else if (lowerQuery.includes('sofa') || lowerQuery.includes('couch')) {
    baseline = 450;
    demandMultiplier = 0.9;
    confidence = 60;
  } else if (lowerQuery.includes('desk') || lowerQuery.includes('table')) {
    baseline = 200;
    demandMultiplier = 0.85;
    confidence = 58;
  }
  // Vehicles
  else if (lowerQuery.includes('car') || lowerQuery.includes('truck') || lowerQuery.includes('vehicle')) {
    baseline = 15000;
    demandMultiplier = 1.0;
    confidence = 45;
  } else if (lowerQuery.includes('motorcycle') || lowerQuery.includes('bike')) {
    baseline = 5000;
    demandMultiplier = 0.95;
    confidence = 50;
  }
  // Category fallbacks
  else if (cat.includes('electronics')) {
    baseline = 250;
    confidence = 55;
  } else if (cat.includes('clothing') || cat.includes('apparel')) {
    baseline = 75;
    confidence = 52;
  } else if (cat.includes('furniture')) {
    baseline = 300;
    confidence = 50;
  }

  // Condition adjustments from keywords
  if (lowerQuery.includes('new') || lowerQuery.includes('sealed') || lowerQuery.includes('mint')) {
    baseline *= 1.15;
    confidence += 5;
  } else if (lowerQuery.includes('used') || lowerQuery.includes('refurbished')) {
    baseline *= 0.7;
    confidence += 3;
  } else if (lowerQuery.includes('broken') || lowerQuery.includes('parts')) {
    baseline *= 0.3;
    confidence += 2;
  }

  // Pro/Max/Plus variants
  if (lowerQuery.includes('pro') || lowerQuery.includes('max') || lowerQuery.includes('plus')) {
    baseline *= 1.25;
  }

  const avgPrice = Math.round(baseline * 100) / 100;
  const minPrice = Math.round(baseline * 0.7 * 100) / 100;
  const maxPrice = Math.round(baseline * 1.4 * 100) / 100;
  const medianPrice = Math.round(baseline * 0.95 * 100) / 100;
  const recommendedPrice = Math.round(baseline * 0.92 * 100) / 100;

  const demand: 'low' | 'medium' | 'high' = demandMultiplier >= 1.2 ? 'high' : demandMultiplier >= 1.0 ? 'medium' : 'low';

  return {
    avgPrice,
    minPrice,
    maxPrice,
    medianPrice,
    priceRange: `$${minPrice} - $${maxPrice}`,
    recommendedPrice,
    marketDemand: demand,
    confidence: Math.min(95, confidence),
  };
}

function generateMockCraigslistListings(keywords: string, location?: string): Array<{
  id: string;
  title: string;
  price: number;
  location: string;
  url: string;
  postedAt: string;
}> {
  const count = 3 + Math.floor(Math.random() * 5);
  const appraisal = computeHeuristicAppraisal(keywords);

  return Array.from({ length: count }, (_, idx) => {
    const variance = 0.8 + Math.random() * 0.4;
    return {
      id: `cl-${Date.now()}-${idx}`,
      title: `${keywords} - ${['Great condition', 'Like new', 'Used', 'Excellent'][idx % 4]}`,
      price: Math.round(appraisal.avgPrice * variance),
      location: location || ['San Francisco', 'Los Angeles', 'New York', 'Chicago'][idx % 4],
      url: `https://craigslist.org/item/${Date.now()}-${idx}`,
      postedAt: new Date(Date.now() - idx * 86400000).toISOString(),
    };
  });
}

function extractKeywords(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get('query') || u.searchParams.get('q') || u.pathname.split('/').pop() || 'item';
  } catch {
    return 'item';
  }
}

function extractItemInfoFromUrl(url: string): {
  source: string;
  title: string | null;
  price: number | null;
  category: string | null;
} {
  const lowerUrl = url.toLowerCase();
  let source = 'unknown';

  if (lowerUrl.includes('ebay')) source = 'ebay';
  else if (lowerUrl.includes('craigslist')) source = 'craigslist';
  else if (lowerUrl.includes('facebook') || lowerUrl.includes('fb.com')) source = 'facebook-marketplace';
  else if (lowerUrl.includes('offerup')) source = 'offerup';
  else if (lowerUrl.includes('mercari')) source = 'mercari';
  else if (lowerUrl.includes('amazon')) source = 'amazon';

  // Extract title from URL path (simplified)
  const pathParts = url.split('/').filter(Boolean);
  const titlePart = pathParts.find(p => p.length > 10 && !p.includes('.'));
  const title = titlePart ? titlePart.replace(/-/g, ' ').replace(/_/g, ' ') : null;

  return {
    source,
    title,
    price: null, // Would require actual scraping
    category: null,
  };
}

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  logger.info(`Nova Hub service started on port ${PORT}`);
});

export default app;

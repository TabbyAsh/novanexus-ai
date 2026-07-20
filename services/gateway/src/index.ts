import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  RATE_LIMITS,
  ERROR_CODES,
  verifyToken,
  checkRateLimit,
  queryOne,
  query,
  buildDecisionCard,
  novaCardInsert,
  novaCardFromRow,
  CardTypeSchema,
} from '@nova/shared';
import type {
  JWTPayload,
  Scope,
  DecisionCard,
  CardType,
  RecommendedAction,
  RiskLevel,
  NovaCardRow,
} from '@nova/shared';

const app = express();
const logger = createLogger('gateway-service');
const PORT = process.env.PORT || SERVICE_PORTS.GATEWAY;

// Service URLs
const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  orchestrator: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
  eventbus: process.env.EVENTBUS_URL || 'http://localhost:3003',
  billing: process.env.BILLING_URL || 'http://localhost:3006',
  tradebot: process.env.TRADEBOT_URL || 'http://localhost:3010',
  storebot: process.env.STOREBOT_URL || 'http://localhost:3011',
  socialbot: process.env.SOCIALBOT_URL || 'http://localhost:3012',
  researchbot: process.env.RESEARCHBOT_URL || 'http://localhost:3013',
  opsbot: process.env.OPSBOT_URL || 'http://localhost:3014',
  marketdata: process.env.MARKETDATA_URL || 'http://localhost:3020',
  commercedata: process.env.COMMERCEDATA_URL || 'http://localhost:3022',
  novaHub: process.env.NOVA_HUB_URL || 'http://localhost:3030',
  scheduler: process.env.SCHEDULER_URL || 'http://localhost:3040',
};

// Route to required scopes mapping
const ROUTE_SCOPES: Record<string, Scope[]> = {
  '/v1/trade': ['trade.read'],
  '/v1/trade/scan': ['trade.read'],
  '/v1/trade/backtest': ['trade.backtest'],
  '/v1/trade/paper': ['trade.paper.execute'],
  '/v1/trade/live': ['trade.live.execute'],
  '/v1/store': ['store.read'],
  '/v1/store/products': ['store.read', 'store.write'],
  '/v1/store/orders': ['store.orders'],
  '/v1/social': ['social.read'],
  '/v1/social/post': ['social.post'],
  '/v1/social/schedule': ['social.schedule'],
  '/v1/research': ['research.read'],
  '/v1/research/propose': ['research.propose'],
  '/v1/kill-switch': ['admin.killswitch'],
};

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/v1/bootstrap/',   // one-time admin setup — remove after use
  '/v1/cards/intake', // situation intake — public (3 free/month)
  '/v1/cards/outcome', // Phase 1: mark what happened (visitor-scoped)
  '/v1/cards/calibration', // Phase 1: Nova's real track record (honest 0-state)
  '/v1/cards/mine', // Phase 1: a visitor's own cards to resolve
  '/health',
  '/version',
  '/v1/auth/register',
  '/v1/auth/signup',
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/billing/pricing',
  '/v1/billing/founding-seats',
  '/v1/billing/tiers',
  '/billing/webhook',  // Stripe webhook - authenticated by signature
  // Nova Nexus AI - public status
  '/v1/nexus/status',
  '/v1/nexus/initialize',
  '/v1/nexus/analyze',
  '/v1/nexus/ledger',
  // Platform stats + brief proof (public for landing page)
  '/v1/platform/stats',
  '/v1/platform/brief-proof',
  // System health/reality check (must be public for banner)
  '/v1/reality',
  // Diagnostic (public for debugging)
  '/v1/diagnostic/',
  // Referral validation (public)
  '/v1/referrals/validate/',
  // AI Screener - public for demo
  '/v1/ai-screener/',
  // Market scanning - public for demo
  '/v1/trade/scan',
  // Simulator - health check public (Phase 5.3)
  '/v1/sim/health',
  // Marketplace - public for demo (Phase 5.3)
  '/v1/marketplace/health',
  '/v1/marketplace/appraise',
  '/v1/marketplace/ingest/',
  // Value Radar - public for landing page
  '/v1/value-radar/',
  // Trend Radar - public teaser for landing page / sharing
  '/v1/trends/public',
  // Dashboard stats
  '/v1/dashboard/',
  // Flip Card — public decision product
  '/v1/flip/',
  '/v1/flip-card/',
  // The World — public arrival surface (pulse + hail)
  '/v1/world/',
  // The constitution organs (Phases 1-5) — nova-hub seals each behind the
  // world key itself; the gateway only carries them.
  '/v1/vault/',
  '/v1/lattice',
  '/v1/mindspace/',
  '/v1/intents',
  '/v1/grounding/',
  // Agent eval leaderboard — public read (Forge Control surface)
  '/v1/agents/evals/leaderboard',
  // Sovereign Mind Layer provider health — public read (Forge Control)
  '/v1/agents/providers',
];

// Premium features that require paid plan (LITE or higher)
// NOTE: Core features (screener, scanner) are now accessible to ALL logged-in users.
// Paywall only blocks truly premium features that have meaningful compute cost.
const PREMIUM_FEATURES: Record<string, string> = {
  // Core product — accessible to all logged-in users (no paywall)
  // '/v1/trade/scan': 'scanner',        // Removed: core product must work
  // '/v1/screener': 'scanner',           // Removed: core product must work
  // '/v1/market/indicators': 'scanner',  // Removed: needed for screener
  // Paywalled premium features
  '/v1/trade/theses': 'thesis_cards',
  '/v1/trade/paper-trades': 'paper_trading',
  '/v1/signals': 'alerts',
  '/v1/decisions': 'decisions',
};

// Routes that don't require Stripe webhook auth
const WEBHOOK_ROUTES = ['/billing/webhook'];

// Extend Express Request to include auth and entitlement
declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
      entitlement?: {
        plan: string;
        features: string[];
      };
    }
  }
}

app.use(express.json({ limit: '1mb' })); // Limit payload size

// ==========================================================================
// SECURITY HEADERS MIDDLEWARE
// ==========================================================================
const ALLOWED_ORIGINS = [
  // Local dev (explicit)
  'http://localhost:3000',
  'http://localhost:3100',

  // Production
  'https://novanexus-ai.com',
  'https://www.novanexus-ai.com',
  'https://novanexus-ai.vercel.app',
];

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // HSTS for production (force HTTPS)
  if (process.env.NODE_ENV === 'production' || req.headers.host?.includes('novanexus')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://*.railway.app https://*.up.railway.app https://api.alpaca.markets wss:; " +
    "frame-ancestors 'none';"
  );
  
  next();
});

// CORS middleware with origin validation
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  // NOTE: When we reflect Origin dynamically, ensure caches don't mix origins.
  res.setHeader('Vary', 'Origin');
  
  // Check if origin is allowed
  if (origin && (isLocalhostOrigin(origin) || ALLOWED_ORIGINS.includes(origin) || origin.includes('vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without origin (server-to-server, curl, etc)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Rate limiting middleware (Redis-backed)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.headers.authorization
      ? `user:${req.headers.authorization.substring(7, 20)}`
      : `ip:${req.ip || 'unknown'}`;

    const isAuthRoute = req.path.startsWith('/v1/auth/');
    const limit = isAuthRoute
      ? RATE_LIMITS.AUTH_ATTEMPTS_PER_MINUTE
      : RATE_LIMITS.API_REQUESTS_PER_MINUTE;

    const result = await checkRateLimit(clientId, limit, 60);

    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.resetAt.toString());

    if (!result.allowed) {
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Rate limit exceeded. Retry after reset window.',
        },
      });
    }

    next();
  } catch (error) {
    // If Redis fails, allow the request but log it
    logger.error('Rate limiting check failed', error as Error);
    next();
  }
});

// Authentication middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Check if route is public
  if (PUBLIC_ROUTES.some((r) => req.path === r || req.path.startsWith(r))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Missing or invalid authorization header' },
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid or expired token' },
    });
  }

  if (payload.type !== 'access') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid token type' },
    });
  }

  req.auth = payload;
  next();
});

// Paywall middleware - Check entitlements for premium features
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Skip for public routes or routes without auth
  if (!req.auth) {
    return next();
  }

  // Check if route requires premium feature
  const matchingFeature = Object.entries(PREMIUM_FEATURES).find(([route]) => 
    req.path.startsWith(route)
  );

  if (!matchingFeature) {
    return next();
  }

  const [, requiredFeature] = matchingFeature;

  try {
    // Call billing service to check entitlement
    const response = await fetch(`${SERVICE_URLS.billing}/internal/check-entitlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: req.auth.userId, feature: requiredFeature }),
    });

    const result = await response.json() as {
      success: boolean;
      data?: {
        allowed: boolean;
        reason?: string;
        requiredPlan?: string;
        plan?: string;
        features?: string[];
      };
    };

    if (!result.success || !result.data?.allowed) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: result.data?.reason || `This feature requires a paid subscription`,
          requiredPlan: result.data?.requiredPlan || 'LITE',
          upgradeUrl: '/pricing',
        },
      });
    }

    // Attach entitlement info to request
    req.entitlement = {
      plan: result.data.plan,
      features: result.data.features,
    };

    next();
  } catch (error) {
    // If billing service is down, allow request but log warning
    logger.warn('Entitlement check failed, allowing request', { error: (error as Error).message });
    next();
  }
});

// Kill switch check middleware (for automation routes)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Skip for non-automation routes
  const automationRoutes = ['/v1/trade', '/v1/store', '/v1/social', '/v1/research'];
  const isAutomationRoute = automationRoutes.some((r) => req.path.startsWith(r));

  if (!isAutomationRoute || req.method === 'GET') {
    return next();
  }

  try {
    const result = await queryOne<{ value_json: string }>(
      "SELECT value_json FROM system_state WHERE key = 'kill_switch'"
    );

    if (result) {
      const state = JSON.parse(result.value_json);
      if (state.enabled) {
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          success: false,
          error: {
            code: ERROR_CODES.AUTOMATION_DISABLED,
            message: 'Automation is currently disabled by kill switch',
            details: { reason: state.reason, enabledAt: state.enabledAt },
          },
        });
      }
    }
  } catch (error) {
    logger.error('Failed to check kill switch', error as Error);
  }

  next();
});

// Scope check middleware
function requireScopes(scopes: Scope[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const hasScope = scopes.some((s) => req.auth!.scopes.includes(s));
    if (!hasScope) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          message: `Requires one of: ${scopes.join(', ')}`,
        },
      });
    }

    next();
  };
}

// Logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.headers['x-request-id'],
    userId: req.auth?.userId,
    orgId: req.auth?.orgId,
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'gateway',
    timestamp: new Date().toISOString(),
  });
});

// Basic metrics endpoint for monitoring
const startTime = Date.now();
let requestCount = 0;
let errorCount = 0;

app.use((_req: Request, _res: Response, next: NextFunction) => {
  requestCount++;
  next();
});

app.get('/metrics', (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const memUsage = process.memoryUsage();
  
  res.json({
    service: 'gateway',
    uptime_seconds: uptime,
    requests_total: requestCount,
    errors_total: errorCount,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// Version endpoint for deployment tracking
// Environment detection: Railway sets RAILWAY_ENVIRONMENT for all deploys
const IS_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
const DEPLOY_ENV = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'development';

// Git SHA detection:
// - GIT_SHA: Injected by deploy-prod.js from local HEAD (preferred)
// - RAILWAY_GIT_COMMIT_SHA: Set by Railway for GitHub-triggered deploys
// - Must be a valid 7-40 char hex string to qualify as gitSha
const GIT_SHA_RAW = process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || '';
const DEPLOY_TIMESTAMP = process.env.RAILWAY_DEPLOYMENT_TIMESTAMP || new Date().toISOString();

// Validate that a string is a valid git SHA (7-40 hex chars)
function isValidGitSha(sha: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(sha);
}

// Determine build info with separate gitSha and deployId
interface BuildInfo {
  buildId: string;   // Short identifier for build (sha prefix or cli-timestamp)
  gitSha: string;    // Full git SHA if available, empty string otherwise
  deployId: string;  // Deployment identifier (timestamp-based for CLI deploys)
}

function getBuildIdentifier(): BuildInfo {
  const validSha = isValidGitSha(GIT_SHA_RAW) ? GIT_SHA_RAW : '';
  const ts = new Date(DEPLOY_TIMESTAMP).toISOString().replace(/[-:T]/g, '').substring(0, 14);
  
  if (validSha) {
    // We have a real git SHA
    return {
      buildId: validSha.substring(0, 7),
      gitSha: validSha,
      deployId: `deploy-${ts}`,
    };
  }
  
  // No valid git SHA - use timestamp-based identifiers
  if (IS_RAILWAY || DEPLOY_ENV === 'production') {
    return {
      buildId: `cli-${ts}`,
      gitSha: '',  // Empty - no valid SHA available
      deployId: `cli-deploy-${DEPLOY_TIMESTAMP}`,
    };
  }
  
  // Local development
  return {
    buildId: 'local',
    gitSha: '',
    deployId: 'local-dev',
  };
}

const BUILD_INFO = getBuildIdentifier();

app.get('/version', (_req: Request, res: Response) => {
  res.json({
    service: 'nova-nexus-api',
    version: '1.0.0',
    buildId: BUILD_INFO.buildId,
    gitSha: BUILD_INFO.gitSha,
    deployId: BUILD_INFO.deployId,
    // Legacy field for backwards compatibility (deprecated)
    build: BUILD_INFO.buildId,
    commitSha: BUILD_INFO.gitSha || BUILD_INFO.deployId,
    deployedAt: DEPLOY_TIMESTAMP,
    environment: DEPLOY_ENV,
    railway: IS_RAILWAY,
    features: {
      progressiveBroker: true,
      serverManagedAlpaca: !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY),
      marketplace: true,
      simulator: true,
    },
  });
});

// ============================================
// Proxy helper
// ============================================

async function proxyRequestRewrite(targetUrl: string, targetPath: string, req: Request, res: Response): Promise<void> {
  try {
    const url = `${targetUrl}${targetPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': req.headers['x-request-id'] as string,
    };

    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    if (req.auth) {
      headers['X-User-ID'] = req.auth.userId;
      headers['X-Org-ID'] = req.auth.orgId;
      headers['X-User-Role'] = req.auth.role;
    }

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    }

    if (contentType?.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (error) {
    logger.error('Proxy request failed', error as Error, { targetUrl, path: targetPath });
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
    });
  }
}

async function proxyRequest(targetUrl: string, req: Request, res: Response): Promise<void> {
  try {
    const url = `${targetUrl}${req.originalUrl}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': req.headers['x-request-id'] as string,
    };

    // Forward auth header
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // The world key (Nova OS door) must survive the hop to nova-hub.
    if (req.headers['x-world-key']) {
      headers['X-World-Key'] = req.headers['x-world-key'] as string;
    }

    // True client IP — downstream per-IP rate limits (hail, unlock) are
    // meaningless if every request arrives wearing the gateway's address.
    const xff = (req.headers['x-forwarded-for'] as string) || req.ip;
    if (xff) {
      headers['X-Forwarded-For'] = xff;
    }

    // Add user context headers
    if (req.auth) {
      headers['X-User-ID'] = req.auth.userId;
      headers['X-Org-ID'] = req.auth.orgId;
      headers['X-User-Role'] = req.auth.role;
    }

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    // Copy response headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    }

    if (contentType?.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).send(text);
    }
  } catch (error) {
    logger.error('Proxy request failed', error as Error, { targetUrl, path: req.path });
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
    });
  }
}

// ============================================
// Route Handlers
// ============================================

// Auth routes -> Auth service (public)
app.all('/v1/auth/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.auth, req, res);
});

app.get('/v1/me', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.auth, req, res);
});

app.all('/v1/policies*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.auth, req, res);
});

// Goal/Task routes -> Orchestrator
app.all('/v1/goals*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

app.all('/v1/tasks*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

app.all('/v1/approvals*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

app.all('/v1/kill-switch*', requireScopes(['admin.killswitch']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

app.get('/v1/stats', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

// Event routes -> EventBus
app.all('/v1/events*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.eventbus, req, res);
});

app.all('/v1/subscriptions*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.eventbus, req, res);
});

// Trade routes -> TradeBot
// Direct API mapping for trade functionality
app.all('/v1/trade/scan', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/scan', req, res);
});

// TRADE Decision Card analysis (Sprint Zero T8)
app.post('/v1/trade/analyze', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/trade/analyze', req, res);
});

app.all('/v1/trade/theses', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/theses', req, res);
});

app.all('/v1/trade/paper-trades', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/trades', req, res);
});

app.all('/v1/trade/paper-trades/:id/close', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, `/api/trades/${req.params.id}/close`, req, res);
});

app.all('/v1/trade/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.tradebot, req, res);
});

app.all('/v1/watchlists*', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.tradebot, req, res);
});

app.all('/v1/signals*', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.tradebot, req, res);
});

// Alerts routes -> TradeBot
app.all('/v1/alerts*', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, req.path.replace('/v1/alerts', '/api/alerts'), req, res);
});

// Export routes -> TradeBot (CSV downloads)
app.get('/v1/export/trades.csv', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/export/trades.csv', req, res);
});

app.get('/v1/export/scan.csv', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/export/scan.csv', req, res);
});

app.get('/v1/export/theses.csv', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/export/theses.csv', req, res);
});

// Store routes -> StoreBot (basic inventory - still stub for MVP)
app.get('/v1/store/products', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { products: [] },
    trace: { service: 'storebot', status: 'stub', reason: 'Inventory module pending' }
  });
});

app.get('/v1/store/products/catalog', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { products: [] },
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.get('/v1/store/alerts', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { alerts: [] },
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.get('/v1/store/pricing-recommendations', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { recommendations: [] },
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.get('/v1/store/pricing/analyze', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { recommendations: [], analyzedAt: new Date().toISOString() },
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.post('/v1/store/pricing/apply', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { applied: false, reason: 'Inventory module pending' }
  });
});

// Store appraise -> Nova Hub marketplace appraisal (Phase 5.3)
app.post('/v1/store/products/appraise', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.novaHub, '/v1/marketplace/appraise', req, res);
});

// Phase 7: Dropshipping MVP routes -> StoreBot
app.post('/v1/dropship/generate', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/dropship/generate', req, res);
});

app.get('/v1/dropship/drafts', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/dropship/drafts', req, res);
});

app.get('/v1/dropship/drafts/:id', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, `/api/dropship/drafts/${req.params.id}`, req, res);
});

app.get('/v1/dropship/export/:id', (req: Request, res: Response) => {
  const qs = req.originalUrl.split('?')[1] || '';
  proxyRequestRewrite(SERVICE_URLS.storebot, `/api/dropship/export/${req.params.id}${qs ? '?' + qs : ''}`, req, res);
});

app.get('/v1/dropship/export', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/dropship/export', req, res);
});

// Catch-all for other store routes
app.all('/v1/store/*', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {},
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.all('/v1/products*', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { products: [] },
    trace: { service: 'storebot', status: 'stub' }
  });
});

app.all('/v1/orders*', requireScopes(['store.orders']), (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { orders: [] },
    trace: { service: 'storebot', status: 'stub' }
  });
});

// ============================================
// Flip Card Routes -> Nova Hub (public decision product)
// ============================================
app.all('/v1/flip/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/flip-card/analyze', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/flip-card/stats', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/flip-card/result/:id', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Marketplace & Appraisal Routes -> Nova Hub (Phase 5.3)
// ============================================

app.get('/v1/marketplace/health', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/marketplace/appraise', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/marketplace/ingest/craigslist', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/marketplace/ingest/url', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/marketplace/ingest/csv', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Simulator Routes -> Nova Hub (Phase 5.3)
// ============================================

app.get('/v1/sim/health', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/sim/run', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/sim/seeded', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Social routes -> SocialBot
app.get('/v1/social/posts', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/posts', req, res);
});

app.get('/v1/social/sentiment', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/sentiment', req, res);
});

app.get('/v1/social/engagement', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/engagement', req, res);
});

app.get('/v1/social/alerts', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/alerts', req, res);
});

// Phase 7: Social MVP routes -> SocialBot
app.post('/v1/social/plan/generate', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/social/plan/generate', req, res);
});

app.get('/v1/social/plans', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/social/plans', req, res);
});

app.get('/v1/social/plans/:id', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, `/api/social/plans/${req.params.id}`, req, res);
});

app.get('/v1/social/plan/export/:id', (req: Request, res: Response) => {
  const qs = req.originalUrl.split('?')[1] || '';
  proxyRequestRewrite(SERVICE_URLS.socialbot, `/api/social/plan/export/${req.params.id}${qs ? '?' + qs : ''}`, req, res);
});

app.get('/v1/social/drafts/export', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.socialbot, '/api/social/drafts/export', req, res);
});

app.all('/v1/social/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.socialbot, req, res);
});

// Content Engine routes -> Nova Hub (generate/drafts are nova-hub; everything else is socialbot)
app.post('/v1/content/generate', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/content/drafts', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Social Content Manager routes -> SocialBot (accounts, posts, suggestions, calendar, analytics)
app.all('/v1/content/*', (req: Request, res: Response) => {
  proxyRequestRewrite(
    SERVICE_URLS.socialbot,
    req.originalUrl.replace('/v1/content', '/api/content'),
    req,
    res
  );
});

// Research routes -> ResearchBot
app.all('/v1/research/*', requireScopes(['research.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.researchbot, req, res);
});

app.all('/v1/kb*', requireScopes(['research.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.researchbot, req, res);
});

app.all('/v1/proposals*', requireScopes(['research.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.researchbot, req, res);
});

// Ops routes -> OpsBot
app.all('/v1/ops/*', requireScopes(['ops.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.opsbot, req, res);
});

// Admin routes -> Nova Hub (founder-only: requires ops.admin scope)
app.all('/v1/admin/*', requireScopes(['ops.admin']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Governance mode -> Nova Hub
app.all('/v1/governance/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Business OS (CRM/pipeline) -> Nova Hub
app.all('/v1/business/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// NovaCore (the central AI command center) -> Nova Hub
app.all('/v1/nova/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Trend Radar -> Nova Hub (demand-detection engine; /public is unauthenticated)
app.all('/v1/trends*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Nova Hub routes -> Nova Hub service (Journal / Backtests / Thesis / Portfolio)
app.all('/v1/journal*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/decisions*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/decision-cards*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/guided*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/usage', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/backtest*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/strategy-performance*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/strategy-simulator*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/thesis*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/portfolio*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/alerts*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/screener*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/scanner*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/alpaca*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Weekly improvement report -> Nova Hub
app.get('/v1/weekly-report', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Flip pipeline -> StoreBot
app.all('/v1/flips*', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, req.originalUrl.replace('/v1/flips', '/api/flips'), req, res);
});

// Mode control -> Nova Hub
app.all('/v1/ops/modes*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Bootstrap (one-time admin setup, public, secret-protected internally)
app.all('/v1/bootstrap/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Situation intake — public (no auth needed for first 3 free cards)
app.all('/v1/cards/intake*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Decision card generation -> Nova Hub (auth required)
app.all('/v1/cards/generate*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Contact form -> Nova Hub (public — no auth)
app.all('/v1/contact*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Calibration -> Nova Hub
app.all('/v1/calibration*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/dashboard/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Market data routes -> MarketData service
app.all('/v1/market/*', requireScopes(['trade.read']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.marketdata, req, res);
});

// Billing routes -> Billing service
app.get('/v1/billing/pricing', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.billing, req, res);
});

app.get('/v1/billing/entitlement', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.billing, req, res);
});

app.post('/v1/billing/checkout-session', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.billing, req, res);
});

app.post('/v1/billing/portal', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.billing, req, res);
});

app.get('/v1/billing/founding-seats', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.billing, req, res);
});

// Stripe webhook - needs raw body, passthrough to billing
app.post('/billing/webhook', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.billing, '/webhook', req, res);
});

// ============================================
// Nova Nexus AI Routes -> TradeBot
// ============================================
// Decision Infrastructure lifecycle routes -> Nova Hub
app.all('/v1/nexus/observe', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/nexus/decision-cards*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/nexus/status', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/status', req, res);
});

app.all('/v1/nexus/initialize', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/initialize', req, res);
});

app.all('/v1/nexus/analyze', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/analyze', req, res);
});

app.all('/v1/nexus/execute', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/execute', req, res);
});

app.all('/v1/nexus/autonomous-scan', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/autonomous-scan', req, res);
});

app.all('/v1/nexus/ledger', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/ledger', req, res);
});

app.all('/v1/nexus/stop', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/nexus/stop', req, res);
});


// ============================================
// AI Screener Routes -> TradeBot
// ============================================

app.all('/v1/ai-screener/status', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/ai-screener/status', req, res);
});

app.all('/v1/ai-screener/scan', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/ai-screener/scan', req, res);
});

app.all('/v1/ai-screener/top-movers', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/ai-screener/top-movers', req, res);
});

app.all('/v1/ai-screener/analyze', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/ai-screener/analyze', req, res);
});

// ============================================
// Value Radar + Marketplace -> Nova Hub
// ============================================

app.all('/v1/value-radar/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/marketplace/search', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/marketplace/appraise', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/marketplace/trending', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/dashboard/stats', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Reality check, Decision Cards, UDM, Daily Drop, Proof Packs -> Nova Hub
app.all('/v1/reality', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Universal Decision Card API (Sprint Zero T5)
// The canonical CRUD surface over the nova_cards table.
// Cards are produced by bots (storebot/tradebot) or posted directly here.
// ============================================

// Build a normalized DecisionCard from a request body, forcing the
// authenticated user as owner and guaranteeing identity/governance/outcome.
function coerceCardFromBody(
  body: any,
  userId: string
): DecisionCard | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body must be a card object' };
  const ct = CardTypeSchema.safeParse(body.card_type);
  if (!ct.success) {
    return { error: 'card_type must be one of TRADE|FLIP|PRICING|CONTENT|OPS|LIFE' };
  }
  if (!body.observation || !body.analysis || !body.recommendation) {
    return { error: 'card must include observation, analysis, and recommendation' };
  }
  return buildDecisionCard({
    card_type: ct.data,
    user_id: userId,
    session_id: typeof body.session_id === 'string' ? body.session_id : undefined,
    observation: {
      source: String(body.observation.source ?? 'user_input'),
      raw_input: body.observation.raw_input ?? null,
      context: typeof body.observation.context === 'object' ? body.observation.context : {},
      timestamp: typeof body.observation.timestamp === 'string' ? body.observation.timestamp : undefined,
    },
    analysis: {
      confidence: typeof body.analysis.confidence === 'number' ? body.analysis.confidence : null,
      reasoning: Array.isArray(body.analysis.reasoning) ? body.analysis.reasoning : [],
      data_used: Array.isArray(body.analysis.data_used) ? body.analysis.data_used : [],
      missing: Array.isArray(body.analysis.missing) ? body.analysis.missing : [],
      warnings: Array.isArray(body.analysis.warnings) ? body.analysis.warnings : [],
    },
    recommendation: {
      action: body.recommendation.action as RecommendedAction,
      summary: String(body.recommendation.summary ?? ''),
      details: typeof body.recommendation.details === 'string' ? body.recommendation.details : undefined,
      risk_level: body.recommendation.risk_level as RiskLevel | undefined,
    },
    metrics: body.metrics ?? null,
    action_steps: Array.isArray(body.action_steps) ? body.action_steps : [],
    governance: typeof body.governance === 'object' ? body.governance : undefined,
  });
}

// Create a Decision Card
app.post('/v1/cards', async (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
    });
  }
  const built = coerceCardFromBody(req.body, req.auth.userId);
  if ('error' in built) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_FAILED, message: built.error },
    });
  }
  try {
    const { text, values } = novaCardInsert(built);
    const row = await queryOne<NovaCardRow>(text, values);
    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { card: row ? novaCardFromRow(row) : built },
    });
  } catch (error) {
    logger.error('Failed to create card', error as Error);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'CARD_PERSIST_FAILED', message: 'Failed to store card' },
    });
  }
});

// List the authenticated user's cards (newest first)
app.get('/v1/cards', async (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
    });
  }
  const limit = Math.min(Math.max(Math.floor(Number(req.query.limit) || 20), 1), 100);
  const offset = Math.max(Math.floor(Number(req.query.offset) || 0), 0);
  const typeParsed = CardTypeSchema.safeParse(req.query.type);

  const params: unknown[] = [req.auth.userId];
  let sql = 'SELECT * FROM nova_cards WHERE user_id = $1';
  if (typeParsed.success) {
    params.push(typeParsed.data);
    sql += ` AND card_type = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  try {
    const result = await query<NovaCardRow>(sql, params as any[]);
    return res.json({
      success: true,
      data: { cards: result.rows.map(novaCardFromRow), count: result.rows.length },
      meta: { limit, offset },
    });
  } catch (error) {
    logger.error('Failed to list cards', error as Error);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'CARD_LIST_FAILED', message: 'Failed to list cards' },
    });
  }
});

// Get one card by ULID (26-char id) — scoped to the user (or public/null-owner)
app.get('/v1/cards/:id([0-9A-Za-z]{26})', async (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
    });
  }
  try {
    const row = await queryOne<NovaCardRow>(
      'SELECT * FROM nova_cards WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
      [req.params.id, req.auth.userId]
    );
    if (!row) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Card not found' },
      });
    }
    return res.json({ success: true, data: { card: novaCardFromRow(row) } });
  } catch (error) {
    logger.error('Failed to get card', error as Error);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'CARD_GET_FAILED', message: 'Failed to get card' },
    });
  }
});

// Record the real-world outcome of a Decision Card (Sprint Zero T9 — the Loop)
app.patch('/v1/cards/:id([0-9A-Za-z]{26})/outcome', async (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
    });
  }

  const { status, result, actual_vs_expected, lesson } = req.body || {};
  const allowed = ['EXECUTED', 'SKIPPED', 'CANCELLED'];
  if (!allowed.includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_FAILED, message: `status must be one of ${allowed.join(', ')}` },
    });
  }

  const now = new Date().toISOString();
  const outcome = {
    status,
    result: result ?? null,
    actual_vs_expected: typeof actual_vs_expected === 'string' ? actual_vs_expected : null,
    lesson: typeof lesson === 'string' ? lesson : null,
    logged_at: now,
  };

  try {
    const row = await queryOne<NovaCardRow>(
      `UPDATE nova_cards
         SET outcome = $1::jsonb,
             version = version + 1,
             governance = CASE WHEN $2 = 'EXECUTED'
               THEN jsonb_set(governance, '{executed_at}', to_jsonb($3::text))
               ELSE governance END
       WHERE id = $4 AND (user_id = $5 OR user_id IS NULL)
       RETURNING *`,
      [JSON.stringify(outcome), status, now, req.params.id, req.auth.userId]
    );
    if (!row) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Card not found' },
      });
    }
    return res.json({ success: true, data: { card: novaCardFromRow(row) } });
  } catch (error) {
    logger.error('Failed to record card outcome', error as Error);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'CARD_OUTCOME_FAILED', message: 'Failed to record outcome' },
    });
  }
});

app.all('/v1/cards/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/udm/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/daily-drop', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.all('/v1/proofpacks/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Manifesto: Agent Engine Routes -> Nova Hub
// ============================================

app.all('/v1/agents/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Manifesto: Usage Metering Routes -> Nova Hub
// ============================================

app.get('/v1/billing/usage', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/billing/tiers', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Manifesto: Outcome Tracking Routes -> Nova Hub
// ============================================

app.all('/v1/outcomes/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Tycoon: Intelligence Digest -> Nova Hub
// ============================================

app.get('/v1/intelligence/weekly', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Tycoon: Referral System -> Nova Hub
// ============================================

app.all('/v1/referrals/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.post('/v1/referrals/generate', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// ============================================
// Command Layer -> Nova Hub + Scheduler
// ============================================

// Command pulse + review -> Nova Hub
app.all('/v1/command/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Scheduler status, triggers, history -> Scheduler service
app.all('/v1/scheduler/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.scheduler, req, res);
});

// ============================================
// Tycoon: Platform Stats (public) -> Nova Hub
// ============================================

app.get('/v1/platform/stats', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// The World — public arrival surface (pulse + hail) -> Nova Hub
app.all('/v1/world/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// The constitution organs (Phases 1-5) -> Nova Hub. Each route is sealed
// behind the world key INSIDE nova-hub — the gateway is a carrier here.
app.all('/v1/vault/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/lattice*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/mindspace/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/intents*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});
app.all('/v1/grounding/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Alerts (unread count + list) -> Nova Hub. The endpoint existed for months;
// the gateway never routed it — every dashboard page 404'd on it.
app.all('/v1/alerts*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Executor agents (Spec v0.2 Layer A, authed) -> Nova Hub
app.all('/v1/executor/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// The Smith (builder-agent layer, authed) -> Nova Hub. Agent evals are
// already forwarded by the existing /v1/agents/* route below.
app.all('/v1/smith/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Ignition v2 (Spec v0.2 Layer D, authed) -> Nova Hub
app.all('/v1/ignition/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

app.get('/v1/platform/brief-proof', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Diagnostic
app.get('/v1/diagnostic/live', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.novaHub, req, res);
});

// Catch-all for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: { code: ERROR_CODES.NOT_FOUND, message: 'Endpoint not found' },
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Gateway service started on port ${PORT}`);
});

export default app;

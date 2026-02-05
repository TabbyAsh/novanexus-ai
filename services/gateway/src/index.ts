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
} from '@nova/shared';
import type { JWTPayload, Scope } from '@nova/shared';

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
  '/health',
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/billing/pricing',
  '/billing/webhook',  // Stripe webhook - authenticated by signature
];

// Premium features that require paid plan (LITE or higher)
const PREMIUM_FEATURES: Record<string, string> = {
  '/v1/trade/scan': 'scanner',
  '/v1/trade/theses': 'thesis_cards',
  '/v1/trade/paper-trades': 'paper_trading',
  '/v1/watchlists': 'watchlists',
  '/v1/signals': 'alerts',
  '/v1/market/': 'scanner',
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

app.use(express.json());

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
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

// Store routes -> StoreBot
app.get('/v1/store/products', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/products', req, res);
});

app.get('/v1/store/alerts', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/inventory/alerts', req, res);
});

app.get('/v1/store/pricing-recommendations', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.storebot, '/api/pricing/recommendations', req, res);
});

app.all('/v1/store/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.storebot, req, res);
});

app.all('/v1/products*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.storebot, req, res);
});

app.all('/v1/orders*', requireScopes(['store.orders']), (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.storebot, req, res);
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

app.all('/v1/social/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.socialbot, req, res);
});

app.all('/v1/content*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.socialbot, req, res);
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

// Stripe webhook - needs raw body, passthrough to billing
app.post('/billing/webhook', (req: Request, res: Response) => {
  proxyRequestRewrite(SERVICE_URLS.billing, '/webhook', req, res);
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

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telemetry_1 = require("@nova/telemetry");
const shared_1 = require("@nova/shared");
const app = (0, express_1.default)();
const logger = (0, telemetry_1.createLogger)('gateway-service');
const PORT = process.env.PORT || shared_1.SERVICE_PORTS.GATEWAY;
// Service URLs
const SERVICE_URLS = {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    orchestrator: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
    eventbus: process.env.EVENTBUS_URL || 'http://localhost:3003',
    tradebot: process.env.TRADEBOT_URL || 'http://localhost:3010',
    storebot: process.env.STOREBOT_URL || 'http://localhost:3011',
    socialbot: process.env.SOCIALBOT_URL || 'http://localhost:3012',
    researchbot: process.env.RESEARCHBOT_URL || 'http://localhost:3013',
    opsbot: process.env.OPSBOT_URL || 'http://localhost:3014',
    marketdata: process.env.MARKETDATA_URL || 'http://localhost:3020',
};
// Route to required scopes mapping
const ROUTE_SCOPES = {
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
];
app.use(express_1.default.json());
// CORS middleware
app.use((req, res, next) => {
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
app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
});
// Rate limiting middleware (Redis-backed)
app.use(async (req, res, next) => {
    try {
        const clientId = req.headers.authorization
            ? `user:${req.headers.authorization.substring(7, 20)}`
            : `ip:${req.ip || 'unknown'}`;
        const isAuthRoute = req.path.startsWith('/v1/auth/');
        const limit = isAuthRoute
            ? shared_1.RATE_LIMITS.AUTH_ATTEMPTS_PER_MINUTE
            : shared_1.RATE_LIMITS.API_REQUESTS_PER_MINUTE;
        const result = await (0, shared_1.checkRateLimit)(clientId, limit, 60);
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', result.resetAt.toString());
        if (!result.allowed) {
            return res.status(shared_1.HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.RATE_LIMITED,
                    message: 'Rate limit exceeded. Retry after reset window.',
                },
            });
        }
        next();
    }
    catch (error) {
        // If Redis fails, allow the request but log it
        logger.error('Rate limiting check failed', error);
        next();
    }
});
// Authentication middleware
app.use(async (req, res, next) => {
    // Check if route is public
    if (PUBLIC_ROUTES.some((r) => req.path === r || req.path.startsWith(r))) {
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Missing or invalid authorization header' },
        });
    }
    const token = authHeader.substring(7);
    const payload = (0, shared_1.verifyToken)(token);
    if (!payload) {
        return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid or expired token' },
        });
    }
    if (payload.type !== 'access') {
        return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid token type' },
        });
    }
    req.auth = payload;
    next();
});
// Kill switch check middleware (for automation routes)
app.use(async (req, res, next) => {
    // Skip for non-automation routes
    const automationRoutes = ['/v1/trade', '/v1/store', '/v1/social', '/v1/research'];
    const isAutomationRoute = automationRoutes.some((r) => req.path.startsWith(r));
    if (!isAutomationRoute || req.method === 'GET') {
        return next();
    }
    try {
        const result = await (0, shared_1.queryOne)("SELECT value_json FROM system_state WHERE key = 'kill_switch'");
        if (result) {
            const state = JSON.parse(result.value_json);
            if (state.enabled) {
                return res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
                    success: false,
                    error: {
                        code: shared_1.ERROR_CODES.AUTOMATION_DISABLED,
                        message: 'Automation is currently disabled by kill switch',
                        details: { reason: state.reason, enabledAt: state.enabledAt },
                    },
                });
            }
        }
    }
    catch (error) {
        logger.error('Failed to check kill switch', error);
    }
    next();
});
// Scope check middleware
function requireScopes(scopes) {
    return (req, res, next) => {
        if (!req.auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const hasScope = scopes.some((s) => req.auth.scopes.includes(s));
        if (!hasScope) {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS,
                    message: `Requires one of: ${scopes.join(', ')}`,
                },
            });
        }
        next();
    };
}
// Logging middleware
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        requestId: req.headers['x-request-id'],
        userId: req.auth?.userId,
        orgId: req.auth?.orgId,
    });
    next();
});
// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'gateway',
        timestamp: new Date().toISOString(),
    });
});
// ============================================
// Proxy helper
// ============================================
async function proxyRequestRewrite(targetUrl, targetPath, req, res) {
    try {
        const url = `${targetUrl}${targetPath}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Request-ID': req.headers['x-request-id'],
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
        }
        else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    }
    catch (error) {
        logger.error('Proxy request failed', error, { targetUrl, path: targetPath });
        res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
        });
    }
}
async function proxyRequest(targetUrl, req, res) {
    try {
        const url = `${targetUrl}${req.originalUrl}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-Request-ID': req.headers['x-request-id'],
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
        }
        else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    }
    catch (error) {
        logger.error('Proxy request failed', error, { targetUrl, path: req.path });
        res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
        });
    }
}
// ============================================
// Route Handlers
// ============================================
// Auth routes -> Auth service (public)
app.all('/v1/auth/*', (req, res) => {
    proxyRequest(SERVICE_URLS.auth, req, res);
});
app.get('/v1/me', (req, res) => {
    proxyRequest(SERVICE_URLS.auth, req, res);
});
app.all('/v1/policies*', (req, res) => {
    proxyRequest(SERVICE_URLS.auth, req, res);
});
// Goal/Task routes -> Orchestrator
app.all('/v1/goals*', (req, res) => {
    proxyRequest(SERVICE_URLS.orchestrator, req, res);
});
app.all('/v1/tasks*', (req, res) => {
    proxyRequest(SERVICE_URLS.orchestrator, req, res);
});
app.all('/v1/approvals*', (req, res) => {
    proxyRequest(SERVICE_URLS.orchestrator, req, res);
});
app.all('/v1/kill-switch*', requireScopes(['admin.killswitch']), (req, res) => {
    proxyRequest(SERVICE_URLS.orchestrator, req, res);
});
app.get('/v1/stats', (req, res) => {
    proxyRequest(SERVICE_URLS.orchestrator, req, res);
});
// Event routes -> EventBus
app.all('/v1/events*', (req, res) => {
    proxyRequest(SERVICE_URLS.eventbus, req, res);
});
app.all('/v1/subscriptions*', (req, res) => {
    proxyRequest(SERVICE_URLS.eventbus, req, res);
});
// Trade routes -> TradeBot
// Direct API mapping for trade functionality
app.all('/v1/trade/scan', (req, res) => {
    proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/scan', req, res);
});
app.all('/v1/trade/theses', (req, res) => {
    proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/theses', req, res);
});
app.all('/v1/trade/paper-trades', (req, res) => {
    proxyRequestRewrite(SERVICE_URLS.tradebot, '/api/trades', req, res);
});
app.all('/v1/trade/paper-trades/:id/close', (req, res) => {
    proxyRequestRewrite(SERVICE_URLS.tradebot, `/api/trades/${req.params.id}/close`, req, res);
});
app.all('/v1/trade/*', (req, res) => {
    proxyRequest(SERVICE_URLS.tradebot, req, res);
});
app.all('/v1/watchlists*', requireScopes(['trade.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.tradebot, req, res);
});
app.all('/v1/signals*', requireScopes(['trade.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.tradebot, req, res);
});
// Store routes -> StoreBot
app.all('/v1/store/*', requireScopes(['store.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.storebot, req, res);
});
app.all('/v1/products*', requireScopes(['store.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.storebot, req, res);
});
app.all('/v1/orders*', requireScopes(['store.orders']), (req, res) => {
    proxyRequest(SERVICE_URLS.storebot, req, res);
});
// Social routes -> SocialBot
app.all('/v1/social/*', requireScopes(['social.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.socialbot, req, res);
});
app.all('/v1/content*', requireScopes(['social.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.socialbot, req, res);
});
// Research routes -> ResearchBot
app.all('/v1/research/*', requireScopes(['research.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.researchbot, req, res);
});
app.all('/v1/kb*', requireScopes(['research.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.researchbot, req, res);
});
app.all('/v1/proposals*', requireScopes(['research.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.researchbot, req, res);
});
// Ops routes -> OpsBot
app.all('/v1/ops/*', requireScopes(['ops.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.opsbot, req, res);
});
// Market data routes -> MarketData service
app.all('/v1/market/*', requireScopes(['trade.read']), (req, res) => {
    proxyRequest(SERVICE_URLS.marketdata, req, res);
});
// Catch-all for unknown routes
app.use((_req, res) => {
    res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Endpoint not found' },
    });
});
// Error handler
app.use((err, _req, res, _next) => {
    logger.error('Unhandled error', err);
    res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
});
// Start server
app.listen(PORT, () => {
    logger.info(`Gateway service started on port ${PORT}`);
});
exports.default = app;

import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, RATE_LIMITS } from '@nova/shared';

const app = express();
const logger = createLogger('gateway-service');
const PORT = process.env.PORT || SERVICE_PORTS.GATEWAY;

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

app.use(express.json());

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Rate limiting middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const clientId = req.headers['x-user-id'] as string || req.ip || 'anonymous';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  
  let record = rateLimiter.get(clientId);
  
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs };
    rateLimiter.set(clientId, record);
  }
  
  record.count++;
  
  if (record.count > RATE_LIMITS.API_REQUESTS_PER_MINUTE) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
  }
  
  next();
});

// Logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, { 
    requestId: req.headers['x-request-id'],
    userAgent: req.headers['user-agent'],
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'gateway',
    timestamp: new Date().toISOString() 
  });
});

// ============================================
// Service URLs (from environment)
// ============================================

const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  orchestrator: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
  eventbus: process.env.EVENTBUS_URL || 'http://localhost:3003',
  audit: process.env.AUDIT_URL || 'http://localhost:3004',
  tradebot: process.env.TRADEBOT_URL || 'http://localhost:3010',
  storebot: process.env.STOREBOT_URL || 'http://localhost:3011',
  socialbot: process.env.SOCIALBOT_URL || 'http://localhost:3012',
  marketdata: process.env.MARKETDATA_URL || 'http://localhost:3020',
};

// ============================================
// Proxy helper
// ============================================

async function proxyRequest(
  targetUrl: string,
  req: Request,
  res: Response
): Promise<void> {
  try {
    const url = `${targetUrl}${req.path}`;
    
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': req.headers['x-request-id'] as string,
        'x-user-id': req.headers['x-user-id'] as string || '',
        'x-org-id': req.headers['x-org-id'] as string || '',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error('Proxy request failed', error as Error, { targetUrl });
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Upstream service unavailable' },
    });
  }
}

// ============================================
// Route Handlers
// ============================================

// Auth routes -> Auth service
app.all('/v1/auth/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.auth, req, res);
});

app.get('/v1/me', (req: Request, res: Response) => {
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

app.all('/v1/kill-switch/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.orchestrator, req, res);
});

// Event routes -> EventBus
app.all('/v1/events*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.eventbus, req, res);
});

// Trade routes -> TradeBot
app.all('/v1/trade/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.tradebot, req, res);
});

// Store routes -> StoreBot
app.all('/v1/store/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.storebot, req, res);
});

// Social routes -> SocialBot
app.all('/v1/social/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.socialbot, req, res);
});

// Market data routes -> MarketData service
app.all('/v1/market/*', (req: Request, res: Response) => {
  proxyRequest(SERVICE_URLS.marketdata, req, res);
});

// Catch-all for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
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

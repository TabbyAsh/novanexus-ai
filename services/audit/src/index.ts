import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  query,
  queryOne,
  verifyToken,
} from '@nova/shared';
import { getEventStore } from '@nova/eventing';
import { hasCrossOrgAuditAuthority } from './platform-authority';

const app = express();
const logger = createLogger('audit-service');
const PORT = process.env.PORT || SERVICE_PORTS.AUDIT;

// Middleware
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Auth middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid token' },
    });
  }

  (req as any).user = payload;
  next();
}

// Admin middleware - requires admin.audit scope
async function requireAuditScope(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user.scopes.includes('admin.audit')) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.audit scope' },
    });
  }
  next();
}

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'healthy', service: 'audit', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'unhealthy',
      service: 'audit',
      error: 'Database connection failed',
    });
  }
});

// ============================================
// Event Log Endpoints
// ============================================

// GET /v1/events - List events
app.get('/v1/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const store = getEventStore();

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const types = req.query.types ? (req.query.types as string).split(',') : undefined;
    const actorType = req.query.actorType as string;
    const fromTs = req.query.from as string;
    const toTs = req.query.to as string;

    const events = await store.getEvents({
      orgId: user.orgId,
      types,
      actorType: actorType as any,
      fromTs,
      toTs,
      limit,
      offset,
    });

    const totalCount = await store.getTotalCount(user.orgId);

    res.json({
      success: true,
      data: { events },
      meta: { page: Math.floor(offset / limit), pageSize: limit, total: totalCount },
    });
  } catch (error) {
    logger.error('Failed to list events', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to list events' },
    });
  }
});

// GET /v1/events/:id - Get single event
app.get('/v1/events/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const store = getEventStore();

    const event = await store.getEventById(req.params.id);

    if (!event) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Event not found' },
      });
    }

    // Verify org ownership
    if (event.orgId !== user.orgId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Access denied' },
      });
    }

    res.json({ success: true, data: { event } });
  } catch (error) {
    logger.error('Failed to get event', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get event' },
    });
  }
});

// GET /v1/events/stats - Event statistics
app.get('/v1/events/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const store = getEventStore();

    const totalCount = await store.getTotalCount(user.orgId);
    const countsByType = await store.countEventsByType(user.orgId);

    res.json({
      success: true,
      data: {
        totalCount,
        countsByType,
      },
    });
  } catch (error) {
    logger.error('Failed to get event stats', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get stats' },
    });
  }
});

// ============================================
// Admin Audit Endpoints
// ============================================

// GET /admin/audit/verify - Verify hash chain integrity
app.get('/admin/audit/verify', requireAuth, requireAuditScope, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  
  try {
    const user = (req as any).user;
    const store = getEventStore();

    logger.info('Starting audit chain verification', { orgId: user.orgId, requestId });
    const startTime = Date.now();

    const result = await store.verifyChain(user.orgId);

    const duration = Date.now() - startTime;
    logger.info('Audit chain verification complete', {
      orgId: user.orgId,
      valid: result.valid,
      eventCount: result.eventCount,
      errorCount: result.errors.length,
      durationMs: duration,
      requestId,
    });

    res.json({
      success: true,
      data: {
        verification: {
          valid: result.valid,
          eventCount: result.eventCount,
          firstEventTs: result.firstEventTs,
          lastEventTs: result.lastEventTs,
          errors: result.errors,
          verifiedAt: new Date().toISOString(),
          durationMs: duration,
        },
      },
    });
  } catch (error) {
    logger.error('Audit verification failed', error as Error, { requestId });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.EXTERNAL_API_ERROR, message: 'Verification failed' },
    });
  }
});

// GET /admin/audit/summary - Get audit summary for all orgs (super admin)
app.get('/admin/audit/summary', requireAuth, requireAuditScope, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!hasCrossOrgAuditAuthority(user)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires ops.admin scope' },
      });
    }

    // Get summary stats
    const totalEventsResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM events');
    const totalEvents = parseInt(totalEventsResult?.count || '0', 10);

    const eventsByOrgResult = await query<{ org_id: string; count: string }>(
      'SELECT org_id, COUNT(*) as count FROM events GROUP BY org_id ORDER BY count DESC LIMIT 10'
    );

    const eventsByTypeResult = await query<{ type: string; count: string }>(
      'SELECT type, COUNT(*) as count FROM events GROUP BY type ORDER BY count DESC LIMIT 20'
    );

    const recentEventsResult = await query<{ type: string; ts: string; actor_type: string }>(
      'SELECT type, ts, actor_type FROM events ORDER BY ts DESC LIMIT 10'
    );

    res.json({
      success: true,
      data: {
        totalEvents,
        eventsByOrg: eventsByOrgResult.rows.map((r) => ({ orgId: r.org_id, count: parseInt(r.count, 10) })),
        eventsByType: eventsByTypeResult.rows.map((r) => ({ type: r.type, count: parseInt(r.count, 10) })),
        recentEvents: recentEventsResult.rows.map((r) => ({
          type: r.type,
          ts: r.ts,
          actorType: r.actor_type,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to get audit summary', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get summary' },
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Audit service started on port ${PORT}`);
});

export default app;

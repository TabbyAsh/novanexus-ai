import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import {
  SERVICE_PORTS,
  HTTP_STATUS,
  ERROR_CODES,
  query,
  queryOne,
  transaction,
  computeEventHash,
  nowTimestamp,
  verifyToken,
} from '@nova/shared';
import type { ApiResponse, NovaEvent, JWTPayload } from '@nova/shared';

const app = express();
const logger = createLogger('eventbus-service');
const PORT = process.env.PORT || SERVICE_PORTS.EVENTBUS;
const GENESIS_HASH = '0'.repeat(64);

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Auth middleware helper
function extractAuth(req: Request): JWTPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

function parseJsonOptional<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  const parsed = parseJsonOptional<T>(value);
  return parsed === undefined ? fallback : parsed;
}

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const countResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM events');
    res.json({
      status: 'healthy',
      service: 'eventbus',
      eventCount: parseInt(countResult?.count || '0', 10),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'unhealthy',
      service: 'eventbus',
      error: 'Database connection failed',
    });
  }
});

// ============================================
// Event Routes
// ============================================

// POST /v1/events - Emit a new event
app.post('/v1/events', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    const { type, payload, actorType, actorId, orgId } = req.body;

    // Validate required fields
    if (!type || !payload || !actorType || !actorId || !orgId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Missing required fields' },
      });
    }

    // For authenticated requests, validate org access
    if (auth && auth.orgId !== orgId && actorType === 'USER') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Cannot emit events to other orgs' },
      });
    }

    const event = await transaction(async (client) => {
      // Get the last event hash for this org (for chain integrity)
      const lastEventResult = await client.query<{ hash: string }>(
        'SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1 FOR UPDATE',
        [orgId]
      );
      const prevHash = lastEventResult.rows[0]?.hash || GENESIS_HASH;

      const ts = nowTimestamp();
      const hash = computeEventHash(prevHash, payload, type, ts, actorType, actorId);

      // Insert the event
      const insertResult = await client.query<{
        id: string;
        org_id: string;
        actor_type: string;
        actor_id: string;
        type: string;
        ts: string;
        payload_json: string;
        prev_hash: string;
        hash: string;
      }>(
        `INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash`,
        [orgId, actorType, actorId, type, ts, JSON.stringify(payload), prevHash, hash]
      );

      const row = insertResult.rows[0];
      return {
        id: row.id,
        orgId: row.org_id,
        actorType: row.actor_type as 'USER' | 'BOT' | 'SYSTEM',
        actorId: row.actor_id,
        type: row.type,
        ts: row.ts,
        payload: parseJsonValue<Record<string, unknown>>(row.payload_json, {}),
        prevHash: row.prev_hash,
        hash: row.hash,
      };
    });

    logger.info('Event emitted', { eventId: event.id, type });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { event },
    });
  } catch (error) {
    logger.error('Failed to emit event', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'EVENT_EMIT_FAILED', message: 'Failed to emit event' },
    });
  }
});

// POST /v1/events/query - Query events with filters
app.post('/v1/events/query', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    const { orgId, types, actorType, actorId, fromTs, toTs, limit = 100, offset = 0 } = req.body;

    // For authenticated requests, enforce org scope
    const effectiveOrgId = auth ? auth.orgId : orgId;

    if (!effectiveOrgId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'orgId is required' },
      });
    }

    // Build dynamic query
    const conditions: string[] = ['org_id = $1'];
    const params: any[] = [effectiveOrgId];
    let paramIndex = 2;

    if (types && types.length > 0) {
      conditions.push(`type = ANY($${paramIndex})`);
      params.push(types);
      paramIndex++;
    }

    if (actorType) {
      conditions.push(`actor_type = $${paramIndex}`);
      params.push(actorType);
      paramIndex++;
    }

    if (actorId) {
      conditions.push(`actor_id = $${paramIndex}`);
      params.push(actorId);
      paramIndex++;
    }

    if (fromTs) {
      conditions.push(`ts >= $${paramIndex}`);
      params.push(fromTs);
      paramIndex++;
    }

    if (toTs) {
      conditions.push(`ts <= $${paramIndex}`);
      params.push(toTs);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM events WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    // Get events
    const effectiveLimit = Math.min(limit, 1000);
    params.push(effectiveLimit, offset);

    const result = await query<{
      id: string;
      org_id: string;
      actor_type: string;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: string;
      prev_hash: string;
      hash: string;
    }>(
      `SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE ${whereClause}
       ORDER BY ts DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const events: NovaEvent[] = result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      actorType: row.actor_type as 'USER' | 'BOT' | 'SYSTEM',
      actorId: row.actor_id,
      type: row.type,
      ts: row.ts,
      payload: parseJsonValue<Record<string, unknown>>(row.payload_json, {}),
      prevHash: row.prev_hash,
      hash: row.hash,
    }));

    res.json({
      success: true,
      data: { events },
      meta: { total, limit: effectiveLimit, offset },
    });
  } catch (error) {
    logger.error('Failed to query events', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to query events' },
    });
  }
});

// GET /v1/events/recent - Get recent events (authenticated)
app.get('/v1/events/recent', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const result = await query<{
      id: string;
      org_id: string;
      actor_type: string;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: string;
      prev_hash: string;
      hash: string;
    }>(
      `SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE org_id = $1
       ORDER BY ts DESC
       LIMIT $2`,
      [auth.orgId, limit]
    );

    const events: NovaEvent[] = result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      actorType: row.actor_type as 'USER' | 'BOT' | 'SYSTEM',
      actorId: row.actor_id,
      type: row.type,
      ts: row.ts,
      payload: parseJsonValue<Record<string, unknown>>(row.payload_json, {}),
      prevHash: row.prev_hash,
      hash: row.hash,
    }));

    res.json({ success: true, data: { events } });
  } catch (error) {
    logger.error('Failed to get recent events', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get recent events' },
    });
  }
});

// GET /v1/events/:id - Get event by ID
app.get('/v1/events/:id', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    const eventId = req.params.id;

    const result = await queryOne<{
      id: string;
      org_id: string;
      actor_type: string;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: string;
      prev_hash: string;
      hash: string;
    }>('SELECT * FROM events WHERE id = $1', [eventId]);

    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Event not found' },
      });
    }

    // Check org access
    if (auth && auth.orgId !== result.org_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Access denied' },
      });
    }

    const event: NovaEvent = {
      id: result.id,
      orgId: result.org_id,
      actorType: result.actor_type as 'USER' | 'BOT' | 'SYSTEM',
      actorId: result.actor_id,
      type: result.type,
      ts: result.ts,
      payload: parseJsonValue<Record<string, unknown>>(result.payload_json, {}),
      prevHash: result.prev_hash,
      hash: result.hash,
    };

    res.json({ success: true, data: { event } });
  } catch (error) {
    logger.error('Failed to get event', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get event' },
    });
  }
});

// GET /v1/events/chain/verify - Verify event chain integrity
app.get('/v1/events/chain/verify', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    // Get all events for this org in chronological order
    const result = await query<{
      id: string;
      actor_type: string;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: string;
      prev_hash: string;
      hash: string;
    }>(
      `SELECT id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE org_id = $1 ORDER BY ts ASC`,
      [auth.orgId]
    );

    let valid = true;
    let brokenAt: string | null = null;
    let brokenReason: string | null = null;
    let expectedHash: string = GENESIS_HASH;

    for (let i = 0; i < result.rows.length; i++) {
      const event = result.rows[i];

      // Verify that prevHash matches expected
      if (event.prev_hash !== expectedHash) {
        valid = false;
        brokenAt = event.id;
        brokenReason = `Chain linkage broken: expected prevHash ${expectedHash.substring(0, 8)}... but got ${event.prev_hash.substring(0, 8)}...`;
        break;
      }

      // Verify hash computation
      const payload = parseJsonValue<Record<string, unknown>>(event.payload_json, {});
      const computedHash = computeEventHash(
        event.prev_hash,
        payload,
        event.type,
        event.ts,
        event.actor_type,
        event.actor_id
      );

      if (event.hash !== computedHash) {
        valid = false;
        brokenAt = event.id;
        brokenReason = `Hash mismatch: stored ${event.hash.substring(0, 8)}... but computed ${computedHash.substring(0, 8)}...`;
        break;
      }

      expectedHash = event.hash;
    }

    res.json({
      success: true,
      data: {
        valid,
        eventCount: result.rows.length,
        brokenAt,
        brokenReason,
        lastHash: expectedHash,
      },
    });
  } catch (error) {
    logger.error('Chain verification failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'VERIFY_FAILED', message: 'Failed to verify chain' },
    });
  }
});

// POST /v1/events/chain/repair - Rebuild event chain hashes from genesis
app.post('/v1/events/chain/repair', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    // Get all events for this org in chronological order
    const result = await query<{
      id: string;
      actor_type: string;
      actor_id: string;
      type: string;
      ts: string;
      payload_json: string;
      prev_hash: string;
      hash: string;
    }>(
      `SELECT id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE org_id = $1 ORDER BY ts ASC`,
      [auth.orgId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: { repaired: 0, eventCount: 0, message: 'No events to repair' },
      });
    }

    let repaired = 0;
    let expectedPrevHash = GENESIS_HASH;

    await transaction(async (client) => {
      for (let i = 0; i < result.rows.length; i++) {
        const event = result.rows[i];
        const payload = parseJsonValue<Record<string, unknown>>(event.payload_json, {});
        const correctHash = computeEventHash(
          expectedPrevHash,
          payload,
          event.type,
          event.ts,
          event.actor_type,
          event.actor_id
        );

        if (event.prev_hash !== expectedPrevHash || event.hash !== correctHash) {
          await client.query(
            'UPDATE events SET prev_hash = $1, hash = $2 WHERE id = $3',
            [expectedPrevHash, correctHash, event.id]
          );
          repaired++;
        }

        expectedPrevHash = correctHash;
      }
    });

    logger.info('Event chain repaired', { orgId: auth.orgId, repaired, total: result.rows.length });

    res.json({
      success: true,
      data: {
        repaired,
        eventCount: result.rows.length,
        lastHash: expectedPrevHash,
        message: repaired > 0 ? `Repaired ${repaired} events` : 'Chain was already valid',
      },
    });
  } catch (error) {
    logger.error('Chain repair failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'REPAIR_FAILED', message: 'Failed to repair chain' },
    });
  }
});

// GET /v1/events/stats - Get event statistics
app.get('/v1/events/stats', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const [totalResult, byTypeResult, last24hResult] = await Promise.all([
      queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM events WHERE org_id = $1',
        [auth.orgId]
      ),
      query<{ type: string; count: string }>(
        `SELECT type, COUNT(*) as count FROM events
         WHERE org_id = $1
         GROUP BY type ORDER BY count DESC LIMIT 10`,
        [auth.orgId]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM events
         WHERE org_id = $1 AND ts > NOW() - INTERVAL '24 hours'`,
        [auth.orgId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        total: parseInt(totalResult?.count || '0', 10),
        last24Hours: parseInt(last24hResult?.count || '0', 10),
        byType: byTypeResult.rows.map((r) => ({ type: r.type, count: parseInt(r.count, 10) })),
      },
    });
  } catch (error) {
    logger.error('Failed to get event stats', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get event stats' },
    });
  }
});

// ============================================
// Subscription Routes
// ============================================

// POST /v1/subscriptions - Create subscription
app.post('/v1/subscriptions', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { consumer, eventType, enabled = true } = req.body;

    if (!consumer || !eventType) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'consumer and eventType are required' },
      });
    }

    const result = await queryOne<{ id: string }>(
      `INSERT INTO subscriptions (org_id, consumer, event_type, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [auth.orgId, consumer, eventType, enabled]
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        subscription: {
          id: result?.id,
          orgId: auth.orgId,
          consumer,
          eventType,
          enabled,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to create subscription', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: 'Failed to create subscription' },
    });
  }
});

// GET /v1/subscriptions - List subscriptions
app.get('/v1/subscriptions', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const result = await query<{
      id: string;
      consumer: string;
      event_type: string;
      cursor: string | null;
      enabled: boolean;
    }>('SELECT * FROM subscriptions WHERE org_id = $1', [auth.orgId]);

    res.json({
      success: true,
      data: {
        subscriptions: result.rows.map((r) => ({
          id: r.id,
          orgId: auth.orgId,
          consumer: r.consumer,
          eventType: r.event_type,
          cursor: r.cursor,
          enabled: r.enabled,
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to list subscriptions', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to list subscriptions' },
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`EventBus service started on port ${PORT}`);
});

export default app;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telemetry_1 = require("@nova/telemetry");
const shared_1 = require("@nova/shared");
const app = (0, express_1.default)();
const logger = (0, telemetry_1.createLogger)('eventbus-service');
const PORT = process.env.PORT || shared_1.SERVICE_PORTS.EVENTBUS;
const GENESIS_HASH = '0'.repeat(64);
app.use(express_1.default.json());
app.use((req, _res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    logger.info(`${req.method} ${req.path}`, { requestId });
    next();
});
// Auth middleware helper
function extractAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    return (0, shared_1.verifyToken)(authHeader.substring(7));
}
// Health check
app.get('/health', async (_req, res) => {
    try {
        const countResult = await (0, shared_1.queryOne)('SELECT COUNT(*) as count FROM events');
        res.json({
            status: 'healthy',
            service: 'eventbus',
            eventCount: parseInt(countResult?.count || '0', 10),
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
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
app.post('/v1/events', async (req, res) => {
    try {
        const auth = extractAuth(req);
        const { type, payload, actorType, actorId, orgId } = req.body;
        // Validate required fields
        if (!type || !payload || !actorType || !actorId || !orgId) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Missing required fields' },
            });
        }
        // For authenticated requests, validate org access
        if (auth && auth.orgId !== orgId && actorType === 'USER') {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Cannot emit events to other orgs' },
            });
        }
        const event = await (0, shared_1.transaction)(async (client) => {
            // Get the last event hash for this org (for chain integrity)
            const lastEventResult = await client.query('SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1 FOR UPDATE', [orgId]);
            const prevHash = lastEventResult.rows[0]?.hash || GENESIS_HASH;
            const ts = (0, shared_1.nowTimestamp)();
            const hash = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, actorType, actorId);
            // Insert the event
            const insertResult = await client.query(`INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash`, [orgId, actorType, actorId, type, ts, JSON.stringify(payload), prevHash, hash]);
            const row = insertResult.rows[0];
            return {
                id: row.id,
                orgId: row.org_id,
                actorType: row.actor_type,
                actorId: row.actor_id,
                type: row.type,
                ts: row.ts,
                payload: JSON.parse(row.payload_json),
                prevHash: row.prev_hash,
                hash: row.hash,
            };
        });
        logger.info('Event emitted', { eventId: event.id, type });
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: { event },
        });
    }
    catch (error) {
        logger.error('Failed to emit event', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'EVENT_EMIT_FAILED', message: 'Failed to emit event' },
        });
    }
});
// POST /v1/events/query - Query events with filters
app.post('/v1/events/query', async (req, res) => {
    try {
        const auth = extractAuth(req);
        const { orgId, types, actorType, actorId, fromTs, toTs, limit = 100, offset = 0 } = req.body;
        // For authenticated requests, enforce org scope
        const effectiveOrgId = auth ? auth.orgId : orgId;
        if (!effectiveOrgId) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'orgId is required' },
            });
        }
        // Build dynamic query
        const conditions = ['org_id = $1'];
        const params = [effectiveOrgId];
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
        const countResult = await (0, shared_1.queryOne)(`SELECT COUNT(*) as count FROM events WHERE ${whereClause}`, params);
        const total = parseInt(countResult?.count || '0', 10);
        // Get events
        const effectiveLimit = Math.min(limit, 1000);
        params.push(effectiveLimit, offset);
        const result = await (0, shared_1.query)(`SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE ${whereClause}
       ORDER BY ts DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, params);
        const events = result.rows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            actorType: row.actor_type,
            actorId: row.actor_id,
            type: row.type,
            ts: row.ts,
            payload: JSON.parse(row.payload_json),
            prevHash: row.prev_hash,
            hash: row.hash,
        }));
        res.json({
            success: true,
            data: { events },
            meta: { total, limit: effectiveLimit, offset },
        });
    }
    catch (error) {
        logger.error('Failed to query events', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to query events' },
        });
    }
});
// GET /v1/events/recent - Get recent events (authenticated)
app.get('/v1/events/recent', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const result = await (0, shared_1.query)(`SELECT id, org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE org_id = $1
       ORDER BY ts DESC
       LIMIT $2`, [auth.orgId, limit]);
        const events = result.rows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            actorType: row.actor_type,
            actorId: row.actor_id,
            type: row.type,
            ts: row.ts,
            payload: JSON.parse(row.payload_json),
            prevHash: row.prev_hash,
            hash: row.hash,
        }));
        res.json({ success: true, data: { events } });
    }
    catch (error) {
        logger.error('Failed to get recent events', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get recent events' },
        });
    }
});
// GET /v1/events/:id - Get event by ID
app.get('/v1/events/:id', async (req, res) => {
    try {
        const auth = extractAuth(req);
        const eventId = req.params.id;
        const result = await (0, shared_1.queryOne)('SELECT * FROM events WHERE id = $1', [eventId]);
        if (!result) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Event not found' },
            });
        }
        // Check org access
        if (auth && auth.orgId !== result.org_id) {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Access denied' },
            });
        }
        const event = {
            id: result.id,
            orgId: result.org_id,
            actorType: result.actor_type,
            actorId: result.actor_id,
            type: result.type,
            ts: result.ts,
            payload: JSON.parse(result.payload_json),
            prevHash: result.prev_hash,
            hash: result.hash,
        };
        res.json({ success: true, data: { event } });
    }
    catch (error) {
        logger.error('Failed to get event', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get event' },
        });
    }
});
// GET /v1/events/chain/verify - Verify event chain integrity
app.get('/v1/events/chain/verify', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        // Get all events for this org in chronological order
        const result = await (0, shared_1.query)(`SELECT id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash
       FROM events WHERE org_id = $1 ORDER BY ts ASC`, [auth.orgId]);
        let valid = true;
        let brokenAt = null;
        let brokenReason = null;
        let expectedHash = GENESIS_HASH;
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
            const payload = JSON.parse(event.payload_json);
            const computedHash = (0, shared_1.computeEventHash)(event.prev_hash, payload, event.type, event.ts, event.actor_type, event.actor_id);
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
    }
    catch (error) {
        logger.error('Chain verification failed', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'VERIFY_FAILED', message: 'Failed to verify chain' },
        });
    }
});
// GET /v1/events/stats - Get event statistics
app.get('/v1/events/stats', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const [totalResult, byTypeResult, last24hResult] = await Promise.all([
            (0, shared_1.queryOne)('SELECT COUNT(*) as count FROM events WHERE org_id = $1', [auth.orgId]),
            (0, shared_1.query)(`SELECT type, COUNT(*) as count FROM events
         WHERE org_id = $1
         GROUP BY type ORDER BY count DESC LIMIT 10`, [auth.orgId]),
            (0, shared_1.queryOne)(`SELECT COUNT(*) as count FROM events
         WHERE org_id = $1 AND ts > NOW() - INTERVAL '24 hours'`, [auth.orgId]),
        ]);
        res.json({
            success: true,
            data: {
                total: parseInt(totalResult?.count || '0', 10),
                last24Hours: parseInt(last24hResult?.count || '0', 10),
                byType: byTypeResult.rows.map((r) => ({ type: r.type, count: parseInt(r.count, 10) })),
            },
        });
    }
    catch (error) {
        logger.error('Failed to get event stats', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get event stats' },
        });
    }
});
// ============================================
// Subscription Routes
// ============================================
// POST /v1/subscriptions - Create subscription
app.post('/v1/subscriptions', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { consumer, eventType, enabled = true } = req.body;
        if (!consumer || !eventType) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'consumer and eventType are required' },
            });
        }
        const result = await (0, shared_1.queryOne)(`INSERT INTO subscriptions (org_id, consumer, event_type, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING id`, [auth.orgId, consumer, eventType, enabled]);
        res.status(shared_1.HTTP_STATUS.CREATED).json({
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
    }
    catch (error) {
        logger.error('Failed to create subscription', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'CREATE_FAILED', message: 'Failed to create subscription' },
        });
    }
});
// GET /v1/subscriptions - List subscriptions
app.get('/v1/subscriptions', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const result = await (0, shared_1.query)('SELECT * FROM subscriptions WHERE org_id = $1', [auth.orgId]);
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
    }
    catch (error) {
        logger.error('Failed to list subscriptions', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to list subscriptions' },
        });
    }
});
// Start server
app.listen(PORT, () => {
    logger.info(`EventBus service started on port ${PORT}`);
});
exports.default = app;

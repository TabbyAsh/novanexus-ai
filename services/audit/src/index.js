"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telemetry_1 = require("@nova/telemetry");
const shared_1 = require("@nova/shared");
const eventing_1 = require("@nova/eventing");
const app = (0, express_1.default)();
const logger = (0, telemetry_1.createLogger)('audit-service');
const PORT = process.env.PORT || shared_1.SERVICE_PORTS.AUDIT;
// Middleware
app.use(express_1.default.json());
app.use((req, _res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    logger.info(`${req.method} ${req.path}`, { requestId });
    next();
});
// Auth middleware
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Missing authorization' },
        });
    }
    const token = authHeader.substring(7);
    const payload = (0, shared_1.verifyToken)(token);
    if (!payload) {
        return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Invalid token' },
        });
    }
    req.user = payload;
    next();
}
// Admin middleware - requires admin.audit scope
async function requireAuditScope(req, res, next) {
    const user = req.user;
    if (!user.scopes.includes('admin.audit')) {
        return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.audit scope' },
        });
    }
    next();
}
// Health check
app.get('/health', async (_req, res) => {
    try {
        await (0, shared_1.query)('SELECT 1');
        res.json({ status: 'healthy', service: 'audit', timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
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
app.get('/v1/events', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const store = (0, eventing_1.getEventStore)();
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const types = req.query.types ? req.query.types.split(',') : undefined;
        const actorType = req.query.actorType;
        const fromTs = req.query.from;
        const toTs = req.query.to;
        const events = await store.getEvents({
            orgId: user.orgId,
            types,
            actorType: actorType,
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
    }
    catch (error) {
        logger.error('Failed to list events', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to list events' },
        });
    }
});
// GET /v1/events/:id - Get single event
app.get('/v1/events/:id', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const store = (0, eventing_1.getEventStore)();
        const event = await store.getEventById(req.params.id);
        if (!event) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Event not found' },
            });
        }
        // Verify org ownership
        if (event.orgId !== user.orgId) {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Access denied' },
            });
        }
        res.json({ success: true, data: { event } });
    }
    catch (error) {
        logger.error('Failed to get event', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get event' },
        });
    }
});
// GET /v1/events/stats - Event statistics
app.get('/v1/events/stats', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const store = (0, eventing_1.getEventStore)();
        const totalCount = await store.getTotalCount(user.orgId);
        const countsByType = await store.countEventsByType(user.orgId);
        res.json({
            success: true,
            data: {
                totalCount,
                countsByType,
            },
        });
    }
    catch (error) {
        logger.error('Failed to get event stats', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get stats' },
        });
    }
});
// ============================================
// Admin Audit Endpoints
// ============================================
// GET /admin/audit/verify - Verify hash chain integrity
app.get('/admin/audit/verify', requireAuth, requireAuditScope, async (req, res) => {
    const requestId = req.headers['x-request-id'];
    try {
        const user = req.user;
        const store = (0, eventing_1.getEventStore)();
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
    }
    catch (error) {
        logger.error('Audit verification failed', error, { requestId });
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.EXTERNAL_API_ERROR, message: 'Verification failed' },
        });
    }
});
// GET /admin/audit/summary - Get audit summary for all orgs (super admin)
app.get('/admin/audit/summary', requireAuth, requireAuditScope, async (req, res) => {
    try {
        const user = req.user;
        // Only OWNER role can see all orgs
        if (user.role !== 'OWNER') {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires OWNER role' },
            });
        }
        // Get summary stats
        const totalEventsResult = await (0, shared_1.queryOne)('SELECT COUNT(*) as count FROM events');
        const totalEvents = parseInt(totalEventsResult?.count || '0', 10);
        const eventsByOrgResult = await (0, shared_1.query)('SELECT org_id, COUNT(*) as count FROM events GROUP BY org_id ORDER BY count DESC LIMIT 10');
        const eventsByTypeResult = await (0, shared_1.query)('SELECT type, COUNT(*) as count FROM events GROUP BY type ORDER BY count DESC LIMIT 20');
        const recentEventsResult = await (0, shared_1.query)('SELECT type, ts, actor_type FROM events ORDER BY ts DESC LIMIT 10');
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
    }
    catch (error) {
        logger.error('Failed to get audit summary', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.EXTERNAL_API_ERROR, message: 'Failed to get summary' },
        });
    }
});
// Start server
app.listen(PORT, () => {
    logger.info(`Audit service started on port ${PORT}`);
});
exports.default = app;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telemetry_1 = require("@nova/telemetry");
const shared_1 = require("@nova/shared");
const app = (0, express_1.default)();
const logger = (0, telemetry_1.createLogger)('orchestrator-service');
const PORT = process.env.PORT || shared_1.SERVICE_PORTS.ORCHESTRATOR;
// Valid state transitions
const GOAL_TRANSITIONS = {
    NEW: ['PLANNED', 'CANCELLED'],
    PLANNED: ['EXECUTING', 'BLOCKED', 'CANCELLED'],
    EXECUTING: ['REVIEW', 'BLOCKED', 'CANCELLED'],
    REVIEW: ['COMPLETE', 'EXECUTING', 'CANCELLED'],
    COMPLETE: [],
    BLOCKED: ['PLANNED', 'CANCELLED'],
    CANCELLED: [],
};
const TASK_TRANSITIONS = {
    QUEUED: ['RUNNING', 'FAILED'],
    RUNNING: ['DONE', 'NEEDS_APPROVAL', 'FAILED', 'RETRYING'],
    NEEDS_APPROVAL: ['RUNNING', 'FAILED'],
    DONE: [],
    FAILED: ['RETRYING', 'QUEUED'],
    RETRYING: ['RUNNING', 'FAILED'],
};
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
function parseJsonOptional(value) {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }
    return value;
}
function parseJsonValue(value, fallback) {
    const parsed = parseJsonOptional(value);
    return parsed === undefined ? fallback : parsed;
}
// Event emission helper
async function emitEvent(orgId, actorType, actorId, type, payload) {
    try {
        const lastEvent = await (0, shared_1.queryOne)('SELECT hash FROM events WHERE org_id = $1 ORDER BY ts DESC LIMIT 1', [orgId]);
        const prevHash = lastEvent?.hash || '0'.repeat(64);
        const ts = (0, shared_1.nowTimestamp)();
        const hash = (0, shared_1.computeEventHash)(prevHash, payload, type, ts, actorType, actorId);
        await (0, shared_1.query)(`INSERT INTO events (org_id, actor_type, actor_id, type, ts, payload_json, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [orgId, actorType, actorId, type, ts, JSON.stringify(payload), prevHash, hash]);
    }
    catch (error) {
        logger.error('Failed to emit event', error);
    }
}
// Kill switch helper
async function getKillSwitchState() {
    const result = await (0, shared_1.queryOne)("SELECT value_json FROM system_state WHERE key = 'kill_switch'");
    if (!result)
        return { enabled: false };
    return parseJsonValue(result.value_json, { enabled: false });
}
async function setKillSwitchState(state) {
    await (0, shared_1.query)(`INSERT INTO system_state (key, value_json, updated_at) 
     VALUES ('kill_switch', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = $1, updated_at = NOW()`, [JSON.stringify(state)]);
}
// Health check
app.get('/health', async (_req, res) => {
    try {
        await (0, shared_1.query)('SELECT 1');
        const killSwitch = await getKillSwitchState();
        res.json({
            status: 'healthy',
            service: 'orchestrator',
            killSwitch: killSwitch.enabled,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(shared_1.HTTP_STATUS.SERVICE_UNAVAILABLE).json({
            status: 'unhealthy',
            service: 'orchestrator',
            error: 'Database connection failed',
        });
    }
});
// ============================================
// Goal Routes
// ============================================
// POST /v1/goals - Create a new goal
app.post('/v1/goals', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { title, intent, constraints } = req.body;
        if (!title || !intent) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Title and intent are required' },
            });
        }
        const result = await (0, shared_1.queryOne)(`INSERT INTO goals (org_id, created_by, title, intent, constraints_json, status)
       VALUES ($1, $2, $3, $4, $5, 'NEW')
       RETURNING *`, [auth.orgId, auth.userId, title, intent, JSON.stringify(constraints || {})]);
        if (!result)
            throw new Error('Failed to insert goal');
        const goal = {
            id: result.id,
            orgId: result.org_id,
            createdBy: result.created_by,
            title: result.title,
            intent: result.intent,
            constraints: parseJsonValue(result.constraints_json, {}),
            status: result.status,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.GOAL_CREATED, {
            goalId: goal.id,
            title: goal.title,
            intent: goal.intent,
        });
        logger.info('Goal created', { goalId: goal.id, intent });
        res.status(shared_1.HTTP_STATUS.CREATED).json({ success: true, data: { goal } });
    }
    catch (error) {
        logger.error('Failed to create goal', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'GOAL_CREATE_FAILED', message: 'Failed to create goal' },
        });
    }
});
// GET /v1/goals/:id - Get goal by ID
app.get('/v1/goals/:id', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const result = await (0, shared_1.queryOne)('SELECT * FROM goals WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!result) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Goal not found' },
            });
        }
        const goal = {
            id: result.id,
            orgId: result.org_id,
            createdBy: result.created_by,
            title: result.title,
            intent: result.intent,
            constraints: parseJsonValue(result.constraints_json, {}),
            status: result.status,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
        res.json({ success: true, data: { goal } });
    }
    catch (error) {
        logger.error('Failed to get goal', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get goal' },
        });
    }
});
// GET /v1/goals - List goals
app.get('/v1/goals', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { status } = req.query;
        let sql = 'SELECT * FROM goals WHERE org_id = $1';
        const params = [auth.orgId];
        if (status) {
            sql += ' AND status = $2';
            params.push(status);
        }
        sql += ' ORDER BY created_at DESC';
        const result = await (0, shared_1.query)(sql, params);
        const goals = result.rows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            createdBy: row.created_by,
            title: row.title,
            intent: row.intent,
            constraints: parseJsonValue(row.constraints_json, {}),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        res.json({ success: true, data: { goals } });
    }
    catch (error) {
        logger.error('Failed to list goals', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to list goals' },
        });
    }
});
// PATCH /v1/goals/:id/status - Update goal status
app.patch('/v1/goals/:id/status', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { status: newStatus } = req.body;
        if (!newStatus) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Status is required' },
            });
        }
        const current = await (0, shared_1.queryOne)('SELECT status FROM goals WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!current) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Goal not found' },
            });
        }
        const allowedTransitions = GOAL_TRANSITIONS[current.status];
        if (!allowedTransitions.includes(newStatus)) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INVALID_INPUT,
                    message: `Cannot transition from ${current.status} to ${newStatus}`,
                },
            });
        }
        await (0, shared_1.query)('UPDATE goals SET status = $1, updated_at = NOW() WHERE id = $2', [
            newStatus,
            req.params.id,
        ]);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.GOAL_UPDATED, {
            goalId: req.params.id,
            previousStatus: current.status,
            newStatus,
        });
        res.json({ success: true, data: { goalId: req.params.id, status: newStatus } });
    }
    catch (error) {
        logger.error('Failed to update goal status', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'UPDATE_FAILED', message: 'Failed to update goal status' },
        });
    }
});
// ============================================
// Task Routes
// ============================================
// POST /v1/tasks - Create a task
app.post('/v1/tasks', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { goalId, type, assignedToBot, input } = req.body;
        if (!goalId || !type || !assignedToBot) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'goalId, type, and assignedToBot are required' },
            });
        }
        const normalizedAssigned = normalizeBotType(assignedToBot);
        if (!normalizedAssigned) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INVALID_INPUT,
                    message: `Invalid assignedToBot. Must be one of: ${CANONICAL_BOT_TYPES.join(', ')}`,
                },
            });
        }
        if (normalizedAssigned.wasNormalized) {
            logger.warn('Normalized assignedToBot to canonical form', {
                original: assignedToBot,
                normalized: normalizedAssigned.normalized,
            });
        }
        const result = await (0, shared_1.queryOne)(`INSERT INTO tasks (org_id, goal_id, assigned_to_bot, type, status, input_json)
       VALUES ($1, $2, $3, $4, 'QUEUED', $5)
       RETURNING *`, [auth.orgId, goalId, normalizedAssigned.normalized, type, JSON.stringify(input || {})]);
        if (!result)
            throw new Error('Failed to insert task');
        const task = {
            id: result.id,
            orgId: result.org_id,
            goalId: result.goal_id,
            assignedToBot: result.assigned_to_bot,
            type: result.type,
            status: result.status,
            input: parseJsonValue(result.input_json, {}),
            output: parseJsonOptional(result.output_json),
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
        emitEvent(auth.orgId, 'SYSTEM', 'orchestrator', shared_1.EVENT_TYPES.TASK_CREATED, {
            taskId: task.id,
            goalId: task.goalId,
            bot: task.assignedToBot,
            type: task.type,
        });
        res.status(shared_1.HTTP_STATUS.CREATED).json({ success: true, data: { task } });
    }
    catch (error) {
        logger.error('Failed to create task', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'TASK_CREATE_FAILED', message: 'Failed to create task' },
        });
    }
});
// GET /v1/tasks - List tasks
app.get('/v1/tasks', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { goalId, status, bot } = req.query;
        let sql = 'SELECT * FROM tasks WHERE org_id = $1';
        const params = [auth.orgId];
        let paramIndex = 2;
        if (goalId) {
            sql += ` AND goal_id = $${paramIndex++}`;
            params.push(goalId);
        }
        if (status) {
            sql += ` AND status = $${paramIndex++}`;
            params.push(status);
        }
        if (bot) {
            const normalizedBot = normalizeBotType(String(bot));
            if (!normalizedBot) {
                return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: {
                        code: shared_1.ERROR_CODES.INVALID_INPUT,
                        message: `Invalid bot filter. Must be one of: ${CANONICAL_BOT_TYPES.join(', ')}`,
                    },
                });
            }
            sql += ` AND assigned_to_bot = $${paramIndex++}`;
            params.push(normalizedBot.normalized);
        }
        sql += ' ORDER BY created_at DESC';
        const result = await (0, shared_1.query)(sql, params);
        const tasks = result.rows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            goalId: row.goal_id,
            assignedToBot: row.assigned_to_bot,
            type: row.type,
            status: row.status,
            input: parseJsonValue(row.input_json, {}),
            output: parseJsonOptional(row.output_json),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        res.json({ success: true, data: { tasks } });
    }
    catch (error) {
        logger.error('Failed to list tasks', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to list tasks' },
        });
    }
});
// PATCH /v1/tasks/:id/status - Update task status
app.patch('/v1/tasks/:id/status', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { status: newStatus, output } = req.body;
        if (!newStatus) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Status is required' },
            });
        }
        const current = await (0, shared_1.queryOne)('SELECT status, goal_id FROM tasks WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!current) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Task not found' },
            });
        }
        const allowedTransitions = TASK_TRANSITIONS[current.status];
        if (!allowedTransitions.includes(newStatus)) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INVALID_INPUT,
                    message: `Cannot transition from ${current.status} to ${newStatus}`,
                },
            });
        }
        if (output) {
            await (0, shared_1.query)('UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3', [newStatus, JSON.stringify(output), req.params.id]);
        }
        else {
            await (0, shared_1.query)('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', [
                newStatus,
                req.params.id,
            ]);
        }
        const eventType = newStatus === 'DONE'
            ? shared_1.EVENT_TYPES.TASK_COMPLETED
            : newStatus === 'FAILED'
                ? shared_1.EVENT_TYPES.TASK_FAILED
                : newStatus === 'RUNNING'
                    ? shared_1.EVENT_TYPES.TASK_STARTED
                    : 'orchestrator.task.updated';
        emitEvent(auth.orgId, 'SYSTEM', 'orchestrator', eventType, {
            taskId: req.params.id,
            goalId: current.goal_id,
            previousStatus: current.status,
            newStatus,
        });
        res.json({ success: true, data: { taskId: req.params.id, status: newStatus } });
    }
    catch (error) {
        logger.error('Failed to update task status', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'UPDATE_FAILED', message: 'Failed to update task status' },
        });
    }
});
// ============================================
// Approval Routes
// ============================================
// GET /v1/approvals - List pending approvals
app.get('/v1/approvals', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { status = 'PENDING' } = req.query;
        const result = await (0, shared_1.query)('SELECT * FROM approvals WHERE org_id = $1 AND status = $2 ORDER BY requested_at DESC', [auth.orgId, status]);
        const approvals = result.rows.map((row) => ({
            id: row.id,
            orgId: row.org_id,
            taskId: row.task_id,
            requiredRole: row.required_role,
            status: row.status,
            requestedAt: row.requested_at,
            resolvedAt: row.resolved_at,
            resolution: parseJsonOptional(row.resolution_json),
        }));
        res.json({ success: true, data: { approvals } });
    }
    catch (error) {
        logger.error('Failed to list approvals', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to list approvals' },
        });
    }
});
// POST /v1/approvals/:id/approve
app.post('/v1/approvals/:id/approve', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const approval = await (0, shared_1.queryOne)('SELECT * FROM approvals WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!approval) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Approval not found' },
            });
        }
        if (approval.status !== 'PENDING') {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Approval is not pending' },
            });
        }
        await (0, shared_1.query)(`UPDATE approvals SET status = 'APPROVED', resolved_at = NOW(), resolution_json = $1 WHERE id = $2`, [JSON.stringify({ approvedBy: auth.userId, ...req.body }), req.params.id]);
        // Resume the task
        await (0, shared_1.query)("UPDATE tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = $1", [
            approval.task_id,
        ]);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.APPROVAL_RESOLVED, {
            approvalId: req.params.id,
            taskId: approval.task_id,
            resolution: 'APPROVED',
        });
        res.json({ success: true, data: { approvalId: req.params.id, status: 'APPROVED' } });
    }
    catch (error) {
        logger.error('Failed to approve', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'APPROVE_FAILED', message: 'Failed to approve' },
        });
    }
});
// POST /v1/approvals/:id/reject
app.post('/v1/approvals/:id/reject', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const { reason } = req.body;
        const approval = await (0, shared_1.queryOne)('SELECT * FROM approvals WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!approval) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Approval not found' },
            });
        }
        if (approval.status !== 'PENDING') {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'Approval is not pending' },
            });
        }
        await (0, shared_1.query)(`UPDATE approvals SET status = 'REJECTED', resolved_at = NOW(), resolution_json = $1 WHERE id = $2`, [JSON.stringify({ rejectedBy: auth.userId, reason }), req.params.id]);
        // Fail the task
        await (0, shared_1.query)("UPDATE tasks SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [
            approval.task_id,
        ]);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.APPROVAL_RESOLVED, {
            approvalId: req.params.id,
            taskId: approval.task_id,
            resolution: 'REJECTED',
            reason,
        });
        res.json({ success: true, data: { approvalId: req.params.id, status: 'REJECTED' } });
    }
    catch (error) {
        logger.error('Failed to reject', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'REJECT_FAILED', message: 'Failed to reject' },
        });
    }
});
// ============================================
// Kill Switch Routes
// ============================================
// POST /v1/kill-switch/enable
app.post('/v1/kill-switch/enable', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        if (!auth.scopes.includes('admin.killswitch')) {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.killswitch scope' },
            });
        }
        const { reason } = req.body;
        const state = {
            enabled: true,
            enabledAt: (0, shared_1.nowTimestamp)(),
            enabledBy: auth.userId,
            reason,
        };
        await setKillSwitchState(state);
        // Cancel all running tasks
        await (0, shared_1.query)(`UPDATE tasks SET status = 'FAILED', updated_at = NOW() WHERE org_id = $1 AND status IN ('QUEUED', 'RUNNING')`, [auth.orgId]);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.KILL_SWITCH_ENABLED, {
            reason,
            cancelledTasks: true,
        });
        logger.warn('Kill switch ENABLED - all automation disabled', { userId: auth.userId, reason });
        res.json({ success: true, data: state });
    }
    catch (error) {
        logger.error('Failed to enable kill switch', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'KILLSWITCH_FAILED', message: 'Failed to enable kill switch' },
        });
    }
});
// POST /v1/kill-switch/disable
app.post('/v1/kill-switch/disable', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        if (!auth.scopes.includes('admin.killswitch')) {
            return res.status(shared_1.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.killswitch scope' },
            });
        }
        const state = { enabled: false };
        await setKillSwitchState(state);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.KILL_SWITCH_DISABLED, {});
        logger.info('Kill switch disabled - automation resumed', { userId: auth.userId });
        res.json({ success: true, data: state });
    }
    catch (error) {
        logger.error('Failed to disable kill switch', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'KILLSWITCH_FAILED', message: 'Failed to disable kill switch' },
        });
    }
});
// GET /v1/kill-switch/status
app.get('/v1/kill-switch/status', async (req, res) => {
    try {
        const state = await getKillSwitchState();
        res.json({ success: true, data: state });
    }
    catch (error) {
        logger.error('Failed to get kill switch status', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get kill switch status' },
        });
    }
});
// ============================================
// Bot Registry Routes
// ============================================
const CANONICAL_BOT_TYPES = [
    'tradebot',
    'storebot',
    'socialbot',
    'researchbot',
    'opsbot',
    'forgebot',
];
function normalizeBotType(input) {
    if (!input)
        return null;
    const raw = String(input).trim();
    const lower = raw.toLowerCase();
    let normalized = null;
    if (lower === 'trade' || lower === 'tradebot')
        normalized = 'tradebot';
    if (lower === 'store' || lower === 'storebot')
        normalized = 'storebot';
    if (lower === 'social' || lower === 'socialbot')
        normalized = 'socialbot';
    if (lower === 'research' || lower === 'researchbot')
        normalized = 'researchbot';
    if (lower === 'ops' || lower === 'opsbot')
        normalized = 'opsbot';
    if (lower === 'forge' || lower === 'forgebot')
        normalized = 'forgebot';
    if (!normalized)
        return null;
    return { normalized, wasNormalized: raw !== normalized };
}
// POST /v1/bots/register - Register a bot instance
app.post('/v1/bots/register', async (req, res) => {
    try {
        const { botType, instanceId, capabilities, permissions, metadata } = req.body;
        if (!botType || !instanceId) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'botType and instanceId are required' },
            });
        }
        const normalized = normalizeBotType(botType);
        if (!normalized) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INVALID_INPUT,
                    message: `Invalid botType. Must be one of: ${CANONICAL_BOT_TYPES.join(', ')}`,
                },
            });
        }
        if (normalized.wasNormalized) {
            logger.warn('Normalized botType to canonical form', { original: botType, normalized: normalized.normalized });
        }
        const result = await (0, shared_1.queryOne)(`INSERT INTO bots (bot_type, instance_id, status, capabilities_json, permissions_json, metadata_json, last_heartbeat)
       VALUES ($1, $2, 'ONLINE', $3, $4, $5, NOW())
       ON CONFLICT (bot_type, instance_id) DO UPDATE SET
         status = 'ONLINE',
         capabilities_json = $3,
         permissions_json = $4,
         metadata_json = $5,
         last_heartbeat = NOW(),
         updated_at = NOW()
       RETURNING *`, [
            normalized.normalized,
            instanceId,
            JSON.stringify(capabilities || []),
            JSON.stringify(permissions || []),
            JSON.stringify(metadata || {}),
        ]);
        const bot = {
            id: result.id,
            botType: result.bot_type,
            instanceId: result.instance_id,
            status: result.status,
            capabilities: parseJsonValue(result.capabilities_json, []),
            permissions: parseJsonValue(result.permissions_json, []),
            lastHeartbeat: result.last_heartbeat,
            registeredAt: result.registered_at,
        };
        logger.info('Bot registered', { botType: normalized.normalized, instanceId });
        res.status(shared_1.HTTP_STATUS.CREATED).json({ success: true, data: { bot } });
    }
    catch (error) {
        logger.error('Failed to register bot', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'BOT_REGISTER_FAILED', message: 'Failed to register bot' },
        });
    }
});
// GET /v1/bots - List registered bots
app.get('/v1/bots', async (req, res) => {
    try {
        const { type, status } = req.query;
        let sql = 'SELECT * FROM bots WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        if (type) {
            const normalizedType = normalizeBotType(String(type));
            if (!normalizedType) {
                return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: {
                        code: shared_1.ERROR_CODES.INVALID_INPUT,
                        message: `Invalid bot type filter. Must be one of: ${CANONICAL_BOT_TYPES.join(', ')}`,
                    },
                });
            }
            sql += ` AND bot_type = $${paramIndex++}`;
            params.push(normalizedType.normalized);
        }
        if (status) {
            sql += ` AND status = $${paramIndex++}`;
            params.push(status);
        }
        sql += ' ORDER BY bot_type, instance_id';
        const result = await (0, shared_1.query)(sql, params);
        const bots = result.rows.map((row) => ({
            id: row.id,
            botType: row.bot_type,
            instanceId: row.instance_id,
            status: row.status,
            capabilities: parseJsonValue(row.capabilities_json, []),
            permissions: parseJsonValue(row.permissions_json, []),
            lastHeartbeat: row.last_heartbeat,
            registeredAt: row.registered_at,
        }));
        res.json({ success: true, data: { bots } });
    }
    catch (error) {
        logger.error('Failed to list bots', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to list bots' },
        });
    }
});
// POST /v1/bots/:id/heartbeat - Bot heartbeat
app.post('/v1/bots/:id/heartbeat', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await (0, shared_1.queryOne)(`UPDATE bots SET last_heartbeat = NOW(), status = COALESCE($1, status), updated_at = NOW()
       WHERE id = $2 RETURNING *`, [status, req.params.id]);
        if (!result) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
            });
        }
        res.json({ success: true, data: { lastHeartbeat: result.last_heartbeat } });
    }
    catch (error) {
        logger.error('Heartbeat failed', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'HEARTBEAT_FAILED', message: 'Heartbeat failed' },
        });
    }
});
// DELETE /v1/bots/:id - Unregister a bot
app.delete('/v1/bots/:id', async (req, res) => {
    try {
        const result = await (0, shared_1.query)('DELETE FROM bots WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
            });
        }
        logger.info('Bot unregistered', { botId: req.params.id });
        res.json({ success: true, data: { message: 'Bot unregistered' } });
    }
    catch (error) {
        logger.error('Failed to unregister bot', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'UNREGISTER_FAILED', message: 'Failed to unregister bot' },
        });
    }
});
// GET /v1/bots/:id/tasks - Get tasks assigned to a bot
app.get('/v1/bots/:id/tasks', async (req, res) => {
    try {
        const botId = req.params.id;
        // Verify bot exists
        const bot = await (0, shared_1.queryOne)('SELECT * FROM bots WHERE id = $1', [botId]);
        if (!bot) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
            });
        }
        // Find queued tasks that can be assigned to this bot type
        const tasks = await (0, shared_1.query)(`SELECT t.* FROM tasks t
       WHERE t.status = 'QUEUED'
       AND (t.assigned_to_bot IS NULL OR t.assigned_to_bot = $1)
       ORDER BY t.created_at ASC
       LIMIT 5`, [bot.bot_type]);
        const result = tasks.rows.map((row) => ({
            id: row.id,
            goalId: row.goal_id,
            botId: row.assigned_to_bot,
            type: row.type,
            priority: row.priority || 0,
            status: row.status,
            inputJson: parseJsonValue(row.input_json, {}),
            createdAt: row.created_at,
            startedAt: row.started_at,
        }));
        res.json(result);
    }
    catch (error) {
        logger.error('Failed to get bot tasks', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get bot tasks' },
        });
    }
});
// POST /v1/tasks/:id/progress - Report task progress
app.post('/v1/tasks/:id/progress', async (req, res) => {
    try {
        const { progress, message } = req.body;
        const task = await (0, shared_1.queryOne)('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
        if (!task) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Task not found' },
            });
        }
        // Update task with progress (store in output_json for now)
        const progressData = { progress, message, updatedAt: new Date().toISOString() };
        await (0, shared_1.query)(`UPDATE tasks SET 
       output_json = jsonb_set(COALESCE(output_json::jsonb, '{}'::jsonb), '{progress}', $1::jsonb),
       status = CASE WHEN status = 'QUEUED' THEN 'RUNNING' ELSE status END,
       updated_at = NOW()
       WHERE id = $2`, [JSON.stringify(progressData), req.params.id]);
        res.json({ success: true, data: { taskId: req.params.id, progress } });
    }
    catch (error) {
        logger.error('Failed to update task progress', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'UPDATE_FAILED', message: 'Failed to update task progress' },
        });
    }
});
// POST /v1/tasks/:id/complete - Complete a task
app.post('/v1/tasks/:id/complete', async (req, res) => {
    try {
        const { status, output, error: errorMsg, metrics } = req.body;
        const task = await (0, shared_1.queryOne)('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
        if (!task) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Task not found' },
            });
        }
        const finalStatus = status === 'DONE' ? 'DONE' : 'FAILED';
        const outputJson = JSON.stringify({ result: output, error: errorMsg, metrics });
        await (0, shared_1.query)(`UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3`, [finalStatus, outputJson, req.params.id]);
        // Record task run in task_runs table if bot is specified
        const botId = req.headers['x-bot-id'];
        if (botId) {
            await (0, shared_1.query)(`INSERT INTO task_runs (task_id, bot_id, started_at, completed_at, status, result_json)
         VALUES ($1, $2, $3, NOW(), $4, $5)`, [req.params.id, botId, task.created_at, finalStatus, outputJson]);
        }
        logger.info('Task completed', { taskId: req.params.id, status: finalStatus });
        res.json({ success: true, data: { taskId: req.params.id, status: finalStatus } });
    }
    catch (error) {
        logger.error('Failed to complete task', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'UPDATE_FAILED', message: 'Failed to complete task' },
        });
    }
});
// POST /v1/events - Emit an event from a bot
app.post('/v1/events', async (req, res) => {
    try {
        const { type, source, data } = req.body;
        if (!type || !source) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.INVALID_INPUT, message: 'type and source are required' },
            });
        }
        // Extract bot ID from source if it's a bot event
        const botMatch = source.match(/^bot:(.+)$/);
        const actorType = botMatch ? 'BOT' : 'SYSTEM';
        const actorId = botMatch ? botMatch[1] : source;
        // For bot events, we use a system org since bots may not have org context
        const orgId = 'system';
        emitEvent(orgId, actorType, actorId, type, data || {});
        res.json({ success: true, data: { type, source } });
    }
    catch (error) {
        logger.error('Failed to emit event', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'EMIT_FAILED', message: 'Failed to emit event' },
        });
    }
});
// ============================================
// Task Cancel Endpoint
// ============================================
// POST /v1/tasks/:id/cancel - Cancel a task
app.post('/v1/tasks/:id/cancel', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const current = await (0, shared_1.queryOne)('SELECT status, goal_id FROM tasks WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!current) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Task not found' },
            });
        }
        // Can only cancel tasks that are not already done or failed
        const cancellableStatuses = ['QUEUED', 'RUNNING', 'NEEDS_APPROVAL', 'RETRYING'];
        if (!cancellableStatuses.includes(current.status)) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.INVALID_INPUT,
                    message: `Cannot cancel task in ${current.status} status`,
                },
            });
        }
        await (0, shared_1.query)('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', [
            'FAILED',
            req.params.id,
        ]);
        // Cancel any pending approval
        await (0, shared_1.query)(`UPDATE approvals SET status = 'REJECTED', resolved_at = NOW(), 
       resolution_json = $1 WHERE task_id = $2 AND status = 'PENDING'`, [JSON.stringify({ cancelledBy: auth.userId, reason: 'Task cancelled' }), req.params.id]);
        emitEvent(auth.orgId, 'USER', auth.userId, shared_1.EVENT_TYPES.TASK_FAILED, {
            taskId: req.params.id,
            goalId: current.goal_id,
            previousStatus: current.status,
            reason: 'Cancelled by user',
        });
        logger.info('Task cancelled', { taskId: req.params.id, userId: auth.userId });
        res.json({ success: true, data: { taskId: req.params.id, status: 'FAILED', cancelled: true } });
    }
    catch (error) {
        logger.error('Failed to cancel task', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'CANCEL_FAILED', message: 'Failed to cancel task' },
        });
    }
});
// GET /v1/tasks/:id - Get task by ID
app.get('/v1/tasks/:id', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const result = await (0, shared_1.queryOne)('SELECT * FROM tasks WHERE id = $1 AND org_id = $2', [req.params.id, auth.orgId]);
        if (!result) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Task not found' },
            });
        }
        const task = {
            id: result.id,
            orgId: result.org_id,
            goalId: result.goal_id,
            assignedToBot: result.assigned_to_bot,
            type: result.type,
            status: result.status,
            input: parseJsonValue(result.input_json, {}),
            output: parseJsonOptional(result.output_json),
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
        res.json({ success: true, data: { task } });
    }
    catch (error) {
        logger.error('Failed to get task', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get task' },
        });
    }
});
// ============================================
// Dashboard Stats
// ============================================
app.get('/v1/stats', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(shared_1.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
            });
        }
        const [goalsResult, tasksResult, approvalsResult] = await Promise.all([
            (0, shared_1.query)('SELECT status, COUNT(*) as count FROM goals WHERE org_id = $1 GROUP BY status', [auth.orgId]),
            (0, shared_1.query)('SELECT status, COUNT(*) as count FROM tasks WHERE org_id = $1 GROUP BY status', [auth.orgId]),
            (0, shared_1.queryOne)("SELECT COUNT(*) as count FROM approvals WHERE org_id = $1 AND status = 'PENDING'", [auth.orgId]),
        ]);
        const killSwitch = await getKillSwitchState();
        res.json({
            success: true,
            data: {
                goals: goalsResult.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count, 10) }), {}),
                tasks: tasksResult.rows.reduce((acc, r) => ({ ...acc, [r.status]: parseInt(r.count, 10) }), {}),
                pendingApprovals: parseInt(approvalsResult?.count || '0', 10),
                killSwitch,
            },
        });
    }
    catch (error) {
        logger.error('Failed to get stats', error);
        res.status(shared_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: { code: 'QUERY_FAILED', message: 'Failed to get stats' },
        });
    }
});
// Start server
app.listen(PORT, () => {
    logger.info(`Orchestrator service started on port ${PORT}`);
});
exports.default = app;

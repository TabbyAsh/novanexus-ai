import express, { Request, Response, NextFunction } from 'express';
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
  computeEventHash,
  nowTimestamp,
} from '@nova/shared';
import type {
  ApiResponse,
  Goal,
  Task,
  Approval,
  GoalStatus,
  TaskStatus,
  BotType,
  JWTPayload,
  KillSwitchState,
} from '@nova/shared';

const app = express();
const logger = createLogger('orchestrator-service');
const PORT = process.env.PORT || SERVICE_PORTS.ORCHESTRATOR;

// Valid state transitions
const GOAL_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  NEW: ['PLANNED', 'CANCELLED'],
  PLANNED: ['EXECUTING', 'BLOCKED', 'CANCELLED'],
  EXECUTING: ['REVIEW', 'BLOCKED', 'CANCELLED'],
  REVIEW: ['COMPLETE', 'EXECUTING', 'CANCELLED'],
  COMPLETE: [],
  BLOCKED: ['PLANNED', 'CANCELLED'],
  CANCELLED: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  QUEUED: ['RUNNING', 'FAILED'],
  RUNNING: ['DONE', 'NEEDS_APPROVAL', 'FAILED', 'RETRYING'],
  NEEDS_APPROVAL: ['RUNNING', 'FAILED'],
  DONE: [],
  FAILED: ['RETRYING', 'QUEUED'],
  RETRYING: ['RUNNING', 'FAILED'],
};

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

// Event emission helper
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

// Kill switch helper
async function getKillSwitchState(): Promise<KillSwitchState> {
  const result = await queryOne<{ value_json: unknown }>(
    "SELECT value_json FROM system_state WHERE key = 'kill_switch'"
  );
  if (!result) return { enabled: false };
  return parseJsonValue<KillSwitchState>(result.value_json, { enabled: false });
}

async function setKillSwitchState(state: KillSwitchState): Promise<void> {
  await query(
    `INSERT INTO system_state (key, value_json, updated_at) 
     VALUES ('kill_switch', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = $1, updated_at = NOW()`,
    [JSON.stringify(state)]
  );
}

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    const killSwitch = await getKillSwitchState();
    res.json({
      status: 'healthy',
      service: 'orchestrator',
      killSwitch: killSwitch.enabled,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
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
app.post('/v1/goals', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { title, intent, constraints } = req.body;

    if (!title || !intent) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Title and intent are required' },
      });
    }

    const result = await queryOne<{
      id: string;
      org_id: string;
      created_by: string;
      title: string;
      intent: string;
      constraints_json: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO goals (org_id, created_by, title, intent, constraints_json, status)
       VALUES ($1, $2, $3, $4, $5, 'NEW')
       RETURNING *`,
      [auth.orgId, auth.userId, title, intent, JSON.stringify(constraints || {})]
    );

    if (!result) throw new Error('Failed to insert goal');

    const goal: Goal = {
      id: result.id,
      orgId: result.org_id,
      createdBy: result.created_by,
      title: result.title,
      intent: result.intent,
      constraints: parseJsonValue<Record<string, unknown>>(result.constraints_json, {}),
      status: result.status as GoalStatus,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.GOAL_CREATED, {
      goalId: goal.id,
      title: goal.title,
      intent: goal.intent,
    });

    logger.info('Goal created', { goalId: goal.id, intent });
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { goal } });
  } catch (error) {
    logger.error('Failed to create goal', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'GOAL_CREATE_FAILED', message: 'Failed to create goal' },
    });
  }
});

// GET /v1/goals/:id - Get goal by ID
app.get('/v1/goals/:id', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const result = await queryOne<any>(
      'SELECT * FROM goals WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Goal not found' },
      });
    }

    const goal: Goal = {
      id: result.id,
      orgId: result.org_id,
      createdBy: result.created_by,
      title: result.title,
      intent: result.intent,
      constraints: parseJsonValue<Record<string, unknown>>(result.constraints_json, {}),
      status: result.status,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };

    res.json({ success: true, data: { goal } });
  } catch (error) {
    logger.error('Failed to get goal', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get goal' },
    });
  }
});

// GET /v1/goals - List goals
app.get('/v1/goals', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { status } = req.query;
    let sql = 'SELECT * FROM goals WHERE org_id = $1';
    const params: any[] = [auth.orgId];

    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<any>(sql, params);

    const goals: Goal[] = result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      createdBy: row.created_by,
      title: row.title,
      intent: row.intent,
      constraints: parseJsonValue<Record<string, unknown>>(row.constraints_json, {}),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({ success: true, data: { goals } });
  } catch (error) {
    logger.error('Failed to list goals', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to list goals' },
    });
  }
});

// PATCH /v1/goals/:id/status - Update goal status
app.patch('/v1/goals/:id/status', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { status: newStatus } = req.body;
    if (!newStatus) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Status is required' },
      });
    }

    const current = await queryOne<{ status: string }>(
      'SELECT status FROM goals WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!current) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Goal not found' },
      });
    }

    const allowedTransitions = GOAL_TRANSITIONS[current.status as GoalStatus];
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: `Cannot transition from ${current.status} to ${newStatus}`,
        },
      });
    }

    await query('UPDATE goals SET status = $1, updated_at = NOW() WHERE id = $2', [
      newStatus,
      req.params.id,
    ]);

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.GOAL_UPDATED, {
      goalId: req.params.id,
      previousStatus: current.status,
      newStatus,
    });

    res.json({ success: true, data: { goalId: req.params.id, status: newStatus } });
  } catch (error) {
    logger.error('Failed to update goal status', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update goal status' },
    });
  }
});

// ============================================
// Task Routes
// ============================================

// POST /v1/tasks - Create a task
app.post('/v1/tasks', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { goalId, type, assignedToBot, input } = req.body;

    if (!goalId || !type || !assignedToBot) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'goalId, type, and assignedToBot are required' },
      });
    }

    const result = await queryOne<any>(
      `INSERT INTO tasks (org_id, goal_id, assigned_to_bot, type, status, input_json)
       VALUES ($1, $2, $3, $4, 'QUEUED', $5)
       RETURNING *`,
      [auth.orgId, goalId, assignedToBot, type, JSON.stringify(input || {})]
    );

    if (!result) throw new Error('Failed to insert task');

    const task: Task = {
      id: result.id,
      orgId: result.org_id,
      goalId: result.goal_id,
      assignedToBot: result.assigned_to_bot,
      type: result.type,
      status: result.status,
      input: parseJsonValue<Record<string, unknown>>(result.input_json, {}),
      output: parseJsonOptional<Record<string, unknown>>(result.output_json),
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };

    emitEvent(auth.orgId, 'SYSTEM', 'orchestrator', EVENT_TYPES.TASK_CREATED, {
      taskId: task.id,
      goalId: task.goalId,
      bot: task.assignedToBot,
      type: task.type,
    });

    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { task } });
  } catch (error) {
    logger.error('Failed to create task', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'TASK_CREATE_FAILED', message: 'Failed to create task' },
    });
  }
});

// GET /v1/tasks - List tasks
app.get('/v1/tasks', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { goalId, status, bot } = req.query;
    let sql = 'SELECT * FROM tasks WHERE org_id = $1';
    const params: any[] = [auth.orgId];
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
      sql += ` AND assigned_to_bot = $${paramIndex++}`;
      params.push(bot);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query<any>(sql, params);

    const tasks: Task[] = result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      goalId: row.goal_id,
      assignedToBot: row.assigned_to_bot,
      type: row.type,
      status: row.status,
      input: parseJsonValue<Record<string, unknown>>(row.input_json, {}),
      output: parseJsonOptional<Record<string, unknown>>(row.output_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({ success: true, data: { tasks } });
  } catch (error) {
    logger.error('Failed to list tasks', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to list tasks' },
    });
  }
});

// PATCH /v1/tasks/:id/status - Update task status
app.patch('/v1/tasks/:id/status', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { status: newStatus, output } = req.body;
    if (!newStatus) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Status is required' },
      });
    }

    const current = await queryOne<{ status: string; goal_id: string }>(
      'SELECT status, goal_id FROM tasks WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!current) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Task not found' },
      });
    }

    const allowedTransitions = TASK_TRANSITIONS[current.status as TaskStatus];
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: `Cannot transition from ${current.status} to ${newStatus}`,
        },
      });
    }

    if (output) {
      await query(
        'UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, JSON.stringify(output), req.params.id]
      );
    } else {
      await query('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', [
        newStatus,
        req.params.id,
      ]);
    }

    const eventType =
      newStatus === 'DONE'
        ? EVENT_TYPES.TASK_COMPLETED
        : newStatus === 'FAILED'
        ? EVENT_TYPES.TASK_FAILED
        : newStatus === 'RUNNING'
        ? EVENT_TYPES.TASK_STARTED
        : 'orchestrator.task.updated';

    emitEvent(auth.orgId, 'SYSTEM', 'orchestrator', eventType, {
      taskId: req.params.id,
      goalId: current.goal_id,
      previousStatus: current.status,
      newStatus,
    });

    res.json({ success: true, data: { taskId: req.params.id, status: newStatus } });
  } catch (error) {
    logger.error('Failed to update task status', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update task status' },
    });
  }
});

// ============================================
// Approval Routes
// ============================================

// GET /v1/approvals - List pending approvals
app.get('/v1/approvals', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { status = 'PENDING' } = req.query;

    const result = await query<any>(
      'SELECT * FROM approvals WHERE org_id = $1 AND status = $2 ORDER BY requested_at DESC',
      [auth.orgId, status]
    );

    const approvals: Approval[] = result.rows.map((row) => ({
      id: row.id,
      orgId: row.org_id,
      taskId: row.task_id,
      requiredRole: row.required_role,
      status: row.status,
      requestedAt: row.requested_at,
      resolvedAt: row.resolved_at,
      resolution: parseJsonOptional<Record<string, unknown>>(row.resolution_json),
    }));

    res.json({ success: true, data: { approvals } });
  } catch (error) {
    logger.error('Failed to list approvals', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to list approvals' },
    });
  }
});

// POST /v1/approvals/:id/approve
app.post('/v1/approvals/:id/approve', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const approval = await queryOne<any>(
      'SELECT * FROM approvals WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!approval) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval not found' },
      });
    }

    if (approval.status !== 'PENDING') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Approval is not pending' },
      });
    }

    await query(
      `UPDATE approvals SET status = 'APPROVED', resolved_at = NOW(), resolution_json = $1 WHERE id = $2`,
      [JSON.stringify({ approvedBy: auth.userId, ...req.body }), req.params.id]
    );

    // Resume the task
    await query("UPDATE tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = $1", [
      approval.task_id,
    ]);

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.APPROVAL_RESOLVED, {
      approvalId: req.params.id,
      taskId: approval.task_id,
      resolution: 'APPROVED',
    });

    res.json({ success: true, data: { approvalId: req.params.id, status: 'APPROVED' } });
  } catch (error) {
    logger.error('Failed to approve', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'APPROVE_FAILED', message: 'Failed to approve' },
    });
  }
});

// POST /v1/approvals/:id/reject
app.post('/v1/approvals/:id/reject', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const { reason } = req.body;

    const approval = await queryOne<any>(
      'SELECT * FROM approvals WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!approval) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Approval not found' },
      });
    }

    if (approval.status !== 'PENDING') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'Approval is not pending' },
      });
    }

    await query(
      `UPDATE approvals SET status = 'REJECTED', resolved_at = NOW(), resolution_json = $1 WHERE id = $2`,
      [JSON.stringify({ rejectedBy: auth.userId, reason }), req.params.id]
    );

    // Fail the task
    await query("UPDATE tasks SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [
      approval.task_id,
    ]);

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.APPROVAL_RESOLVED, {
      approvalId: req.params.id,
      taskId: approval.task_id,
      resolution: 'REJECTED',
      reason,
    });

    res.json({ success: true, data: { approvalId: req.params.id, status: 'REJECTED' } });
  } catch (error) {
    logger.error('Failed to reject', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'REJECT_FAILED', message: 'Failed to reject' },
    });
  }
});

// ============================================
// Kill Switch Routes
// ============================================

// POST /v1/kill-switch/enable
app.post('/v1/kill-switch/enable', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    if (!auth.scopes.includes('admin.killswitch')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.killswitch scope' },
      });
    }

    const { reason } = req.body;

    const state: KillSwitchState = {
      enabled: true,
      enabledAt: nowTimestamp(),
      enabledBy: auth.userId,
      reason,
    };

    await setKillSwitchState(state);

    // Cancel all running tasks
    await query(
      `UPDATE tasks SET status = 'FAILED', updated_at = NOW() WHERE org_id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [auth.orgId]
    );

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.KILL_SWITCH_ENABLED, {
      reason,
      cancelledTasks: true,
    });

    logger.warn('Kill switch ENABLED - all automation disabled', { userId: auth.userId, reason });

    res.json({ success: true, data: state });
  } catch (error) {
    logger.error('Failed to enable kill switch', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'KILLSWITCH_FAILED', message: 'Failed to enable kill switch' },
    });
  }
});

// POST /v1/kill-switch/disable
app.post('/v1/kill-switch/disable', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    if (!auth.scopes.includes('admin.killswitch')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.INSUFFICIENT_PERMISSIONS, message: 'Requires admin.killswitch scope' },
      });
    }

    const state: KillSwitchState = { enabled: false };
    await setKillSwitchState(state);

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.KILL_SWITCH_DISABLED, {});

    logger.info('Kill switch disabled - automation resumed', { userId: auth.userId });

    res.json({ success: true, data: state });
  } catch (error) {
    logger.error('Failed to disable kill switch', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'KILLSWITCH_FAILED', message: 'Failed to disable kill switch' },
    });
  }
});

// GET /v1/kill-switch/status
app.get('/v1/kill-switch/status', async (req: Request, res: Response) => {
  try {
    const state = await getKillSwitchState();
    res.json({ success: true, data: state });
  } catch (error) {
    logger.error('Failed to get kill switch status', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get kill switch status' },
    });
  }
});

// ============================================
// Bot Registry Routes
// ============================================

export interface BotRegistration {
  id: string;
  botType: BotType;
  instanceId: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ERROR';
  capabilities: string[];
  permissions: string[];
  lastHeartbeat: string | null;
  registeredAt: string;
}

// POST /v1/bots/register - Register a bot instance
app.post('/v1/bots/register', async (req: Request, res: Response) => {
  try {
    const { botType, instanceId, capabilities, permissions, metadata } = req.body;

    if (!botType || !instanceId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'botType and instanceId are required' },
      });
    }

    const validBotTypes = ['tradebot', 'storebot', 'socialbot', 'researchbot', 'opsbot', 'forgebot', 'TRADE', 'STORE', 'SOCIAL', 'ANALYTICS', 'CUSTOM'];
    if (!validBotTypes.includes(botType)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: `Invalid botType. Must be one of: ${validBotTypes.join(', ')}` },
      });
    }

    const result = await queryOne<any>(
      `INSERT INTO bots (bot_type, instance_id, status, capabilities_json, permissions_json, metadata_json, last_heartbeat)
       VALUES ($1, $2, 'ONLINE', $3, $4, $5, NOW())
       ON CONFLICT (bot_type, instance_id) DO UPDATE SET
         status = 'ONLINE',
         capabilities_json = $3,
         permissions_json = $4,
         metadata_json = $5,
         last_heartbeat = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        botType,
        instanceId,
        JSON.stringify(capabilities || []),
        JSON.stringify(permissions || []),
        JSON.stringify(metadata || {}),
      ]
    );

    const bot: BotRegistration = {
      id: result.id,
      botType: result.bot_type,
      instanceId: result.instance_id,
      status: result.status,
      capabilities: parseJsonValue<string[]>(result.capabilities_json, []),
      permissions: parseJsonValue<string[]>(result.permissions_json, []),
      lastHeartbeat: result.last_heartbeat,
      registeredAt: result.registered_at,
    };

    logger.info('Bot registered', { botType, instanceId });
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { bot } });
  } catch (error) {
    logger.error('Failed to register bot', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'BOT_REGISTER_FAILED', message: 'Failed to register bot' },
    });
  }
});

// GET /v1/bots - List registered bots
app.get('/v1/bots', async (req: Request, res: Response) => {
  try {
    const { type, status } = req.query;
    let sql = 'SELECT * FROM bots WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      sql += ` AND bot_type = $${paramIndex++}`;
      params.push(type);
    }
    if (status) {
      sql += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    sql += ' ORDER BY bot_type, instance_id';

    const result = await query<any>(sql, params);

    const bots: BotRegistration[] = result.rows.map((row) => ({
      id: row.id,
      botType: row.bot_type,
      instanceId: row.instance_id,
      status: row.status,
      capabilities: parseJsonValue<string[]>(row.capabilities_json, []),
      permissions: parseJsonValue<string[]>(row.permissions_json, []),
      lastHeartbeat: row.last_heartbeat,
      registeredAt: row.registered_at,
    }));

    res.json({ success: true, data: { bots } });
  } catch (error) {
    logger.error('Failed to list bots', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to list bots' },
    });
  }
});

// POST /v1/bots/:id/heartbeat - Bot heartbeat
app.post('/v1/bots/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    const result = await queryOne<any>(
      `UPDATE bots SET last_heartbeat = NOW(), status = COALESCE($1, status), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
      });
    }

    res.json({ success: true, data: { lastHeartbeat: result.last_heartbeat } });
  } catch (error) {
    logger.error('Heartbeat failed', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'HEARTBEAT_FAILED', message: 'Heartbeat failed' },
    });
  }
});

// DELETE /v1/bots/:id - Unregister a bot
app.delete('/v1/bots/:id', async (req: Request, res: Response) => {
  try {
    const result = await query('DELETE FROM bots WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
      });
    }

    logger.info('Bot unregistered', { botId: req.params.id });
    res.json({ success: true, data: { message: 'Bot unregistered' } });
  } catch (error) {
    logger.error('Failed to unregister bot', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'UNREGISTER_FAILED', message: 'Failed to unregister bot' },
    });
  }
});

// GET /v1/bots/:id/tasks - Get tasks assigned to a bot
app.get('/v1/bots/:id/tasks', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id;

    // Verify bot exists
    const bot = await queryOne<any>('SELECT * FROM bots WHERE id = $1', [botId]);
    if (!bot) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Bot not found' },
      });
    }

    // Find queued tasks that can be assigned to this bot type
    const tasks = await query<any>(
      `SELECT t.* FROM tasks t
       WHERE t.status = 'QUEUED'
       AND (t.assigned_to_bot IS NULL OR t.assigned_to_bot = $1)
       ORDER BY t.created_at ASC
       LIMIT 5`,
      [bot.bot_type]
    );

    const result = tasks.rows.map((row) => ({
      id: row.id,
      goalId: row.goal_id,
      botId: row.assigned_to_bot,
      type: row.type,
      priority: row.priority || 0,
      status: row.status,
      inputJson: parseJsonValue<Record<string, unknown>>(row.input_json, {}),
      createdAt: row.created_at,
      startedAt: row.started_at,
    }));

    res.json(result);
  } catch (error) {
    logger.error('Failed to get bot tasks', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get bot tasks' },
    });
  }
});

// POST /v1/tasks/:id/progress - Report task progress
app.post('/v1/tasks/:id/progress', async (req: Request, res: Response) => {
  try {
    const { progress, message } = req.body;

    const task = await queryOne<any>('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!task) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Task not found' },
      });
    }

    // Update task with progress (store in output_json for now)
    const progressData = { progress, message, updatedAt: new Date().toISOString() };
    await query(
      `UPDATE tasks SET 
       output_json = jsonb_set(COALESCE(output_json::jsonb, '{}'::jsonb), '{progress}', $1::jsonb),
       status = CASE WHEN status = 'QUEUED' THEN 'RUNNING' ELSE status END,
       updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(progressData), req.params.id]
    );

    res.json({ success: true, data: { taskId: req.params.id, progress } });
  } catch (error) {
    logger.error('Failed to update task progress', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update task progress' },
    });
  }
});

// POST /v1/tasks/:id/complete - Complete a task
app.post('/v1/tasks/:id/complete', async (req: Request, res: Response) => {
  try {
    const { status, output, error: errorMsg, metrics } = req.body;

    const task = await queryOne<any>('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!task) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Task not found' },
      });
    }

    const finalStatus = status === 'DONE' ? 'DONE' : 'FAILED';
    const outputJson = JSON.stringify({ result: output, error: errorMsg, metrics });

    await query(
      `UPDATE tasks SET status = $1, output_json = $2, updated_at = NOW() WHERE id = $3`,
      [finalStatus, outputJson, req.params.id]
    );

    // Record task run in task_runs table if bot is specified
    const botId = req.headers['x-bot-id'];
    if (botId) {
      await query(
        `INSERT INTO task_runs (task_id, bot_id, started_at, completed_at, status, result_json)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [req.params.id, botId, task.created_at, finalStatus, outputJson]
      );
    }

    logger.info('Task completed', { taskId: req.params.id, status: finalStatus });
    res.json({ success: true, data: { taskId: req.params.id, status: finalStatus } });
  } catch (error) {
    logger.error('Failed to complete task', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to complete task' },
    });
  }
});

// POST /v1/events - Emit an event from a bot
app.post('/v1/events', async (req: Request, res: Response) => {
  try {
    const { type, source, data } = req.body;

    if (!type || !source) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: ERROR_CODES.INVALID_INPUT, message: 'type and source are required' },
      });
    }

    // Extract bot ID from source if it's a bot event
    const botMatch = source.match(/^bot:(.+)$/);
    const actorType = botMatch ? 'BOT' : 'SYSTEM';
    const actorId = botMatch ? botMatch[1] : source;

    // For bot events, we use a system org since bots may not have org context
    const orgId = 'system';

    emitEvent(orgId, actorType as any, actorId, type, data || {});

    res.json({ success: true, data: { type, source } });
  } catch (error) {
    logger.error('Failed to emit event', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'EMIT_FAILED', message: 'Failed to emit event' },
    });
  }
});

// ============================================
// Task Cancel Endpoint
// ============================================

// POST /v1/tasks/:id/cancel - Cancel a task
app.post('/v1/tasks/:id/cancel', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const current = await queryOne<{ status: string; goal_id: string }>(
      'SELECT status, goal_id FROM tasks WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!current) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Task not found' },
      });
    }

    // Can only cancel tasks that are not already done or failed
    const cancellableStatuses = ['QUEUED', 'RUNNING', 'NEEDS_APPROVAL', 'RETRYING'];
    if (!cancellableStatuses.includes(current.status)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_INPUT,
          message: `Cannot cancel task in ${current.status} status`,
        },
      });
    }

    await query('UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2', [
      'FAILED',
      req.params.id,
    ]);

    // Cancel any pending approval
    await query(
      `UPDATE approvals SET status = 'REJECTED', resolved_at = NOW(), 
       resolution_json = $1 WHERE task_id = $2 AND status = 'PENDING'`,
      [JSON.stringify({ cancelledBy: auth.userId, reason: 'Task cancelled' }), req.params.id]
    );

    emitEvent(auth.orgId, 'USER', auth.userId, EVENT_TYPES.TASK_FAILED, {
      taskId: req.params.id,
      goalId: current.goal_id,
      previousStatus: current.status,
      reason: 'Cancelled by user',
    });

    logger.info('Task cancelled', { taskId: req.params.id, userId: auth.userId });
    res.json({ success: true, data: { taskId: req.params.id, status: 'FAILED', cancelled: true } });
  } catch (error) {
    logger.error('Failed to cancel task', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'CANCEL_FAILED', message: 'Failed to cancel task' },
    });
  }
});

// GET /v1/tasks/:id - Get task by ID
app.get('/v1/tasks/:id', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const result = await queryOne<any>(
      'SELECT * FROM tasks WHERE id = $1 AND org_id = $2',
      [req.params.id, auth.orgId]
    );

    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Task not found' },
      });
    }

    const task: Task = {
      id: result.id,
      orgId: result.org_id,
      goalId: result.goal_id,
      assignedToBot: result.assigned_to_bot,
      type: result.type,
      status: result.status,
      input: parseJsonValue<Record<string, unknown>>(result.input_json, {}),
      output: parseJsonOptional<Record<string, unknown>>(result.output_json),
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };

    res.json({ success: true, data: { task } });
  } catch (error) {
    logger.error('Failed to get task', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get task' },
    });
  }
});

// ============================================
// Dashboard Stats
// ============================================

app.get('/v1/stats', async (req: Request, res: Response) => {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Unauthorized' },
      });
    }

    const [goalsResult, tasksResult, approvalsResult] = await Promise.all([
      query<{ status: string; count: string }>(
        'SELECT status, COUNT(*) as count FROM goals WHERE org_id = $1 GROUP BY status',
        [auth.orgId]
      ),
      query<{ status: string; count: string }>(
        'SELECT status, COUNT(*) as count FROM tasks WHERE org_id = $1 GROUP BY status',
        [auth.orgId]
      ),
      queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM approvals WHERE org_id = $1 AND status = 'PENDING'",
        [auth.orgId]
      ),
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
  } catch (error) {
    logger.error('Failed to get stats', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'QUERY_FAILED', message: 'Failed to get stats' },
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Orchestrator service started on port ${PORT}`);
});

export default app;

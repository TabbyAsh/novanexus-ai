import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, EVENT_TYPES } from '@nova/shared';
import type { ApiResponse, Goal, Task, Approval, GoalStatus, TaskStatus, BotType } from '@nova/shared';

const app = express();
const logger = createLogger('orchestrator-service');
const PORT = process.env.PORT || SERVICE_PORTS.ORCHESTRATOR;

// In-memory state (replace with DB)
let killSwitchEnabled = false;
const goals: Map<string, Goal> = new Map();
const tasks: Map<string, Task> = new Map();
const approvals: Map<string, Approval> = new Map();

app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'orchestrator',
    killSwitch: killSwitchEnabled,
    timestamp: new Date().toISOString() 
  });
});

// ============================================
// Goal Routes
// ============================================

// POST /v1/goals - Create a new goal
app.post('/v1/goals', async (req: Request, res: Response) => {
  try {
    const { title, intent, constraints } = req.body;
    
    const goal: Goal = {
      id: crypto.randomUUID(),
      orgId: req.headers['x-org-id'] as string || 'default-org',
      createdBy: req.headers['x-user-id'] as string || 'default-user',
      title,
      intent,
      constraints: constraints || {},
      status: 'NEW' as GoalStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    goals.set(goal.id, goal);
    
    // TODO: Generate task plan based on intent
    // 1. Analyze intent
    // 2. Break down into tasks
    // 3. Assign to appropriate bots
    // 4. Create approval requests if needed
    
    logger.info('Goal created', { goalId: goal.id, intent });
    
    const response: ApiResponse<{ goal: Goal }> = {
      success: true,
      data: { goal },
    };
    
    res.status(HTTP_STATUS.CREATED).json(response);
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
  const goal = goals.get(req.params.id);
  
  if (!goal) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Goal not found' },
    });
  }
  
  res.json({ success: true, data: { goal } });
});

// GET /v1/goals - List goals
app.get('/v1/goals', async (req: Request, res: Response) => {
  const goalList = Array.from(goals.values());
  res.json({ success: true, data: { goals: goalList } });
});

// ============================================
// Task Routes
// ============================================

// POST /v1/tasks - Create a task
app.post('/v1/tasks', async (req: Request, res: Response) => {
  const { goalId, type, assignedToBot, input } = req.body;
  
  const task: Task = {
    id: crypto.randomUUID(),
    orgId: req.headers['x-org-id'] as string || 'default-org',
    goalId,
    assignedToBot: assignedToBot as BotType,
    type,
    status: 'QUEUED' as TaskStatus,
    input: input || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  tasks.set(task.id, task);
  
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { task } });
});

// GET /v1/tasks - List tasks
app.get('/v1/tasks', async (req: Request, res: Response) => {
  const { goalId, status } = req.query;
  let taskList = Array.from(tasks.values());
  
  if (goalId) {
    taskList = taskList.filter(t => t.goalId === goalId);
  }
  if (status) {
    taskList = taskList.filter(t => t.status === status);
  }
  
  res.json({ success: true, data: { tasks: taskList } });
});

// ============================================
// Orchestrator Route (Bot invocation)
// ============================================

// POST /v1/orchestrator/route - Route a goal to appropriate bots
app.post('/v1/orchestrator/route', async (req: Request, res: Response) => {
  if (killSwitchEnabled) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'KILL_SWITCH_ENABLED', message: 'Automation is disabled' },
    });
  }
  
  const { goalId } = req.body;
  const goal = goals.get(goalId);
  
  if (!goal) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Goal not found' },
    });
  }
  
  // TODO: Implement intelligent routing based on goal intent
  // This is a stub that creates sample tasks
  const plan = {
    goalId,
    tasks: [
      { type: 'analyze', bot: 'researchbot' },
      { type: 'execute', bot: 'tradebot' },
    ],
  };
  
  res.json({ success: true, data: { plan } });
});

// ============================================
// Approval Routes
// ============================================

// POST /v1/approvals/:id/approve
app.post('/v1/approvals/:id/approve', async (req: Request, res: Response) => {
  const approval = approvals.get(req.params.id);
  
  if (!approval) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Approval not found' },
    });
  }
  
  approval.status = 'APPROVED';
  approval.resolvedAt = new Date().toISOString();
  
  res.json({ success: true, data: { approval } });
});

// POST /v1/approvals/:id/reject
app.post('/v1/approvals/:id/reject', async (req: Request, res: Response) => {
  const approval = approvals.get(req.params.id);
  
  if (!approval) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Approval not found' },
    });
  }
  
  approval.status = 'REJECTED';
  approval.resolvedAt = new Date().toISOString();
  
  res.json({ success: true, data: { approval } });
});

// ============================================
// Kill Switch Routes
// ============================================

// POST /v1/kill-switch/enable
app.post('/v1/kill-switch/enable', async (req: Request, res: Response) => {
  killSwitchEnabled = true;
  logger.warn('Kill switch ENABLED - all automation disabled');
  
  // TODO: Emit kill switch event
  // TODO: Cancel all running tasks
  
  res.json({ success: true, data: { enabled: true } });
});

// POST /v1/kill-switch/disable
app.post('/v1/kill-switch/disable', async (req: Request, res: Response) => {
  killSwitchEnabled = false;
  logger.info('Kill switch disabled - automation resumed');
  
  res.json({ success: true, data: { enabled: false } });
});

// GET /v1/kill-switch/status
app.get('/v1/kill-switch/status', async (req: Request, res: Response) => {
  res.json({ success: true, data: { enabled: killSwitchEnabled } });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Orchestrator service started on port ${PORT}`);
});

export default app;

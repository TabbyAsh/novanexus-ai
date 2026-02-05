import { generateId, nowTimestamp } from '@nova/shared';
import { createLogger, Logger, Metrics } from '@nova/telemetry';

// ============================================================================
// Bot Types
// ============================================================================

export type BotType = 'TRADE' | 'STORE' | 'SOCIAL' | 'ANALYTICS' | 'CUSTOM';
export type BotStatus = 'STARTING' | 'READY' | 'BUSY' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type TaskStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';

export interface BotCapability {
  name: string;
  version: string;
  description?: string;
}

export interface BotConfig {
  botType: BotType;
  instanceId?: string;
  orchestratorUrl: string;
  capabilities: BotCapability[];
  permissions?: string[];
  metadata?: Record<string, unknown>;
  heartbeatIntervalMs?: number;
  taskPollIntervalMs?: number;
}

export interface TaskDefinition {
  id: string;
  goalId: string;
  botId?: string;
  type: string;
  priority: number;
  status: TaskStatus;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  metrics?: Record<string, number>;
}

export interface BotRegistration {
  id: string;
  botType: BotType;
  instanceId: string;
  status: BotStatus;
  capabilities: BotCapability[];
  permissions: string[];
  registeredAt: string;
  lastHeartbeat: string;
}

// ============================================================================
// Task Handler Interface
// ============================================================================

export type TaskHandler = (task: TaskDefinition, context: TaskContext) => Promise<TaskResult>;

export interface TaskContext {
  botId: string;
  logger: Logger;
  metrics: Metrics;
  emit: (eventType: string, data: Record<string, unknown>) => Promise<void>;
  reportProgress: (progress: number, message?: string) => Promise<void>;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    latencyMs?: number;
  }>;
  uptime: number;
  version: string;
}

export interface ReadinessStatus {
  ready: boolean;
  reason?: string;
}

// ============================================================================
// BotClient - Main SDK Class
// ============================================================================

export class BotClient {
  private config: Required<BotConfig>;
  private registration: BotRegistration | null = null;
  private status: BotStatus = 'STOPPED';
  private taskHandlers: Map<string, TaskHandler> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private taskPollTimer: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private currentTask: TaskDefinition | null = null;
  
  public readonly logger: Logger;
  public readonly metrics: Metrics;

  constructor(config: BotConfig) {
    this.config = {
      ...config,
      instanceId: config.instanceId || generateId(),
      permissions: config.permissions || [],
      metadata: config.metadata || {},
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      taskPollIntervalMs: config.taskPollIntervalMs || 5000,
    };
    
    this.logger = createLogger(`bot-${this.config.botType.toLowerCase()}-${this.config.instanceId.slice(0, 8)}`);
    this.metrics = new Metrics();
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.status !== 'STOPPED') {
      throw new Error(`Cannot start bot in status: ${this.status}`);
    }

    this.status = 'STARTING';
    this.startTime = Date.now();
    this.logger.info('Bot starting', { botType: this.config.botType, instanceId: this.config.instanceId });

    try {
      // Register with orchestrator
      await this.register();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Start task polling
      this.startTaskPolling();
      
      this.status = 'READY';
      this.logger.info('Bot started successfully', { botId: this.registration?.id });
    } catch (error) {
      this.status = 'ERROR';
      this.logger.error('Bot failed to start', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'STOPPED') {
      return;
    }

    this.status = 'STOPPING';
    this.logger.info('Bot stopping');

    // Stop timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.taskPollTimer) {
      clearInterval(this.taskPollTimer);
      this.taskPollTimer = null;
    }

    // Deregister from orchestrator
    if (this.registration) {
      try {
        await this.deregister();
      } catch (error) {
        this.logger.warn('Failed to deregister bot', { error });
      }
    }

    this.status = 'STOPPED';
    this.logger.info('Bot stopped');
  }

  // --------------------------------------------------------------------------
  // Task Handling
  // --------------------------------------------------------------------------

  registerTaskHandler(taskType: string, handler: TaskHandler): void {
    this.taskHandlers.set(taskType, handler);
    this.logger.debug('Registered task handler', { taskType });
  }

  unregisterTaskHandler(taskType: string): void {
    this.taskHandlers.delete(taskType);
    this.logger.debug('Unregistered task handler', { taskType });
  }

  private async processTask(task: TaskDefinition): Promise<void> {
    const handler = this.taskHandlers.get(task.type);
    if (!handler) {
      this.logger.warn('No handler for task type', { taskType: task.type, taskId: task.id });
      await this.reportTaskResult(task.id, {
        success: false,
        error: `No handler registered for task type: ${task.type}`,
      });
      return;
    }

    this.currentTask = task;
    this.status = 'BUSY';
    const startTime = Date.now();

    const context: TaskContext = {
      botId: this.registration!.id,
      logger: this.logger.child({ taskId: task.id, taskType: task.type }),
      metrics: this.metrics,
      emit: async (eventType: string, data: Record<string, unknown>) => {
        await this.emitEvent(eventType, { ...data, taskId: task.id });
      },
      reportProgress: async (progress: number, message?: string) => {
        await this.reportTaskProgress(task.id, progress, message);
      },
    };

    try {
      this.logger.info('Processing task', { taskId: task.id, taskType: task.type });
      await this.emitEvent('TASK_STARTED', { taskId: task.id, taskType: task.type });

      const result = await handler(task, context);
      const duration = Date.now() - startTime;

      this.metrics.histogram('task.duration', duration, { taskType: task.type });
      this.metrics.increment('task.completed', 1, { taskType: task.type, success: String(result.success) });

      await this.reportTaskResult(task.id, result);
      await this.emitEvent('TASK_COMPLETED', { 
        taskId: task.id, 
        taskType: task.type, 
        success: result.success,
        durationMs: duration,
      });

      this.logger.info('Task completed', { taskId: task.id, success: result.success, durationMs: duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.increment('task.failed', 1, { taskType: task.type });

      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.reportTaskResult(task.id, {
        success: false,
        error: errorMessage,
      });
      await this.emitEvent('TASK_FAILED', { taskId: task.id, taskType: task.type, error: errorMessage });

      this.logger.error('Task failed', error as Error, { taskId: task.id });
    } finally {
      this.currentTask = null;
      this.status = 'READY';
    }
  }

  // --------------------------------------------------------------------------
  // Health & Readiness
  // --------------------------------------------------------------------------

  getHealthStatus(): HealthStatus {
    const checks: HealthStatus['checks'] = {
      orchestrator: {
        status: this.registration ? 'pass' : 'fail',
        message: this.registration ? 'Connected' : 'Not registered',
      },
      heartbeat: {
        status: this.heartbeatTimer ? 'pass' : 'fail',
        message: this.heartbeatTimer ? 'Active' : 'Stopped',
      },
    };

    const hasFailure = Object.values(checks).some(c => c.status === 'fail');
    const hasWarning = Object.values(checks).some(c => c.status === 'warn');

    return {
      status: hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
      checks,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      version: '0.1.0',
    };
  }

  getReadinessStatus(): ReadinessStatus {
    if (this.status === 'READY') {
      return { ready: true };
    }
    return { 
      ready: false, 
      reason: `Bot status is ${this.status}`,
    };
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getStatus(): BotStatus {
    return this.status;
  }

  getRegistration(): BotRegistration | null {
    return this.registration;
  }

  getBotId(): string | null {
    return this.registration?.id || null;
  }

  getCurrentTask(): TaskDefinition | null {
    return this.currentTask;
  }

  // --------------------------------------------------------------------------
  // Orchestrator Communication
  // --------------------------------------------------------------------------

  private async register(): Promise<void> {
    const response = await this.orchestratorRequest('POST', '/v1/bots/register', {
      botType: this.config.botType,
      instanceId: this.config.instanceId,
      capabilities: this.config.capabilities,
      permissions: this.config.permissions,
      metadata: this.config.metadata,
    });

    this.registration = response as BotRegistration;
    this.logger.info('Bot registered', { botId: this.registration.id });
  }

  private async deregister(): Promise<void> {
    if (!this.registration) return;
    
    await this.orchestratorRequest('DELETE', `/v1/bots/${this.registration.id}`);
    this.registration = null;
    this.logger.info('Bot deregistered');
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.registration) return;

    try {
      await this.orchestratorRequest('POST', `/v1/bots/${this.registration.id}/heartbeat`, {
        status: this.status,
        metrics: this.metrics.getMetrics(),
      });
    } catch (error) {
      this.logger.warn('Heartbeat failed', { error });
    }
  }

  private async pollForTasks(): Promise<void> {
    if (!this.registration || this.status !== 'READY') return;

    try {
      const response = await this.orchestratorRequest('GET', `/v1/bots/${this.registration.id}/tasks`);
      const tasks = response as TaskDefinition[];
      
      if (tasks.length > 0) {
        // Process first available task
        await this.processTask(tasks[0]);
      }
    } catch (error) {
      this.logger.debug('Task poll failed', { error });
    }
  }

  private async reportTaskProgress(taskId: string, progress: number, message?: string): Promise<void> {
    if (!this.registration) return;

    try {
      await this.orchestratorRequest('POST', `/v1/tasks/${taskId}/progress`, {
        progress: Math.min(100, Math.max(0, progress)),
        message,
      });
    } catch (error) {
      this.logger.warn('Failed to report task progress', { taskId, error });
    }
  }

  private async reportTaskResult(taskId: string, result: TaskResult): Promise<void> {
    if (!this.registration) return;

    try {
      const status = result.success ? 'DONE' : 'FAILED';
      await this.orchestratorRequest('POST', `/v1/tasks/${taskId}/complete`, {
        status,
        output: result.output,
        error: result.error,
        metrics: result.metrics,
      });
    } catch (error) {
      this.logger.error('Failed to report task result', error as Error, { taskId });
    }
  }

  private async emitEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    if (!this.registration) return;

    try {
      await this.orchestratorRequest('POST', `/v1/events`, {
        type: eventType,
        source: `bot:${this.registration.id}`,
        data,
      });
    } catch (error) {
      this.logger.debug('Failed to emit event', { eventType, error });
    }
  }

  private async orchestratorRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.config.orchestratorUrl}${path}`;
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Id': this.registration?.id || '',
        'X-Bot-Instance': this.config.instanceId,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Orchestrator request failed: ${response.status} ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    return {};
  }

  // --------------------------------------------------------------------------
  // Timers
  // --------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  private startTaskPolling(): void {
    this.taskPollTimer = setInterval(() => {
      this.pollForTasks();
    }, this.config.taskPollIntervalMs);
  }
}

// ============================================================================
// Express Middleware Factory
// ============================================================================

export interface BotMiddlewareOptions {
  bot: BotClient;
  basePath?: string;
}

export function createBotHealthRoutes(options: BotMiddlewareOptions): {
  healthHandler: (req: unknown, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => void;
  readyHandler: (req: unknown, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => void;
  metricsHandler: (req: unknown, res: { json: (data: unknown) => void }) => void;
} {
  const { bot } = options;

  return {
    healthHandler: (_req, res) => {
      const health = bot.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    },
    readyHandler: (_req, res) => {
      const ready = bot.getReadinessStatus();
      const statusCode = ready.ready ? 200 : 503;
      res.status(statusCode).json(ready);
    },
    metricsHandler: (_req, res) => {
      res.json(bot.metrics.getMetrics());
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createBotConfig(
  botType: BotType,
  capabilities: BotCapability[],
  options?: Partial<BotConfig>
): BotConfig {
  return {
    botType,
    capabilities,
    orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
    ...options,
  };
}

export { Logger, Metrics };

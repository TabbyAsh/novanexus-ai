import { generateId } from '@nova/shared';
import { createLogger, Logger, Metrics } from '@nova/telemetry';

// ============================================================================
// Bot Types
// ============================================================================

export type BotType = 'tradebot' | 'storebot' | 'socialbot' | 'researchbot' | 'opsbot' | 'forgebot';
export type BotStatus = 'STARTING' | 'READY' | 'BUSY' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type OrchestratorBotStatus = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ERROR';
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
  requestTimeoutMs?: number;
  heartbeatFailureThreshold?: number;
  taskShutdownTimeoutMs?: number;
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
  leaseExpiresAt?: string;
  claimToken?: string;
  claimGeneration?: number;
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
  status: OrchestratorBotStatus;
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
  signal: AbortSignal;
  /** Stable across retries of the logical task; pass it to every side effect. */
  idempotencyKey: string;
  /** Unique to the current fenced claim attempt; use for audit correlation. */
  claimId: string;
  throwIfCancelled: () => void;
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

class OrchestratorRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'OrchestratorRequestError';
  }
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
  private currentTaskPromise: Promise<void> | null = null;
  private currentTaskAbortController: AbortController | null = null;
  private currentTaskLeaseActive = false;
  private currentTaskCompletionSignal: AbortSignal | null = null;
  private pendingTaskLeaseConflict: {
    task: TaskDefinition;
    signal: AbortSignal;
    reason: Error;
  } | null = null;
  private currentTaskLeaseTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInFlight: Promise<boolean> | null = null;
  private pollInFlight: Promise<void> | null = null;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private startupAbortController: AbortController | null = null;
  private runAbortController: AbortController | null = null;
  private lifecycleVersion = 0;
  private consecutiveHeartbeatFailures = 0;
  private lastHeartbeatSuccessAt: number | null = null;
  private lastHeartbeatFailureAt: number | null = null;
  
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
      requestTimeoutMs: Math.max(1, config.requestTimeoutMs ?? 2000),
      heartbeatFailureThreshold: Math.max(1, config.heartbeatFailureThreshold ?? 3),
      taskShutdownTimeoutMs: Math.max(1, config.taskShutdownTimeoutMs ?? 3000),
    };
    
    this.logger = createLogger(`bot-${this.config.botType.toLowerCase()}-${this.config.instanceId.slice(0, 8)}`);
    this.metrics = new Metrics();
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise || this.status === 'STOPPING') {
      return Promise.reject(new Error('Cannot start bot while it is stopping'));
    }
    if (this.status !== 'STOPPED') {
      return Promise.reject(new Error(`Cannot start bot in status: ${this.status}`));
    }

    const lifecycleVersion = ++this.lifecycleVersion;
    const startupController = new AbortController();
    this.startupAbortController = startupController;
    this.status = 'STARTING';
    this.startTime = Date.now();
    this.consecutiveHeartbeatFailures = 0;
    this.lastHeartbeatSuccessAt = null;
    this.lastHeartbeatFailureAt = null;
    this.logger.info('Bot starting', { botType: this.config.botType, instanceId: this.config.instanceId });

    const operation = (async () => {
      try {
        await this.register(startupController.signal);
        this.assertActiveStart(lifecycleVersion, startupController.signal);

        this.runAbortController = new AbortController();
        await this.sendHeartbeat(this.runAbortController.signal);
        this.assertActiveStart(lifecycleVersion, startupController.signal);

        this.status = 'READY';
        this.startHeartbeat();
        this.startTaskPolling();
        this.logger.info('Bot started successfully', { botId: this.registration?.id });
      } catch (error) {
        this.clearTimers();
        this.runAbortController?.abort(new Error('Bot startup failed'));
        this.runAbortController = null;

        if (this.lifecycleVersion === lifecycleVersion && this.status !== 'STOPPING' && this.status !== 'STOPPED') {
          this.status = 'ERROR';
        }
        this.logger.error('Bot failed to start', error as Error);
        throw error;
      } finally {
        if (this.startupAbortController === startupController) {
          this.startupAbortController = null;
        }
      }
    })();

    this.startPromise = operation;
    void operation.then(
      () => { if (this.startPromise === operation) this.startPromise = null; },
      () => { if (this.startPromise === operation) this.startPromise = null; },
    );
    return operation;
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (this.status === 'STOPPED' && !this.startPromise) return Promise.resolve();

    ++this.lifecycleVersion;
    this.status = 'STOPPING';
    this.logger.info('Bot stopping');
    this.clearTimers();
    this.startupAbortController?.abort(new Error('Bot stop requested during startup'));
    this.runAbortController?.abort(new Error('Bot stop requested'));

    const pendingStart = this.startPromise;
    const pendingHeartbeat = this.heartbeatInFlight;
    const operation = (async () => {
      if (pendingStart || pendingHeartbeat) {
        await Promise.allSettled([
          pendingStart ?? Promise.resolve(),
          pendingHeartbeat ?? Promise.resolve(false),
        ]);
      }

      const activeTask = this.currentTask;
      const activeTaskPromise = this.currentTaskPromise;
      if (activeTask && activeTaskPromise) {
        const drained = await this.waitForCompletion(activeTaskPromise, this.config.taskShutdownTimeoutMs);
        if (!drained) {
          this.logger.warn('Task did not drain before shutdown deadline', { taskId: activeTask.id });
          this.currentTaskAbortController?.abort(new Error('Task cancelled during bot shutdown'));
          await this.reportTaskResult(activeTask, {
            success: false,
            error: 'Task cancelled during bot shutdown',
          });
          this.clearTaskLeaseWatchdog();
        }
      }

      if (this.registration) {
        try {
          await this.deregister();
        } catch (error) {
          this.logger.warn('Failed to deregister bot', { error });
        }
      }

      this.registration = null;
      this.runAbortController = null;
      this.status = 'STOPPED';
      this.logger.info('Bot stopped');
    })();

    this.stopPromise = operation;
    void operation.then(
      () => { if (this.stopPromise === operation) this.stopPromise = null; },
      () => { if (this.stopPromise === operation) this.stopPromise = null; },
    );
    return operation;
  }

  private assertActiveStart(lifecycleVersion: number, signal: AbortSignal): void {
    if (signal.aborted || this.lifecycleVersion !== lifecycleVersion || this.status !== 'STARTING') {
      throw new Error('Bot startup cancelled');
    }
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.taskPollTimer) {
      clearInterval(this.taskPollTimer);
      this.taskPollTimer = null;
    }
  }

  private async waitForCompletion(operation: Promise<unknown>, timeoutMs: number): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        operation.then(() => true, () => true),
        new Promise<boolean>(resolve => {
          timeout = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
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
      await this.reportTaskResult(task, {
        success: false,
        error: `No handler registered for task type: ${task.type}`,
      });
      return;
    }

    const taskController = new AbortController();
    this.currentTask = task;
    this.currentTaskAbortController = taskController;
    this.currentTaskLeaseActive = true;
    this.pendingTaskLeaseConflict = null;
    this.armTaskLeaseWatchdog(task, taskController);
    this.status = 'BUSY';
    const startTime = Date.now();

    const context: TaskContext = {
      botId: this.registration!.id,
      logger: this.logger.child({ taskId: task.id, taskType: task.type }),
      metrics: this.metrics,
      signal: taskController.signal,
      idempotencyKey: `task:${task.id}`,
      claimId: `task:${task.id}:claim:${task.claimGeneration}`,
      throwIfCancelled: () => {
        if (taskController.signal.aborted) {
          throw taskController.signal.reason instanceof Error
            ? taskController.signal.reason
            : new Error('Task cancelled');
        }
      },
      emit: async (eventType: string, data: Record<string, unknown>) => {
        await this.emitEvent(eventType, {
          ...data,
          taskId: task.id,
          idempotencyKey: `task:${task.id}`,
          claimId: `task:${task.id}:claim:${task.claimGeneration}`,
        }, taskController.signal);
      },
      reportProgress: async (progress: number, message?: string) => {
        await this.reportTaskProgress(task, progress, message, taskController.signal);
      },
    };

    try {
      this.logger.info('Processing task', { taskId: task.id, taskType: task.type });
      await this.emitEvent('TASK_STARTED', { taskId: task.id, taskType: task.type }, taskController.signal);

      const result = await handler(task, context);
      if (taskController.signal.aborted) return;

      const duration = Date.now() - startTime;

      this.metrics.histogram('task.duration', duration, { taskType: task.type });
      this.metrics.increment('task.completed', 1, { taskType: task.type, success: String(result.success) });

      const reported = await this.reportCurrentTaskResult(task, result, taskController);
      if (!reported) return;
      if (taskController.signal.aborted) return;
      await this.emitEvent('TASK_COMPLETED', { 
        taskId: task.id, 
        taskType: task.type, 
        success: result.success,
        durationMs: duration,
      }, taskController.signal);

      this.logger.info('Task completed', { taskId: task.id, success: result.success, durationMs: duration });
    } catch (error) {
      if (taskController.signal.aborted) {
        this.logger.warn('Task cancelled', { taskId: task.id });
        return;
      }

      this.metrics.increment('task.failed', 1, { taskType: task.type });

      const errorMessage = error instanceof Error ? error.message : String(error);
      const reported = await this.reportCurrentTaskResult(task, {
        success: false,
        error: errorMessage,
      }, taskController);
      if (!reported) return;
      if (taskController.signal.aborted) return;
      await this.emitEvent(
        'TASK_FAILED',
        { taskId: task.id, taskType: task.type, error: errorMessage },
        taskController.signal,
      );

      this.logger.error('Task failed', error as Error, { taskId: task.id });
    } finally {
      if (this.currentTaskAbortController === taskController) {
        this.clearTaskLeaseWatchdog();
        this.currentTaskLeaseActive = false;
        this.currentTaskCompletionSignal = null;
        this.pendingTaskLeaseConflict = null;
        this.currentTask = null;
        this.currentTaskAbortController = null;
      }
      if (this.status === 'BUSY') this.status = 'READY';
    }
  }

  // --------------------------------------------------------------------------
  // Health & Readiness
  // --------------------------------------------------------------------------

  getHealthStatus(): HealthStatus {
    let heartbeatCheck: HealthStatus['checks'][string];
    if (!this.heartbeatTimer) {
      heartbeatCheck = { status: 'fail', message: 'Stopped' };
    } else if (this.consecutiveHeartbeatFailures >= this.config.heartbeatFailureThreshold) {
      heartbeatCheck = {
        status: 'fail',
        message: `${this.consecutiveHeartbeatFailures} consecutive heartbeat failures; last at ${new Date(this.lastHeartbeatFailureAt!).toISOString()}`,
      };
    } else if (this.consecutiveHeartbeatFailures > 0) {
      heartbeatCheck = {
        status: 'warn',
        message: `${this.consecutiveHeartbeatFailures} recent heartbeat failure(s); last at ${new Date(this.lastHeartbeatFailureAt!).toISOString()}`,
      };
    } else if (this.lastHeartbeatSuccessAt) {
      heartbeatCheck = {
        status: 'pass',
        message: `Last succeeded at ${new Date(this.lastHeartbeatSuccessAt).toISOString()}`,
      };
    } else {
      heartbeatCheck = { status: 'warn', message: 'Waiting for first heartbeat' };
    }

    const checks: HealthStatus['checks'] = {
      lifecycle: {
        status: this.status === 'READY' || this.status === 'BUSY'
          ? 'pass'
          : this.status === 'STARTING'
          ? 'warn'
          : 'fail',
        message: `Bot status is ${this.status}`,
      },
      orchestrator: {
        status: this.registration?.id ? 'pass' : 'fail',
        message: this.registration?.id ? 'Connected' : 'Not registered',
      },
      heartbeat: heartbeatCheck,
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
    if (this.status === 'READY' || this.status === 'BUSY') {
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

  private async register(signal: AbortSignal): Promise<void> {
    const response = await this.orchestratorRequest('POST', '/v1/bots/register', {
      botType: this.config.botType,
      instanceId: this.config.instanceId,
      capabilities: this.config.capabilities,
      permissions: this.config.permissions,
      metadata: this.config.metadata,
    }, { signal });

    // The canonical orchestrator API wraps registrations in
    // { success, data: { bot } }. Keep accepting the SDK's legacy direct shape
    // so existing compatible orchestrators are not broken.
    const responseRecord = response && typeof response === 'object'
      ? response as Partial<BotRegistration> & { data?: { bot?: BotRegistration } }
      : {};
    const registration = responseRecord.data?.bot ?? responseRecord;

    if (typeof registration.id !== 'string' || registration.id.length === 0) {
      throw new Error('Orchestrator registration response missing bot id');
    }

    this.registration = registration as BotRegistration;
    this.logger.info('Bot registered', { botId: this.registration.id });
  }

  private async deregister(): Promise<void> {
    if (!this.registration) return;

    const botId = this.registration.id;
    try {
      await this.orchestratorRequest('DELETE', `/v1/bots/${botId}`);
      this.logger.info('Bot deregistered');
    } finally {
      this.registration = null;
    }
  }

  private sendHeartbeat(signal?: AbortSignal): Promise<boolean> {
    if (this.heartbeatInFlight) return this.heartbeatInFlight;
    if (!this.registration?.id) return Promise.resolve(false);

    const botId = this.registration.id;
    const operation = (async () => {
      const activeTask = this.currentTask;
      const activeTaskController = this.currentTaskAbortController;
      const currentTask = this.status === 'BUSY'
        && activeTask
        && activeTaskController
        && this.currentTaskLeaseActive
        && this.currentTaskCompletionSignal !== activeTaskController.signal
        && !activeTaskController.signal.aborted
        && this.hasClaimIdentity(activeTask)
        ? {
            id: activeTask.id,
            claimToken: activeTask.claimToken,
            claimGeneration: activeTask.claimGeneration,
          }
        : undefined;
      try {
        const linked = currentTask && activeTaskController
          ? this.linkAbortSignals([signal, activeTaskController.signal])
          : { signal, cleanup: () => undefined };
        let response: unknown;
        try {
          response = await this.orchestratorRequest('POST', `/v1/bots/${botId}/heartbeat`, {
            status: this.toOrchestratorStatus(),
            metrics: this.metrics.getMetrics(),
            currentTask,
          }, { signal: linked.signal });
        } finally {
          linked.cleanup();
        }

        if (
          currentTask
          && activeTask
          && activeTaskController
          && this.status === 'BUSY'
          && this.currentTaskLeaseActive
          && this.currentTaskCompletionSignal !== activeTaskController.signal
          && !activeTaskController.signal.aborted
          && this.currentTask === activeTask
          && this.currentTaskAbortController === activeTaskController
        ) {
          const leaseExpiresAt = this.readLeaseExpiry(response, true);
          this.armTaskLeaseWatchdog(activeTask, activeTaskController, leaseExpiresAt);
        }

        if (signal?.aborted || this.status === 'STOPPING' || this.status === 'STOPPED') return false;
        this.lastHeartbeatSuccessAt = Date.now();
        this.consecutiveHeartbeatFailures = 0;
        return true;
      } catch (error) {
        if (signal?.aborted || this.status === 'STOPPING' || this.status === 'STOPPED') {
          this.logger.debug('Heartbeat cancelled during shutdown');
          return false;
        }

        if (
          error instanceof OrchestratorRequestError
          && error.statusCode === 409
          && currentTask
          && activeTask
          && activeTaskController
        ) {
          this.handleTaskLeaseConflict(
            new Error('Task lease lost'),
            activeTask,
            activeTaskController.signal,
          );
          // A task-scoped conflict is either authoritative lease loss, deferred
          // to the in-flight completion, or stale for an older task. None is a
          // transport heartbeat failure; lease loss sets unhealthy itself.
          return false;
        }

        this.lastHeartbeatFailureAt = Date.now();
        this.consecutiveHeartbeatFailures += 1;
        this.logger.warn('Heartbeat failed', {
          error,
          consecutiveFailures: this.consecutiveHeartbeatFailures,
        });
        return false;
      }
    })();

    this.heartbeatInFlight = operation;
    void operation.then(
      () => { if (this.heartbeatInFlight === operation) this.heartbeatInFlight = null; },
      () => { if (this.heartbeatInFlight === operation) this.heartbeatInFlight = null; },
    );
    return operation;
  }

  private hasClaimIdentity(task: TaskDefinition): task is TaskDefinition & {
    claimToken: string;
    claimGeneration: number;
  } {
    return typeof task.claimToken === 'string'
      && task.claimToken.length > 0
      && Number.isSafeInteger(task.claimGeneration)
      && (task.claimGeneration ?? 0) > 0;
  }

  private async acknowledgeTask(task: TaskDefinition, signal?: AbortSignal): Promise<void> {
    const response = await this.orchestratorRequest(
      'POST',
      `/v1/bots/${this.registration!.id}/tasks/${task.id}/ack`,
      undefined,
      { signal, taskClaim: task },
    );
    task.leaseExpiresAt = this.readLeaseExpiry(response, false);
  }

  private readLeaseExpiry(response: unknown, heartbeat: boolean): string {
    const record = response && typeof response === 'object'
      ? response as { data?: { leaseExpiresAt?: unknown; currentTask?: { leaseExpiresAt?: unknown } | null } }
      : {};
    const value = heartbeat
      ? record.data?.currentTask?.leaseExpiresAt
      : record.data?.leaseExpiresAt;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      throw new Error('Orchestrator response missing a valid task lease expiry');
    }
    return value;
  }

  private linkAbortSignals(signals: Array<AbortSignal | undefined>): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
    for (const source of signals) {
      if (!source) continue;
      const listener = () => controller.abort(source.reason);
      if (source.aborted) listener();
      else {
        source.addEventListener('abort', listener, { once: true });
        listeners.push({ signal: source, listener });
      }
    }
    return {
      signal: controller.signal,
      cleanup: () => {
        for (const entry of listeners) entry.signal.removeEventListener('abort', entry.listener);
      },
    };
  }

  private armTaskLeaseWatchdog(
    task: TaskDefinition,
    controller: AbortController,
    leaseExpiresAt: string = task.leaseExpiresAt || '',
  ): void {
    const expiresAt = Date.parse(leaseExpiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error('Cannot execute task without a valid lease expiry');
    }

    this.clearTaskLeaseWatchdog();
    task.leaseExpiresAt = leaseExpiresAt;
    const remainingMs = expiresAt - Date.now();
    const safetyMs = Math.min(5_000, Math.max(10, Math.floor(remainingMs / 4)));
    const delayMs = Math.max(0, remainingMs - safetyMs);
    this.currentTaskLeaseTimer = setTimeout(() => {
      if (
        this.currentTask === task
        && this.currentTaskAbortController === controller
        && this.currentTaskLeaseActive
        && !controller.signal.aborted
      ) {
        this.declareTaskLeaseLost(
          new Error('Task lease renewal could not be confirmed before expiry'),
          task,
          controller.signal,
        );
      }
    }, delayMs);
  }

  private endTaskLeaseHeartbeatEligibility(task: TaskDefinition, controller: AbortController): void {
    if (this.currentTask !== task || this.currentTaskAbortController !== controller) return;
    this.currentTaskLeaseActive = false;
    if (
      this.pendingTaskLeaseConflict?.task === task
      && this.pendingTaskLeaseConflict.signal === controller.signal
    ) {
      this.pendingTaskLeaseConflict = null;
    }
    this.clearTaskLeaseWatchdog();
  }

  private handleTaskLeaseConflict(
    reason: Error,
    expectedTask: TaskDefinition,
    expectedSignal: AbortSignal,
  ): 'deferred' | 'lost' | 'ignored' {
    if (
      this.currentTask === expectedTask
      && this.currentTaskAbortController?.signal === expectedSignal
      && this.currentTaskLeaseActive
      && this.status === 'BUSY'
      && !expectedSignal.aborted
      && this.currentTaskCompletionSignal === expectedSignal
    ) {
      this.pendingTaskLeaseConflict = { task: expectedTask, signal: expectedSignal, reason };
      return 'deferred';
    }
    return this.declareTaskLeaseLost(reason, expectedTask, expectedSignal) ? 'lost' : 'ignored';
  }

  private declareTaskLeaseLost(
    reason: Error,
    expectedTask: TaskDefinition,
    expectedSignal: AbortSignal,
  ): boolean {
    const controller = this.currentTaskAbortController;
    if (
      !controller
      || this.currentTask !== expectedTask
      || controller.signal !== expectedSignal
      || !this.currentTaskLeaseActive
      || this.status !== 'BUSY'
      || controller.signal.aborted
    ) return false;

    this.status = 'ERROR';
    this.currentTaskLeaseActive = false;
    this.pendingTaskLeaseConflict = null;
    this.clearTaskLeaseWatchdog();
    this.lastHeartbeatFailureAt = Date.now();
    this.consecutiveHeartbeatFailures = Math.max(
      this.consecutiveHeartbeatFailures,
      this.config.heartbeatFailureThreshold,
    );
    controller.abort(reason);
    return true;
  }

  private clearTaskLeaseWatchdog(): void {
    if (this.currentTaskLeaseTimer) {
      clearTimeout(this.currentTaskLeaseTimer);
      this.currentTaskLeaseTimer = null;
    }
  }

  private pollForTasks(): Promise<void> {
    if (this.pollInFlight) return this.pollInFlight;
    if (!this.registration?.id || this.status !== 'READY' || this.currentTaskPromise) {
      return Promise.resolve();
    }

    const botId = this.registration.id;
    const lifecycleVersion = this.lifecycleVersion;
    const signal = this.runAbortController?.signal;
    const operation = (async () => {
      try {
        const response = await this.orchestratorRequest('GET', `/v1/bots/${botId}/tasks`, undefined, { signal });

        // A stop can begin while the request is in flight. Never start work from
        // a stale response, and never overlap an already-running task.
        if (
          signal?.aborted ||
          lifecycleVersion !== this.lifecycleVersion ||
          this.status !== 'READY' ||
          this.currentTaskPromise
        ) {
          return;
        }

        const tasks = Array.isArray(response) ? response as TaskDefinition[] : [];
        const task = tasks[0];
        if (!task) return;
        if (task.status !== 'RUNNING') {
          this.logger.warn('Ignoring task that was not atomically claimed', { taskId: task.id, status: task.status });
          return;
        }
        if (!this.hasClaimIdentity(task)) {
          this.logger.warn('Ignoring task without a fenced claim identity', { taskId: task.id });
          return;
        }

        await this.acknowledgeTask(task, signal);
        if (
          signal?.aborted
          || lifecycleVersion !== this.lifecycleVersion
          || this.status !== 'READY'
          || this.currentTaskPromise
        ) {
          return;
        }

        const taskOperation = this.processTask(task);
        this.currentTaskPromise = taskOperation;
        try {
          await taskOperation;
        } finally {
          if (this.currentTaskPromise === taskOperation) this.currentTaskPromise = null;
        }
      } catch (error) {
        if (!signal?.aborted && this.status !== 'STOPPING' && this.status !== 'STOPPED') {
          this.logger.debug('Task poll failed', { error });
        }
      }
    })();

    this.pollInFlight = operation;
    void operation.then(
      () => { if (this.pollInFlight === operation) this.pollInFlight = null; },
      () => { if (this.pollInFlight === operation) this.pollInFlight = null; },
    );
    return operation;
  }

  private async reportTaskProgress(
    task: TaskDefinition,
    progress: number,
    message?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.registration) return;

    try {
      await this.orchestratorRequest('POST', `/v1/tasks/${task.id}/progress`, {
        progress: Math.min(100, Math.max(0, progress)),
        message,
      }, { signal, taskClaim: task });
    } catch (error) {
      if (error instanceof OrchestratorRequestError && error.statusCode === 409) {
        if (signal) this.handleTaskLeaseConflict(new Error('Task claim became stale'), task, signal);
      }
      this.logger.warn('Failed to report task progress', { taskId: task.id, error });
    }
  }

  private async reportTaskResult(task: TaskDefinition, result: TaskResult, signal?: AbortSignal): Promise<boolean> {
    if (!this.registration) return false;

    try {
      const status = result.success ? 'DONE' : 'FAILED';
      await this.orchestratorRequest('POST', `/v1/tasks/${task.id}/complete`, {
        status,
        output: result.output,
        error: result.error,
        metrics: result.metrics,
      }, { signal, taskClaim: task });
      return true;
    } catch (error) {
      if (error instanceof OrchestratorRequestError && error.statusCode === 409) {
        if (signal) this.declareTaskLeaseLost(new Error('Task claim became stale'), task, signal);
      }
      this.logger.error('Failed to report task result', error as Error, { taskId: task.id });
      return false;
    }
  }

  private async reportCurrentTaskResult(
    task: TaskDefinition,
    result: TaskResult,
    controller: AbortController,
  ): Promise<boolean> {
    if (this.currentTask !== task || this.currentTaskAbortController !== controller) return false;
    this.currentTaskCompletionSignal = controller.signal;
    try {
      const reported = await this.reportTaskResult(task, result, controller.signal);
      if (reported) {
        // Completion is authoritative. End renewal eligibility before this
        // promise resolves so no queued stale response can mark the task lost.
        this.endTaskLeaseHeartbeatEligibility(task, controller);
      } else {
        const pending = this.pendingTaskLeaseConflict;
        if (pending?.task === task && pending.signal === controller.signal) {
          this.pendingTaskLeaseConflict = null;
          this.declareTaskLeaseLost(pending.reason, task, controller.signal);
        }
      }
      return reported;
    } finally {
      if (this.currentTaskCompletionSignal === controller.signal) {
        this.currentTaskCompletionSignal = null;
      }
      if (
        this.pendingTaskLeaseConflict?.task === task
        && this.pendingTaskLeaseConflict.signal === controller.signal
      ) {
        this.pendingTaskLeaseConflict = null;
      }
    }
  }

  private async emitEvent(eventType: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
    if (!this.registration) return;

    try {
      await this.orchestratorRequest('POST', `/v1/events`, {
        type: eventType,
        source: `bot:${this.registration.id}`,
        data,
      }, { signal });
    } catch (error) {
      this.logger.debug('Failed to emit event', { eventType, error });
    }
  }

  private async orchestratorRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    requestOptions: {
      signal?: AbortSignal;
      timeoutMs?: number;
      taskClaim?: TaskDefinition;
    } = {},
  ): Promise<unknown> {
    const url = `${this.config.orchestratorUrl}${path}`;
    const timeoutMs = requestOptions.timeoutMs ?? this.config.requestTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort(requestOptions.signal?.reason);
    if (requestOptions.signal?.aborted) {
      onExternalAbort();
    } else {
      requestOptions.signal?.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Orchestrator request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Bot-Id': this.registration?.id || '',
      'X-Bot-Instance': this.config.instanceId,
    };
    if (requestOptions.taskClaim && this.hasClaimIdentity(requestOptions.taskClaim)) {
      headers['X-Task-Claim-Token'] = requestOptions.taskClaim.claimToken;
      headers['X-Task-Claim-Generation'] = String(requestOptions.taskClaim.claimGeneration);
    }

    const options: RequestInit = {
      method,
      signal: controller.signal,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new OrchestratorRequestError(
          `Orchestrator request failed: ${response.status} ${errorText}`,
          response.status,
        );
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }

      return {};
    } catch (error) {
      if (timedOut) {
        throw new Error(`Orchestrator request timed out after ${timeoutMs}ms: ${method} ${path}`);
      }
      if (requestOptions.signal?.aborted) {
        throw new Error(`Orchestrator request aborted: ${method} ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      requestOptions.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private toOrchestratorStatus(): OrchestratorBotStatus {
    switch (this.status) {
      case 'BUSY':
        return 'BUSY';
      case 'ERROR':
        return 'ERROR';
      case 'STOPPING':
      case 'STOPPED':
        return 'OFFLINE';
      case 'STARTING':
      case 'READY':
      default:
        return 'ONLINE';
    }
  }

  // --------------------------------------------------------------------------
  // Timers
  // --------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat(this.runAbortController?.signal);
    }, this.config.heartbeatIntervalMs);
  }

  private startTaskPolling(): void {
    this.taskPollTimer = setInterval(() => {
      void this.pollForTasks();
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

export interface BotSignalSource {
  once: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
  removeListener: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
}

export interface BotShutdownHandlerOptions {
  signalSource?: BotSignalSource;
  exit?: (code: number) => void;
  logger?: Logger;
}

export interface RegisteredBotLifecycle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Start an HTTP worker only after orchestrator registration, then notify PM2.
 * A registration failure never invokes the listener or readiness callback.
 */
export async function startRegisteredBotHttpService<T>(
  bot: RegisteredBotLifecycle,
  listen: () => Promise<T>,
  signalReady: () => void = () => {
    if (typeof process.send === 'function') process.send('ready');
  },
): Promise<T> {
  await bot.start();
  try {
    const server = await listen();
    signalReady();
    return server;
  } catch (error) {
    await bot.stop().catch(() => undefined);
    throw error;
  }
}

/** Install one-shot process shutdown handlers that honor the SDK task-drain budget. */
export function installBotShutdownHandlers(
  bot: BotClient,
  options: BotShutdownHandlerOptions = {},
): () => void {
  const signalSource = options.signalSource ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const logger = options.logger ?? bot.logger;
  let stopping = false;

  const cleanup = () => {
    signalSource.removeListener('SIGTERM', onSigterm);
    signalSource.removeListener('SIGINT', onSigint);
  };
  const stop = (signal: 'SIGTERM' | 'SIGINT') => {
    if (stopping) return;
    stopping = true;
    cleanup();
    logger.info(`Received ${signal}, shutting down bot`);
    void bot.stop().then(
      () => exit(0),
      (error) => {
        logger.error('Bot shutdown failed', error as Error);
        exit(1);
      },
    );
  };
  const onSigterm = () => stop('SIGTERM');
  const onSigint = () => stop('SIGINT');

  signalSource.once('SIGTERM', onSigterm);
  signalSource.once('SIGINT', onSigint);
  return cleanup;
}

export { Logger, Metrics };

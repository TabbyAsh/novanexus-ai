"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metrics = exports.Logger = exports.BotClient = void 0;
exports.createBotHealthRoutes = createBotHealthRoutes;
exports.createBotConfig = createBotConfig;
const shared_1 = require("@nova/shared");
const telemetry_1 = require("@nova/telemetry");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return telemetry_1.Logger; } });
Object.defineProperty(exports, "Metrics", { enumerable: true, get: function () { return telemetry_1.Metrics; } });
// ============================================================================
// BotClient - Main SDK Class
// ============================================================================
class BotClient {
    config;
    registration = null;
    status = 'STOPPED';
    taskHandlers = new Map();
    heartbeatTimer = null;
    taskPollTimer = null;
    startTime = 0;
    currentTask = null;
    logger;
    metrics;
    constructor(config) {
        this.config = {
            ...config,
            instanceId: config.instanceId || (0, shared_1.generateId)(),
            permissions: config.permissions || [],
            metadata: config.metadata || {},
            heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
            taskPollIntervalMs: config.taskPollIntervalMs || 5000,
        };
        this.logger = (0, telemetry_1.createLogger)(`bot-${this.config.botType.toLowerCase()}-${this.config.instanceId.slice(0, 8)}`);
        this.metrics = new telemetry_1.Metrics();
    }
    // --------------------------------------------------------------------------
    // Lifecycle
    // --------------------------------------------------------------------------
    async start() {
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
        }
        catch (error) {
            this.status = 'ERROR';
            this.logger.error('Bot failed to start', error);
            throw error;
        }
    }
    async stop() {
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
            }
            catch (error) {
                this.logger.warn('Failed to deregister bot', { error });
            }
        }
        this.status = 'STOPPED';
        this.logger.info('Bot stopped');
    }
    // --------------------------------------------------------------------------
    // Task Handling
    // --------------------------------------------------------------------------
    registerTaskHandler(taskType, handler) {
        this.taskHandlers.set(taskType, handler);
        this.logger.debug('Registered task handler', { taskType });
    }
    unregisterTaskHandler(taskType) {
        this.taskHandlers.delete(taskType);
        this.logger.debug('Unregistered task handler', { taskType });
    }
    async processTask(task) {
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
        const context = {
            botId: this.registration.id,
            logger: this.logger.child({ taskId: task.id, taskType: task.type }),
            metrics: this.metrics,
            emit: async (eventType, data) => {
                await this.emitEvent(eventType, { ...data, taskId: task.id });
            },
            reportProgress: async (progress, message) => {
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
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.metrics.increment('task.failed', 1, { taskType: task.type });
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.reportTaskResult(task.id, {
                success: false,
                error: errorMessage,
            });
            await this.emitEvent('TASK_FAILED', { taskId: task.id, taskType: task.type, error: errorMessage });
            this.logger.error('Task failed', error, { taskId: task.id });
        }
        finally {
            this.currentTask = null;
            this.status = 'READY';
        }
    }
    // --------------------------------------------------------------------------
    // Health & Readiness
    // --------------------------------------------------------------------------
    getHealthStatus() {
        const checks = {
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
    getReadinessStatus() {
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
    getStatus() {
        return this.status;
    }
    getRegistration() {
        return this.registration;
    }
    getBotId() {
        return this.registration?.id || null;
    }
    getCurrentTask() {
        return this.currentTask;
    }
    // --------------------------------------------------------------------------
    // Orchestrator Communication
    // --------------------------------------------------------------------------
    async register() {
        const response = await this.orchestratorRequest('POST', '/v1/bots/register', {
            botType: this.config.botType,
            instanceId: this.config.instanceId,
            capabilities: this.config.capabilities,
            permissions: this.config.permissions,
            metadata: this.config.metadata,
        });
        this.registration = response;
        this.logger.info('Bot registered', { botId: this.registration.id });
    }
    async deregister() {
        if (!this.registration)
            return;
        await this.orchestratorRequest('DELETE', `/v1/bots/${this.registration.id}`);
        this.registration = null;
        this.logger.info('Bot deregistered');
    }
    async sendHeartbeat() {
        if (!this.registration)
            return;
        try {
            await this.orchestratorRequest('POST', `/v1/bots/${this.registration.id}/heartbeat`, {
                status: this.status,
                metrics: this.metrics.getMetrics(),
            });
        }
        catch (error) {
            this.logger.warn('Heartbeat failed', { error });
        }
    }
    async pollForTasks() {
        if (!this.registration || this.status !== 'READY')
            return;
        try {
            const response = await this.orchestratorRequest('GET', `/v1/bots/${this.registration.id}/tasks`);
            const tasks = response;
            if (tasks.length > 0) {
                // Process first available task
                await this.processTask(tasks[0]);
            }
        }
        catch (error) {
            this.logger.debug('Task poll failed', { error });
        }
    }
    async reportTaskProgress(taskId, progress, message) {
        if (!this.registration)
            return;
        try {
            await this.orchestratorRequest('POST', `/v1/tasks/${taskId}/progress`, {
                progress: Math.min(100, Math.max(0, progress)),
                message,
            });
        }
        catch (error) {
            this.logger.warn('Failed to report task progress', { taskId, error });
        }
    }
    async reportTaskResult(taskId, result) {
        if (!this.registration)
            return;
        try {
            const status = result.success ? 'DONE' : 'FAILED';
            await this.orchestratorRequest('POST', `/v1/tasks/${taskId}/complete`, {
                status,
                output: result.output,
                error: result.error,
                metrics: result.metrics,
            });
        }
        catch (error) {
            this.logger.error('Failed to report task result', error, { taskId });
        }
    }
    async emitEvent(eventType, data) {
        if (!this.registration)
            return;
        try {
            await this.orchestratorRequest('POST', `/v1/events`, {
                type: eventType,
                source: `bot:${this.registration.id}`,
                data,
            });
        }
        catch (error) {
            this.logger.debug('Failed to emit event', { eventType, error });
        }
    }
    async orchestratorRequest(method, path, body) {
        const url = `${this.config.orchestratorUrl}${path}`;
        const options = {
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
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatIntervalMs);
    }
    startTaskPolling() {
        this.taskPollTimer = setInterval(() => {
            this.pollForTasks();
        }, this.config.taskPollIntervalMs);
    }
}
exports.BotClient = BotClient;
function createBotHealthRoutes(options) {
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
function createBotConfig(botType, capabilities, options) {
    return {
        botType,
        capabilities,
        orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://localhost:3002',
        ...options,
    };
}

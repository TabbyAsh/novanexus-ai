import { Logger, Metrics } from '@nova/telemetry';
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
export type TaskHandler = (task: TaskDefinition, context: TaskContext) => Promise<TaskResult>;
export interface TaskContext {
    botId: string;
    logger: Logger;
    metrics: Metrics;
    emit: (eventType: string, data: Record<string, unknown>) => Promise<void>;
    reportProgress: (progress: number, message?: string) => Promise<void>;
}
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
export declare class BotClient {
    private config;
    private registration;
    private status;
    private taskHandlers;
    private heartbeatTimer;
    private taskPollTimer;
    private startTime;
    private currentTask;
    readonly logger: Logger;
    readonly metrics: Metrics;
    constructor(config: BotConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    registerTaskHandler(taskType: string, handler: TaskHandler): void;
    unregisterTaskHandler(taskType: string): void;
    private processTask;
    getHealthStatus(): HealthStatus;
    getReadinessStatus(): ReadinessStatus;
    getStatus(): BotStatus;
    getRegistration(): BotRegistration | null;
    getBotId(): string | null;
    getCurrentTask(): TaskDefinition | null;
    private register;
    private deregister;
    private sendHeartbeat;
    private pollForTasks;
    private reportTaskProgress;
    private reportTaskResult;
    private emitEvent;
    private orchestratorRequest;
    private startHeartbeat;
    private startTaskPolling;
}
export interface BotMiddlewareOptions {
    bot: BotClient;
    basePath?: string;
}
export declare function createBotHealthRoutes(options: BotMiddlewareOptions): {
    healthHandler: (req: unknown, res: {
        json: (data: unknown) => void;
        status: (code: number) => {
            json: (data: unknown) => void;
        };
    }) => void;
    readyHandler: (req: unknown, res: {
        json: (data: unknown) => void;
        status: (code: number) => {
            json: (data: unknown) => void;
        };
    }) => void;
    metricsHandler: (req: unknown, res: {
        json: (data: unknown) => void;
    }) => void;
};
export declare function createBotConfig(botType: BotType, capabilities: BotCapability[], options?: Partial<BotConfig>): BotConfig;
export { Logger, Metrics };

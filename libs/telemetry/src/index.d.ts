/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Log entry structure
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    service: string;
    message: string;
    requestId?: string;
    userId?: string;
    orgId?: string;
    meta?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}
/**
 * Logger configuration
 */
export interface LoggerConfig {
    service: string;
    level: LogLevel;
    pretty?: boolean;
}
/**
 * Logger instance for structured logging
 */
export declare class Logger {
    private config;
    private context;
    private static levelPriority;
    constructor(config: LoggerConfig);
    /**
     * Create a child logger with additional context
     */
    child(context: Record<string, unknown>): Logger;
    /**
     * Set request context
     */
    withRequest(requestId: string, userId?: string, orgId?: string): Logger;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error, meta?: Record<string, unknown>): void;
    private log;
    private prettyPrint;
}
/**
 * Span for distributed tracing
 */
export interface Span {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
    serviceName: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    status: 'OK' | 'ERROR';
    tags: Record<string, string>;
    logs: Array<{
        timestamp: string;
        message: string;
    }>;
}
/**
 * Tracer for distributed tracing
 */
export declare class Tracer {
    private serviceName;
    private spans;
    constructor(serviceName: string);
    /**
     * Start a new trace
     */
    startTrace(operationName: string, tags?: Record<string, string>): Span;
    /**
     * Start a child span
     */
    startSpan(operationName: string, parentSpan?: Span, tags?: Record<string, string>): Span;
    /**
     * End a span
     */
    endSpan(span: Span, status?: 'OK' | 'ERROR'): void;
    /**
     * Add a log to a span
     */
    logToSpan(span: Span, message: string): void;
    /**
     * Get all spans (for testing/export)
     */
    getSpans(): Span[];
    /**
     * Clear spans
     */
    clear(): void;
}
/**
 * Metrics collector
 */
export declare class Metrics {
    private counters;
    private gauges;
    private histograms;
    /**
     * Increment a counter
     */
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    /**
     * Set a gauge value
     */
    gauge(name: string, value: number, tags?: Record<string, string>): void;
    /**
     * Record a histogram value
     */
    histogram(name: string, value: number, tags?: Record<string, string>): void;
    /**
     * Record request duration
     */
    recordDuration(name: string, startTime: number, tags?: Record<string, string>): void;
    /**
     * Get all metrics
     */
    getMetrics(): {
        counters: Record<string, number>;
        gauges: Record<string, number>;
        histograms: Record<string, {
            count: number;
            sum: number;
            avg: number;
            min: number;
            max: number;
        }>;
    };
    /**
     * Reset all metrics
     */
    reset(): void;
    private buildKey;
}
/**
 * Create default logger for a service
 */
export declare function createLogger(service: string): Logger;
/**
 * Create default tracer for a service
 */
export declare function createTracer(service: string): Tracer;
/**
 * Create default metrics collector
 */
export declare function createMetrics(): Metrics;

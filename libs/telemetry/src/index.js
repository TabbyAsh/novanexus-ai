"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metrics = exports.Tracer = exports.Logger = void 0;
exports.createLogger = createLogger;
exports.createTracer = createTracer;
exports.createMetrics = createMetrics;
const shared_1 = require("@nova/shared");
/**
 * Logger instance for structured logging
 */
class Logger {
    config;
    context = {};
    static levelPriority = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };
    constructor(config) {
        this.config = config;
    }
    /**
     * Create a child logger with additional context
     */
    child(context) {
        const child = new Logger(this.config);
        child.context = { ...this.context, ...context };
        return child;
    }
    /**
     * Set request context
     */
    withRequest(requestId, userId, orgId) {
        return this.child({ requestId, userId, orgId });
    }
    debug(message, meta) {
        this.log('debug', message, meta);
    }
    info(message, meta) {
        this.log('info', message, meta);
    }
    warn(message, meta) {
        this.log('warn', message, meta);
    }
    error(message, error, meta) {
        this.log('error', message, {
            ...meta,
            error: error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                }
                : undefined,
        });
    }
    log(level, message, meta) {
        if (Logger.levelPriority[level] < Logger.levelPriority[this.config.level]) {
            return;
        }
        const entry = {
            timestamp: (0, shared_1.nowTimestamp)(),
            level,
            service: this.config.service,
            message,
            requestId: this.context.requestId,
            userId: this.context.userId,
            orgId: this.context.orgId,
            meta: { ...this.context, ...meta },
        };
        if (meta?.error) {
            entry.error = meta.error;
        }
        if (this.config.pretty) {
            this.prettyPrint(entry);
        }
        else {
            console.log(JSON.stringify(entry));
        }
    }
    prettyPrint(entry) {
        const levelColors = {
            debug: '\x1b[36m', // cyan
            info: '\x1b[32m', // green
            warn: '\x1b[33m', // yellow
            error: '\x1b[31m', // red
        };
        const reset = '\x1b[0m';
        const color = levelColors[entry.level];
        let output = `${entry.timestamp} ${color}${entry.level.toUpperCase()}${reset} [${entry.service}] ${entry.message}`;
        if (entry.requestId) {
            output += ` (req:${entry.requestId})`;
        }
        if (entry.meta && Object.keys(entry.meta).length > 0) {
            output += ` ${JSON.stringify(entry.meta)}`;
        }
        if (entry.error) {
            output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
            if (entry.error.stack) {
                output += `\n  ${entry.error.stack}`;
            }
        }
        console.log(output);
    }
}
exports.Logger = Logger;
/**
 * Tracer for distributed tracing
 */
class Tracer {
    serviceName;
    spans = [];
    constructor(serviceName) {
        this.serviceName = serviceName;
    }
    /**
     * Start a new trace
     */
    startTrace(operationName, tags) {
        return this.startSpan(operationName, undefined, tags);
    }
    /**
     * Start a child span
     */
    startSpan(operationName, parentSpan, tags) {
        const span = {
            traceId: parentSpan?.traceId || (0, shared_1.generateId)(),
            spanId: (0, shared_1.generateId)(),
            parentSpanId: parentSpan?.spanId,
            operationName,
            serviceName: this.serviceName,
            startTime: (0, shared_1.nowTimestamp)(),
            status: 'OK',
            tags: tags || {},
            logs: [],
        };
        this.spans.push(span);
        return span;
    }
    /**
     * End a span
     */
    endSpan(span, status = 'OK') {
        span.endTime = (0, shared_1.nowTimestamp)();
        span.status = status;
        span.duration =
            new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
    }
    /**
     * Add a log to a span
     */
    logToSpan(span, message) {
        span.logs.push({
            timestamp: (0, shared_1.nowTimestamp)(),
            message,
        });
    }
    /**
     * Get all spans (for testing/export)
     */
    getSpans() {
        return [...this.spans];
    }
    /**
     * Clear spans
     */
    clear() {
        this.spans = [];
    }
}
exports.Tracer = Tracer;
/**
 * Metrics collector
 */
class Metrics {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
    /**
     * Increment a counter
     */
    increment(name, value = 1, tags) {
        const key = this.buildKey(name, tags);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
    }
    /**
     * Set a gauge value
     */
    gauge(name, value, tags) {
        const key = this.buildKey(name, tags);
        this.gauges.set(key, value);
    }
    /**
     * Record a histogram value
     */
    histogram(name, value, tags) {
        const key = this.buildKey(name, tags);
        const values = this.histograms.get(key) || [];
        values.push(value);
        this.histograms.set(key, values);
    }
    /**
     * Record request duration
     */
    recordDuration(name, startTime, tags) {
        const duration = Date.now() - startTime;
        this.histogram(name, duration, tags);
    }
    /**
     * Get all metrics
     */
    getMetrics() {
        const histogramStats = {};
        for (const [key, values] of this.histograms) {
            const count = values.length;
            const sum = values.reduce((a, b) => a + b, 0);
            histogramStats[key] = {
                count,
                sum,
                avg: count > 0 ? sum / count : 0,
                min: count > 0 ? Math.min(...values) : 0,
                max: count > 0 ? Math.max(...values) : 0,
            };
        }
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: histogramStats,
        };
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }
    buildKey(name, tags) {
        if (!tags || Object.keys(tags).length === 0) {
            return name;
        }
        const tagStr = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${name}{${tagStr}}`;
    }
}
exports.Metrics = Metrics;
/**
 * Create default logger for a service
 */
function createLogger(service) {
    return new Logger({
        service,
        level: process.env.LOG_LEVEL || 'info',
        pretty: process.env.NODE_ENV === 'development',
    });
}
/**
 * Create default tracer for a service
 */
function createTracer(service) {
    return new Tracer(service);
}
/**
 * Create default metrics collector
 */
function createMetrics() {
    return new Metrics();
}

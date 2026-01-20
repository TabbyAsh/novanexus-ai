import { generateId, nowTimestamp } from '@nova/shared';

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
export class Logger {
  private config: LoggerConfig;
  private context: Record<string, unknown> = {};
  
  private static levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Set request context
   */
  withRequest(requestId: string, userId?: string, orgId?: string): Logger {
    return this.child({ requestId, userId, orgId });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
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

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (Logger.levelPriority[level] < Logger.levelPriority[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: nowTimestamp(),
      level,
      service: this.config.service,
      message,
      requestId: this.context.requestId as string | undefined,
      userId: this.context.userId as string | undefined,
      orgId: this.context.orgId as string | undefined,
      meta: { ...this.context, ...meta },
    };

    if (meta?.error) {
      entry.error = meta.error as LogEntry['error'];
    }

    if (this.config.pretty) {
      this.prettyPrint(entry);
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  private prettyPrint(entry: LogEntry): void {
    const levelColors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
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
  logs: Array<{ timestamp: string; message: string }>;
}

/**
 * Tracer for distributed tracing
 */
export class Tracer {
  private serviceName: string;
  private spans: Span[] = [];

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Start a new trace
   */
  startTrace(operationName: string, tags?: Record<string, string>): Span {
    return this.startSpan(operationName, undefined, tags);
  }

  /**
   * Start a child span
   */
  startSpan(
    operationName: string,
    parentSpan?: Span,
    tags?: Record<string, string>
  ): Span {
    const span: Span = {
      traceId: parentSpan?.traceId || generateId(),
      spanId: generateId(),
      parentSpanId: parentSpan?.spanId,
      operationName,
      serviceName: this.serviceName,
      startTime: nowTimestamp(),
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
  endSpan(span: Span, status: 'OK' | 'ERROR' = 'OK'): void {
    span.endTime = nowTimestamp();
    span.status = status;
    span.duration =
      new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  }

  /**
   * Add a log to a span
   */
  logToSpan(span: Span, message: string): void {
    span.logs.push({
      timestamp: nowTimestamp(),
      message,
    });
  }

  /**
   * Get all spans (for testing/export)
   */
  getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * Clear spans
   */
  clear(): void {
    this.spans = [];
  }
}

/**
 * Metrics collector
 */
export class Metrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  /**
   * Increment a counter
   */
  increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    this.gauges.set(key, value);
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  /**
   * Record request duration
   */
  recordDuration(name: string, startTime: number, tags?: Record<string, string>): void {
    const duration = Date.now() - startTime;
    this.histogram(name, duration, tags);
  }

  /**
   * Get all metrics
   */
  getMetrics(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; sum: number; avg: number; min: number; max: number }>;
  } {
    const histogramStats: Record<string, { count: number; sum: number; avg: number; min: number; max: number }> = {};
    
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
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private buildKey(name: string, tags?: Record<string, string>): string {
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

/**
 * Create default logger for a service
 */
export function createLogger(service: string): Logger {
  return new Logger({
    service,
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    pretty: process.env.NODE_ENV === 'development',
  });
}

/**
 * Create default tracer for a service
 */
export function createTracer(service: string): Tracer {
  return new Tracer(service);
}

/**
 * Create default metrics collector
 */
export function createMetrics(): Metrics {
  return new Metrics();
}

import express, { Request, Response } from 'express';
import { createLogger } from '@nova/telemetry';
import { HTTP_STATUS, query } from '@nova/shared';
import cron from 'node-cron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import https from 'https';
import http from 'http';

const execFileAsync = promisify(execFile);

const app = express();
const logger = createLogger('scheduler-service');
const PORT = process.env.PORT || 3040;
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const NODE_BIN = process.execPath; // Use the same Node.js binary

// ============================================================================
// CONFIG
// ============================================================================

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const ENABLE_BRIEF_SCHEDULE = process.env.ENABLE_BRIEF_SCHEDULE !== 'false';
const ENABLE_HEALTH_MONITOR = process.env.ENABLE_HEALTH_MONITOR !== 'false';

// Service endpoints to monitor
const MONITORED_SERVICES = [
  { name: 'gateway', url: process.env.GATEWAY_URL || 'http://localhost:3000' },
  { name: 'auth', url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001' },
  { name: 'nova-hub', url: process.env.NOVA_HUB_URL || 'http://localhost:3030' },
  { name: 'marketdata', url: process.env.MARKETDATA_URL || 'http://localhost:3020' },
  { name: 'billing', url: process.env.BILLING_URL || 'http://localhost:3006' },
];

// ============================================================================
// STATE — Run history for the scheduler itself
// ============================================================================

interface JobRun {
  job: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'success' | 'failure';
  durationMs: number | null;
  output: string;
  error: string | null;
}

const runHistory: JobRun[] = [];
const MAX_HISTORY = 100;

function recordRun(run: JobRun) {
  runHistory.unshift(run);
  if (runHistory.length > MAX_HISTORY) runHistory.pop();
}

// ============================================================================
// DISCORD WEBHOOK
// ============================================================================

async function sendDiscordAlert(title: string, message: string, color: number = 0xff0000): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;

  const body = JSON.stringify({
    embeds: [{
      title,
      description: message.slice(0, 2000),
      color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Nova Scheduler' },
    }],
  });

  return new Promise((resolve) => {
    try {
      const url = new URL(DISCORD_WEBHOOK_URL);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, () => resolve());
      req.on('error', (err) => {
        logger.warn('Discord webhook failed', { error: err.message });
        resolve();
      });
      req.write(body);
      req.end();
    } catch {
      resolve();
    }
  });
}

// ============================================================================
// SCRIPT RUNNER
// ============================================================================

async function runScript(scriptName: string, args: string[] = [], timeoutMs: number = 300_000): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  logger.info(`Running script: ${scriptName}`, { args });

  const startTime = Date.now();
  const run: JobRun = {
    job: scriptName,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    durationMs: null,
    output: '',
    error: null,
  };

  try {
    const { stdout, stderr } = await execFileAsync(NODE_BIN, [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..', '..', '..'),
      timeout: timeoutMs,
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const durationMs = Date.now() - startTime;
    run.completedAt = new Date().toISOString();
    run.status = 'success';
    run.durationMs = durationMs;
    run.output = stdout.slice(-2000);
    recordRun(run);

    logger.info(`Script completed: ${scriptName}`, { durationMs, stdoutLength: stdout.length });
    return { stdout, stderr };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    run.completedAt = new Date().toISOString();
    run.status = 'failure';
    run.durationMs = durationMs;
    run.error = err.message?.slice(0, 500) || 'Unknown error';
    run.output = (err.stdout || '').slice(-2000);
    recordRun(run);

    logger.error(`Script failed: ${scriptName}`, err instanceof Error ? err : new Error(String(err)), { durationMs });
    throw err;
  }
}

// ============================================================================
// DATABASE LOGGING
// ============================================================================

async function logSchedulerRun(jobName: string, status: string, durationMs: number, details: Record<string, any> = {}): Promise<void> {
  try {
    await query(
      `INSERT INTO scheduler_runs (job_name, status, duration_ms, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [jobName, status, durationMs, JSON.stringify(details)]
    );
  } catch (err: any) {
    // Table may not exist yet — log but don't crash
    logger.warn('Could not log scheduler run to DB (table may not exist yet)', { error: err.message });
  }
}

// ============================================================================
// JOB: DAILY BRIEF — Generate + Send (Pre-Market)
// ============================================================================

async function jobDailyBrief(): Promise<void> {
  const startTime = Date.now();
  logger.info('=== DAILY BRIEF JOB STARTED ===');

  try {
    // Step 1: Generate the brief
    logger.info('[BRIEF] Step 1/2: Generating Daily Brief...');
    const genResult = await runScript('generate-daily-brief.js', [], 180_000);
    logger.info('[BRIEF] Brief generated successfully');

    // Step 2: Send to subscribers
    logger.info('[BRIEF] Step 2/2: Sending to subscribers...');
    const sendResult = await runScript('send-daily-brief.js', [], 120_000);
    logger.info('[BRIEF] Delivery complete');

    const durationMs = Date.now() - startTime;
    await logSchedulerRun('daily-brief', 'success', durationMs, {
      generateOutput: genResult.stdout.slice(-500),
      sendOutput: sendResult.stdout.slice(-500),
    });

    await sendDiscordAlert(
      '✅ Daily Brief Delivered',
      `Brief generated and sent successfully in ${(durationMs / 1000).toFixed(1)}s`,
      0x00ff00
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSchedulerRun('daily-brief', 'failure', durationMs, { error: err.message });
    await sendDiscordAlert(
      '❌ Daily Brief Failed',
      `Error: ${err.message?.slice(0, 500)}\nDuration: ${(durationMs / 1000).toFixed(1)}s`
    );
    throw err;
  }
}

// ============================================================================
// JOB: OUTCOME TRACKING (Post-Market)
// ============================================================================

async function jobOutcomeTracking(): Promise<void> {
  const startTime = Date.now();
  logger.info('=== OUTCOME TRACKING JOB STARTED ===');

  try {
    const result = await runScript('log-brief-outcomes.js', [], 120_000);

    const durationMs = Date.now() - startTime;
    await logSchedulerRun('outcome-tracking', 'success', durationMs, {
      output: result.stdout.slice(-500),
    });

    await sendDiscordAlert(
      '📊 Brief Outcomes Logged',
      `Outcome tracking completed in ${(durationMs / 1000).toFixed(1)}s\n\`\`\`\n${result.stdout.slice(-300)}\n\`\`\``,
      0x8b5cf6
    );
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSchedulerRun('outcome-tracking', 'failure', durationMs, { error: err.message });
    await sendDiscordAlert(
      '❌ Outcome Tracking Failed',
      `Error: ${err.message?.slice(0, 500)}`
    );
    throw err;
  }
}

// ============================================================================
// JOB: HEALTH MONITOR
// ============================================================================

interface HealthCheckResult {
  service: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unreachable';
  responseTimeMs: number;
  statusCode: number | null;
  error: string | null;
}

async function checkServiceHealth(name: string, baseUrl: string): Promise<HealthCheckResult> {
  const url = `${baseUrl}/health`;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 10_000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk);
      res.on('end', () => {
        const responseTimeMs = Date.now() - startTime;
        resolve({
          service: name,
          url,
          status: res.statusCode === 200 ? 'healthy' : 'unhealthy',
          responseTimeMs,
          statusCode: res.statusCode || null,
          error: res.statusCode !== 200 ? `HTTP ${res.statusCode}: ${data.slice(0, 200)}` : null,
        });
      });
    });
    req.on('error', (err: Error) => {
      resolve({
        service: name,
        url,
        status: 'unreachable',
        responseTimeMs: Date.now() - startTime,
        statusCode: null,
        error: err.message,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        service: name,
        url,
        status: 'unreachable',
        responseTimeMs: Date.now() - startTime,
        statusCode: null,
        error: 'Timeout (10s)',
      });
    });
  });
}

let lastHealthStatus: HealthCheckResult[] = [];
let consecutiveFailures: Record<string, number> = {};

async function jobHealthMonitor(): Promise<void> {
  const results = await Promise.all(
    MONITORED_SERVICES.map(s => checkServiceHealth(s.name, s.url))
  );

  lastHealthStatus = results;

  const unhealthy = results.filter(r => r.status !== 'healthy');
  if (unhealthy.length > 0) {
    for (const u of unhealthy) {
      consecutiveFailures[u.service] = (consecutiveFailures[u.service] || 0) + 1;
    }

    // Alert only after 2 consecutive failures (avoid one-off flakes)
    const alertWorthy = unhealthy.filter(u => (consecutiveFailures[u.service] || 0) >= 2);
    if (alertWorthy.length > 0) {
      const detail = alertWorthy.map(u =>
        `• **${u.service}**: ${u.status} (${u.error || 'unknown'})`
      ).join('\n');

      logger.warn('Health check failures detected', { services: alertWorthy.map(u => u.service) });

      await sendDiscordAlert(
        '🚨 Service Health Alert',
        `${alertWorthy.length} service(s) unhealthy:\n${detail}`,
        0xff6600
      );

      try {
        await logSchedulerRun('health-monitor', 'alert', 0, {
          unhealthy: alertWorthy.map(u => ({ service: u.service, status: u.status, error: u.error })),
        });
      } catch { /* best effort */ }
    }
  }

  // Reset counters for healthy services
  for (const r of results) {
    if (r.status === 'healthy') {
      consecutiveFailures[r.service] = 0;
    }
  }
}

// ============================================================================
// EXPRESS APP — Health & Status
// ============================================================================

app.use(express.json());

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'scheduler',
      timestamp: new Date().toISOString(),
      schedulesActive: ENABLE_BRIEF_SCHEDULE,
      healthMonitorActive: ENABLE_HEALTH_MONITOR,
    });
  } catch {
    res.json({
      status: 'healthy',
      service: 'scheduler',
      timestamp: new Date().toISOString(),
      schedulesActive: ENABLE_BRIEF_SCHEDULE,
      healthMonitorActive: ENABLE_HEALTH_MONITOR,
      dbConnected: false,
    });
  }
});

// Status dashboard data
app.get('/v1/scheduler/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      schedulesActive: ENABLE_BRIEF_SCHEDULE,
      healthMonitorActive: ENABLE_HEALTH_MONITOR,
      recentRuns: runHistory.slice(0, 20),
      serviceHealth: lastHealthStatus,
      nextBriefRun: getNextCronRun('30 13 * * 1-5'), // 8:30 AM ET = 13:30 UTC
      nextOutcomeRun: getNextCronRun('30 21 * * 1-5'), // 4:30 PM ET = 21:30 UTC
    },
  });
});

// ============================================================================
// COOLDOWN + ACTION AUDIT — Trigger Safety
// ============================================================================

const COOLDOWN_MS: Record<string, number> = { brief: 60_000, outcomes: 60_000, health: 10_000 };
const lastTriggerTime: Record<string, number> = {};

function checkCooldown(job: string): { allowed: boolean; remainingMs: number } {
  const cooldown = COOLDOWN_MS[job] || 60_000;
  const lastTime = lastTriggerTime[job] || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < cooldown) {
    return { allowed: false, remainingMs: cooldown - elapsed };
  }
  return { allowed: true, remainingMs: 0 };
}

async function logCommandAction(actionType: string, target: string, result: string, details: Record<string, any> = {}, actorId: string = 'scheduler'): Promise<void> {
  try {
    await query(
      `INSERT INTO command_actions (actor_id, action_type, target, result, details) VALUES ($1, $2, $3, $4, $5)`,
      [actorId, actionType, target, result, JSON.stringify(details)]
    );
  } catch (err: any) {
    logger.warn('Could not log command action', { error: err.message });
  }
}

function getActorId(req: Request): string {
  return (req.headers['x-user-id'] as string) || 'scheduler';
}

// Manual triggers (with cooldown + audit)
app.post('/v1/scheduler/trigger/brief', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  const cd = checkCooldown('brief');
  if (!cd.allowed) {
    await logCommandAction('trigger-brief', 'scheduler', 'rejected', { reason: 'cooldown', remainingMs: cd.remainingMs }, actor);
    return res.status(429).json({
      success: false,
      error: { code: 'COOLDOWN', message: `Brief trigger on cooldown. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` },
      cooldownRemainingMs: cd.remainingMs,
    });
  }
  try {
    lastTriggerTime['brief'] = Date.now();
    logger.info('Manual brief trigger received', { actor });
    await logCommandAction('trigger-brief', 'scheduler', 'success', { source: 'manual' }, actor);
    jobDailyBrief().catch(err => logger.error('Manual brief job failed', err instanceof Error ? err : new Error(String(err))));
    res.json({ success: true, message: 'Brief job triggered (running in background)' });
  } catch (err: any) {
    await logCommandAction('trigger-brief', 'scheduler', 'failure', { error: err.message }, actor);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/v1/scheduler/trigger/outcomes', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  const cd = checkCooldown('outcomes');
  if (!cd.allowed) {
    await logCommandAction('trigger-outcomes', 'scheduler', 'rejected', { reason: 'cooldown', remainingMs: cd.remainingMs }, actor);
    return res.status(429).json({
      success: false,
      error: { code: 'COOLDOWN', message: `Outcome trigger on cooldown. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` },
      cooldownRemainingMs: cd.remainingMs,
    });
  }
  try {
    lastTriggerTime['outcomes'] = Date.now();
    logger.info('Manual outcome tracking trigger received', { actor });
    await logCommandAction('trigger-outcomes', 'scheduler', 'success', { source: 'manual' }, actor);
    jobOutcomeTracking().catch(err => logger.error('Manual outcome job failed', err instanceof Error ? err : new Error(String(err))));
    res.json({ success: true, message: 'Outcome tracking job triggered (running in background)' });
  } catch (err: any) {
    await logCommandAction('trigger-outcomes', 'scheduler', 'failure', { error: err.message }, actor);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/v1/scheduler/trigger/health', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  const cd = checkCooldown('health');
  if (!cd.allowed) {
    return res.status(429).json({
      success: false,
      error: { code: 'COOLDOWN', message: `Health trigger on cooldown. Wait ${Math.ceil(cd.remainingMs / 1000)}s.` },
      cooldownRemainingMs: cd.remainingMs,
    });
  }
  try {
    lastTriggerTime['health'] = Date.now();
    await logCommandAction('trigger-health', 'scheduler', 'success', { source: 'manual' }, actor);
    await jobHealthMonitor();
    res.json({ success: true, data: { serviceHealth: lastHealthStatus } });
  } catch (err: any) {
    await logCommandAction('trigger-health', 'scheduler', 'failure', { error: err.message }, actor);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run history
app.get('/v1/scheduler/history', (_req: Request, res: Response) => {
  res.json({ success: true, data: { runs: runHistory } });
});

// ============================================================================
// CRON SCHEDULING
// ============================================================================

function getNextCronRun(cronExpr: string): string | null {
  // Simple heuristic — node-cron doesn't expose next run natively
  // Just return the cron expression for now
  return cronExpr;
}

function startSchedules(): void {
  if (ENABLE_BRIEF_SCHEDULE) {
    // Daily Brief: 8:30 AM ET = 13:30 UTC (weekdays only)
    // Cron: minute hour dom month dow
    cron.schedule('30 13 * * 1-5', () => {
      logger.info('Cron triggered: Daily Brief generation + delivery');
      jobDailyBrief().catch(err => {
        logger.error('Daily Brief cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Daily Brief — 8:30 AM ET (13:30 UTC) weekdays');

    // Outcome Tracking: 4:30 PM ET = 21:30 UTC (weekdays only)
    cron.schedule('30 21 * * 1-5', () => {
      logger.info('Cron triggered: Outcome tracking');
      jobOutcomeTracking().catch(err => {
        logger.error('Outcome tracking cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Outcome Tracking — 4:30 PM ET (21:30 UTC) weekdays');
  } else {
    logger.info('⏸ Brief scheduling disabled (ENABLE_BRIEF_SCHEDULE=false)');
  }

  if (ENABLE_HEALTH_MONITOR) {
    // Health checks every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      jobHealthMonitor().catch(err => {
        logger.error('Health monitor cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    });
    logger.info('📅 Scheduled: Health Monitor — every 5 minutes');
  } else {
    logger.info('⏸ Health monitoring disabled (ENABLE_HEALTH_MONITOR=false)');
  }
}

// ============================================================================
// STARTUP
// ============================================================================

app.listen(PORT, () => {
  logger.info(`Nova Scheduler running on port ${PORT}`);
  logger.info('=== Nova Scheduler — The Heart of the Enterprise ===');
  logger.info(`Scripts directory: ${SCRIPTS_DIR}`);

  startSchedules();

  // Run health check immediately on startup
  if (ENABLE_HEALTH_MONITOR) {
    setTimeout(() => {
      jobHealthMonitor().catch(err => {
        logger.error('Initial health check failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, 5000);
  }

  // Signal PM2 ready
  if (typeof process.send === 'function') {
    process.send('ready');
  }
});

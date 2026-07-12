import express, { Request, Response } from 'express';
import { createLogger } from '@nova/telemetry';
import { HTTP_STATUS, query, queryOne } from '@nova/shared';
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

async function automationAllowed(): Promise<boolean> {
  try {
    const row = await queryOne<{ value_json: string | { enabled?: boolean } }>(
      `SELECT value_json FROM system_state WHERE key = 'kill_switch'`,
    );
    if (!row) return false;
    const state = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return state?.enabled !== true;
  } catch (err) {
    logger.error('Scheduler authority unavailable; failing closed', err as Error);
    return false;
  }
}

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
  if (!(await automationAllowed())) return;
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
  if (!(await automationAllowed())) return;
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

app.post('/v1/scheduler/trigger/stock-alerts', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  try {
    logger.info('Manual stock alerts trigger received', { actor });
    jobDailyStockAlerts().catch(err => logger.error('Manual stock alerts failed', err instanceof Error ? err : new Error(String(err))));
    res.json({ success: true, message: 'Stock alerts job triggered (running in background)' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/v1/scheduler/trigger/weekly-digest', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  try {
    logger.info('Manual weekly digest trigger received', { actor });
    jobWeeklyDigest().catch(err => logger.error('Manual weekly digest failed', err instanceof Error ? err : new Error(String(err))));
    res.json({ success: true, message: 'Weekly digest job triggered (running in background)' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/v1/scheduler/trigger/flip-alerts', async (req: Request, res: Response) => {
  const actor = getActorId(req);
  try {
    logger.info('Manual flip alerts trigger received', { actor });
    jobDailyFlipAlerts().catch(err => logger.error('Manual flip alerts failed', err instanceof Error ? err : new Error(String(err))));
    res.json({ success: true, message: 'Flip alerts job triggered (running in background)' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run history
app.get('/v1/scheduler/history', (_req: Request, res: Response) => {
  res.json({ success: true, data: { runs: runHistory } });
});

// ============================================================================
// JOB: DAILY FLIP ALERTS — Free flip opportunities emailed to subscribers
// ============================================================================

const NOVA_HUB_URL  = process.env.NOVA_HUB_URL   || 'http://localhost:3030';
const TRADEBOT_URL  = process.env.TRADEBOT_URL   || 'http://localhost:3010';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FLIP_ALERT_CITIES = ['newyork', 'losangeles', 'chicago', 'houston', 'phoenix', 'sfbay', 'seattle', 'denver', 'atlanta', 'miami'];

const FLIP_ALERT_PATTERNS = [
  { pattern: /iphone|ipad|macbook|apple watch/i, category: 'apple' },
  { pattern: /samsung|galaxy|pixel/i, category: 'phones' },
  { pattern: /laptop|chromebook|computer/i, category: 'computers' },
  { pattern: /ps[45]|playstation|xbox|nintendo|switch/i, category: 'gaming' },
  { pattern: /dyson|roomba|vacuum/i, category: 'appliances' },
  { pattern: /bike|bicycle/i, category: 'bikes' },
  { pattern: /drill|saw|dewalt|milwaukee|makita/i, category: 'tools' },
  { pattern: /airpods|headphones|speaker|bose|sonos/i, category: 'audio' },
  { pattern: /camera|canon|nikon|gopro/i, category: 'cameras' },
  { pattern: /guitar|keyboard|piano/i, category: 'instruments' },
  { pattern: /kitchenaid|mixer|instant pot/i, category: 'kitchen' },
  { pattern: /lego|pokemon|trading card/i, category: 'collectibles' },
  { pattern: /peloton|treadmill|dumbbell/i, category: 'fitness' },
];

async function scanCityFreeListings(city: string): Promise<{ title: string; link: string; city: string }[]> {
  try {
    const url = `https://${city}.craigslist.org/search/zip`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const listings: { title: string; link: string; city: string }[] = [];

    // Parse CL listings
    const titleRegex = /class="titlestring">([^<]+)</g;
    const linkRegex = /href="(https:\/\/[^"]*\.craigslist\.org\/[^"]+)"/g;
    const titles: string[] = [];
    const links: string[] = [];
    let m;
    while ((m = titleRegex.exec(html)) && titles.length < 50) titles.push(m[1].trim());
    while ((m = linkRegex.exec(html)) && links.length < 50) links.push(m[1]);
    for (let i = 0; i < Math.min(titles.length, links.length); i++) {
      listings.push({ title: titles[i], link: links[i], city });
    }
    return listings;
  } catch {
    return [];
  }
}

interface FlipAlertItem {
  title: string;
  city: string;
  link: string;
  category: string;
  verdict: string;
  resale_mid: number;
  net_profit_mid: number;
  confidence: number;
}

async function jobDailyFlipAlerts(): Promise<void> {
  if (!(await automationAllowed())) return;
  const startTime = Date.now();
  logger.info('=== DAILY FLIP ALERTS JOB STARTED ===');

  try {
    // 1. Scan Craigslist free sections
    const allListings: { title: string; link: string; city: string }[] = [];
    for (const city of FLIP_ALERT_CITIES.slice(0, 5)) {
      const listings = await scanCityFreeListings(city);
      allListings.push(...listings);
      await new Promise(r => setTimeout(r, 1000)); // Rate limit
    }

    // 2. Filter to potentially valuable items
    const valuable = allListings.filter(l => FLIP_ALERT_PATTERNS.some(p => p.pattern.test(l.title))).slice(0, 10);
    if (valuable.length === 0) {
      logger.info('No valuable free items found today');
      await logSchedulerRun('flip-alerts', 'success', Date.now() - startTime, { found: 0 });
      return;
    }

    // 3. Evaluate each through Flip Card engine
    const evaluated: FlipAlertItem[] = [];
    for (const item of valuable) {
      try {
        const category = FLIP_ALERT_PATTERNS.find(p => p.pattern.test(item.title))?.category || 'general';
        const res = await fetch(`${NOVA_HUB_URL}/v1/flip/appraise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.title, buy_price: 0, condition: 'Fair', shipping_or_pickup: 'pickup', category }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json() as { success: boolean; data: { est_net_profit_mid: number; verdict: string; est_resale_mid: number; confidence_score: number } };
        if (data.success && data.data.est_net_profit_mid > 10) {
          evaluated.push({
            title: item.title, city: item.city, link: item.link, category,
            verdict: data.data.verdict, resale_mid: data.data.est_resale_mid,
            net_profit_mid: data.data.est_net_profit_mid, confidence: data.data.confidence_score,
          });
        }
      } catch { /* skip failed evaluations */ }
      await new Promise(r => setTimeout(r, 500));
    }

    evaluated.sort((a, b) => b.net_profit_mid - a.net_profit_mid);
    logger.info(`Flip Alerts: ${evaluated.length} opportunities found from ${allListings.length} listings`);

    // 4. Get subscribers with LITE or higher plans
    let subscribers: { email: string; user_id: string }[] = [];
    try {
      const result = await query<{ user_id: string }>(
        `SELECT user_id FROM entitlements WHERE plan IN ('LITE', 'PRO', 'FOUNDING') AND status = 'ACTIVE'`
      );
      for (const row of result.rows) {
        const user = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [row.user_id]);
        if (user.rows[0]?.email) subscribers.push({ email: user.rows[0].email, user_id: row.user_id });
      }
    } catch (err: any) {
      logger.warn('Could not fetch subscribers for flip alerts', { error: err.message });
    }

    // 5. Send email via Resend
    if (evaluated.length > 0 && subscribers.length > 0 && RESEND_API_KEY) {
      const itemsHtml = evaluated.slice(0, 5).map(item =>
        `<tr><td style="padding:8px;border-bottom:1px solid #333">${item.title}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #333;color:#10b981;font-weight:bold">~$${item.resale_mid}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #333">${item.city}</td>` +
        `<td style="padding:8px;border-bottom:1px solid #333"><a href="${item.link}" style="color:#10b981">View</a></td></tr>`
      ).join('');

      const html = `<div style="font-family:system-ui;background:#0a0a0f;color:#fff;padding:32px;max-width:600px">
        <h1 style="color:#10b981;margin-bottom:4px">Daily Flip Alerts</h1>
        <p style="color:#9ca3af;font-size:14px">Free items near you that could be worth money.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="color:#9ca3af;font-size:12px;text-transform:uppercase">
            <th style="text-align:left;padding:8px">Item</th><th style="padding:8px">Est. Value</th>
            <th style="padding:8px">City</th><th style="padding:8px">Link</th>
          </tr>
          ${itemsHtml}
        </table>
        <p style="color:#6b7280;font-size:12px">Estimates based on eBay sold comps. Pick up for free, sell for profit. Not guaranteed.</p>
        <p style="color:#374151;font-size:11px">Powered by Nova · <a href="https://novanexus-ai.com" style="color:#6b7280">Flip Card</a></p>
      </div>`;

      for (const sub of subscribers) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Flip Card Alerts <brief@novanexus-ai.com>',
              to: [sub.email],
              subject: `${evaluated.length} Free Flip Opportunities Today`,
              html,
            }),
          });
          logger.info('Flip alert sent', { userId: sub.user_id });
        } catch (err: any) {
          logger.warn('Flip alert email failed', { userId: sub.user_id, error: err.message });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logSchedulerRun('flip-alerts', 'success', durationMs, {
      scanned: allListings.length, valuable: valuable.length, evaluated: evaluated.length, emailed: subscribers.length,
    });

    if (evaluated.length > 0) {
      await sendDiscordAlert(
        '💰 Daily Flip Alerts Sent',
        `Found ${evaluated.length} opportunities from ${allListings.length} free listings. Emailed ${subscribers.length} subscribers.`,
        0x10b981
      );

      // Also push top opportunity into in-app alerts (works without Resend)
      const top = evaluated[0];
      try {
        await fetch(`${NOVA_HUB_URL}/v1/alerts/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: 'nova-scheduler',
            alertType: 'CUSTOM',
            message: `🔍 Flip Alert: "${top.title}" in ${top.city} — est. resale ~$${top.resale_mid}. ${top.link}`,
          }),
          signal: AbortSignal.timeout(8000),
        });
      } catch { /* non-blocking */ }
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSchedulerRun('flip-alerts', 'failure', durationMs, { error: err.message });
    logger.error('Daily Flip Alerts failed', err instanceof Error ? err : new Error(String(err)));
  }
}

// ============================================================================
// JOB: DAILY STOCK SCREENER ALERTS — top setups emailed to subscribers
// Runs after market open, 9:30 AM ET = 14:30 UTC weekdays
// ============================================================================

interface StockAlertItem {
  symbol: string;
  name: string;
  type: string;
  pattern: string;
  confidence: number;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
}

async function jobDailyStockAlerts(): Promise<void> {
  if (!(await automationAllowed())) return;
  const startTime = Date.now();
  logger.info('=== DAILY STOCK ALERTS JOB STARTED ===');

  try {
    // 1. Fetch top screener signals
    let signals: StockAlertItem[] = [];
    try {
      const res = await fetch(`${TRADEBOT_URL}/api/ai-screener/top-movers`, {
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json() as { success: boolean; data?: { signals?: StockAlertItem[] } };
      if (data.success && Array.isArray(data.data?.signals)) {
        signals = data.data!.signals
          .filter((s) => s.type === 'bullish' && s.confidence >= 60)
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .slice(0, 5);
      }
    } catch (err: any) {
      logger.warn('Stock screener fetch failed', { error: err.message });
    }

    if (signals.length === 0) {
      logger.info('No qualifying stock setups today');
      await logSchedulerRun('stock-alerts', 'success', Date.now() - startTime, { signals: 0 });
      return;
    }

    // 2. Get paid subscribers (LITE, PRO, FOUNDING)
    let subscribers: { email: string; user_id: string }[] = [];
    try {
      const result = await query<{ user_id: string }>(
        `SELECT user_id FROM entitlements WHERE plan IN ('LITE', 'PRO', 'FOUNDING') AND status = 'ACTIVE'`
      );
      for (const row of result.rows) {
        const user = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [row.user_id]);
        if (user.rows[0]?.email) subscribers.push({ email: user.rows[0].email, user_id: row.user_id });
      }
    } catch (err: any) {
      logger.warn('Could not fetch subscribers for stock alerts', { error: err.message });
    }

    // 3. Send email via Resend
    if (signals.length > 0 && subscribers.length > 0 && RESEND_API_KEY) {
      const rowsHtml = signals.map((s) => {
        const rr = s.riskReward ? s.riskReward.toFixed(1) : '—';
        const conf = s.confidence ? `${s.confidence.toFixed(0)}%` : '—';
        return `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;font-weight:bold;color:#fff">${s.symbol}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#10b981">${s.pattern}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#9ca3af">$${Number(s.entry).toFixed(2)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#34d399">$${Number(s.target).toFixed(2)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#6b7280">${rr}:1</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#a78bfa">${conf}</td>
        </tr>`;
      }).join('');

      const topSignal = signals[0];
      const html = `<div style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;padding:32px;max-width:640px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#10b981,#059669);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px">N</div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#fff">Nova Stock Alerts</div>
            <div style="font-size:12px;color:#6b7280">AI momentum signals — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          </div>
        </div>

        <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:20px">
          <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Top Setup Today</div>
          <div style="font-size:24px;font-weight:700;color:#10b981">${topSignal.symbol}</div>
          <div style="font-size:14px;color:#9ca3af;margin-top:4px">${topSignal.pattern} · ${topSignal.confidence?.toFixed(0) ?? '—'}% confidence</div>
          <div style="font-size:13px;color:#6b7280;margin-top:8px;line-height:1.5">${(topSignal.reasoning || '').slice(0, 200)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead>
            <tr style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">
              <th style="text-align:left;padding:8px">Symbol</th>
              <th style="padding:8px">Pattern</th>
              <th style="padding:8px">Entry</th>
              <th style="padding:8px">Target</th>
              <th style="padding:8px">R:R</th>
              <th style="padding:8px">Conf.</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:16px;margin-bottom:20px">
          <div style="font-size:12px;color:#f59e0b;font-weight:600;margin-bottom:4px">⚠ Not financial advice</div>
          <div style="font-size:12px;color:#6b7280;line-height:1.5">
            These are AI-generated pattern signals for informational purposes only. Past signals do not guarantee future results.
            Always use paper trading to validate before risking real capital. Use your own judgment.
          </div>
        </div>

        <a href="https://novanexus-ai.com/dashboard/screener" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          View Full Screener →
        </a>

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1f2937;font-size:11px;color:#374151">
          Powered by Nova · <a href="https://novanexus-ai.com" style="color:#6b7280">novanexus-ai.com</a>
        </div>
      </div>`;

      for (const sub of subscribers) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Nova Stock Alerts <alerts@novanexus-ai.com>',
              to: [sub.email],
              subject: `📈 ${signals.length} Stock Setup${signals.length > 1 ? 's' : ''} Today — Top: ${topSignal.symbol} (${topSignal.confidence?.toFixed(0)}% conf)`,
              html,
            }),
          });
          logger.info('Stock alert sent', { userId: sub.user_id });
        } catch (err: any) {
          logger.warn('Stock alert email failed', { userId: sub.user_id, error: err.message });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logSchedulerRun('stock-alerts', 'success', durationMs, {
      signals: signals.length, emailed: subscribers.length,
    });

    await sendDiscordAlert(
      '📈 Daily Stock Alerts Sent',
      `Found ${signals.length} qualifying setup(s). Emailed ${subscribers.length} subscribers. Top: ${signals[0]?.symbol} ${signals[0]?.pattern}`,
      0x8b5cf6
    );

    // Also push top signal into in-app alerts (works without Resend)
    const top = signals[0];
    try {
      await fetch(`${NOVA_HUB_URL}/v1/alerts/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'nova-scheduler',
          alertType: 'TRADE',
          symbol: top.symbol,
          message: `📈 Stock Setup: ${top.symbol} — ${top.pattern} · Entry $${Number(top.entry).toFixed(2)} · Target $${Number(top.target).toFixed(2)} · ${top.confidence?.toFixed(0)}% confidence`,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* non-blocking */ }

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSchedulerRun('stock-alerts', 'failure', durationMs, { error: err.message });
    logger.error('Daily Stock Alerts failed', err instanceof Error ? err : new Error(String(err)));
  }
}

// ============================================================================
// JOB: WEEKLY INTELLIGENCE DIGEST — Saturday morning summary email
// Best flips + stock setups from the week. Keeps ALL subscribers engaged.
// ============================================================================

async function jobWeeklyDigest(): Promise<void> {
  if (!(await automationAllowed())) return;
  const startTime = Date.now();
  logger.info('=== WEEKLY DIGEST JOB STARTED ===');

  try {
    // 1. Pull aggregate realized financial outcomes only. Never place one
    // user's free-text description into another user's email.
    const weekOutcomes = await query<{ domain: string; event_type: string; total_value: string; event_count: string }>(
      `SELECT domain, event_type, SUM(value) AS total_value, COUNT(*) AS event_count
       FROM outcome_events
       WHERE created_at > NOW() - INTERVAL '7 days'
          AND event_type IN ('PROFIT', 'FLIP_PROFIT')
          AND value > 0
       GROUP BY domain, event_type
       ORDER BY total_value DESC
       LIMIT 5`
    ).catch(() => ({ rows: [] }));

    // 2. Pull today's top stock signals
    let signals: StockAlertItem[] = [];
    try {
      const res = await fetch(`${TRADEBOT_URL}/api/ai-screener/top-movers`, { signal: AbortSignal.timeout(15_000) });
      const data = await res.json() as { success: boolean; data?: { signals?: StockAlertItem[] } };
      if (data.success) signals = (data.data?.signals || []).filter((s) => s.confidence >= 55).slice(0, 3);
    } catch { /* non-fatal */ }

    // 3. Get ALL subscribers (free users get digest too — retention + upgrade nudge)
    let subscribers: { email: string }[] = [];
    try {
      const result = await query<{ email: string }>('SELECT email FROM users WHERE status = $1 LIMIT 500', ['ACTIVE']);
      subscribers = result.rows;
    } catch (err: any) {
      logger.warn('Could not fetch users for weekly digest', { error: err.message });
    }

    if (subscribers.length === 0) {
      logger.info('No subscribers for weekly digest');
      await logSchedulerRun('weekly-digest', 'success', Date.now() - startTime, { emailed: 0 });
      return;
    }

    const outcomeRows = weekOutcomes.rows.map((o) => {
      const val = parseFloat(o.total_value || '0');
      const count = parseInt(o.event_count || '0', 10);
      const domain = String(o.domain || 'other').replace(/[^a-z0-9 _-]/gi, '').slice(0, 30);
      return `<li style="padding:6px 0;color:#9ca3af;font-size:14px">
        <span style="color:#10b981;font-weight:600">+$${val.toFixed(0)}</span>
        — ${count} verified ${count === 1 ? 'outcome' : 'outcomes'} in ${domain}
      </li>`;
    }).join('');

    const signalRows = signals.map((s) =>
      `<li style="padding:6px 0;color:#9ca3af;font-size:14px">
        <span style="color:#a78bfa;font-weight:600">${s.symbol}</span>
        — ${s.pattern} · entry $${Number(s.entry).toFixed(2)} · ${s.confidence?.toFixed(0)}% conf
      </li>`
    ).join('');

    const weekStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const html = `<div style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;padding:32px;max-width:600px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px">N</div>
        <div>
          <div style="font-size:18px;font-weight:700">Nova Weekly Intelligence</div>
          <div style="font-size:12px;color:#6b7280">Week ending ${weekStr}</div>
        </div>
      </div>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
        Here's what Nova found this week — flips, setups, and opportunities worth knowing about.
      </p>

      ${outcomeRows ? `<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="font-size:12px;color:#10b981;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:12px">💰 Aggregated Realized Outcomes</div>
        <ul style="list-style:none;margin:0;padding:0">${outcomeRows}</ul>
        <div style="font-size:11px;color:#374151;margin-top:12px">Aggregated counts only. No user descriptions or opportunity estimates.</div>
      </div>` : ''}

      ${signalRows ? `<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="font-size:12px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:12px">📈 Current Stock Setups</div>
        <ul style="list-style:none;margin:0;padding:0">${signalRows}</ul>
      </div>` : ''}

      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        <a href="https://novanexus-ai.com/dashboard/scanner" style="flex:1;min-width:140px;display:block;text-align:center;background:#111827;border:1px solid #1f2937;color:#10b981;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
          🔍 Scan for Flips
        </a>
        <a href="https://novanexus-ai.com/dashboard/screener" style="flex:1;min-width:140px;display:block;text-align:center;background:#111827;border:1px solid #1f2937;color:#a78bfa;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
          📈 Stock Screener
        </a>
        <a href="https://novanexus-ai.com/pricing" style="flex:1;min-width:140px;display:block;text-align:center;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
          ⚡ Upgrade Plan
        </a>
      </div>

      <div style="font-size:11px;color:#374151;border-top:1px solid #1f2937;padding-top:16px">
        Not financial or investment advice. Powered by Nova · <a href="https://novanexus-ai.com" style="color:#6b7280">novanexus-ai.com</a>
      </div>
    </div>`;

    let sent = 0;
    for (const sub of subscribers.slice(0, 500)) {
      if (!RESEND_API_KEY) break;
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Nova Weekly <weekly@novanexus-ai.com>',
            to: [sub.email],
            subject: `Nova Weekly: ${signals.length > 0 ? `${signals[0].symbol} setup + ` : ''}${weekOutcomes.rows.length > 0 ? 'verified outcomes' : 'intelligence digest'}`,
            html,
          }),
        });
        sent++;
      } catch { /* skip individual failures */ }
      // Resend rate limit: ~10 req/s, batch with small delay
      if (sent % 10 === 0) await new Promise((r) => setTimeout(r, 1000));
    }

    const durationMs = Date.now() - startTime;
    await logSchedulerRun('weekly-digest', 'success', durationMs, { emailed: sent });
    await sendDiscordAlert(
      '📬 Weekly Digest Sent',
      `Emailed ${sent} users. ${signals.length} stock setups, ${weekOutcomes.rows.length} tracked wins.`,
      0x4f46e5
    );

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logSchedulerRun('weekly-digest', 'failure', durationMs, { error: err.message });
    logger.error('Weekly Digest failed', err instanceof Error ? err : new Error(String(err)));
  }
}

// ============================================================================
// JOB: BUSINESS OS FOLLOW-UP REMINDERS
// Emails operators a list of leads that need following up today.
// The #1 reason small operators lose money is forgetting to follow up.
// ============================================================================

async function jobBusinessFollowUps(): Promise<void> {
  if (!(await automationAllowed())) return;
  const startTime = Date.now();
  logger.info('=== BUSINESS FOLLOW-UP REMINDERS STARTED ===');

  try {
    const today = new Date().toISOString().split('T')[0];

    // Find all jobs needing follow-up, grouped by user
    const due = await query<{
      user_id: string; email: string; contact_name: string;
      contact_phone: string; service: string; quoted_price: string; status: string;
    }>(
      `SELECT j.user_id, u.email, j.contact_name, j.contact_phone, j.service, j.quoted_price, j.status
       FROM business_jobs j
       JOIN users u ON u.id = j.user_id
       WHERE j.follow_up_due IS NOT NULL
         AND j.follow_up_due <= $1
         AND j.status IN ('LEAD', 'QUOTED')
         AND u.status = 'ACTIVE'
       ORDER BY j.user_id, j.follow_up_due ASC`,
      [today]
    ).catch(() => ({ rows: [] as any[] }));

    if (due.rows.length === 0) {
      logger.info('No follow-ups due today');
      await logSchedulerRun('business-followups', 'success', Date.now() - startTime, { reminders: 0 });
      return;
    }

    // Group by user
    const byUser: Record<string, { email: string; jobs: any[] }> = {};
    for (const row of due.rows) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { email: row.email, jobs: [] };
      byUser[row.user_id].jobs.push(row);
    }

    let emailed = 0;
    for (const [, data] of Object.entries(byUser)) {
      if (!RESEND_API_KEY || !data.email) continue;

      const rows = data.jobs.map(j => {
        const price = j.quoted_price ? `$${parseFloat(j.quoted_price).toFixed(0)}` : 'no quote yet';
        const phone = j.contact_phone ? ` · ${j.contact_phone}` : '';
        return `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;font-weight:bold;color:#fff">${j.contact_name}${phone}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#9ca3af">${j.service || 'service'}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#10b981">${price}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #1f2937;color:#6b7280">${j.status}</td>
        </tr>`;
      }).join('');

      const html = `<div style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;padding:28px;max-width:560px;margin:0 auto">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:32px;height:32px;background:linear-gradient(135deg,#10b981,#06b6d4);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold">N</div>
          <div style="font-size:16px;font-weight:700">${data.jobs.length} lead${data.jobs.length > 1 ? 's' : ''} to follow up today</div>
        </div>
        <p style="color:#9ca3af;font-size:14px">The #1 way to lose a job is to forget to follow up. Here's who to reach out to:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="color:#6b7280;font-size:11px;text-transform:uppercase">
            <th style="text-align:left;padding:8px">Customer</th><th style="text-align:left;padding:8px">Service</th>
            <th style="text-align:left;padding:8px">Quote</th><th style="text-align:left;padding:8px">Stage</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <a href="https://novanexus-ai.com/dashboard/business" style="display:inline-block;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Open Business OS →
        </a>
        <p style="color:#374151;font-size:11px;margin-top:20px">A quick text or call today is the difference between a job and a lost lead. Powered by Nova.</p>
      </div>`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Nova Business OS <business@novanexus-ai.com>',
            to: [data.email],
            subject: `${data.jobs.length} lead${data.jobs.length > 1 ? 's' : ''} to follow up today`,
            html,
          }),
        });
        emailed++;
      } catch (err: any) {
        logger.warn('Follow-up email failed', { error: err.message });
      }
    }

    await logSchedulerRun('business-followups', 'success', Date.now() - startTime, {
      remindersDue: due.rows.length, usersEmailed: emailed,
    });
    if (emailed > 0) {
      await sendDiscordAlert('📋 Business Follow-Up Reminders', `Sent ${emailed} operator${emailed > 1 ? 's' : ''} their follow-up list (${due.rows.length} leads total).`, 0x10b981);
    }
  } catch (err: any) {
    await logSchedulerRun('business-followups', 'failure', Date.now() - startTime, { error: err.message });
    logger.error('Business follow-ups failed', err instanceof Error ? err : new Error(String(err)));
  }
}

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

    // Daily Flip Alerts: 7:00 AM ET = 12:00 UTC (every day)
    cron.schedule('0 12 * * *', () => {
      logger.info('Cron triggered: Daily Flip Alerts');
      jobDailyFlipAlerts().catch(err => {
        logger.error('Daily Flip Alerts cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Daily Flip Alerts — 7:00 AM ET (12:00 UTC) daily');

    // Daily Stock Alerts: 9:45 AM ET = 14:45 UTC (weekdays, after market opens)
    cron.schedule('45 14 * * 1-5', () => {
      logger.info('Cron triggered: Daily Stock Alerts');
      jobDailyStockAlerts().catch(err => {
        logger.error('Daily Stock Alerts cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Daily Stock Alerts — 9:45 AM ET (14:45 UTC) weekdays');

    // Weekly Intelligence Digest: Saturday 9:00 AM ET = 14:00 UTC
    cron.schedule('0 14 * * 6', () => {
      logger.info('Cron triggered: Weekly Digest');
      jobWeeklyDigest().catch(err => {
        logger.error('Weekly Digest cron job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Weekly Digest — Saturday 9:00 AM ET (14:00 UTC)');

    // Business OS Follow-Up Reminders: 8:00 AM ET = 13:00 UTC daily
    // Emails operators which leads need following up. The #1 money-leak fix.
    cron.schedule('0 13 * * *', () => {
      logger.info('Cron triggered: Business OS follow-up reminders');
      jobBusinessFollowUps().catch(err => {
        logger.error('Follow-up reminder job failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, { timezone: 'UTC' });
    logger.info('📅 Scheduled: Business Follow-Ups — 8:00 AM ET (13:00 UTC) daily');
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

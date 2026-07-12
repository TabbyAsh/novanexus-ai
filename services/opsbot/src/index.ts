/**
 * Nova OpsBot — Operational monitoring, system health, founder command center.
 *
 * Port: 3014
 * Gateway routes /v1/ops/* here.
 *
 * Doctrine: Nova cannot be a governed system if it cannot monitor itself.
 * No fake numbers. If a service is down, say DOWN. If latency is unknown, say null.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import { createLogger } from '@nova/telemetry';
import { nowTimestamp } from '@nova/shared';

const PORT = parseInt(process.env.PORT || '3014', 10);
const logger = createLogger('opsbot');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// Service registry — every service Nova runs
// ============================================================================

interface ServiceDef {
  name: string;
  url: string;
  healthPath: string;
  critical: boolean; // if true, failure degrades the whole system
}

const SERVICES: ServiceDef[] = [
  { name: 'gateway',      url: process.env.GATEWAY_URL      || 'http://localhost:3000', healthPath: '/health',  critical: true  },
  { name: 'auth',         url: process.env.AUTH_URL          || 'http://localhost:3001', healthPath: '/health',  critical: true  },
  { name: 'orchestrator', url: process.env.ORCHESTRATOR_URL  || 'http://localhost:3002', healthPath: '/health',  critical: true  },
  { name: 'eventbus',     url: process.env.EVENTBUS_URL      || 'http://localhost:3003', healthPath: '/health',  critical: true  },
  { name: 'billing',      url: process.env.BILLING_URL       || 'http://localhost:3006', healthPath: '/health',  critical: false },
  { name: 'tradebot',     url: process.env.TRADEBOT_URL      || 'http://localhost:3010', healthPath: '/health',  critical: false },
  { name: 'storebot',     url: process.env.STOREBOT_URL      || 'http://localhost:3011', healthPath: '/health',  critical: false },
  { name: 'socialbot',    url: process.env.SOCIALBOT_URL     || 'http://localhost:3012', healthPath: '/health',  critical: false },
  { name: 'marketdata',   url: process.env.MARKETDATA_URL    || 'http://localhost:3020', healthPath: '/health',  critical: false },
  { name: 'commercedata', url: process.env.COMMERCEDATA_URL  || 'http://localhost:3022', healthPath: '/health',  critical: false },
  { name: 'nova-hub',     url: process.env.NOVA_HUB_URL      || 'http://localhost:3030', healthPath: '/health',  critical: true  },
  { name: 'scheduler',    url: process.env.SCHEDULER_URL     || 'http://localhost:3040', healthPath: '/health',  critical: false },
];

// ============================================================================
// Types
// ============================================================================

interface ServiceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number | null;
  checkedAt: string;
  critical: boolean;
  error?: string;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  services: ServiceStatus[];
  checkedAt: string;
  criticalDown: string[];
  degradedCount: number;
}

// ============================================================================
// Health probe — checks one service
// ============================================================================

async function probeService(svc: ServiceDef): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await axios.get(`${svc.url}${svc.healthPath}`, { timeout: 4000 });
    return {
      name: svc.name,
      status: 'ok',
      latencyMs: Date.now() - start,
      checkedAt: nowTimestamp(),
      critical: svc.critical,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    // Connection refused = down; timeout = degraded
    const isDown = errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND');
    return {
      name: svc.name,
      status: isDown ? 'down' : 'degraded',
      latencyMs: isDown ? null : latencyMs,
      checkedAt: nowTimestamp(),
      critical: svc.critical,
      error: errMsg.slice(0, 120),
    };
  }
}

async function checkAllServices(): Promise<SystemHealth> {
  const results = await Promise.all(SERVICES.map(probeService));

  const criticalDown = results
    .filter((s) => s.critical && s.status === 'down')
    .map((s) => s.name);

  const degradedCount = results.filter((s) => s.status !== 'ok').length;

  let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (criticalDown.length > 0) overall = 'critical';
  else if (degradedCount > 0) overall = 'degraded';

  return {
    overall,
    services: results,
    checkedAt: nowTimestamp(),
    criticalDown,
    degradedCount,
  };
}

// ============================================================================
// Governance snapshot — fetches state from orchestrator + nova-hub
// ============================================================================

async function getGovernanceSnapshot() {
  const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3002';
  const NOVA_HUB_URL = process.env.NOVA_HUB_URL || 'http://localhost:3030';

  const [killSwitch, pendingApprovals, activeGoals, activeTasks] = await Promise.allSettled([
    axios.get(`${ORCHESTRATOR_URL}/kill-switch`, { timeout: 3000 }),
    axios.get(`${ORCHESTRATOR_URL}/approvals?status=PENDING&limit=1`, { timeout: 3000 }),
    axios.get(`${ORCHESTRATOR_URL}/goals?status=EXECUTING&limit=1`, { timeout: 3000 }),
    axios.get(`${ORCHESTRATOR_URL}/tasks?status=RUNNING&limit=1`, { timeout: 3000 }),
  ]);

  const ks = killSwitch.status === 'fulfilled' ? killSwitch.value.data : null;
  const approvals = pendingApprovals.status === 'fulfilled'
    ? (pendingApprovals.value.data?.data?.total ?? pendingApprovals.value.data?.data?.length ?? null)
    : null;
  const goals = activeGoals.status === 'fulfilled'
    ? (activeGoals.value.data?.data?.total ?? activeGoals.value.data?.data?.length ?? null)
    : null;
  const tasks = activeTasks.status === 'fulfilled'
    ? (activeTasks.value.data?.data?.total ?? activeTasks.value.data?.data?.length ?? null)
    : null;

  // Platform stats from nova-hub (no auth needed)
  let platformStats: Record<string, unknown> = {};
  try {
    const ps = await axios.get(`${NOVA_HUB_URL}/v1/platform/stats`, { timeout: 3000 });
    platformStats = ps.data?.data ?? {};
  } catch {
    // non-fatal
  }

  return {
    killSwitch: {
      enabled: ks?.data?.enabled ?? null,
      reason: ks?.data?.reason ?? null,
    },
    pendingApprovals: approvals,
    activeGoals: goals,
    activeTasks: tasks,
    platformStats,
    snapshotAt: nowTimestamp(),
  };
}

// ============================================================================
// Routes
// ============================================================================

// Standard health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'opsbot', ts: nowTimestamp() });
});

app.get('/ready', (_req: Request, res: Response) => {
  res.json({ ready: true });
});

// ── GET /v1/ops/system ────────────────────────────────────────────────────────
// Pings every service and returns the full health matrix.
app.get('/v1/ops/system', async (_req: Request, res: Response) => {
  try {
    const health = await checkAllServices();
    res.json({ success: true, data: health });
  } catch (err) {
    logger.error('System health check failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'HEALTH_CHECK_FAILED', message: 'Could not complete system health check' } });
  }
});

// ── GET /v1/ops/governance ───────────────────────────────────────────────────
// Kill switch state, pending approvals, active goals/tasks.
app.get('/v1/ops/governance', async (_req: Request, res: Response) => {
  try {
    const gov = await getGovernanceSnapshot();
    res.json({ success: true, data: gov });
  } catch (err) {
    logger.error('Governance snapshot failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'GOVERNANCE_FAILED', message: 'Could not fetch governance state' } });
  }
});

// ── GET /v1/ops/metrics ──────────────────────────────────────────────────────
// Platform activity: users, runs, outcomes, flips — from nova-hub public stats.
app.get('/v1/ops/metrics', async (_req: Request, res: Response) => {
  const NOVA_HUB_URL = process.env.NOVA_HUB_URL || 'http://localhost:3030';
  try {
    const [statsRes, weeklyRes] = await Promise.allSettled([
      axios.get(`${NOVA_HUB_URL}/v1/platform/stats`, { timeout: 4000 }),
      axios.get(`${NOVA_HUB_URL}/v1/intelligence/weekly`, { timeout: 4000 }),
    ]);

    const stats = statsRes.status === 'fulfilled' ? statsRes.value.data?.data : null;
    const weekly = weeklyRes.status === 'fulfilled' ? weeklyRes.value.data?.data : null;

    res.json({
      success: true,
      data: {
        platform: stats ?? { note: 'unavailable' },
        weeklyIntelligence: weekly ?? { note: 'unavailable' },
        generatedAt: nowTimestamp(),
      },
    });
  } catch (err) {
    logger.error('Metrics fetch failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'METRICS_FAILED', message: 'Could not fetch metrics' } });
  }
});

// ── GET /v1/ops/errors ───────────────────────────────────────────────────────
// Recent error events from eventbus.
app.get('/v1/ops/errors', async (req: Request, res: Response) => {
  const EVENTBUS_URL = process.env.EVENTBUS_URL || 'http://localhost:3003';
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
  try {
    const evRes = await axios.get(`${EVENTBUS_URL}/events`, {
      params: { type: 'error', limit },
      timeout: 4000,
    });
    res.json({ success: true, data: evRes.data?.data ?? { events: [], note: 'unavailable' } });
  } catch {
    // eventbus might not have an error filter — return graceful fallback
    res.json({
      success: true,
      data: {
        events: [],
        note: 'Error log unavailable — eventbus may not expose filtered error events yet.',
        checkedAt: nowTimestamp(),
      },
    });
  }
});

// ── GET /v1/ops/founder ──────────────────────────────────────────────────────
// One-call founder command center: system + governance + metrics in parallel.
app.get('/v1/ops/founder', async (_req: Request, res: Response) => {
  try {
    const [health, governance, metricsRes] = await Promise.allSettled([
      checkAllServices(),
      getGovernanceSnapshot(),
      (async () => {
        const NOVA_HUB_URL = process.env.NOVA_HUB_URL || 'http://localhost:3030';
        const r = await axios.get(`${NOVA_HUB_URL}/v1/platform/stats`, { timeout: 4000 });
        return r.data?.data ?? null;
      })(),
    ]);

    res.json({
      success: true,
      data: {
        system:     health.status      === 'fulfilled' ? health.value      : { overall: 'unknown', note: 'unavailable' },
        governance: governance.status  === 'fulfilled' ? governance.value  : { note: 'unavailable' },
        metrics:    metricsRes.status  === 'fulfilled' ? metricsRes.value  : { note: 'unavailable' },
        generatedAt: nowTimestamp(),
      },
    });
  } catch (err) {
    logger.error('Founder snapshot failed', err as Error);
    res.status(500).json({ success: false, error: { code: 'FOUNDER_FAILED', message: 'Could not build founder snapshot' } });
  }
});

// ============================================================================
// Start
// ============================================================================

app.listen(PORT, () => {
  logger.info(`OpsBot running on port ${PORT}`);
  if (typeof process.send === 'function') process.send('ready');
});

export default app;

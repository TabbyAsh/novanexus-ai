/**
 * Nova Admin API client.
 * Hits the gateway (or OpsBot directly) for all admin data.
 * No fake numbers — if unavailable, the caller receives null.
 */

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
const OPSBOT  = process.env.NEXT_PUBLIC_OPSBOT_URL  || 'http://localhost:3014';

async function get<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? json ?? null;
  } catch {
    return null;
  }
}

// ── OpsBot ───────────────────────────────────────────────────────────────────

export const getFounderSnapshot = () =>
  get<FounderSnapshot>(`${OPSBOT}/v1/ops/founder`);

export const getSystemHealth = () =>
  get<SystemHealth>(`${OPSBOT}/v1/ops/system`);

export const getGovernance = () =>
  get<GovernanceSnapshot>(`${OPSBOT}/v1/ops/governance`);

export const getOpsMetrics = () =>
  get<OpsMetrics>(`${OPSBOT}/v1/ops/metrics`);

// ── Nova Hub (via gateway) ───────────────────────────────────────────────────

export const getPlatformStats = () =>
  get<PlatformStats>(`${GATEWAY}/v1/platform/stats`);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServiceStatus {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number | null;
  checkedAt: string;
  critical: boolean;
  error?: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  services: ServiceStatus[];
  checkedAt: string;
  criticalDown: string[];
  degradedCount: number;
}

export interface GovernanceSnapshot {
  killSwitch: { enabled: boolean | null; reason: string | null };
  pendingApprovals: number | null;
  activeGoals: number | null;
  activeTasks: number | null;
  platformStats: Record<string, unknown>;
  snapshotAt: string;
}

export interface OpsMetrics {
  platform: Record<string, unknown> | { note: string };
  weeklyIntelligence: Record<string, unknown> | { note: string };
  generatedAt: string;
}

export interface FounderSnapshot {
  system: SystemHealth | { overall: string; note: string };
  governance: GovernanceSnapshot | { note: string };
  metrics: Record<string, unknown> | { note: string };
  generatedAt: string;
}

export interface PlatformStats {
  users?: number;
  agentRuns?: number;
  totalOutcomeValue?: number;
  flipPlans?: number;
  [key: string]: unknown;
}

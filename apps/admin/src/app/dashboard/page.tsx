'use client';

/**
 * Founder Command Center
 * Real data only. If a number is unavailable, it says so.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, XCircle,
  Zap, Users, DollarSign, BarChart3, RefreshCw,
  ShieldAlert, ShieldCheck, Clock, TrendingUp,
} from 'lucide-react';
import {
  getFounderSnapshot, getSystemHealth,
  type FounderSnapshot, type SystemHealth, type ServiceStatus,
} from '@/lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'ok' | 'degraded' | 'down' | string }) {
  const cls =
    status === 'ok'       ? 'bg-emerald-400' :
    status === 'degraded' ? 'bg-amber-400'   : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

function OverallBadge({ overall }: { overall: string }) {
  const cfg =
    overall === 'healthy'  ? { label: 'All Systems Go',    cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' } :
    overall === 'degraded' ? { label: 'Degraded',          cls: 'bg-amber-500/20  text-amber-300  border-amber-500/30'  } :
    overall === 'critical' ? { label: 'Critical Failure',  cls: 'bg-red-500/20    text-red-300    border-red-500/30'    } :
                             { label: 'Unknown',           cls: 'bg-gray-500/20   text-gray-400   border-gray-700'      };
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<FounderSnapshot | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [snap, sys] = await Promise.all([getFounderSnapshot(), getSystemHealth()]);
    setSnapshot(snap);
    setHealth(sys);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 30s
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const gov = snapshot && 'killSwitch' in snapshot.governance ? snapshot.governance : null;
  const metrics = snapshot?.metrics && !('note' in snapshot.metrics) ? snapshot.metrics as Record<string, unknown> : null;
  const sysData = health ?? (snapshot?.system && 'services' in snapshot.system ? snapshot.system as SystemHealth : null);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-6 h-6 text-violet-400" />
            Founder Command Center
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sysData && <OverallBadge overall={sysData.overall} />}
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Kill Switch Banner */}
      {gov?.killSwitch?.enabled === true && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <span className="font-semibold text-red-300">KILL SWITCH ACTIVE</span>
            {gov.killSwitch.reason && (
              <span className="text-red-400 text-sm ml-2">— {gov.killSwitch.reason}</span>
            )}
          </div>
        </div>
      )}

      {/* Governance row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GovernanceTile
          icon={gov?.killSwitch?.enabled ? ShieldAlert : ShieldCheck}
          iconCls={gov?.killSwitch?.enabled ? 'text-red-400' : 'text-emerald-400'}
          label="Kill Switch"
          value={gov?.killSwitch?.enabled === true ? 'ACTIVE' : gov?.killSwitch?.enabled === false ? 'Safe' : 'unavailable'}
          valueCls={gov?.killSwitch?.enabled ? 'text-red-400' : 'text-emerald-400'}
        />
        <GovernanceTile
          icon={AlertTriangle}
          iconCls="text-amber-400"
          label="Pending Approvals"
          value={gov?.pendingApprovals != null ? String(gov.pendingApprovals) : 'unavailable'}
          valueCls={gov?.pendingApprovals ? 'text-amber-400' : 'text-white'}
        />
        <GovernanceTile
          icon={Zap}
          iconCls="text-cyan-400"
          label="Active Goals"
          value={gov?.activeGoals != null ? String(gov.activeGoals) : 'unavailable'}
          valueCls="text-white"
        />
        <GovernanceTile
          icon={Clock}
          iconCls="text-purple-400"
          label="Running Tasks"
          value={gov?.activeTasks != null ? String(gov.activeTasks) : 'unavailable'}
          valueCls="text-white"
        />
      </div>

      {/* Platform stats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Platform Activity</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile icon={Users}     iconCls="text-blue-400"    label="Total Users"      value={fmtNum(metrics?.users as number)}           />
          <StatTile icon={BarChart3} iconCls="text-violet-400"  label="Agent Runs"       value={fmtNum(metrics?.agentRuns as number)}       />
          <StatTile icon={DollarSign}iconCls="text-emerald-400" label="Outcome Value"     value={fmtUSD(metrics?.totalOutcomeValue as number)} />
          <StatTile icon={TrendingUp}iconCls="text-amber-400"   label="Flip Plans"        value={fmtNum(metrics?.flipPlans as number)}        />
        </div>
      </div>

      {/* Service health grid */}
      {sysData && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Service Health
            <span className={`ml-3 text-xs ${sysData.degradedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {sysData.services.filter(s => s.status === 'ok').length}/{sysData.services.length} healthy
            </span>
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sysData.services.map((svc: ServiceStatus) => (
              <ServiceTile key={svc.name} svc={svc} />
            ))}
          </div>
        </div>
      )}

      {loading && !snapshot && (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function GovernanceTile({
  icon: Icon, iconCls, label, value, valueCls,
}: {
  icon: React.ElementType; iconCls: string; label: string; value: string; valueCls: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className={`flex items-center gap-2 text-xs text-gray-500 mb-2`}>
        <Icon className={`w-3.5 h-3.5 ${iconCls}`} />{label}
      </div>
      <div className={`text-xl font-bold ${valueCls}`}>{value}</div>
    </div>
  );
}

function StatTile({
  icon: Icon, iconCls, label, value,
}: {
  icon: React.ElementType; iconCls: string; label: string; value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <Icon className={`w-3.5 h-3.5 ${iconCls}`} />{label}
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function ServiceTile({ svc }: { svc: ServiceStatus }) {
  const borderCls =
    svc.status === 'ok'       ? 'border-gray-800'          :
    svc.status === 'degraded' ? 'border-amber-500/30'      : 'border-red-500/30';
  const bgCls =
    svc.status === 'ok'       ? 'bg-gray-900/40'           :
    svc.status === 'degraded' ? 'bg-amber-500/5'           : 'bg-red-500/5';

  return (
    <div className={`rounded-xl border ${borderCls} ${bgCls} p-3 flex items-center justify-between gap-2`}>
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={svc.status} />
        <span className="text-sm font-medium text-white truncate">{svc.name}</span>
        {svc.critical && <span className="text-xs text-gray-600">core</span>}
      </div>
      <div className="text-right shrink-0">
        {svc.status === 'ok' ? (
          <span className="text-xs text-gray-500">{svc.latencyMs}ms</span>
        ) : svc.status === 'degraded' ? (
          <span className="text-xs text-amber-400">slow</span>
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-400" />
        )}
      </div>
    </div>
  );
}

// ── formatters ────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'unavailable';
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'unavailable';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

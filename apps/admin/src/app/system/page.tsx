'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Wifi } from 'lucide-react';
import { getSystemHealth, type SystemHealth, type ServiceStatus } from '@/lib/api';

const STATUS_CONFIG = {
  ok:       { label: 'Online',   cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  degraded: { label: 'Slow',     cls: 'text-amber-400',   bg: 'bg-amber-500/10   border-amber-500/20'   },
  down:     { label: 'Down',     cls: 'text-red-400',     bg: 'bg-red-500/10     border-red-500/20'     },
};

export default function SystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getSystemHealth();
    setHealth(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const overall = health?.overall ?? 'unknown';

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Wifi className="w-6 h-6 text-cyan-400" /> System Health
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()} — auto-updates every 20s` : 'Loading…'}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Overall status banner */}
      {health && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          overall === 'healthy'  ? 'border-emerald-500/30 bg-emerald-500/10' :
          overall === 'degraded' ? 'border-amber-500/30  bg-amber-500/10'   :
          overall === 'critical' ? 'border-red-500/30    bg-red-500/10'     :
                                   'border-gray-700      bg-gray-900'
        }`}>
          {overall === 'healthy'  && <CheckCircle   className="w-5 h-5 text-emerald-400 shrink-0" />}
          {overall === 'degraded' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0"   />}
          {overall === 'critical' && <XCircle       className="w-5 h-5 text-red-400 shrink-0"     />}
          <div>
            <span className={`font-semibold ${
              overall === 'healthy'  ? 'text-emerald-300' :
              overall === 'degraded' ? 'text-amber-300'   :
              overall === 'critical' ? 'text-red-300'     : 'text-gray-400'
            }`}>
              {overall === 'healthy'  ? 'All systems operational' :
               overall === 'degraded' ? `${health.degradedCount} service(s) degraded` :
               overall === 'critical' ? `Critical failure: ${health.criticalDown.join(', ')}` : 'Unknown'}
            </span>
            <span className="text-gray-500 text-sm ml-2">
              {health.services.filter(s => s.status === 'ok').length}/{health.services.length} services healthy
            </span>
          </div>
        </div>
      )}

      {/* Service list */}
      {health?.services && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-widest grid grid-cols-4">
            <span>Service</span>
            <span>Status</span>
            <span>Latency</span>
            <span>Type</span>
          </div>
          {health.services.map((svc: ServiceStatus) => {
            const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.down;
            return (
              <div key={svc.name} className="px-5 py-4 border-b border-gray-800/60 last:border-0 grid grid-cols-4 items-center hover:bg-white/[0.02] transition">
                <span className="text-sm font-medium text-white">{svc.name}</span>
                <span className={`text-sm font-semibold ${cfg.cls}`}>{cfg.label}</span>
                <span className="text-sm text-gray-400">
                  {svc.latencyMs != null ? `${svc.latencyMs}ms` : '—'}
                </span>
                <span className={`text-xs ${svc.critical ? 'text-violet-400' : 'text-gray-600'}`}>
                  {svc.critical ? 'Critical' : 'Optional'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {loading && !health && (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
        </div>
      )}
    </div>
  );
}

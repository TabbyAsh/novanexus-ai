'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  TrendingUp, Clock, Bot, DollarSign, BarChart3, RefreshCw,
  Layers, Zap, Target,
} from 'lucide-react';

interface OutcomesSummary {
  allTime: { totalValue: number; totalEvents: number; profit: number; loss: number; timeSavedMinutes: number };
  thisWeek: { totalValue: number; totalEvents: number; timeSavedMinutes: number };
  agentActivity: { runsThisWeek: number; completedThisWeek: number };
  sectorBreakdown: Record<string, { value: number; events: number }>;
  generatedAt: string;
}

interface UsageData {
  period: { start: string; end: string };
  meters: Array<{ type: string; consumed: number; included: number; remaining: number }>;
  totalEvents: number;
}

const SECTOR_LABELS: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  stocks: { label: 'Wall Street', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10', icon: TrendingUp },
  marketplace: { label: 'Marketplace', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', icon: DollarSign },
  portfolio: { label: 'Portfolio', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10', icon: BarChart3 },
  compliance: { label: 'Compliance', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', icon: Target },
};

export default function OutcomesPage() {
  const [summary, setSummary] = useState<OutcomesSummary | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [outRes, usageRes] = await Promise.all([
        api.getOutcomesSummary(),
        api.getBillingUsage(),
      ]);
      if (outRes.success && outRes.data) setSummary(outRes.data);
      if (usageRes.success && usageRes.data) setUsage(usageRes.data);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-green-400" /> Outcome Ledger
          </h1>
          <p className="text-gray-400 mt-1">
            Measurable ROI from every agent run. &quot;A user should see X% improvement within 2 weeks.&quot;
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
          <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !summary ? (
        <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" /></div>
      ) : summary ? (
        <>
          {/* Hero Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <DollarSign className="w-4 h-4" /> All-Time Value
              </div>
              <div className="text-3xl font-bold text-green-400">{fmt(summary.allTime.totalValue)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtNum(summary.allTime.totalEvents)} events</div>
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <Zap className="w-4 h-4" /> This Week
              </div>
              <div className="text-3xl font-bold text-cyan-400">{fmt(summary.thisWeek.totalValue)}</div>
              <div className="text-xs text-gray-500 mt-1">{fmtNum(summary.thisWeek.totalEvents)} events</div>
            </div>

            <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <Clock className="w-4 h-4" /> Time Saved
              </div>
              <div className="text-3xl font-bold text-purple-400">
                {summary.allTime.timeSavedMinutes >= 60
                  ? `${(summary.allTime.timeSavedMinutes / 60).toFixed(1)}h`
                  : `${summary.allTime.timeSavedMinutes}m`
                }
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.thisWeek.timeSavedMinutes}m this week
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <Bot className="w-4 h-4" /> Agent Runs
              </div>
              <div className="text-3xl font-bold text-amber-400">{summary.agentActivity.runsThisWeek}</div>
              <div className="text-xs text-gray-500 mt-1">
                {summary.agentActivity.completedThisWeek} completed this week
              </div>
            </div>
          </div>

          {/* Profit/Loss Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" /> Profit & Loss
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Opportunities Found / Profit</span>
                  <span className="text-green-400 font-semibold">{fmt(summary.allTime.profit)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Losses</span>
                  <span className="text-red-400 font-semibold">-{fmt(summary.allTime.loss)}</span>
                </div>
                <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
                  <span className="text-white font-medium">Net Value</span>
                  <span className={`font-bold text-lg ${summary.allTime.totalValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(summary.allTime.totalValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Usage Metering */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" /> Usage This Period
              </h3>
              {usage ? (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 mb-2">
                    {usage.period.start} → {usage.period.end}
                  </div>
                  {usage.meters.length > 0 ? usage.meters.map((m, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-400">{m.type}</span>
                        <span className="text-sm text-white">{fmtNum(m.consumed)}{m.included > 0 ? ` / ${fmtNum(m.included)}` : ''}</span>
                      </div>
                      {m.included > 0 && (
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${m.consumed / m.included > 0.9 ? 'bg-red-500' : m.consumed / m.included > 0.7 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                            style={{ width: `${Math.min(100, (m.consumed / m.included) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )) : (
                    <div className="text-gray-500 text-sm">
                      {usage.totalEvents} total events recorded. Usage meters start after first agent run.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">Loading usage data...</div>
              )}
            </div>
          </div>

          {/* Sector Breakdown */}
          {Object.keys(summary.sectorBreakdown).length > 0 && (
            <>
              <h2 className="text-xl font-semibold text-white mb-4">Sector Breakdown (30d)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {Object.entries(summary.sectorBreakdown).map(([sector, data]) => {
                  const info = SECTOR_LABELS[sector] || { label: sector, color: 'text-gray-400 border-gray-700 bg-gray-800', icon: BarChart3 };
                  const Icon = info.icon;
                  return (
                    <div key={sector} className={`rounded-xl border p-4 ${info.color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{info.label}</span>
                      </div>
                      <div className="text-2xl font-bold text-white">{fmt(data.value)}</div>
                      <div className="text-xs opacity-75 mt-1">{data.events} events</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Manifesto Quote */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-center">
            <p className="text-gray-400 italic text-sm">
              &quot;A tycoon is a machine that prints surplus: cashflow → reinvest → scale → defensibility.&quot;
            </p>
            <p className="text-gray-600 text-xs mt-2">Last updated: {new Date(summary.generatedAt).toLocaleString()}</p>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No outcome data yet. Run your first agent to start tracking ROI.</p>
        </div>
      )}
    </div>
  );
}

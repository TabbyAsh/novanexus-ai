'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Flame,
  BarChart3,
  AlertTriangle,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
} from 'lucide-react';

interface WeeklyReport {
  period: { start: string; end: string };
  journal: {
    trades: number; wins: number; losses: number; winRate: number;
    totalPnl: number; avgPnlPercent: number; bestTradePct: number; worstTradePct: number;
  };
  comparison: { priorTrades: number; priorWinRate: number; winRateDelta: number; pnlDelta: number };
  decisionCards: { total: number; accuracy: number | null; avgConfidence: number };
  streak: { current: number; longest: number; totalDays: number };
  topMistakes: Array<{ strategy: string; count: number; totalLoss: number }>;
  topWins: Array<{ strategy: string; count: number; totalGain: number }>;
  generatedAt: string;
}

function StatCard({ label, value, sub, icon: Icon, color = 'cyan' }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: 'cyan' | 'green' | 'red' | 'amber' | 'purple';
}) {
  const colors = {
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <Icon className="w-5 h-5 opacity-60" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-80">{sub}</div>}
    </div>
  );
}

function DeltaBadge({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-gray-500 text-sm flex items-center gap-1"><Minus className="w-3 h-3" /> No change</span>;
  const positive = value > 0;
  return (
    <span className={`text-sm flex items-center gap-1 ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}{value}{suffix}
    </span>
  );
}

export default function WeeklyReportPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWeeklyReport();
      if (res.success && res.data) {
        setReport(res.data as WeeklyReport);
      } else {
        setError(res.error?.message || 'Failed to load report');
      }
    } catch {
      setError('Failed to load weekly report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-400">{error || 'No report data available'}</p>
          <button onClick={load} className="mt-3 text-sm text-gray-400 hover:text-white">Retry</button>
        </div>
      </div>
    );
  }

  const { journal: j, comparison: c, decisionCards: dc, streak: s } = report;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Weekly Improvement Report</h1>
          <p className="text-gray-400 mt-1">
            {new Date(report.period.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' — '}
            {new Date(report.period.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Trades This Week" value={j.trades} sub={`${j.wins}W / ${j.losses}L`} icon={BarChart3} color="cyan" />
        <StatCard label="Win Rate" value={`${j.winRate}%`} sub={c.winRateDelta !== 0 ? `${c.winRateDelta > 0 ? '+' : ''}${c.winRateDelta}% vs last week` : 'Same as last week'} icon={Target} color={j.winRate >= 50 ? 'green' : 'red'} />
        <StatCard label="Total P/L" value={fmt(j.totalPnl)} sub={`Avg ${pct(j.avgPnlPercent)} per trade`} icon={j.totalPnl >= 0 ? TrendingUp : TrendingDown} color={j.totalPnl >= 0 ? 'green' : 'red'} />
        <StatCard label="Journal Streak" value={`${s.current} days`} sub={`Best: ${s.longest} days`} icon={Flame} color="amber" />
      </div>

      {/* Week-over-Week Comparison */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Week-over-Week</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Win Rate</span>
              <div className="text-right">
                <span className="text-white font-medium">{j.winRate}%</span>
                <span className="text-gray-500 mx-2">vs</span>
                <span className="text-gray-400">{c.priorWinRate}%</span>
                <span className="ml-2"><DeltaBadge value={c.winRateDelta} suffix="%" /></span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Trade Count</span>
              <div className="text-right">
                <span className="text-white font-medium">{j.trades}</span>
                <span className="text-gray-500 mx-2">vs</span>
                <span className="text-gray-400">{c.priorTrades}</span>
                <span className="ml-2"><DeltaBadge value={j.trades - c.priorTrades} /></span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">P/L Delta</span>
              <DeltaBadge value={Math.round(c.pnlDelta * 100) / 100} suffix="" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Best Trade</span>
              <span className={j.bestTradePct >= 0 ? 'text-green-400' : 'text-red-400'}>{pct(j.bestTradePct)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Worst Trade</span>
              <span className={j.worstTradePct >= 0 ? 'text-green-400' : 'text-red-400'}>{pct(j.worstTradePct)}</span>
            </div>
          </div>
        </div>

        {/* Decision Cards */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Decision Card Intelligence</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Cards Generated</span>
              <span className="text-white font-medium">{dc.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Card Accuracy</span>
              <span className={`font-medium ${dc.accuracy !== null && dc.accuracy >= 50 ? 'text-green-400' : 'text-gray-500'}`}>
                {dc.accuracy !== null ? `${dc.accuracy}%` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Avg Confidence</span>
              <span className="text-white">{dc.avgConfidence > 0 ? `${(dc.avgConfidence * 100).toFixed(0)}%` : 'N/A'}</span>
            </div>
            {dc.accuracy !== null && dc.avgConfidence > 0 && (
              <div className="mt-2 p-3 bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-400">
                  <strong className="text-gray-300">Calibration:</strong>{' '}
                  {Math.abs(dc.accuracy - dc.avgConfidence * 100) < 10
                    ? 'Well-calibrated — your confidence matches outcomes.'
                    : dc.accuracy > dc.avgConfidence * 100
                    ? 'Under-confident — you perform better than you predict.'
                    : 'Over-confident — consider reviewing your signal criteria.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Wins & Mistakes */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-green-400" /> Top Winning Strategies
          </h2>
          {report.topWins.length === 0 ? (
            <p className="text-gray-500 text-sm">No winning strategies this week.</p>
          ) : (
            <div className="space-y-3">
              {report.topWins.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/10 rounded-lg">
                  <div>
                    <span className="text-white font-medium">{w.strategy}</span>
                    <span className="text-gray-500 text-sm ml-2">{w.count} trade{w.count > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-green-400 font-medium">{fmt(w.totalGain)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" /> Top Mistakes to Fix
          </h2>
          {report.topMistakes.length === 0 ? (
            <p className="text-gray-500 text-sm">No losing strategies this week — keep it up.</p>
          ) : (
            <div className="space-y-3">
              {report.topMistakes.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                  <div>
                    <span className="text-white font-medium">{m.strategy}</span>
                    <span className="text-gray-500 text-sm ml-2">{m.count} trade{m.count > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-red-400 font-medium">{fmt(m.totalLoss)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-600 text-xs">
        Report generated {new Date(report.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

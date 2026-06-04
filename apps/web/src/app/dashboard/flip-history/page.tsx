'use client';

/**
 * Saved Flip Analysis History — Lite+ feature.
 * Every Flip Card you've run is stored here. Click any to view the full card.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';
import { Clock, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronRight } from 'lucide-react';

interface AnalysisSummary {
  id: string;
  title: string;
  buyPrice: number;
  condition: string;
  verdict: 'BUY' | 'NEGOTIATE LOWER' | 'PASS';
  netProfitMid: number;
  roiPercent: number;
  confidenceScore: number;
  createdAt: string;
}

const VERDICT_CONFIG = {
  'BUY':             { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: TrendingUp },
  'NEGOTIATE LOWER': { cls: 'text-cyan-400    bg-cyan-500/10    border-cyan-500/30',    icon: Minus      },
  'PASS':            { cls: 'text-red-400     bg-red-500/10     border-red-500/30',      icon: TrendingDown },
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function FlipHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/flip/history?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : ''}`,
          },
        }
      );
      const d = await res.json();
      if (d.success && d.data) {
        setAnalyses(d.data.analyses);
        setTotal(d.data.total);
      }
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const buys      = analyses.filter((a) => a.verdict === 'BUY').length;
  const passes    = analyses.filter((a) => a.verdict === 'PASS').length;
  const totalProfit = analyses.reduce((s, a) => s + (a.verdict !== 'PASS' ? a.netProfitMid : 0), 0);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Clock className="w-6 h-6 text-emerald-400" /> Flip Analysis History
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Every item you&apos;ve analyzed, saved automatically. {total > 0 && `${total} total.`}
            </p>
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats row */}
        {analyses.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="text-xs text-gray-500 mb-1">BUY verdicts</div>
              <div className="text-2xl font-bold text-emerald-400">{buys}</div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <div className="text-xs text-gray-500 mb-1">PASS verdicts</div>
              <div className="text-2xl font-bold text-red-400">{passes}</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="text-xs text-gray-500 mb-1">Potential profit (BUY/NEGOTIATE)</div>
              <div className={`text-2xl font-bold ${totalProfit > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {fmtCurrency(totalProfit)}
              </div>
            </div>
          </div>
        )}

        {/* Analysis list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
          </div>
        ) : analyses.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold text-white mb-2">No analyses yet</h3>
            <p className="text-gray-500 text-sm mb-6">
              Every Flip Card you run is saved here automatically. Start with any item.
            </p>
            <Link href="/dashboard/flip-card"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">
              Run Your First Analysis →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
            {analyses.map((a) => {
              const cfg = VERDICT_CONFIG[a.verdict] ?? VERDICT_CONFIG.PASS;
              const Icon = cfg.icon;
              return (
                <Link
                  key={a.id}
                  href={`/flip?id=${a.id}`}
                  className="flex items-center gap-4 px-5 py-4 border-b border-gray-800/60 last:border-0 hover:bg-white/[0.02] transition group"
                >
                  {/* Verdict badge */}
                  <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${cfg.cls}`}>
                    <Icon className="w-3 h-3" />
                    {a.verdict}
                  </div>

                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{a.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {a.condition} · Buy price: {fmtCurrency(a.buyPrice)} · {timeAgo(a.createdAt)}
                    </div>
                  </div>

                  {/* Profit */}
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${a.netProfitMid > 0 ? 'text-emerald-400' : a.netProfitMid < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {a.netProfitMid >= 0 ? '+' : ''}{fmtCurrency(a.netProfitMid)}
                    </div>
                    <div className="text-xs text-gray-600">{a.roiPercent.toFixed(0)}% ROI · {a.confidenceScore.toFixed(0)}% conf</div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

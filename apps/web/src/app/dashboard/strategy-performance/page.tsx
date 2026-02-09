'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';

type StrategyPerformance = {
  id: string;
  strategyTag: string;
  strategyType?: string | null;
  symbol: string;
  status: string;
  fitnessScore?: number | null;
  metrics?: any;
  drift?: any;
  evaluatedAt?: string;
  updatedAt?: string;
};

export default function StrategyPerformancePage() {
  const [strategies, setStrategies] = useState<StrategyPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StrategyPerformance | null>(null);
  const [filters, setFilters] = useState({ symbol: '', strategyTag: '', status: '' });

  const loadStrategies = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filters.symbol) params.symbol = filters.symbol.toUpperCase();
      if (filters.strategyTag) params.strategyTag = filters.strategyTag;
      if (filters.status) params.status = filters.status;

      const result = await api.getStrategyPerformance(params);
      if (result.success && result.data) {
        setStrategies(result.data.strategies as StrategyPerformance[]);
        setSelected(null);
      } else {
        setError(result.error?.message || 'Failed to load strategy performance');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load strategy performance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStrategies();
  }, []);

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Strategy Performance</h1>
            <p className="text-gray-400">Fitness, drift, and slippage sensitivity for strategy tags.</p>
          </div>
          <button
            onClick={loadStrategies}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={filters.symbol}
              onChange={(e) => setFilters((prev) => ({ ...prev, symbol: e.target.value }))}
              placeholder="Symbol"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.strategyTag}
              onChange={(e) => setFilters((prev) => ({ ...prev, strategyTag: e.target.value }))}
              placeholder="Strategy Tag"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              placeholder="Status"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={loadStrategies}
              className="px-3 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {loading ? (
              <div className="text-gray-400">Loading strategies…</div>
            ) : strategies.length === 0 ? (
              <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 text-gray-400">
                No strategy performance records found.
              </div>
            ) : (
              strategies.map((strategy) => {
                const metrics = strategy.metrics || {};
                const backtest = metrics.backtest || {};
                return (
                  <button
                    key={strategy.id}
                    onClick={() => setSelected(strategy)}
                    className={`w-full text-left p-5 rounded-2xl border transition ${
                      selected?.id === strategy.id
                        ? 'border-cyan-500/60 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-900/70 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-semibold text-white">{strategy.symbol}</span>
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            {strategy.strategyTag}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full border ${strategy.status === 'QUARANTINED' ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'}`}>
                            {strategy.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Updated {formatDate(strategy.updatedAt || strategy.evaluatedAt)}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-300">
                        <div>Fitness: {strategy.fitnessScore ?? '—'}</div>
                        <div>Win: {backtest.winRate ?? '—'}%</div>
                        <div>Return: {backtest.totalReturnPct ?? '—'}%</div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-4">
            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800">
              <h2 className="text-lg font-semibold text-white">Strategy Detail</h2>
              {selected ? (
                <div className="mt-4 space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="text-white">{selected.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fitness</span>
                    <span>{selected.fitnessScore ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Win Rate</span>
                    <span>{selected.metrics?.backtest?.winRate ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Drawdown</span>
                    <span>{selected.metrics?.backtest?.maxDrawdownPct ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sharpe</span>
                    <span>{selected.metrics?.backtest?.sharpeRatio ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit Factor</span>
                    <span>{selected.metrics?.backtest?.profitFactor ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monte Carlo EV</span>
                    <span>{selected.metrics?.monteCarlo?.expectedValue ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit Probability</span>
                    <span>{selected.metrics?.monteCarlo?.probabilityProfit ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Drift</span>
                    <span>{selected.drift?.status ?? '—'}</span>
                  </div>
                  {selected.drift?.reasons?.length ? (
                    <div className="text-xs text-gray-400">Reasons: {selected.drift.reasons.join(', ')}</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-3">Select a strategy to view details.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

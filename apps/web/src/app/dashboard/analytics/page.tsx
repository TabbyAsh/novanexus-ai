'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  BarChart3,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

type TradingData = {
  portfolioValue: number;
  dayChange: number;
  periodChange?: number;
  periodChangePct?: number;
  periodHigh?: number;
  periodLow?: number;
  period?: string;
  fetchedAt: string;
};

export default function AnalyticsDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradingData, setTradingData] = useState<TradingData | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [alpacaData, historyData] = await Promise.all([
        api.getAlpacaAccount(),
        api.getAlpacaHistory({ timeframe: '1D' }),
      ]);

      if (alpacaData.success && alpacaData.data?.account) {
        const account = alpacaData.data.account;

        const portfolioValue = Number(account.portfolio_value);
        const equity = Number(account.equity);
        const lastEquity = Number(account.last_equity);

        if (![portfolioValue, equity, lastEquity].every(Number.isFinite)) {
          throw new Error('Trading data unavailable (invalid numeric values)');
        }

        let periodChange: number | undefined;
        let periodChangePct: number | undefined;
        let periodHigh: number | undefined;
        let periodLow: number | undefined;
        let period: string | undefined;

        if (historyData.success && historyData.data?.history?.length) {
          const points = historyData.data.history;
          const equities = points.map((p) => Number(p.equity)).filter(Number.isFinite);
          if (equities.length >= 2) {
            const first = equities[0];
            const last = equities[equities.length - 1];
            periodChange = last - first;
            periodChangePct = first !== 0 ? (periodChange / first) * 100 : undefined;
            periodHigh = Math.max(...equities);
            periodLow = Math.min(...equities);
            period = historyData.data.period;
          }
        }

        setTradingData({
          portfolioValue,
          dayChange: equity - lastEquity,
          periodChange,
          periodChangePct,
          periodHigh,
          periodLow,
          period,
          fetchedAt: new Date().toISOString(),
        });
      } else {
        setTradingData(null);
        setError(alpacaData.error?.message || 'Trading analytics unavailable');
      }
    } catch (e) {
      console.error('Failed to load analytics:', e);
      setTradingData(null);
      setError((e as Error).message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Business Intelligence</h1>
          <p className="text-gray-400 mt-1">
            Verified data only. Unintegrated divisions are shown as unavailable.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-400" />
            Trading (Alpaca)
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Source: Alpaca • Fetched:{' '}
            {tradingData ? new Date(tradingData.fetchedAt).toLocaleString() : '—'}
          </p>

          {tradingData ? (
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-sm">Portfolio Value</p>
                <p className="text-2xl font-bold text-white">
                  {formatCurrency(tradingData.portfolioValue)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {tradingData.dayChange >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <p
                  className={
                    tradingData.dayChange >= 0
                      ? 'text-sm font-semibold text-green-400'
                      : 'text-sm font-semibold text-red-400'
                  }
                >
                  Day Change: {formatCurrency(tradingData.dayChange)}
                </p>
              </div>
              {typeof tradingData.periodChange === 'number' && (
                <div className="text-sm text-gray-300">
                  {tradingData.period || 'Period'} Change:{' '}
                  <span className={tradingData.periodChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatCurrency(tradingData.periodChange)}
                    {typeof tradingData.periodChangePct === 'number'
                      ? ` (${tradingData.periodChangePct >= 0 ? '+' : ''}${tradingData.periodChangePct.toFixed(2)}%)`
                      : ''}
                  </span>
                </div>
              )}
              {typeof tradingData.periodHigh === 'number' && typeof tradingData.periodLow === 'number' && (
                <div className="text-xs text-gray-500">
                  {tradingData.period || 'Period'} range: {formatCurrency(tradingData.periodLow)} –{' '}
                  {formatCurrency(tradingData.periodHigh)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">
              {isLoading ? 'Loading…' : 'Unavailable — connect Alpaca to view trading analytics.'}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-400" />
            E-Commerce
          </h2>
          <p className="text-gray-500 text-sm mb-4">Not integrated</p>
          <div className="text-gray-400 text-sm">
            Inventory, orders, and revenue are unavailable until the store service is connected.
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-pink-400" />
            Social
          </h2>
          <p className="text-gray-500 text-sm mb-4">Not integrated</p>
          <div className="text-gray-400 text-sm">
            Followers, engagement, and post metrics are unavailable until the social service is connected.
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" />
          Profit & Loss (Ledger)
        </h2>
        <p className="text-gray-400 text-sm">
          Unavailable — accounting ledger not initialized. This section will populate from the double-entry ledger once activated.
        </p>
      </div>
      </div>
    </DashboardLayout>
  );
}

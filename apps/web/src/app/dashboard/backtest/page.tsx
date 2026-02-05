'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Play,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  AlertTriangle,
  ChevronRight,
  Clock,
} from 'lucide-react';

interface Strategy {
  id: string;
  name: string;
  description: string;
  params: Array<{ name: string; label: string; default: number; min: number; max: number }>;
}

interface BacktestResult {
  id: string;
  name: string;
  symbol: string;
  strategyType: string;
  totalReturnPct: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  createdAt: string;
}

interface DetailedResult {
  id: string;
  name: string;
  symbol: string;
  strategyType: string;
  params: Record<string, number>;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: Array<{ entryDate: string; exitDate: string; pnl: number; pnlPercent: number }>;
  equityCurve: Array<{ date: string; value: number }>;
}

const defaultStrategies: Strategy[] = [
  {
    id: 'sma_crossover',
    name: 'SMA Crossover',
    description: 'Buy when fast SMA crosses above slow SMA, sell on cross below',
    params: [
      { name: 'fastPeriod', label: 'Fast Period', default: 20, min: 5, max: 50 },
      { name: 'slowPeriod', label: 'Slow Period', default: 50, min: 20, max: 200 },
    ],
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion',
    description: 'Buy when price drops below mean - X std devs, sell above',
    params: [
      { name: 'period', label: 'Lookback Period', default: 20, min: 5, max: 50 },
      { name: 'threshold', label: 'Std Dev Threshold', default: 2, min: 1, max: 3 },
    ],
  },
  {
    id: 'momentum',
    name: 'Momentum',
    description: 'Buy when momentum exceeds threshold, sell when negative',
    params: [
      { name: 'period', label: 'Momentum Period', default: 14, min: 5, max: 30 },
      { name: 'buyThreshold', label: 'Buy Threshold', default: 0.03, min: 0.01, max: 0.1 },
      { name: 'sellThreshold', label: 'Sell Threshold', default: -0.03, min: -0.1, max: -0.01 },
    ],
  },
];

export default function BacktestPage() {
  const [strategies] = useState<Strategy[]>(defaultStrategies);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>(defaultStrategies[0]);
  const [pastResults, setPastResults] = useState<BacktestResult[]>([]);
  const [currentResult, setCurrentResult] = useState<DetailedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    symbol: 'AAPL',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    initialCapital: '100000',
    params: {} as Record<string, number>,
  });

  useEffect(() => {
    loadPastResults();
  }, []);

  useEffect(() => {
    // Initialize params when strategy changes
    const defaultParams: Record<string, number> = {};
    selectedStrategy.params.forEach(p => {
      defaultParams[p.name] = p.default;
    });
    setFormData(prev => ({ ...prev, params: defaultParams }));
  }, [selectedStrategy]);

  const loadPastResults = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/nova-hub/backtest', {
        headers: { Authorization: `Bearer ${api.getAccessToken()}` },
      });
      const data = await response.json();
      if (data.success) {
        setPastResults(data.data.results || []);
      }
    } catch (err) {
      // Demo fallback
      setPastResults([]);
    }
    setIsLoading(false);
  };

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setError(null);
    setCurrentResult(null);

    try {
      const response = await fetch('/api/nova-hub/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.getAccessToken()}`,
        },
        body: JSON.stringify({
          symbol: formData.symbol.toUpperCase(),
          strategyType: selectedStrategy.id,
          startDate: formData.startDate,
          endDate: formData.endDate,
          initialCapital: parseFloat(formData.initialCapital),
          params: formData.params,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCurrentResult(data.data.result);
        loadPastResults();
      } else {
        setError(data.error?.message || 'Backtest failed');
      }
    } catch (err) {
      setError('Failed to run backtest');
    }
    setIsRunning(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Strategy Backtester</h1>
        <p className="text-gray-400 mt-1">Test your trading strategies on historical data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Strategy Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Strategy</h2>
            <div className="space-y-2">
              {strategies.map(strategy => (
                <button
                  key={strategy.id}
                  onClick={() => setSelectedStrategy(strategy)}
                  className={`w-full p-3 rounded-lg text-left transition ${
                    selectedStrategy.id === strategy.id
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                  }`}
                >
                  <div className="font-medium text-white">{strategy.name}</div>
                  <div className="text-sm text-gray-400 mt-1">{strategy.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold text-white mb-4">Parameters</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="AAPL"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Initial Capital</label>
                <input
                  type="number"
                  value={formData.initialCapital}
                  onChange={(e) => setFormData({ ...formData, initialCapital: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Strategy-specific params */}
              {selectedStrategy.params.map(param => (
                <div key={param.name}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{param.label}</label>
                  <input
                    type="number"
                    step={param.max < 1 ? '0.01' : '1'}
                    min={param.min}
                    max={param.max}
                    value={formData.params[param.name] || param.default}
                    onChange={(e) => setFormData({
                      ...formData,
                      params: { ...formData.params, [param.name]: parseFloat(e.target.value) }
                    })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}

              <button
                onClick={handleRunBacktest}
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition"
              >
                {isRunning ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                    Running Backtest...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Backtest
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
          )}

          {currentResult ? (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Total Return</div>
                  <div className={`text-xl font-bold ${currentResult.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPercent(currentResult.totalReturnPct)}
                  </div>
                  <div className="text-sm text-gray-500">{formatCurrency(currentResult.totalReturn)}</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Win Rate</div>
                  <div className="text-xl font-bold text-white">{currentResult.winRate.toFixed(1)}%</div>
                  <div className="text-sm text-gray-500">{currentResult.winningTrades}W / {currentResult.losingTrades}L</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Sharpe Ratio</div>
                  <div className="text-xl font-bold text-white">{currentResult.sharpeRatio.toFixed(2)}</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Max Drawdown</div>
                  <div className="text-xl font-bold text-red-400">-{currentResult.maxDrawdownPct.toFixed(1)}%</div>
                  <div className="text-sm text-gray-500">{formatCurrency(-currentResult.maxDrawdown)}</div>
                </div>
              </div>

              {/* Equity Curve */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-4">Equity Curve</h3>
                <div className="h-64 flex items-end gap-px">
                  {currentResult.equityCurve.slice(-100).map((point, i, arr) => {
                    const min = Math.min(...arr.map(p => p.value));
                    const max = Math.max(...arr.map(p => p.value));
                    const height = ((point.value - min) / (max - min || 1)) * 100;
                    const isProfit = point.value >= currentResult.initialCapital;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t ${isProfit ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                        style={{ height: `${Math.max(5, height)}%` }}
                        title={`${point.date}: ${formatCurrency(point.value)}`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{currentResult.startDate}</span>
                  <span>{currentResult.endDate}</span>
                </div>
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="font-semibold text-white mb-3">Performance</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Initial Capital</span>
                      <span className="text-white">{formatCurrency(currentResult.initialCapital)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Final Capital</span>
                      <span className="text-white">{formatCurrency(currentResult.finalCapital)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Trades</span>
                      <span className="text-white">{currentResult.totalTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Profit Factor</span>
                      <span className="text-white">{currentResult.profitFactor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="font-semibold text-white mb-3">Trade Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Win</span>
                      <span className="text-green-400">{formatCurrency(currentResult.avgWin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Loss</span>
                      <span className="text-red-400">-{formatCurrency(currentResult.avgLoss)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Winning Trades</span>
                      <span className="text-white">{currentResult.winningTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Losing Trades</span>
                      <span className="text-white">{currentResult.losingTrades}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No Results Yet</h3>
              <p className="text-gray-400">Configure your strategy and run a backtest to see results</p>
            </div>
          )}

          {/* Past Results */}
          {pastResults.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h3 className="font-semibold text-white">Past Backtests</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {pastResults.slice(0, 5).map(result => (
                  <div key={result.id} className="p-4 flex items-center justify-between hover:bg-gray-800/50">
                    <div>
                      <div className="font-medium text-white">{result.name}</div>
                      <div className="text-sm text-gray-400">{result.symbol} • {result.strategyType}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${result.totalReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercent(result.totalReturnPct)}
                      </div>
                      <div className="text-sm text-gray-500">{result.totalTrades} trades</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-400/80">
          <strong>Disclaimer:</strong> Backtested performance is hypothetical and not a guarantee of future results. 
          Past performance does not indicate future returns. Trading involves risk of loss.
        </p>
      </div>
    </div>
  );
}

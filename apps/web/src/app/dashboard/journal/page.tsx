'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Plus,
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Flame,
  X,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';

interface JournalEntry {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number | null;
  positionSize: number;
  entryDate: string;
  exitDate: string | null;
  status: string;
  thesis: string | null;
  notes: string | null;
  strategyTag: string | null;
  pnl: number | null;
  pnlPercent: number | null;
  createdAt: string;
}

interface Metrics {
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnlPercent: number;
}

interface Streak {
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState({ symbol: '', status: '', strategy: '' });
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    symbol: '',
    direction: 'BUY',
    entryPrice: '',
    exitPrice: '',
    positionSize: '',
    entryDate: new Date().toISOString().split('T')[0],
    exitDate: '',
    thesis: '',
    notes: '',
    strategyTag: '',
  });

  useEffect(() => {
    loadJournal();
    loadStreak();
  }, []);

  const loadJournal = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getJournal({
        symbol: filter.symbol || undefined,
        status: filter.status || undefined,
        strategy: filter.strategy || undefined,
      });

      if (result.success && result.data) {
        setEntries(result.data.entries as JournalEntry[]);
        setMetrics(result.data.metrics as Metrics);
      } else {
        setEntries([]);
        setMetrics(null);
        setError(result.error?.message || 'Failed to load journal');
      }
    } catch (err) {
      setEntries([]);
      setMetrics(null);
      setError((err as Error).message || 'Failed to load journal');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStreak = async () => {
    try {
      const result = await api.getJournalStreak();

      if (result.success && result.data) {
        setStreak(result.data as Streak);
      } else {
        setStreak(null);
      }
    } catch {
      setStreak(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const entryPrice = parseFloat(formData.entryPrice);
      const positionSize = parseFloat(formData.positionSize);
      const exitPrice = formData.exitPrice ? parseFloat(formData.exitPrice) : null;

      const result = await api.createJournalEntry({
        symbol: formData.symbol,
        direction: formData.direction,
        entryPrice,
        exitPrice,
        positionSize,
        entryDate: formData.entryDate,
        exitDate: formData.exitDate || null,
        thesis: formData.thesis || null,
        notes: formData.notes || null,
        strategyTag: formData.strategyTag || null,
      });

      if (result.success) {
        setShowForm(false);
        loadJournal();
        loadStreak();
        setFormData({
          symbol: '',
          direction: 'BUY',
          entryPrice: '',
          exitPrice: '',
          positionSize: '',
          entryDate: new Date().toISOString().split('T')[0],
          exitDate: '',
          thesis: '',
          notes: '',
          strategyTag: '',
        });
      } else {
        setError(result.error?.message || 'Failed to create entry');
      }
    } catch {
      setError('Failed to create entry');
    }
  };

  const handleExport = async () => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBase}/v1/journal/export.csv`, {
        headers: { Authorization: `Bearer ${api.getAccessToken()}` },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nova-journal-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error?.message || 'Export failed');
      }
    } catch {
      setError('Export failed');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Journal</h1>
          <p className="text-gray-400 mt-1">Track your trades, build discipline, improve results</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Log Trade
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="text-gray-400 text-sm">Total Trades</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics ? metrics.totalTrades : '—'}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4 text-green-400" />
            <span className="text-gray-400 text-sm">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics ? `${metrics.winRate}%` : '—'}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            {metrics ? (
              metrics.totalPnl >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )
            ) : (
              <AlertCircle className="w-4 h-4 text-gray-500" />
            )}
            <span className="text-gray-400 text-sm">Total P/L</span>
          </div>
          <p className={`text-2xl font-bold ${
            metrics ? (metrics.totalPnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'
          }`}>
            {metrics ? formatCurrency(metrics.totalPnl) : '—'}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-gray-400 text-sm">Avg Return</span>
          </div>
          <p className={`text-2xl font-bold ${
            metrics ? (metrics.avgPnlPercent >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'
          }`}>
            {metrics ? `${metrics.avgPnlPercent.toFixed(2)}%` : '—'}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-gray-400 text-sm">Journal Streak</span>
          </div>
          <p className={`text-2xl font-bold ${streak ? 'text-white' : 'text-gray-500'}`}>
            {streak ? `${streak.currentStreak} days` : '—'}
          </p>
          <p className="text-xs text-gray-500">Best: {streak ? `${streak.longestStreak} days` : '—'}</p>
        </div>
      </div>

      {/* Journal Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Trade History</h2>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-gray-800 rounded-lg">
            <Filter className="w-4 h-4" />
            Filter
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : entries.length === 0 ? (
          metrics === null && error ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Journal unavailable</h3>
              <p className="text-gray-400 mb-4">{error}</p>
              <button
                onClick={loadJournal}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No trades logged yet</h3>
              <p className="text-gray-400 mb-4">Start tracking your trades to build discipline and improve your results.</p>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Log Your First Trade
              </button>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Entry</th>
                  <th className="px-4 py-3 font-medium">Exit</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">P/L</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3 text-sm text-gray-300">{formatDate(entry.entryDate)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{entry.symbol}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        entry.direction === 'BUY' || entry.direction === 'LONG'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {entry.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">${entry.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {entry.exitPrice ? `$${entry.exitPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{entry.positionSize}</td>
                    <td className="px-4 py-3">
                      {entry.pnl !== null ? (
                        <div className={entry.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          <span className="font-medium">{formatCurrency(entry.pnl)}</span>
                          <span className="text-xs ml-1">({entry.pnlPercent?.toFixed(2)}%)</span>
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        entry.status === 'CLOSED'
                          ? 'bg-gray-500/20 text-gray-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-400/80">
          <strong>Disclaimer:</strong> This trading journal is for educational and record-keeping purposes only. 
          Past performance does not guarantee future results. Trading involves risk of loss.
        </p>
      </div>

      {/* Add Trade Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Log Trade</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="AAPL"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Direction</label>
                  <select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="BUY">Buy / Long</option>
                    <option value="SELL">Sell / Short</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Entry Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.entryPrice}
                    onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="150.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Exit Price (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.exitPrice}
                    onChange={(e) => setFormData({ ...formData, exitPrice: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="155.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Position Size</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.positionSize}
                    onChange={(e) => setFormData({ ...formData, positionSize: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Entry Date</label>
                  <input
                    type="date"
                    value={formData.entryDate}
                    onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Strategy Tag (optional)</label>
                <input
                  type="text"
                  value={formData.strategyTag}
                  onChange={(e) => setFormData({ ...formData, strategyTag: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Momentum, Breakout, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Trade Thesis</label>
                <textarea
                  value={formData.thesis}
                  onChange={(e) => setFormData({ ...formData, thesis: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Why did you take this trade?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Additional notes, lessons learned..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Save Trade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

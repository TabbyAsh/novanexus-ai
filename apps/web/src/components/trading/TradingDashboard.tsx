'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

// Types
interface AlpacaAccount {
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
}

interface ScannerResult {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  indicators: {
    rsi?: number;
    macd?: number;
    momentum?: number;
    volumeSpike?: boolean;
  };
  quote: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  };
}

interface ThesisCard {
  id: string;
  symbol: string;
  signal: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reasoning: string[];
  createdAt: string;
  expiresAt: string;
}

// Utility function
const formatCurrency = (value: string | number): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
};

const formatPercent = (value: string | number): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

// Account Overview Component
const AccountOverview: React.FC<{ account: AlpacaAccount | null; loading: boolean }> = ({
  account,
  loading,
}) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="bg-slate-800 rounded-lg p-6">
        <div className="text-red-400">Unable to load account data</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Account Overview</h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            account.status === 'ACTIVE'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {account.status}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Portfolio Value</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(account.portfolio_value)}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Cash</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(account.cash)}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Buying Power</div>
          <div className="text-2xl font-bold text-green-400">{formatCurrency(account.buying_power)}</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Equity</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(account.equity)}</div>
        </div>
      </div>
    </div>
  );
};

// Positions Table Component
const PositionsTable: React.FC<{ positions: AlpacaPosition[]; loading: boolean }> = ({
  positions,
  loading,
}) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Open Positions</h2>
      {positions.length === 0 ? (
        <div className="text-slate-400 text-center py-8">No open positions</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-slate-400 text-sm border-b border-slate-700">
                <th className="text-left py-3 px-2">Symbol</th>
                <th className="text-right py-3 px-2">Qty</th>
                <th className="text-right py-3 px-2">Avg Entry</th>
                <th className="text-right py-3 px-2">Current</th>
                <th className="text-right py-3 px-2">Market Value</th>
                <th className="text-right py-3 px-2">P/L</th>
                <th className="text-right py-3 px-2">P/L %</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const plPercent = parseFloat(pos.unrealized_plpc);
                const isPositive = plPercent >= 0;
                return (
                  <tr key={pos.symbol} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-2 font-semibold text-white">{pos.symbol}</td>
                    <td className="py-3 px-2 text-right text-white">{pos.qty}</td>
                    <td className="py-3 px-2 text-right text-slate-300">
                      {formatCurrency(pos.avg_entry_price)}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-300">
                      {formatCurrency(pos.current_price)}
                    </td>
                    <td className="py-3 px-2 text-right text-white">{formatCurrency(pos.market_value)}</td>
                    <td className={`py-3 px-2 text-right ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(pos.unrealized_pl)}
                    </td>
                    <td className={`py-3 px-2 text-right ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(plPercent * 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Scanner Results Component
const ScannerResults: React.FC<{
  results: ScannerResult[];
  loading: boolean;
  onGenerateThesis: (symbol: string) => void;
}> = ({ results, loading, onGenerateThesis }) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/4 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'SELL':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Market Scanner</h2>
      {results.length === 0 ? (
        <div className="text-slate-400 text-center py-8">No scanner results</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((result) => (
            <div
              key={result.symbol}
              className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30 hover:border-slate-500/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white">{result.symbol}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSignalColor(result.signal)}`}>
                    {result.signal}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">{formatCurrency(result.quote.price)}</div>
                  <div
                    className={`text-sm ${result.quote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {formatPercent(result.quote.changePercent)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400">
                <div>
                  Score: <span className="text-white font-medium">{result.score}</span>
                </div>
                <div>RSI: <span className="text-white">{result.indicators.rsi?.toFixed(1) || 'N/A'}</span></div>
                {result.indicators.volumeSpike && (
                  <span className="text-yellow-400">📈 Vol Spike</span>
                )}
              </div>
              {result.signal === 'BUY' && (
                <button
                  onClick={() => onGenerateThesis(result.symbol)}
                  className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Generate Thesis
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Thesis Cards Component
const ThesisCards: React.FC<{
  theses: ThesisCard[];
  loading: boolean;
  onExecuteTrade: (thesisId: string) => void;
}> = ({ theses, loading, onExecuteTrade }) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Active Theses</h2>
      {theses.length === 0 ? (
        <div className="text-slate-400 text-center py-8">No active theses. Generate one from the scanner.</div>
      ) : (
        <div className="space-y-4">
          {theses.map((thesis) => (
            <div
              key={thesis.id}
              className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-white">{thesis.symbol}</span>
                  <span
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      thesis.signal === 'LONG'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {thesis.signal}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">
                    Confidence: {thesis.confidence.toFixed(0)}%
                  </div>
                  <div className="text-slate-400 text-sm">
                    R:R {thesis.riskRewardRatio.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div>
                  <div className="text-slate-400">Entry</div>
                  <div className="text-white font-medium">{formatCurrency(thesis.entryPrice)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Target</div>
                  <div className="text-green-400 font-medium">{formatCurrency(thesis.targetPrice)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Stop Loss</div>
                  <div className="text-red-400 font-medium">{formatCurrency(thesis.stopLoss)}</div>
                </div>
              </div>

              <div className="text-sm text-slate-300 mb-3">
                <ul className="list-disc list-inside space-y-1">
                  {thesis.reasoning.slice(0, 3).map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => onExecuteTrade(thesis.id)}
                className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Execute Paper Trade
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main Trading Dashboard Component
export const TradingDashboard: React.FC = () => {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [scanResults, setScanResults] = useState<ScannerResult[]>([]);
  const [theses, setTheses] = useState<ThesisCard[]>([]);
  const [loading, setLoading] = useState({
    account: true,
    positions: true,
    scanner: true,
    theses: true,
  });
  const [error, setError] = useState<string | null>(null);

  // Fetch account data
  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3010/api/alpaca/account');
      const data = await res.json();
      if (data.success) {
        setAccount(data.data.account);
      }
    } catch (err) {
      console.error('Failed to fetch account:', err);
    } finally {
      setLoading((l) => ({ ...l, account: false }));
    }
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3010/api/alpaca/positions');
      const data = await res.json();
      if (data.success) {
        setPositions(data.data.positions);
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    } finally {
      setLoading((l) => ({ ...l, positions: false }));
    }
  }, []);

  // Fetch scanner results
  const fetchScanResults = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3010/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlistId: 'default' }),
      });
      const data = await res.json();
      if (data.success) {
        setScanResults(data.data.results);
      }
    } catch (err) {
      console.error('Failed to fetch scanner results:', err);
    } finally {
      setLoading((l) => ({ ...l, scanner: false }));
    }
  }, []);

  // Fetch theses
  const fetchTheses = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3010/api/theses');
      const data = await res.json();
      if (data.success) {
        setTheses(data.data.theses);
      }
    } catch (err) {
      console.error('Failed to fetch theses:', err);
    } finally {
      setLoading((l) => ({ ...l, theses: false }));
    }
  }, []);

  // Generate thesis for a symbol
  const generateThesis = useCallback(async (symbol: string) => {
    try {
      const res = await fetch('http://localhost:3010/api/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.success) {
        setTheses((prev) => [...prev, data.data.thesis]);
      }
    } catch (err) {
      console.error('Failed to generate thesis:', err);
      setError('Failed to generate thesis');
    }
  }, []);

  // Execute paper trade
  const executeTrade = useCallback(async (thesisId: string) => {
    try {
      const res = await fetch('http://localhost:3010/api/alpaca/execute-thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesisId, qty: 1 }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh positions after trade
        fetchPositions();
        fetchAccount();
      } else {
        setError(data.error || 'Failed to execute trade');
      }
    } catch (err) {
      console.error('Failed to execute trade:', err);
      setError('Failed to execute trade');
    }
  }, [fetchPositions, fetchAccount]);

  // Initial data fetch
  useEffect(() => {
    fetchAccount();
    fetchPositions();
    fetchScanResults();
    fetchTheses();
  }, [fetchAccount, fetchPositions, fetchScanResults, fetchTheses]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccount();
      fetchPositions();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAccount, fetchPositions]);

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Trading Dashboard</h1>
            <p className="text-slate-400">AI-Powered Paper Trading with Alpaca</p>
          </div>
          <button
            onClick={() => {
              setLoading({ account: true, positions: true, scanner: true, theses: true });
              fetchAccount();
              fetchPositions();
              fetchScanResults();
              fetchTheses();
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            Refresh All
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* Account Overview */}
        <AccountOverview account={account} loading={loading.account} />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Positions */}
          <PositionsTable positions={positions} loading={loading.positions} />

          {/* Theses */}
          <ThesisCards theses={theses} loading={loading.theses} onExecuteTrade={executeTrade} />
        </div>

        {/* Scanner Results */}
        <ScannerResults results={scanResults} loading={loading.scanner} onGenerateThesis={generateThesis} />
      </div>
    </div>
  );
};

export default TradingDashboard;

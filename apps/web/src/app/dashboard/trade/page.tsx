'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Scan,
  Lightbulb,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  AlertTriangle,
  Play,
  XCircle,
  BarChart3,
} from 'lucide-react';
interface CandleIntegrity {
  source_type: string;
  source_identifier: string;
  latency_class: string;
  confidence_score: number;
  timestamp_range: {
    start: string;
    end: string;
    expected: number;
    actual: number;
    missing: number;
    gapFill?: boolean;
    gapFillCount?: number;
  };
  note?: string;
}

interface ScanResult {
  symbol: string;
  signal: string;
  score: number;
  indicators: Record<string, unknown>;
  integrity?: CandleIntegrity;
  quote: {
    symbol: string;
    price: number;
    change: number | null;
    changePercent: number | null;
    volume: number | null;
  };
}

interface Thesis {
  id: string;
  symbol: string;
  signal: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidence: number;
  reasoning: string[];
  createdAt: string;
  expiresAt: string;
  dataIntegrity?: CandleIntegrity;
}

interface PaperTrade {
  id: string;
  thesisId: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  entryPriceRaw?: number;
  currentPrice?: number;
  exitPrice?: number;
  exitPriceRaw?: number;
  status: string;
  pnl?: number;
  pnlPercent?: number;
  fees?: number;
  entryFees?: number;
  exitFees?: number;
  entrySlippageBps?: number;
  exitSlippageBps?: number;
  dataIntegrity?: CandleIntegrity;
  openedAt: string;
  closedAt?: string;
}

interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  avgSlippageBps: number;
  maxDrawdown: number;
  portfolioValue: number | null;
}

export default function TradePage() {
  const [activeTab, setActiveTab] = useState<'scan' | 'theses' | 'trades'>('scan');
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const loadTheses = useCallback(async () => {
    const result = await api.getTheses();
    if (result.success && result.data?.theses) {
      setTheses(result.data.theses);
    }
  }, []);

  const loadTrades = useCallback(async () => {
    const result = await api.getPaperTrades();
    if (result.success && result.data) {
      setTrades(result.data.trades);
      setStats(result.data.stats);
    }
  }, []);

  useEffect(() => {
    loadTheses();
    loadTrades();
  }, [loadTheses, loadTrades]);

  const handleScan = async () => {
    setIsScanning(true);
    const result = await api.runScan();
    if (result.success && result.data?.results) {
      setScanResults(result.data.results);
    }
    setIsScanning(false);
  };

  const handleCreateThesis = async (symbol: string) => {
    setIsLoading(true);
    const result = await api.createThesis(symbol);
    if (result.success) {
      await loadTheses();
      setActiveTab('theses');
    }
    setIsLoading(false);
  };

  const handleOpenTrade = async (thesisId: string) => {
    setIsLoading(true);
    const result = await api.createPaperTrade(thesisId, 10);
    if (result.success) {
      await loadTrades();
      setActiveTab('trades');
    }
    setIsLoading(false);
  };

  const handleCloseTrade = async (tradeId: string) => {
    setIsLoading(true);
    const result = await api.closePaperTrade(tradeId);
    if (result.success) {
      await loadTrades();
    }
    setIsLoading(false);
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatIntegrity = (integrity?: CandleIntegrity) => {
    if (!integrity) return '—';
    const scorePct = Math.round((integrity.confidence_score <= 1 ? integrity.confidence_score * 100 : integrity.confidence_score));
    return `${integrity.source_type} • ${integrity.latency_class} • ${scorePct}%`;
  };

  const formatDrawdown = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Trade</h1>
        <p className="text-gray-400 mt-1">Scan markets, generate theses, and manage paper trades</p>
      </div>

      {/* Stats */}
      {stats && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.totalTrades}</p>
                <p className="text-sm text-gray-400">Total Trades</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Play className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{stats.openTrades}</p>
                <p className="text-sm text-gray-400">Open Positions</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.totalPnl >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <DollarSign className={`w-5 h-5 ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(stats.totalPnl)}
                </p>
                <p className="text-sm text-gray-400">Total P&L</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Target className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-400">{stats.winRate}%</p>
                <p className="text-sm text-gray-400">Win Rate</p>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Realized P&L</p>
                <p className={`text-xl font-bold ${stats.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(stats.realizedPnl)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <ArrowUpRight className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Unrealized P&L</p>
                <p className={`text-xl font-bold ${stats.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(stats.unrealizedPnl)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Max Drawdown</p>
                <p className="text-xl font-bold text-indigo-300">{formatDrawdown(stats.maxDrawdown)}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Avg Slippage</p>
                <p className="text-xl font-bold text-yellow-300">{stats.avgSlippageBps.toFixed(2)} bps</p>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('scan')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'scan' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Scan className="w-4 h-4" />
          Scanner
        </button>
        <button
          onClick={() => setActiveTab('theses')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'theses' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          Theses ({theses.length})
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'trades' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Paper Trades ({trades.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'scan' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-gray-400">Run a market scan to find trading opportunities</p>
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Run Scan'}
            </button>
          </div>

          {scanResults.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <Scan className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No scan results yet</p>
              <p className="text-sm mt-1">Click &quot;Run Scan&quot; to analyze the market</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scanResults.map((result) => (
                <div key={result.symbol} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-bold text-white">{result.symbol}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      result.signal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                      result.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {result.signal}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Price</span>
                      <span className="text-white">{formatCurrency(result.quote.price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Change</span>
                      {typeof result.quote.changePercent === 'number' && Number.isFinite(result.quote.changePercent) ? (
                        <span className={result.quote.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {result.quote.changePercent >= 0 ? '+' : ''}{result.quote.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Score</span>
                      <span className={`font-medium ${
                        result.score >= 65 ? 'text-green-400' :
                        result.score <= 35 ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>{result.score}/100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Integrity</span>
                      <span className="text-gray-300">{formatIntegrity(result.integrity)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCreateThesis(result.symbol)}
                    disabled={isLoading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition"
                  >
                    Generate Thesis
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'theses' && (
        <div>
          {theses.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No theses generated</p>
              <p className="text-sm mt-1">Run a scan and generate theses from signals</p>
            </div>
          ) : (
            <div className="space-y-4">
              {theses.map((thesis) => (
                <div key={thesis.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        thesis.signal === 'LONG' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {thesis.signal === 'LONG' ? (
                          <TrendingUp className="w-5 h-5 text-green-400" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-lg font-bold text-white">{thesis.symbol}</span>
                        <span className={`ml-2 text-sm ${
                          thesis.signal === 'LONG' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {thesis.signal}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Confidence</div>
                      <div className="text-lg font-bold text-blue-400">{Math.round(thesis.confidence)}%</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Entry</div>
                      <div className="text-white font-medium">{formatCurrency(thesis.entryPrice)}</div>
                    </div>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Target</div>
                      <div className="text-green-400 font-medium flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" />
                        {formatCurrency(thesis.targetPrice)}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-400 mb-1">Stop Loss</div>
                      <div className="text-red-400 font-medium flex items-center gap-1">
                        <ArrowDownRight className="w-3 h-3" />
                        {formatCurrency(thesis.stopLoss)}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-sm text-gray-400 mb-2">Reasoning</div>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {thesis.reasoning.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-400">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-xs text-gray-500 mb-4">
                    Integrity: <span className="text-gray-300">{formatIntegrity(thesis.dataIntegrity)}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenTrade(thesis.id)}
                      disabled={isLoading}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg transition"
                    >
                      Open Paper Trade
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'trades' && (
        <div>
          {trades.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No paper trades yet</p>
              <p className="text-sm mt-1">Generate a thesis and open a paper trade to start</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        trade.side === 'BUY' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {trade.side === 'BUY' ? (
                          <TrendingUp className="w-5 h-5 text-green-400" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-lg font-bold text-white">{trade.symbol}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                          trade.status === 'OPEN' ? 'bg-yellow-500/20 text-yellow-400' :
                          trade.status === 'CLOSED' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.status}
                        </span>
                      </div>
                    </div>
                    {trade.pnl !== undefined && (
                      <div className={`text-right ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <div className="text-lg font-bold">{trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}</div>
                        <div className="text-sm">{trade.pnlPercent !== undefined ? `${trade.pnlPercent.toFixed(2)}%` : ''}</div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <div className="text-gray-400 mb-1">Qty</div>
                      <div className="text-white">{trade.quantity}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Entry</div>
                      <div className="text-white">{formatCurrency(trade.entryPrice)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Current</div>
                      <div className="text-white">{trade.currentPrice ? formatCurrency(trade.currentPrice) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Exit</div>
                      <div className="text-white">{trade.exitPrice ? formatCurrency(trade.exitPrice) : '-'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs text-gray-400">
                    <div>
                      <div>Fees</div>
                      <div className="text-gray-200">{formatCurrency(trade.fees)}</div>
                    </div>
                    <div>
                      <div>Entry Slip</div>
                      <div className="text-gray-200">{trade.entrySlippageBps !== undefined ? `${trade.entrySlippageBps.toFixed(2)} bps` : '—'}</div>
                    </div>
                    <div>
                      <div>Exit Slip</div>
                      <div className="text-gray-200">{trade.exitSlippageBps !== undefined ? `${trade.exitSlippageBps.toFixed(2)} bps` : '—'}</div>
                    </div>
                    <div>
                      <div>Integrity</div>
                      <div className="text-gray-200">{formatIntegrity(trade.dataIntegrity)}</div>
                    </div>
                  </div>

                  {trade.status === 'OPEN' && (
                    <button
                      onClick={() => handleCloseTrade(trade.id)}
                      disabled={isLoading}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Close Position
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

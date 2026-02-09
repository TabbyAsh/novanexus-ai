'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import TrustPanel from '@/components/trading/TrustPanel';
import { api } from '@/lib/api';

type DecisionCard = {
  id: string;
  symbol: string;
  strategyTag?: string | null;
  confidenceScore?: number | null;
  sourceType?: string | null;
  latencyClass?: string | null;
  regime?: string | null;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  score?: Record<string, any> | null;
  card?: Record<string, any> | null;
};

type ReplayResult = {
  cardId: string;
  stored: { hash: string; score: any };
  recomputed: { hash: string; score: any };
  drift: { hashMismatch: boolean; scoreDelta: number | null; expectedValueDelta: number | null };
  status: string;
  expiresAt: string | null;
  expired: boolean;
};

type PaperTrade = {
  id: string;
  decisionCardId?: string | null;
  status?: string;
  pnl?: number;
  pnlPercent?: number;
  entryPrice?: number;
  exitPrice?: number;
  openedAt?: string;
  closedAt?: string;
};

export default function DecisionCardsPage() {
  const [cards, setCards] = useState<DecisionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DecisionCard | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [analyticsDepth, setAnalyticsDepth] = useState<number | null>(null);
  const [tradeMap, setTradeMap] = useState<Record<string, PaperTrade>>({});

  const [filters, setFilters] = useState({
    symbol: '',
    strategy: '',
    minConfidence: '',
    sourceType: '',
    regime: '',
    status: '',
  });

  const loadCards = async () => {
    setLoading(true);
    setError(null);
    setReplay(null);
    try {
      const params: any = {};
      if (filters.symbol) params.symbol = filters.symbol.toUpperCase();
      if (filters.strategy) params.strategy = filters.strategy;
      if (filters.sourceType) params.sourceType = filters.sourceType;
      if (filters.regime) params.regime = filters.regime;
      if (filters.status) params.status = filters.status;
      if (filters.minConfidence) params.minConfidence = Number(filters.minConfidence);

      const result = await api.getDecisionCards(params);
      if (result.success && result.data) {
        setCards(result.data.cards as DecisionCard[]);
        setAnalyticsDepth(typeof result.data.analyticsDepth === 'number' ? result.data.analyticsDepth : null);
        setSelected(null);
      } else {
        setError(result.error?.message || 'Failed to load decision cards');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load decision cards');
    } finally {
      setLoading(false);
    }
  };

  const loadPaperTrades = async () => {
    try {
      const result = await api.getPaperTrades();
      if (result.success && result.data?.trades) {
        const mapped: Record<string, PaperTrade> = {};
        (result.data.trades as PaperTrade[]).forEach((trade) => {
          if (trade.decisionCardId) {
            mapped[trade.decisionCardId] = trade;
          }
        });
        setTradeMap(mapped);
        return;
      }
    } catch {
      // ignore
    }
    setTradeMap({});
  };

  const refreshAll = async () => {
    await loadCards();
    await loadPaperTrades();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const handleReplay = async (cardId: string) => {
    setError(null);
    setReplay(null);
    try {
      const result = await api.replayDecisionCard(cardId);
      if (result.success && result.data) {
        setReplay(result.data as ReplayResult);
      } else {
        setError(result.error?.message || 'Replay failed');
      }
    } catch (err) {
      setError((err as Error).message || 'Replay failed');
    }
  };

  const formatDate = (date?: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Decision Cards</h1>
            <p className="text-gray-400">Review AI decision cards, score drift, and integrity metadata.</p>
          </div>
          <button
            onClick={refreshAll}
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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input
              value={filters.symbol}
              onChange={(e) => setFilters((prev) => ({ ...prev, symbol: e.target.value }))}
              placeholder="Symbol"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.strategy}
              onChange={(e) => setFilters((prev) => ({ ...prev, strategy: e.target.value }))}
              placeholder="Strategy"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.minConfidence}
              onChange={(e) => setFilters((prev) => ({ ...prev, minConfidence: e.target.value }))}
              placeholder="Min Conf"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.sourceType}
              onChange={(e) => setFilters((prev) => ({ ...prev, sourceType: e.target.value }))}
              placeholder="Source Type"
              className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white"
            />
            <input
              value={filters.regime}
              onChange={(e) => setFilters((prev) => ({ ...prev, regime: e.target.value }))}
              placeholder="Regime"
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
              onClick={refreshAll}
              className="px-3 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 transition"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {loading ? (
              <div className="text-gray-400">Loading decision cards…</div>
            ) : cards.length === 0 ? (
              <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 text-gray-400">
                No decision cards found.
              </div>
            ) : (
              cards.map((card) => {
                const score = card.score || {};
                const strategy = score.strategy || {};
                const confidence = score.signalConfidence ?? card.confidenceScore ?? null;
                const strategyStatus = strategy.status ? String(strategy.status) : null;
                const strategyFitness = strategy.fitnessScore ?? null;
                return (
                  <button
                    key={card.id}
                    onClick={() => setSelected(card)}
                    className={`w-full text-left p-5 rounded-2xl border transition ${
                      selected?.id === card.id
                        ? 'border-cyan-500/60 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-900/70 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-semibold text-white">{card.symbol}</span>
                          {card.strategyTag && (
                            <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              {card.strategyTag}
                            </span>
                          )}
                          <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-gray-300 border border-white/10">
                            {card.status}
                          </span>
                          {strategyStatus && (
                            <span className={`text-xs px-2 py-1 rounded-full border ${strategyStatus === 'QUARANTINED' ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'}`}>
                              {strategyStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Source: {card.sourceType || '—'} · Regime: {card.regime || '—'} · Latency: {card.latencyClass || '—'}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-300">
                        <div>Score: {score.score ?? '—'}</div>
                        <div>Conf: {confidence !== null ? Math.round(confidence * 100) : '—'}</div>
                        <div>Fitness: {strategyFitness !== null ? Math.round(strategyFitness) : '—'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-3">
                      Created {formatDate(card.createdAt)} · Expires {formatDate(card.expiresAt)}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-4">
            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800">
              <h2 className="text-lg font-semibold text-white">Card Detail</h2>
              {selected ? (
                <div className="mt-4 space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Symbol</span>
                    <span className="text-white">{selected.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="text-white">{selected.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Regime</span>
                    <span>{selected.regime || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expected Value</span>
                    <span>{selected.score?.expectedValue ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Strategy Status</span>
                    <span>{selected.score?.strategy?.status ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fitness Score</span>
                    <span>{selected.score?.strategy?.fitnessScore ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monte Carlo EV</span>
                    <span>{selected.score?.strategy?.monteCarlo?.expectedValue ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit Probability</span>
                    <span>{selected.score?.strategy?.monteCarlo?.probabilityProfit ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Risk/Reward</span>
                    <span>{selected.score?.riskRewardRatio ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Confidence</span>
                    <span>{selected.score?.dataConfidence ?? '—'}</span>
                  </div>
                  <button
                    onClick={() => handleReplay(selected.id)}
                    className="w-full mt-3 px-3 py-2 rounded-lg bg-purple-600/80 text-white hover:bg-purple-500 transition"
                  >
                    Replay Drift Check
                  </button>
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-3">Select a card to view details.</div>
              )}
            </div>

            {selected ? (
              <TrustPanel
                title="Decision Trust Panel"
                gate={selected.score?.gate}
                integrity={selected.card?.thesis?.dataIntegrity || selected.card?.thesis?.data_integrity || null}
                strategy={selected.score?.strategy}
                expectedValue={selected.score?.expectedValue ?? null}
                observedReturn={tradeMap[selected.id]?.pnlPercent ?? null}
                observedPnl={tradeMap[selected.id]?.pnl ?? null}
                analyticsDepth={analyticsDepth}
              />
            ) : (
              <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800 text-sm text-gray-500">
                Select a card to view the trust panel.
              </div>
            )}

            <div className="p-6 rounded-2xl bg-gray-900/80 border border-gray-800">
              <h2 className="text-lg font-semibold text-white">Replay Output</h2>
              {replay ? (
                <div className="mt-3 space-y-2 text-sm text-gray-300">
                  <div>Hash mismatch: {replay.drift.hashMismatch ? 'Yes' : 'No'}</div>
                  <div>Score delta: {replay.drift.scoreDelta ?? '—'}</div>
                  <div>EV delta: {replay.drift.expectedValueDelta ?? '—'}</div>
                  <div>Expired: {replay.expired ? 'Yes' : 'No'}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-3">Run a replay to see drift checks.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

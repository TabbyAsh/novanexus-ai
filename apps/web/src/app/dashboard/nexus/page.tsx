'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';
import {
  RefreshCw,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  ScrollText,
  Brain,
} from 'lucide-react';

type NexusStatusPayload = any;
type NexusDecisionRecord = any;
type NexusDecisionCard = any;

function shortHash(hash: string | undefined | null, n: number = 12) {
  if (!hash) return '—';
  return hash.length > n ? `${hash.slice(0, n)}…` : hash;
}

export default function NexusDashboardPage() {
  const [status, setStatus] = useState<NexusStatusPayload | null>(null);
  const [ledger, setLedger] = useState<NexusDecisionRecord[]>([]);
  const [card, setCard] = useState<NexusDecisionCard | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState('AAPL');
  const [signal, setSignal] = useState<'BUY' | 'SELL' | 'HOLD'>('BUY');
  const [price, setPrice] = useState('180');
  const [confidence, setConfidence] = useState('0.65');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsRefreshing(true);
    setError(null);

    try {
      const [statusRes, ledgerRes] = await Promise.all([
        api.getNexusStatus(),
        api.getNexusLedger(25),
      ]);

      if (statusRes.success) {
        setStatus(statusRes.data?.status ?? null);
      } else {
        setError(statusRes.error?.message ?? 'Failed to load Nexus status');
      }

      if (ledgerRes.success) {
        setLedger(ledgerRes.data?.ledger ?? []);
      } else {
        setError(ledgerRes.error?.message ?? 'Failed to load Nexus ledger');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      if (!opts?.silent) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load({ silent: true });
  }, [load]);

  const tier = status?.nexus?.constitution?.tier as string | undefined;
  const riskState = status?.nexus?.risk?.riskState as string | undefined;
  const riskScore = status?.nexus?.risk?.riskScore as number | undefined;
  const trustScore = status?.nexus?.trust?.trustScore as number | undefined;
  const trustTrend = status?.nexus?.trust?.trustTrend as string | undefined;
  const inactionCount = status?.nexus?.inaction?.totalArtifacts as number | undefined;

  const riskAvoidance = useMemo(() => {
    const inaction = status?.nexus?.inaction ?? {};
    const risk = status?.nexus?.risk ?? {};

    const cards = (ledger ?? [])
      .map((r: any) => r?.card)
      .filter(Boolean);

    const artifacts = cards
      .map((c: any) => c?.inaction?.artifact)
      .filter(Boolean);

    const riskVetoes = cards.filter((c: any) => c?.risk?.check && c.risk.check.approved === false).length;
    const riskAbstentions = artifacts.filter((a: any) => a?.type === 'RISK_ABSTENTION').length;

    const billableArtifacts = artifacts.filter((a: any) => a?.billable).length;
    const billableValueFromArtifacts = artifacts.reduce((sum: number, a: any) => {
      const v = typeof a?.billableValue === 'number' ? a.billableValue : 0;
      return sum + v;
    }, 0);

    const rejections = (ledger ?? []).filter((r: any) => r?.decision?.approved === false).length;

    return {
      // InactionEngine stats (system-of-record)
      totalArtifacts: typeof inaction.totalArtifacts === 'number' ? inaction.totalArtifacts : 0,
      pendingOutcomes: typeof inaction.pendingOutcomes === 'number' ? inaction.pendingOutcomes : 0,
      totalAvoidedLoss: typeof inaction.totalAvoidedLoss === 'number' ? inaction.totalAvoidedLoss : 0,
      totalBillableValue: typeof inaction.totalBillableValue === 'number' ? inaction.totalBillableValue : 0,
      restraintRate: typeof inaction.restraintRate === 'number' ? inaction.restraintRate : 0,
      emotionalTradesBlocked: typeof inaction.emotionalTradesBlocked === 'number' ? inaction.emotionalTradesBlocked : 0,

      // Derived (from recent decision cards)
      riskVetoes,
      riskAbstentions,
      billableArtifacts,
      billableValueFromArtifacts,
      rejections,

      // Risk context
      isHalted: Boolean(risk.isHalted),
      recentTriggers: typeof risk.recentTriggers === 'number' ? risk.recentTriggers : 0,
    };
  }, [ledger, status?.nexus?.inaction, status?.nexus?.risk]);

  const decisionApproved = useMemo(() => {
    const approved = card?.decision?.approved;
    return typeof approved === 'boolean' ? approved : null;
  }, [card]);

  const analyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const p = parseFloat(price);
      const c = parseFloat(confidence);

      const res = await api.analyzeTradeWithNexus({
        symbol: symbol.trim().toUpperCase(),
        signal,
        price: Number.isFinite(p) ? p : 0,
        confidence: Number.isFinite(c) ? c : 0.5,
      });

      if (!res.success) {
        setError(res.error?.message ?? 'Nexus analysis failed');
        return;
      }

      const nextCard = res.data?.card ?? null;
      setCard(nextCard);

      // Refresh ledger after each analysis so the card shows up in history.
      await load({ silent: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [confidence, load, price, signal, symbol]);

  const initialize = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const res = await api.initializeNexus();
      if (!res.success) {
        setError(res.error?.message ?? 'Failed to initialize Nexus');
        return;
      }
      await load({ silent: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsInitializing(false);
    }
  }, [load]);

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30">
                <Brain className="w-5 h-5 text-cyan-300" />
              </span>
              Nexus Decision Center
            </h1>
            <p className="text-gray-400 mt-1">
              Decision primacy. Governance supremacy. Memory is sacred.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => load()}
              disabled={isRefreshing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={initialize}
              disabled={isInitializing}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg transition flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {isInitializing ? 'Initializing…' : 'Initialize'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <CheckCircle className="w-4 h-4 text-green-400" /> Initialized
            </div>
            <p className="text-2xl font-bold text-white mt-2">{status?.initialized ? 'Yes' : 'No'}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Shield className="w-4 h-4 text-cyan-400" /> Autonomy Tier
            </div>
            <p className="text-2xl font-bold text-cyan-300 mt-2">{tier ?? '—'}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <AlertTriangle className="w-4 h-4 text-yellow-400" /> Risk
            </div>
            <p className="text-2xl font-bold text-yellow-300 mt-2">{riskState ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Score: {typeof riskScore === 'number' ? riskScore : '—'}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <ScrollText className="w-4 h-4 text-purple-400" /> Trust
            </div>
            <p className="text-2xl font-bold text-purple-300 mt-2">{typeof trustScore === 'number' ? trustScore : '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Trend: {trustTrend ?? '—'}</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <XCircle className="w-4 h-4 text-pink-400" /> Inaction
            </div>
            <p className="text-2xl font-bold text-pink-300 mt-2">{typeof inactionCount === 'number' ? inactionCount : '—'}</p>
            <p className="text-xs text-gray-500 mt-1">Artifacts recorded</p>
          </div>
        </div>

        {/* Risk-Avoidance Metrics */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Risk-Avoidance Metrics</h2>
              <p className="text-gray-400 text-sm mt-1">
                Restraint is recorded as first-class output (inaction artifacts + avoided-loss accounting).
              </p>
            </div>
            {riskAvoidance.isHalted && (
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-red-500/15 text-red-300 border-red-500/30">
                HALTED
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-4">
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Total Avoided Loss</p>
              <p className="text-2xl font-bold text-green-300 mt-2">
                ${riskAvoidance.totalAvoidedLoss.toFixed(0)}
              </p>
              <p className="text-xs text-gray-600 mt-1">Requires outcome tracking</p>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Total Restraint Value</p>
              <p className="text-2xl font-bold text-pink-300 mt-2">
                ${riskAvoidance.totalBillableValue.toFixed(0)}
              </p>
              <p className="text-xs text-gray-600 mt-1">Billable inaction value</p>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Restraint Rate</p>
              <p className="text-2xl font-bold text-white mt-2">
                {riskAvoidance.restraintRate.toFixed(2)}
              </p>
              <p className="text-xs text-gray-600 mt-1">Artifacts/day (last 30d)</p>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Risk Abstentions</p>
              <p className="text-2xl font-bold text-yellow-300 mt-2">
                {riskAvoidance.riskAbstentions}
              </p>
              <p className="text-xs text-gray-600 mt-1">From recent decision cards</p>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Risk Engine Vetoes</p>
              <p className="text-2xl font-bold text-red-300 mt-2">
                {riskAvoidance.riskVetoes}
              </p>
              <p className="text-xs text-gray-600 mt-1">Survivability constraints</p>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500">Recent Risk Triggers</p>
              <p className="text-2xl font-bold text-white mt-2">
                {riskAvoidance.recentTriggers}
              </p>
              <p className="text-xs text-gray-600 mt-1">Last 24h</p>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Recent cards: {ledger.length} • Rejections: {riskAvoidance.rejections} • Billable artifacts (recent): {riskAvoidance.billableArtifacts} • Billable value (recent): ${riskAvoidance.billableValueFromArtifacts.toFixed(0)}
          </div>
        </div>

        {/* Analyze Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Analyze a Trade (Decision Card)</h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-gray-500">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="AAPL"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Signal</label>
              <select
                value={signal}
                onChange={(e) => setSignal(e.target.value as 'BUY' | 'SELL' | 'HOLD')}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="HOLD">HOLD</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Price</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="180.00"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Confidence (0-1)</label>
              <input
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="0.65"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={analyze}
                disabled={isAnalyzing}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white rounded-lg transition flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isAnalyzing ? 'Analyzing…' : 'Analyze'}
              </button>
            </div>
          </div>

          {/* Decision Card */}
          <div className="mt-6">
            {!card ? (
              <div className="text-gray-500 text-sm">Run an analysis to generate a decision card.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-gray-400 text-sm">Decision</p>
                      <p className="text-xl font-semibold text-white mt-1">
                        {card?.thesis?.signal} {card?.thesis?.symbol}
                      </p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                      decisionApproved === true
                        ? 'bg-green-500/15 text-green-300 border-green-500/30'
                        : decisionApproved === false
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : 'bg-gray-500/10 text-gray-300 border-gray-500/30'
                    }`}>
                      {decisionApproved === true ? 'APPROVED' : decisionApproved === false ? 'REJECTED' : 'UNKNOWN'}
                    </div>
                  </div>

                  <p className="text-gray-300 mt-4">{card?.decision?.reasoning ?? '—'}</p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Tier</p>
                      <p className="text-sm text-white font-medium mt-1">{card?.decision?.tier ?? '—'}</p>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Confidence</p>
                      <p className="text-sm text-white font-medium mt-1">
                        {typeof card?.decision?.confidence === 'number' ? card.decision.confidence.toFixed(2) : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-gray-400">Constraints</p>
                    {Array.isArray(card?.decision?.constraints) && card.decision.constraints.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-gray-300 list-disc list-inside">
                        {card.decision.constraints.map((c: string, i: number) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 mt-2">None</p>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-gray-400">Ledger Link</p>
                    <div className="mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Entry</span>
                        <span className="text-gray-200 font-mono">{shortHash(card?.ledgerEntry?.id, 16)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-500">Seq</span>
                        <span className="text-gray-200">{card?.ledgerEntry?.sequence ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-500">Hash</span>
                        <span className="text-gray-200 font-mono">{shortHash(card?.ledgerEntry?.hash)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                    <p className="text-sm text-gray-400 mb-2">Trust Ledger</p>
                    <p className="text-white font-semibold">
                      Trust Score: {card?.trust?.trustScore?.overall ?? '—'}
                      <span className="text-gray-500 font-normal"> / 100</span>
                    </p>
                    <p className="text-gray-400 text-sm mt-2">Explanation</p>
                    <p className="text-gray-200 text-sm mt-1">{card?.trust?.explanation?.content?.summary ?? '—'}</p>
                    {Array.isArray(card?.trust?.explanation?.content?.reasoning) && (
                      <ul className="mt-3 space-y-1 text-sm text-gray-300 list-disc list-inside">
                        {card.trust.explanation.content.reasoning.slice(0, 8).map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                    <p className="text-sm text-gray-400 mb-2">Risk Envelope</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                        <p className="text-xs text-gray-500">State</p>
                        <p className="text-sm text-white font-medium mt-1">{card?.risk?.envelope?.state ?? '—'}</p>
                      </div>
                      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Risk Score</p>
                        <p className="text-sm text-white font-medium mt-1">{card?.risk?.envelope?.riskScore ?? '—'}</p>
                      </div>
                    </div>

                    {Array.isArray(card?.risk?.check?.warnings) && card.risk.check.warnings.length > 0 && (
                      <>
                        <p className="text-sm text-gray-400 mt-4">Warnings</p>
                        <ul className="mt-2 space-y-1 text-sm text-gray-300 list-disc list-inside">
                          {card.risk.check.warnings.slice(0, 6).map((w: string, i: number) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-5">
                    <p className="text-sm text-gray-400 mb-2">Inaction Artifact</p>
                    {!card?.inaction?.artifact ? (
                      <p className="text-sm text-gray-500">None (an approved decision does not generate restraint artifacts).</p>
                    ) : (
                      <div className="text-sm text-gray-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Type</span>
                          <span className="font-medium">{card.inaction.artifact.type}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Billable</span>
                          <span className="font-medium">{card.inaction.artifact.billable ? 'Yes' : 'No'}</span>
                        </div>
                        {typeof card.inaction.artifact.billableValue === 'number' && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">Billable Value</span>
                            <span className="font-medium">${card.inaction.artifact.billableValue.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="pt-2 border-t border-gray-800">
                          <p className="text-gray-400">Primary Reason</p>
                          <p className="mt-1">{card.inaction.artifact.reasoning?.primaryReason ?? '—'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Decisions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Decisions</h2>
            <span className="text-xs text-gray-500">Showing last {ledger.length}</span>
          </div>

          {isLoading ? (
            <div className="text-gray-500 text-sm">Loading…</div>
          ) : ledger.length === 0 ? (
            <div className="text-gray-500 text-sm">No decisions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Symbol</th>
                    <th className="py-2 pr-4">Signal</th>
                    <th className="py-2 pr-4">Result</th>
                    <th className="py-2 pr-4">Ledger Seq</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice().reverse().slice(0, 12).map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-800/60 text-gray-200 hover:bg-white/5 cursor-pointer"
                      onClick={() => r.card && setCard(r.card)}
                      title={r.card ? 'Click to load this decision card' : 'No card attached'}
                    >
                      <td className="py-2 pr-4 text-gray-400">
                        {typeof r.timestamp === 'number' ? new Date(r.timestamp).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-4 font-medium">{r.thesis?.symbol ?? '—'}</td>
                      <td className="py-2 pr-4">{r.thesis?.signal ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {r.decision?.approved ? (
                          <span className="inline-flex items-center gap-1 text-green-300">
                            <CheckCircle className="w-4 h-4" /> Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-300">
                            <XCircle className="w-4 h-4" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-gray-300">
                        {r.card?.ledgerEntry?.sequence ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

type UdmTier = 'clarity' | 'foresight' | 'autonomy';

interface UdmWallet {
  clarity: number;
  foresight: number;
  autonomy: number;
}

interface UdmRun {
  runId: string;
  snapshot: any;
  preview: any;
  sim: any | null;
  actionability: any;
  status: string;
}

interface UdmQuote {
  runId: string;
  notional: number;
  sim: any;
  knobs: any;
}

interface UdmDecisionPanelProps {
  symbol: string;
  domain?: string;
  onClose: () => void;
  onConfirm?: (runId: string, executionId: string | null) => void;
}

const TIER_INFO = {
  clarity: {
    name: 'Clarity',
    icon: '🔍',
    desc: 'Accurate heuristics & snapshot',
    color: 'cyan',
    cost: 'FREE preview, 1 card to confirm',
  },
  foresight: {
    name: 'Foresight',
    icon: '🔮',
    desc: 'Monte Carlo simulation (1000 runs)',
    color: 'purple',
    cost: 'FREE preview, 1 card to confirm',
  },
  autonomy: {
    name: 'Autonomy',
    icon: '🤖',
    desc: 'Execution + outcome calibration',
    color: 'amber',
    cost: 'Requires cards for execution',
  },
};

export function UdmDecisionPanel({ symbol, domain = 'stocks', onClose, onConfirm }: UdmDecisionPanelProps) {
  const [wallet, setWallet] = useState<UdmWallet | null>(null);
  const [tier, setTier] = useState<UdmTier>('clarity');
  const [notional, setNotional] = useState(1000);
  const [run, setRun] = useState<UdmRun | null>(null);
  const [quote, setQuote] = useState<UdmQuote | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realityOnline, setRealityOnline] = useState(true);

  // Load wallet on mount
  useEffect(() => {
    const loadWallet = async () => {
      const res = await api.getUdmWallet();
      if (res.success && res.data) {
        setWallet(res.data);
      }
    };
    loadWallet();

    // Check reality
    const checkReality = async () => {
      const res = await api.getReality();
      if (res.success && res.data) {
        setRealityOnline(res.data.online);
      }
    };
    checkReality();
  }, []);

  // Apply (FREE preview)
  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    try {
      const res = await api.applyUdm({
        domain,
        target: symbol,
        tier,
        notional: tier !== 'clarity' ? notional : undefined,
      });
      if (res.success && res.data) {
        setRun(res.data);
        // For foresight+, also get initial quote
        if (tier !== 'clarity') {
          const quoteRes = await api.quoteUdm({ runId: res.data.runId, notional });
          if (quoteRes.success && quoteRes.data) {
            setQuote(quoteRes.data);
          }
        }
      } else {
        setError(res.error?.message || 'Failed to apply');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply');
    } finally {
      setIsApplying(false);
    }
  };

  // Debounced quote update for notional changes
  const updateQuote = useCallback(async (newNotional: number) => {
    if (!run?.runId || tier === 'clarity') return;
    try {
      const res = await api.quoteUdm({ runId: run.runId, notional: newNotional });
      if (res.success && res.data) {
        setQuote(res.data);
      }
    } catch {
      // Ignore quote errors
    }
  }, [run?.runId, tier]);

  // Debounce notional changes
  useEffect(() => {
    if (!run?.runId || tier === 'clarity') return;
    const timer = setTimeout(() => {
      updateQuote(notional);
    }, 300);
    return () => clearTimeout(timer);
  }, [notional, run?.runId, tier, updateQuote]);

  // Confirm (PAID - consumes card)
  const handleConfirm = async () => {
    if (!run?.runId) return;
    if (!realityOnline) {
      setError('System offline — TAKE actions disabled');
      return;
    }

    const tierBalance = wallet?.[tier] ?? 0;
    if (tierBalance < 1) {
      setError(`Insufficient ${tier} cards`);
      return;
    }

    setIsConfirming(true);
    setError(null);
    try {
      const res = await api.confirmUdm({ runId: run.runId, notional });
      if (res.success && res.data) {
        setWallet(res.data.wallet);
        onConfirm?.(run.runId, res.data.executionId);
        onClose();
      } else {
        setError(res.error?.message || 'Failed to confirm');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to confirm');
    } finally {
      setIsConfirming(false);
    }
  };

  const tierColors = {
    clarity: 'cyan',
    foresight: 'purple',
    autonomy: 'amber',
  };

  const currentTierColor = tierColors[tier];
  const tierBalance = wallet?.[tier] ?? 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/20 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{TIER_INFO[tier].icon}</span>
              <div>
                <h2 className="text-xl font-bold text-white">UDM: {symbol}</h2>
                <p className="text-gray-400 text-sm">{TIER_INFO[tier].name} Tier</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
              ×
            </button>
          </div>

          {/* Tier Tabs */}
          <div className="flex gap-2 mb-6">
            {(['clarity', 'foresight', 'autonomy'] as UdmTier[]).map((t) => {
              const info = TIER_INFO[t];
              const balance = wallet?.[t] ?? 0;
              const isActive = tier === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setTier(t);
                    setRun(null);
                    setQuote(null);
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl border transition-all ${
                    isActive
                      ? `bg-${info.color}-500/20 border-${info.color}-500/50 text-${info.color}-400`
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <div className="text-lg mb-1">{info.icon}</div>
                  <div className="font-medium">{info.name}</div>
                  <div className="text-xs opacity-70">{balance} cards</div>
                </button>
              );
            })}
          </div>

          {/* Wallet Display */}
          <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Card Balance</span>
              <div className="flex gap-4">
                <span className="text-cyan-400">🔍 {wallet?.clarity ?? 0}</span>
                <span className="text-purple-400">🔮 {wallet?.foresight ?? 0}</span>
                <span className="text-amber-400">🤖 {wallet?.autonomy ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Notional Input (for Foresight/Autonomy) */}
          {tier !== 'clarity' && (
            <div className="mb-6">
              <label className="text-gray-400 text-sm mb-2 block">Notional Amount ($)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={notional}
                  onChange={(e) => setNotional(Math.max(100, Number(e.target.value)))}
                  className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                  min={100}
                  step={100}
                />
                <button
                  onClick={() => setNotional(1000)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:bg-white/10"
                >
                  $1K
                </button>
                <button
                  onClick={() => setNotional(5000)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:bg-white/10"
                >
                  $5K
                </button>
                <button
                  onClick={() => setNotional(10000)}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:bg-white/10"
                >
                  $10K
                </button>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {!run && (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">{TIER_INFO[tier].desc}</p>
              <p className="text-gray-500 text-sm mb-6">{TIER_INFO[tier].cost}</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleApply}
                disabled={isApplying}
                className={`px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-${currentTierColor}-500 to-${currentTierColor}-600 hover:shadow-lg hover:shadow-${currentTierColor}-500/30 disabled:opacity-50`}
              >
                {isApplying ? '⏳ Loading...' : '🔍 Preview (FREE)'}
              </motion.button>
            </div>
          )}

          {/* Run Results */}
          {run && (
            <>
              {/* Snapshot */}
              <div className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-400 text-xs uppercase mb-2">Snapshot</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Price:</span>
                    <span className="text-white ml-2">${run.snapshot?.price?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Strategy:</span>
                    <span className="text-cyan-400 ml-2">{run.snapshot?.strategyId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Regime:</span>
                    <span className="text-white ml-2">{run.snapshot?.regime}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Trust:</span>
                    <span className="text-white ml-2">{run.actionability?.trust}%</span>
                  </div>
                </div>
                {run.preview?.reasons?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-gray-500 text-xs mb-1">Reasons:</p>
                    <ul className="text-xs text-gray-300 list-disc list-inside">
                      {run.preview.reasons.slice(0, 3).map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Actionability Metrics */}
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30">
                <p className="text-cyan-400 text-xs uppercase mb-2">Actionability</p>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-white">
                    {run.actionability?.actionability ?? '—'}%
                  </div>
                  <div className="text-sm text-gray-400">
                    = Trust ({run.actionability?.trust}%) × Confidence ({run.actionability?.confidence}%) × Feasibility ({run.actionability?.feasibility}%)
                  </div>
                </div>
              </div>

              {/* Simulation (Foresight+) */}
              {(tier === 'foresight' || tier === 'autonomy') && (quote || run.sim) && (
                <div className="mb-4 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                  <p className="text-purple-400 text-xs uppercase mb-2">Monte Carlo Simulation</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-400">Expected Return (P50):</span>
                      <span className="text-green-400 ml-2">
                        ${(quote?.sim?.evBands?.p50 ?? run.sim?.evBands?.p50)?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Win Probability:</span>
                      <span className="text-white ml-2">
                        {quote?.sim?.winProbability ?? run.sim?.winProbability}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Downside (P5):</span>
                      <span className="text-red-400 ml-2">
                        ${(quote?.sim?.evBands?.p5 ?? run.sim?.evBands?.p5)?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Upside (P95):</span>
                      <span className="text-green-400 ml-2">
                        ${(quote?.sim?.evBands?.p95 ?? run.sim?.evBands?.p95)?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Max Drawdown:</span>
                      <span className="text-red-400 ml-2">
                        -${(quote?.sim?.maxDrawdown ?? run.sim?.maxDrawdown)?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Time Horizon:</span>
                      <span className="text-white ml-2">
                        {quote?.sim?.timeHorizon ?? run.sim?.timeHorizon}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRun(null);
                    setQuote(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5"
                >
                  ← Back
                </button>
                <motion.button
                  whileHover={{ scale: isConfirming || !realityOnline ? 1 : 1.02 }}
                  whileTap={{ scale: isConfirming || !realityOnline ? 1 : 0.98 }}
                  disabled={isConfirming || !realityOnline || tierBalance < 1}
                  onClick={handleConfirm}
                  className={`flex-1 py-3 rounded-xl font-bold text-white ${
                    isConfirming || !realityOnline || tierBalance < 1
                      ? 'bg-gray-600 cursor-not-allowed'
                      : `bg-gradient-to-r from-${currentTierColor}-500 to-${currentTierColor}-600 hover:shadow-lg hover:shadow-${currentTierColor}-500/30`
                  }`}
                >
                  {isConfirming ? (
                    '⏳ Confirming...'
                  ) : !realityOnline ? (
                    '🔴 Offline'
                  ) : tierBalance < 1 ? (
                    '🎴 No Cards'
                  ) : (
                    `✓ Confirm (1 ${TIER_INFO[tier].name} Card)`
                  )}
                </motion.button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default UdmDecisionPanel;

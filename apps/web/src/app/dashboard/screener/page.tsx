'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { GradientText } from '@/components/ui/GlassCard';
import TrustPanel from '@/components/trading/TrustPanel';
import { RealityBanner, UdmDecisionPanel } from '@/components/udm';
import { api } from '@/lib/api';

type ConfidenceTag = 'high' | 'medium' | 'low';

type CandleProvenance = {
  source: string;
  method: 'primary' | 'fallback' | 'synthetic' | string;
  confidence: ConfidenceTag | string;
  confidenceScore: number;
  note?: string;
};

type SignalProvenance = {
  candles?: CandleProvenance | null;
  quoteSource?: string | null;
  model?: string;
};

interface Signal {
  symbol: string;
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  pattern: string;
  confidence: number;
  confidenceTag?: ConfidenceTag;
  rawConfidence?: number;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
  timeframe: string;
  indicators?: {
    rsi: number | null;
    sma20?: number | null;
    sma50?: number | null;
    sma200?: number | null;
    volumeRatio?: number;
    atr?: number;
    priceVsSma20?: number | null;
    priceVsSma50?: number | null;
    macdHistogram?: number | null;
  };
  timestamp?: string;
  provenance?: SignalProvenance;
}

interface ScanStatus {
  scanning: boolean;
  progress: number;
  scannedCount: number;
  totalCount: number;
  foundSignals: number;
}
interface PaperTradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  portfolioValue: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  avgSlippageBps: number;
  maxDrawdown: number;
}
type UsageSnapshot = {
  plan: string;
  limits: Record<string, number>;
  analyticsDepth: number;
  usage: Record<string, number>;
  remaining: Record<string, number>;
  upgradeUrl?: string;
};

type GuidedFlowState = {
  thesis: any;
  decisionCard: any;
  gate: any;
  analytics: { depth: number; locked: boolean; reason?: string | null };
};

type PaperTrade = {
  id: string;
  thesisId: string;
  decisionCardId?: string | null;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  status: string;
  pnl?: number;
  pnlPercent?: number;
};

const confidenceColors: Record<ConfidenceTag, string> = {
  high: 'bg-green-500/20 text-green-300 border-green-500/40',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  low: 'bg-red-500/20 text-red-300 border-red-500/40',
};

const classifyConfidence = (score: number): ConfidenceTag => {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
};

const formatModelName = (model?: string) => {
  if (!model) return null;
  if (model.startsWith('openai:')) {
    return `OpenAI ${model.split(':')[1]}`;
  }
  if (model === 'deterministic') return 'Deterministic';
  return model;
};

const formatConfidenceScore = (score?: number) => {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized)}%`;
};

const normalizeSignals = (rawSignals: any[], source: 'ai' | 'deterministic'): Signal[] => {
  return rawSignals.map((signal) => {
    const parsedConfidence = Number(signal.confidence ?? signal.score ?? 0);
    const confidence = Number.isFinite(parsedConfidence) ? parsedConfidence : 0;
    const rawConfidence = typeof signal.rawConfidence === 'number' ? signal.rawConfidence : confidence;
    const confidenceTag = signal.confidenceTag || classifyConfidence(confidence);
    const provenance = signal.provenance || (source === 'deterministic' ? { model: 'deterministic' } : undefined);

    return {
      ...signal,
      confidence,
      rawConfidence,
      confidenceTag,
      provenance,
    } as Signal;
  });
};

// Decision Card Modal
function DecisionCardModal({ 
  run, 
  onClose, 
  onConfirm,
  isConfirming 
}: { 
  run: { runId: string; snapshot: any; sim: any; costs: any; tradeoffs: string[] };
  onClose: () => void;
  onConfirm: (runId: string) => Promise<void>;
  isConfirming: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-gray-900 to-gray-800 border border-white/20 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🎴 Decision Card: {run.snapshot.symbol}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Snapshot Summary */}
        <div className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-gray-400 text-xs uppercase mb-2">Snapshot</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Price:</span>
              <span className="text-white ml-2">${run.snapshot.price?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500">Strategy:</span>
              <span className="text-cyan-400 ml-2">{run.snapshot.strategyId}</span>
            </div>
            <div>
              <span className="text-gray-500">Fitness:</span>
              <span className="text-white ml-2">{run.snapshot.strategyFitness}</span>
            </div>
            <div>
              <span className="text-gray-500">Trust:</span>
              <span className="text-white ml-2">{run.snapshot.trust}%</span>
            </div>
          </div>
          {run.snapshot.reasons?.length > 0 && (
            <div className="mt-3">
              <p className="text-gray-500 text-xs mb-1">Reasons:</p>
              <ul className="text-xs text-gray-300 list-disc list-inside">
                {run.snapshot.reasons.slice(0, 3).map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Simulation Summary */}
        <div className="mb-4 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
          <p className="text-cyan-400 text-xs uppercase mb-2">Simulation Summary</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400">Expected Return:</span>
              <span className="text-green-400 ml-2">
                {run.sim.expectedReturn?.low}% to {run.sim.expectedReturn?.high}%
              </span>
            </div>
            <div>
              <span className="text-gray-400">Win Probability:</span>
              <span className="text-white ml-2">{run.sim.winProbability}%</span>
            </div>
            <div>
              <span className="text-gray-400">Max Drawdown:</span>
              <span className="text-red-400 ml-2">-{run.sim.drawdownEstimate}%</span>
            </div>
            <div>
              <span className="text-gray-400">Time in Trade:</span>
              <span className="text-white ml-2">{run.sim.timeInTrade}</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-400">
            Backtest: {run.sim.backtest?.wins}/{run.sim.backtest?.trades} wins ({Math.round((run.sim.backtest?.wins / run.sim.backtest?.trades) * 100)}%)
          </div>
        </div>

        {/* Costs & Tradeoffs */}
        <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-amber-400 text-xs uppercase mb-2">Cost & Tradeoffs</p>
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎴</span>
              <span className="text-white font-bold">1 Card Required</span>
            </div>
            {run.tradeoffs?.length > 0 && (
              <ul className="text-xs text-amber-300/80 list-disc list-inside">
                {run.tradeoffs.map((t: string, i: number) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <motion.button
            whileHover={{ scale: isConfirming ? 1 : 1.02 }}
            whileTap={{ scale: isConfirming ? 1 : 0.98 }}
            disabled={isConfirming}
            onClick={() => onConfirm(run.runId)}
            className={`flex-1 py-3 rounded-xl font-bold text-white ${
              isConfirming
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:shadow-lg hover:shadow-purple-500/30'
            }`}
          >
            {isConfirming ? '⏳ Confirming...' : '✓ Confirm & Execute'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// Signal Card Component with enhanced visuals
function SignalCard({ signal, index, onAddToWatchlist, onPaperTrade, onStartGuidedFlow, onApplyCard, onOpenUdm, cardBalance }: { 
  signal: Signal; 
  index: number;
  onAddToWatchlist: (symbol: string) => void;
  onPaperTrade: (signal: Signal) => void;
  onStartGuidedFlow: (signal: Signal) => Promise<void> | void;
  onApplyCard: (signal: Signal) => Promise<void>;
  onOpenUdm: (symbol: string) => void;
  cardBalance: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);
  const [isPaperTrading, setIsPaperTrading] = useState(false);
  const [isGuidedFlow, setIsGuidedFlow] = useState(false);
  const [isApplyingCard, setIsApplyingCard] = useState(false);
  const confidenceLabel = signal.confidenceTag || classifyConfidence(signal.confidence);
  const modelLabel = formatModelName(signal.provenance?.model);
  const candleProvenance = signal.provenance?.candles || null;
  const candleScore = formatConfidenceScore(candleProvenance?.confidenceScore);
  const isAI = (signal.provenance?.model || '').startsWith('openai');
  
  const typeColors = {
    bullish: { 
      bg: 'from-green-500/20 via-green-500/10 to-emerald-500/5', 
      border: 'border-green-500/40 hover:border-green-400/60', 
      text: 'text-green-400', 
      badge: 'bg-green-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(34,197,94,0.3)]',
      icon: '📈'
    },
    bearish: { 
      bg: 'from-red-500/20 via-red-500/10 to-rose-500/5', 
      border: 'border-red-500/40 hover:border-red-400/60', 
      text: 'text-red-400', 
      badge: 'bg-red-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(239,68,68,0.3)]',
      icon: '📉'
    },
    neutral: { 
      bg: 'from-yellow-500/20 via-yellow-500/10 to-amber-500/5', 
      border: 'border-yellow-500/40 hover:border-yellow-400/60', 
      text: 'text-yellow-400', 
      badge: 'bg-yellow-500/30',
      glow: 'hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]',
      icon: '➡️'
    },
  };
  
  const colors = typeColors[signal.type];
  const priceVsSma20 = signal.indicators?.priceVsSma20;
  const priceVsSma50 = signal.indicators?.priceVsSma50;
  const hasSma20 = typeof priceVsSma20 === 'number';
  const hasSma50 = typeof priceVsSma50 === 'number';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1, type: 'spring', stiffness: 100 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className={`
        relative backdrop-blur-xl bg-gradient-to-br ${colors.bg}
        border-2 ${colors.border}
        rounded-2xl overflow-hidden
        transition-all duration-300
        ${colors.glow}
      `}
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
      
      <div 
        className="p-6 cursor-pointer relative z-10"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <motion.div 
              className={`w-14 h-14 rounded-2xl ${colors.badge} flex items-center justify-center border ${colors.border}`}
              animate={{ rotate: signal.type === 'bullish' ? [0, 5, 0] : signal.type === 'bearish' ? [0, -5, 0] : 0 }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-2xl">{colors.icon}</span>
            </motion.div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">{signal.symbol}</span>
                <motion.span 
                  className={`text-xs px-3 py-1 rounded-full ${colors.badge} ${colors.text} font-semibold border ${colors.border}`}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {signal.type.toUpperCase()}
                </motion.span>
              </div>
              <p className="text-gray-400 text-sm mt-1">{signal.name}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-400 text-sm">Signal Score</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${confidenceColors[confidenceLabel]}`}>
                {confidenceLabel.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-3 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full rounded-full ${signal.confidence >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : signal.confidence >= 60 ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${signal.confidence}%` }}
                  transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                />
              </div>
              <span className={`text-xl font-bold ${signal.confidence >= 80 ? 'text-green-400' : signal.confidence >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {signal.confidence}%
              </span>
            </div>
            {typeof signal.rawConfidence === 'number' && signal.rawConfidence !== signal.confidence && (
              <p className="text-gray-500 text-[11px] mt-1">Adj. from {Math.round(signal.rawConfidence)}%</p>
            )}
            <p className="text-gray-500 text-xs mt-2 font-medium">{signal.pattern}</p>
            {candleProvenance && (
              <p className="text-gray-500 text-[11px] mt-1">
                Data: {candleProvenance.source} · {candleProvenance.confidence || 'unknown'}{candleScore ? ` (${candleScore})` : ''}
              </p>
            )}
          </div>
        </div>
        
        {/* Price targets with visual bars */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Entry</p>
            <p className="text-white font-bold text-lg">${signal.entry.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
            <p className="text-green-400 text-xs mb-1 uppercase tracking-wide">Target</p>
            <p className="text-green-400 font-bold text-lg">${signal.target.toFixed(2)}</p>
            <p className="text-green-400/60 text-xs">+{((signal.target - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <p className="text-red-400 text-xs mb-1 uppercase tracking-wide">Stop Loss</p>
            <p className="text-red-400 font-bold text-lg">${signal.stopLoss.toFixed(2)}</p>
            <p className="text-red-400/60 text-xs">{((signal.stopLoss - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <p className="text-cyan-400 text-xs mb-1 uppercase tracking-wide">Risk/Reward</p>
            <p className="text-cyan-400 font-bold text-lg">{signal.riskReward.toFixed(2)}:1</p>
            <p className="text-cyan-400/60 text-xs">{signal.riskReward >= 2 ? 'Excellent' : signal.riskReward >= 1.5 ? 'Good' : 'Fair'}</p>
          </div>
        </div>
        
        {/* Indicators if available */}
        {signal.indicators && (
          <div className="flex gap-4 mb-4 text-xs">
            <div className={`px-3 py-1 rounded-full ${signal.indicators.rsi !== null && signal.indicators.rsi < 30 ? 'bg-green-500/20 text-green-400' : signal.indicators.rsi !== null && signal.indicators.rsi > 70 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
              RSI: {signal.indicators.rsi !== null ? signal.indicators.rsi.toFixed(1) : '—'}
            </div>
            <div className={`px-3 py-1 rounded-full ${hasSma20 ? (priceVsSma20! > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-gray-500/20 text-gray-400'}`}>
              vs SMA20: {hasSma20 ? `${priceVsSma20! > 0 ? '+' : ''}${priceVsSma20!.toFixed(1)}%` : '—'}
            </div>
            <div className={`px-3 py-1 rounded-full ${hasSma50 ? (priceVsSma50! > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-gray-500/20 text-gray-400'}`}>
              vs SMA50: {hasSma50 ? `${priceVsSma50! > 0 ? '+' : ''}${priceVsSma50!.toFixed(1)}%` : '—'}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">⏱️ Timeframe: {signal.timeframe}</span>
          <motion.span 
            className={`${colors.text} flex items-center gap-1 font-medium`}
            animate={{ x: expanded ? 0 : [0, 3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {expanded ? '▲ Hide Explanation' : '▼ Show Explanation'}
          </motion.span>
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t-2 border-white/10 overflow-hidden"
          >
            <div className="p-6 bg-gradient-to-br from-cyan-500/10 to-purple-500/10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🧭</span>
                </div>
                <div className="flex-1">
                  <p className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-bold text-lg mb-2">
                    {isAI ? 'AI Explanation' : 'Rule-based Explanation'}
                  </p>
                  <p className="text-gray-300 leading-relaxed text-sm">{signal.reasoning}</p>
                </div>
              </div>

              {signal.provenance && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4 text-xs">
                  {modelLabel && (
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300">
                      Model: {modelLabel}
                    </div>
                  )}
                  {signal.provenance.quoteSource && (
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300">
                      Quote: {signal.provenance.quoteSource}
                    </div>
                  )}
                  {candleProvenance && (
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300">
                      Candles: {candleProvenance.source} · {candleProvenance.confidence || 'unknown'}{candleScore ? ` (${candleScore})` : ''}
                    </div>
                  )}
                </div>
              )}
              
                              <div className="flex flex-col gap-3 mt-6">
                                <div className="flex gap-3">
                                <motion.button 
                                  whileHover={{ scale: isAddingToWatchlist ? 1 : 1.02 }}
                                  whileTap={{ scale: isAddingToWatchlist ? 1 : 0.98 }}
                                  disabled={isAddingToWatchlist}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAddingToWatchlist(true);
                                    onAddToWatchlist(signal.symbol);
                                    setTimeout(() => setIsAddingToWatchlist(false), 1000);
                                  }}
                                  className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                                    isAddingToWatchlist 
                                      ? 'bg-gray-600 cursor-not-allowed' 
                                      : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/30'
                                  }`}
                                >
                                  {isAddingToWatchlist ? '✓ Added!' : '📋 Add to Watchlist'}
                                </motion.button>
                                <motion.button 
                                  whileHover={{ scale: isPaperTrading ? 1 : 1.02 }}
                                  whileTap={{ scale: isPaperTrading ? 1 : 0.98 }}
                                  disabled={isPaperTrading}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsPaperTrading(true);
                                    onPaperTrade(signal);
                                    setTimeout(() => setIsPaperTrading(false), 1500);
                                  }}
                                  className={`flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                                    isPaperTrading 
                                      ? 'bg-gray-600 cursor-not-allowed' 
                                      : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:shadow-green-500/30'
                                  }`}
                                >
                                  {isPaperTrading ? '⏳ Opening...' : '📊 Paper Trade'}
                                </motion.button>
                                </div>
                                <motion.button
                                  whileHover={{ scale: isGuidedFlow ? 1 : 1.02 }}
                                  whileTap={{ scale: isGuidedFlow ? 1 : 0.98 }}
                                  disabled={isGuidedFlow}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setIsGuidedFlow(true);
                                    try {
                                      await onStartGuidedFlow(signal);
                                    } finally {
                                      setIsGuidedFlow(false);
                                    }
                                  }}
                                  className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                                    isGuidedFlow
                                      ? 'bg-gray-600 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:shadow-lg hover:shadow-purple-500/30'
                                  }`}
                                >
                                  {isGuidedFlow ? '⏳ Starting...' : '🧭 Start Guided Flow'}
                                </motion.button>
                                {/* Phase 7.4: Apply Decision Card */}
                                <motion.button
                                  whileHover={{ scale: isApplyingCard || cardBalance < 1 ? 1 : 1.02 }}
                                  whileTap={{ scale: isApplyingCard || cardBalance < 1 ? 1 : 0.98 }}
                                  disabled={isApplyingCard || cardBalance < 1}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setIsApplyingCard(true);
                                    try {
                                      await onApplyCard(signal);
                                    } finally {
                                      setIsApplyingCard(false);
                                    }
                                  }}
                                  className={`w-full py-3 rounded-xl text-white font-semibold text-sm transition-all ${
                                    isApplyingCard || cardBalance < 1
                                      ? 'bg-gray-600 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:shadow-lg hover:shadow-indigo-500/30'
                                  }`}
                                >
                                {isApplyingCard ? '⏳ Applying...' : cardBalance < 1 ? '🎴 No Cards Left' : `🎴 Apply Decision Card (${cardBalance} left)`}
                                </motion.button>
                                {/* UDM v2: Universal Decision Matrix */}
                                <motion.button
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenUdm(signal.symbol);
                                  }}
                                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:shadow-lg hover:shadow-purple-500/30"
                                >
                                  🧬 UDM v2 Analysis
                                </motion.button>
                                {/* Phase 6.1: Direct thesis generation link */}
                                <Link
                                  href={`/dashboard/thesis?symbol=${signal.symbol}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full py-3 rounded-xl text-white font-semibold text-sm text-center transition-all bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-lg hover:shadow-amber-500/30"
                                >
                                  💡 Generate Thesis
                                </Link>
                              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Scanning progress component
function ScanProgress({ status, mode }: { status: ScanStatus; mode: 'ai' | 'deterministic' }) {
  const isAI = mode === 'ai';
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent"
          />
          <div>
            <p className="text-white font-semibold">{isAI ? 'Running AI screener...' : 'Running deterministic fallback...'}</p>
            <p className="text-gray-400 text-sm">
              Analyzing {status.totalCount} stocks with {isAI ? 'AI + market data' : 'rule-based'} signals
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-cyan-400 font-bold text-2xl">{status.foundSignals}</p>
          <p className="text-gray-400 text-xs">Signals Found</p>
        </div>
      </div>
      
      <div className="relative h-4 bg-white/10 rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-60 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>Universe: {status.totalCount} symbols</span>
        <span>Awaiting results…</span>
      </div>
    </motion.div>
  );
}

export default function ScreenerPage() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [scanSource, setScanSource] = useState<'ai' | 'deterministic' | null>(null);
  const [scanMode, setScanMode] = useState<'ai' | 'deterministic'>('ai');
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    scanning: false,
    progress: 0,
    scannedCount: 0,
    totalCount: 0,
    foundSignals: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [paperStats, setPaperStats] = useState<PaperTradeStats | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [alpacaStatus, setAlpacaStatus] = useState<{
    connected: boolean;
    environment?: 'paper' | 'live';
    liveTradingEnabled?: boolean;
  } | null>(null);
  const [settings, setSettings] = useState({
    maxStocks: 50,
    minConfidence: 65,
    signalType: 'all' as 'all' | 'bullish' | 'bearish',
  });
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [guidedFlow, setGuidedFlow] = useState<GuidedFlowState | null>(null);
  const [guidedSignal, setGuidedSignal] = useState<Signal | null>(null);
  const [guidedStep, setGuidedStep] = useState(0);
  const [guidedLoading, setGuidedLoading] = useState(false);
  const [guidedError, setGuidedError] = useState<string | null>(null);
  const [paperTrade, setPaperTrade] = useState<PaperTrade | null>(null);
  const [paperTradeError, setPaperTradeError] = useState<string | null>(null);
  const [paperTradeLoading, setPaperTradeLoading] = useState(false);
  // Phase 7.4: Decision Cards state
  const [cardBalance, setCardBalance] = useState<number>(0);
  const [cardRun, setCardRun] = useState<{ runId: string; snapshot: any; sim: any; costs: any; tradeoffs: string[] } | null>(null);
  const [isConfirmingCard, setIsConfirmingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  // UDM v2: Universal Decision Matrix state
  const [udmSymbol, setUdmSymbol] = useState<string | null>(null);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };
  const formatQuotaValue = (value?: number) => {
    if (value === undefined || value === null) return '—';
    return value === -1 ? '∞' : value;
  };
  const formatPrice = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `$${value.toFixed(2)}`;
  };

  const loadPaperStats = useCallback(async () => {
    setPaperError(null);
    const res = await api.getPaperTrades();
    if (res.success && res.data?.stats) {
      setPaperStats(res.data.stats as PaperTradeStats);
      return;
    }
    setPaperStats(null);
    setPaperError(res.error?.message || 'Paper trade stats unavailable');
  }, []);

  const loadAlpacaStatus = useCallback(async () => {
    const res = await api.getAlpacaStatus();
    if (res.success && res.data) {
      setAlpacaStatus({
        connected: res.data.connected,
        environment: res.data.environment,
        liveTradingEnabled: res.data.liveTradingEnabled,
      });
      return;
    }
    setAlpacaStatus(null);
  }, []);
  const loadUsage = useCallback(async () => {
    setUsageError(null);
    const res = await api.getUsage();
    if (res.success && res.data) {
      setUsage(res.data as UsageSnapshot);
      return;
    }
    setUsage(null);
    setUsageError(res.error?.message || 'Usage unavailable');
  }, []);

  const resetGuidedFlow = useCallback(() => {
    setGuidedFlow(null);
    setGuidedSignal(null);
    setGuidedStep(0);
    setGuidedError(null);
    setPaperTrade(null);
    setPaperTradeError(null);
    setPaperTradeLoading(false);
  }, []);

  const handleStartGuidedFlow = useCallback(async (signal: Signal) => {
    setGuidedLoading(true);
    setGuidedError(null);
    setPaperTrade(null);
    setPaperTradeError(null);
    setGuidedSignal(signal);
    setGuidedStep(0);

    try {
      const result = await api.startGuidedFlow({
        signal: {
          symbol: signal.symbol,
          type: signal.type,
          direction: signal.type === 'bearish' ? 'SHORT' : 'LONG',
          entry: signal.entry,
          target: signal.target,
          stopLoss: signal.stopLoss,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
          pattern: signal.pattern,
          timeframe: signal.timeframe,
          indicators: signal.indicators,
        },
      });

      if (result.success && result.data?.flow) {
        setGuidedFlow(result.data.flow as GuidedFlowState);
        await loadUsage();
      } else {
        setGuidedFlow(null);
        setGuidedError(result.error?.message || 'Guided flow failed');
      }
    } catch (err) {
      setGuidedFlow(null);
      setGuidedError((err as Error).message || 'Guided flow failed');
    } finally {
      setGuidedLoading(false);
    }
  }, [loadUsage]);

  const handleGuidedPaperTrade = useCallback(async () => {
    if (!guidedFlow?.thesis) return;
    setPaperTradeLoading(true);
    setPaperTradeError(null);

    try {
      const thesisResult = await api.createThesis({
        symbol: guidedFlow.thesis.symbol,
        entryPrice: guidedFlow.thesis.entryPrice,
        targetPrice: guidedFlow.thesis.targetPrice,
        stopLoss: guidedFlow.thesis.stopLoss,
        direction: guidedFlow.thesis.signal,
        confidence: guidedFlow.thesis.confidence,
        reasoning: guidedFlow.thesis.reasoning,
        decisionCardId: guidedFlow.decisionCard?.id,
      });

      if (!thesisResult.success || !thesisResult.data?.thesis) {
        setPaperTradeError(thesisResult.error?.message || 'Failed to create thesis');
        return;
      }

      const tradeResult = await api.createPaperTrade(thesisResult.data.thesis.id, 10);
      if (tradeResult.success && tradeResult.data?.trade) {
        setPaperTrade(tradeResult.data.trade as PaperTrade);
        loadPaperStats();
      } else {
        setPaperTradeError(tradeResult.error?.message || 'Failed to open paper trade');
      }
    } catch (err) {
      setPaperTradeError((err as Error).message || 'Paper trade failed');
    } finally {
      setPaperTradeLoading(false);
    }
  }, [guidedFlow, loadPaperStats]);

  // Fetch real signals from the backend
  const runScan = useCallback(async () => {
    setScanStatus(s => ({ ...s, scanning: true, progress: 0, scannedCount: 0, foundSignals: 0, totalCount: settings.maxStocks }));
    setSignals(null);
    setError(null);
    setSaveState('idle');
    setSavedReportId(null);
    setScanSource(null);
    setScanMode('ai');

    const finalizeSuccess = (results: Signal[], scannedAt?: string, source?: 'ai' | 'deterministic') => {
      setSignals(results);
      setScanSource(source || null);
      setLastScan(scannedAt || new Date().toISOString());
      setScanStatus(s => ({
        ...s,
        scanning: false,
        progress: 100,
        scannedCount: s.totalCount,
        foundSignals: results.length,
      }));
    };
    
    try {
      const ai = await api.runAIScreener({
        maxStocks: settings.maxStocks,
        minConfidence: settings.minConfidence,
        signalType: settings.signalType,
      });

      if (ai.success && ai.data?.signals) {
        const normalized = normalizeSignals(ai.data.signals, 'ai');
        finalizeSuccess(normalized, ai.data.scannedAt, 'ai');
        return;
      }
      throw new Error(ai.error?.message || 'AI screener unavailable');
    } catch (err) {
      setScanMode('deterministic');
      try {
        const fallback = await api.runScreener({
          maxSymbols: settings.maxStocks,
          minConfidence: settings.minConfidence,
          signalType: settings.signalType,
        });

        if (fallback.success && fallback.data?.signals) {
          const normalized = normalizeSignals(fallback.data.signals, 'deterministic');
          finalizeSuccess(normalized, fallback.data.scannedAt, 'deterministic');
          return;
        }
        throw new Error(fallback.error?.message || 'Scan failed');
      } catch (fallbackErr) {
        setError((fallbackErr as Error).message);
        setSignals(null);
        setScanStatus(s => ({ ...s, scanning: false, progress: 0, scannedCount: 0, foundSignals: 0 }));
      }
    }
  }, [settings]);

  const handleSaveReport = useCallback(async () => {
    if (!signals || signals.length === 0) return;
    setSaveState('saving');
    setError(null);

    const reportName = `Scan ${new Date().toLocaleString('en-US')}`;
    const result = await api.saveScreenerReport({
      name: reportName,
      signals,
      settings,
      scannedAt: lastScan || new Date().toISOString(),
    });

    if (result.success && result.data) {
      setSaveState('saved');
      setSavedReportId(result.data.reportId);
    } else {
      setSaveState('error');
      setError(result.error?.message || 'Failed to save scan');
    }
  }, [signals, settings, lastScan]);

  // Initial load — do NOT auto-scan; user clicks "Run AI Scan" explicitly
  useEffect(() => {
    loadPaperStats();
    loadAlpacaStatus();
    loadUsage();
    loadCardWallet();
  }, []);

  // Handler for adding signal to watchlist
  const handleAddToWatchlist = useCallback(async (symbol: string) => {
    try {
      const result = await api.addToWatchlist('default', symbol);
      if (result.success) {
        console.log(`Added ${symbol} to watchlist`);
      }
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
    }
  }, []);

  // Handler for opening paper trade from signal
  const handlePaperTrade = useCallback(async (signal: Signal) => {
    try {
      const result = await api.createPaperTradeFromSignal({
        symbol: signal.symbol,
        type: signal.type as 'bullish' | 'bearish',
        entry: signal.entry,
        target: signal.target,
        stopLoss: signal.stopLoss,
      }, 10);
      if (result.success) {
        console.log(`Opened paper trade for ${signal.symbol}`);
        loadPaperStats();
        // Could show a toast notification here
      }
    } catch (err) {
      console.error('Failed to open paper trade:', err);
    }
  }, [loadPaperStats]);

  // Phase 7.4: Load card wallet balance
  const loadCardWallet = useCallback(async () => {
    try {
      const result = await api.getCardWallet();
      if (result.success && result.data) {
        setCardBalance(result.data.balance ?? 0);
      }
    } catch (err) {
      console.error('Failed to load card wallet:', err);
    }
  }, []);

  // Phase 7.4: Apply decision card (create draft run)
  const handleApplyCard = useCallback(async (signal: Signal) => {
    setCardError(null);
    try {
      const result = await api.applyCard({
        symbol: signal.symbol,
        strategyId: (signal as any).strategyId || 'momentum_breakout',
      });
      if (result.success && result.data) {
        setCardRun({
          runId: result.data.runId,
          snapshot: result.data.snapshot,
          sim: result.data.sim,
          costs: result.data.costs,
          tradeoffs: result.data.tradeoffs || [],
        });
      } else {
        setCardError(result.error?.message || 'Failed to apply card');
      }
    } catch (err) {
      setCardError((err as Error).message || 'Failed to apply card');
    }
  }, []);

  // Phase 7.4: Confirm card (consume and create paper execution)
  const handleConfirmCard = useCallback(async (runId: string) => {
    setIsConfirmingCard(true);
    setCardError(null);
    try {
      const result = await api.confirmCard({ runId });
      if (result.success && result.data) {
        setCardBalance(result.data.balance ?? cardBalance - 1);
        setCardRun(null);
        loadPaperStats();
        // Could show success toast
      } else {
        setCardError(result.error?.message || 'Failed to confirm card');
      }
    } catch (err) {
      setCardError((err as Error).message || 'Failed to confirm card');
    } finally {
      setIsConfirmingCard(false);
    }
  }, [cardBalance, loadPaperStats]);

  const liveTradingAllowed = !!(alpacaStatus?.connected && alpacaStatus.environment === 'live' && alpacaStatus.liveTradingEnabled);
  const executionModeLabel = liveTradingAllowed ? 'LIVE' : 'PAPER';
  const executionModeDescription = !alpacaStatus
    ? 'Alpaca status unavailable.'
    : !alpacaStatus.connected
      ? 'Connect Alpaca to unlock live execution.'
      : alpacaStatus.environment !== 'live'
        ? 'Switch Alpaca to live environment to enable execution.'
        : alpacaStatus.liveTradingEnabled
          ? 'Live execution is enabled.'
          : 'Live trading disabled by policy (FEATURE_LIVE_TRADING=false).';
  const guidedSteps = ['Thesis', 'Decision', 'Paper Result', 'Review'];
  const canAdvanceGuided = guidedStep < 2 || (guidedStep === 2 && !!paperTrade);

  return (
    <DashboardLayout>
      {/* UDM v2: Reality Guardrail Banner */}
      <RealityBanner />
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"
        >
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              AI <GradientText>Screener</GradientText>
            </h1>
            <p className="text-gray-400">
              AI-first market screening across {settings.maxStocks}+ symbols with provenance-tagged signals
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {error && (
              <span className="text-yellow-400 text-sm">⚠️ Unavailable</span>
            )}
            {scanSource === 'deterministic' && (
              <span className="text-yellow-300 text-sm">Fallback active</span>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-400 text-sm font-medium">
                {scanSource === 'deterministic' ? 'Deterministic Fallback' : 'AI Signals'}
              </span>
            </div>
            {/* Phase 7.4: Card Balance */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30">
              <span className="text-xl">🎴</span>
              <span className="text-indigo-300 text-sm font-medium">
                {cardBalance} Card{cardBalance !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Execution Mode + Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Execution Mode</p>
                <p className="text-white font-semibold mt-1">{executionModeLabel} Trading</p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full border ${liveTradingAllowed ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10'}`}>
                {executionModeLabel}
              </span>
            </div>
            <p className="text-gray-400 text-sm">{executionModeDescription}</p>
            {!alpacaStatus?.connected && (
              <Link
                href="/dashboard/settings"
                className="inline-flex mt-4 px-3 py-2 text-xs rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              >
                Connect Alpaca
              </Link>
            )}
          </div>

          <div className="lg:col-span-2 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Paper Performance</p>
                <p className="text-white font-semibold mt-1">Paper trading results</p>
              </div>
              <button
                onClick={loadPaperStats}
                className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-300 hover:border-cyan-500/50"
              >
                Refresh
              </button>
            </div>

            {paperStats ? (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Total Trades</p>
                  <p className="text-white font-semibold">{paperStats.totalTrades}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Open</p>
                  <p className="text-white font-semibold">{paperStats.openTrades}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Win Rate</p>
                  <p className="text-white font-semibold">{paperStats.winRate}%</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Total P&L</p>
                  <p className={`font-semibold ${paperStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(paperStats.totalPnl)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Max Drawdown</p>
                  <p className="text-white font-semibold">{paperStats.maxDrawdown.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Avg Slippage</p>
                  <p className="text-white font-semibold">{paperStats.avgSlippageBps.toFixed(2)} bps</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">{paperError || 'Loading paper trade stats…'}</p>
            )}
          </div>
        </div>

        {/* Plan Usage */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Plan Usage</p>
              <p className="text-white font-semibold mt-1">{usage?.plan || '—'} Plan</p>
            </div>
            {usage?.upgradeUrl && usage?.plan === 'FREE' && (
              <Link
                href={usage.upgradeUrl}
                className="inline-flex px-3 py-2 text-xs rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              >
                Upgrade
              </Link>
            )}
          </div>

          {usage ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Decision Cards</p>
                <p className="text-white font-semibold">
                  {formatQuotaValue(usage.remaining?.decisionCards)} / {formatQuotaValue(usage.limits?.daily_decision_cards)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Sim Runs</p>
                <p className="text-white font-semibold">
                  {formatQuotaValue(usage.remaining?.backtest)} / {formatQuotaValue(usage.limits?.daily_backtests)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Analytics Depth</p>
                <p className="text-white font-semibold">{formatQuotaValue(usage.analyticsDepth)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Mode</p>
                <p className="text-white font-semibold">{usage.analyticsDepth > 0 ? 'Full' : 'Summary-only'}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">{usageError || 'Loading usage…'}</p>
          )}
        </div>

        {/* Guided Workflow */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Guided Workflow</p>
              <p className="text-white font-semibold mt-1">Scan → Thesis → Decision → Paper Result → Review</p>
              {guidedSignal && (
                <p className="text-xs text-gray-500 mt-1">Active signal: {guidedSignal.symbol} ({guidedSignal.type.toUpperCase()})</p>
              )}
            </div>
            {guidedFlow && (
              <button
                onClick={resetGuidedFlow}
                className="px-3 py-2 text-xs rounded-lg border border-gray-700 text-gray-200 hover:border-cyan-500/50"
              >
                Reset Flow
              </button>
            )}
          </div>

          {guidedError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              {guidedError}
            </div>
          )}

          {guidedLoading && (
            <p className="text-gray-400 text-sm">Starting guided flow…</p>
          )}

          {!guidedLoading && !guidedFlow && (
            <p className="text-gray-400 text-sm">Select a signal and click “Start Guided Flow” to begin.</p>
          )}

          {guidedFlow && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {guidedSteps.map((step, idx) => {
                  const isActive = guidedStep === idx;
                  const isComplete = guidedStep > idx;
                  return (
                    <button
                      key={step}
                      onClick={() => setGuidedStep(idx)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition ${
                        isActive
                          ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200'
                          : isComplete
                            ? 'border-green-500/40 bg-green-500/10 text-green-200'
                            : 'border-gray-700 text-gray-300'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        isComplete ? 'bg-green-500/30 text-green-200' : isActive ? 'bg-cyan-500/30 text-cyan-200' : 'bg-gray-700/40 text-gray-300'
                      }`}>
                        {idx + 1}
                      </span>
                      {step}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                {guidedStep === 0 && (
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-white/5">
                        <p className="text-gray-500 text-xs">Entry</p>
                        <p className="text-white font-semibold">{formatPrice(guidedFlow.thesis?.entryPrice)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                        <p className="text-green-300 text-xs">Target</p>
                        <p className="text-green-300 font-semibold">{formatPrice(guidedFlow.thesis?.targetPrice)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                        <p className="text-red-300 text-xs">Stop</p>
                        <p className="text-red-300 font-semibold">{formatPrice(guidedFlow.thesis?.stopLoss)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                        <p className="text-cyan-300 text-xs">R/R</p>
                        <p className="text-cyan-300 font-semibold">{guidedFlow.thesis?.riskRewardRatio ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Signal: {guidedFlow.thesis?.signal || '—'}</span>
                      <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Confidence: {guidedFlow.thesis?.confidence ?? '—'}%</span>
                      {guidedFlow.thesis?.expiresAt && (
                        <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Expires {new Date(guidedFlow.thesis.expiresAt).toLocaleString()}</span>
                      )}
                    </div>
                    {guidedFlow.thesis?.reasoning?.length ? (
                      <div className="text-xs text-gray-400">
                        <p className="text-gray-500 mb-1">Reasoning</p>
                        <ul className="list-disc list-inside space-y-1">
                          {guidedFlow.thesis.reasoning.map((reason: string, idx: number) => (
                            <li key={`${reason}-${idx}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No reasoning provided.</p>
                    )}
                  </div>
                )}

                {guidedStep === 1 && (
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Decision Card</span>
                      <span className="text-white">{guidedFlow.decisionCard?.id || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Status</span>
                      <span className="text-white">{guidedFlow.decisionCard?.status || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Execution Gate</span>
                      <span className="text-white">{guidedFlow.gate?.mode?.toUpperCase?.() || '—'}</span>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-1">Gate Reasons</p>
                      {guidedFlow.gate?.reasons?.length ? (
                        <ul className="list-disc list-inside text-xs text-gray-300 space-y-1">
                          {guidedFlow.gate.reasons.map((reason: string) => (
                            <li key={reason}>{reason.replace(/_/g, ' ')}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">No gate constraints.</p>
                      )}
                    </div>
                    {guidedFlow.analytics?.locked && (
                      <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                        Analytics locked: {guidedFlow.analytics?.reason || 'Upgrade to unlock full analytics.'}
                      </div>
                    )}
                  </div>
                )}

                {guidedStep === 2 && (
                  <div className="space-y-3 text-sm text-gray-300">
                    {paperTrade ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-white/5">
                          <p className="text-gray-500 text-xs">Status</p>
                          <p className="text-white font-semibold">{paperTrade.status}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/5">
                          <p className="text-gray-500 text-xs">Entry</p>
                          <p className="text-white font-semibold">{formatPrice(paperTrade.entryPrice)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/5">
                          <p className="text-gray-500 text-xs">P&amp;L</p>
                          <p className={`font-semibold ${typeof paperTrade.pnl === 'number' && paperTrade.pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {typeof paperTrade.pnl === 'number' ? paperTrade.pnl.toFixed(2) : '—'}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/5">
                          <p className="text-gray-500 text-xs">Return</p>
                          <p className={`font-semibold ${typeof paperTrade.pnlPercent === 'number' && paperTrade.pnlPercent >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {typeof paperTrade.pnlPercent === 'number' ? `${paperTrade.pnlPercent.toFixed(2)}%` : '—'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-gray-400 text-sm">Run a paper execution to capture observed outcomes for this decision card.</p>
                        <button
                          onClick={handleGuidedPaperTrade}
                          disabled={paperTradeLoading}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${paperTradeLoading ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'}`}
                        >
                          {paperTradeLoading ? 'Executing…' : '📊 Paper Execute'}
                        </button>
                      </div>
                    )}
                    {paperTradeError && (
                      <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                        {paperTradeError}
                      </div>
                    )}
                  </div>
                )}

                {guidedStep === 3 && (
                  <div className="space-y-4">
                    <TrustPanel
                      title="Guided Review"
                      gate={guidedFlow.gate}
                      integrity={guidedFlow.thesis?.dataIntegrity || null}
                      strategy={guidedFlow.decisionCard?.score?.strategy}
                      expectedValue={guidedFlow.decisionCard?.score?.expectedValue ?? null}
                      observedReturn={paperTrade?.pnlPercent ?? null}
                      observedPnl={paperTrade?.pnl ?? null}
                      analyticsDepth={guidedFlow.analytics?.depth}
                      analyticsLocked={guidedFlow.analytics?.locked}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setGuidedStep((prev) => Math.max(0, prev - 1))}
                  disabled={guidedStep === 0}
                  className={`px-4 py-2 rounded-lg text-xs border ${guidedStep === 0 ? 'border-gray-700 text-gray-500 cursor-not-allowed' : 'border-gray-600 text-gray-200 hover:border-cyan-500/50'}`}
                >
                  Back
                </button>
                <button
                  onClick={() => setGuidedStep((prev) => Math.min(guidedSteps.length - 1, prev + 1))}
                  disabled={!canAdvanceGuided || guidedStep === guidedSteps.length - 1}
                  className={`px-4 py-2 rounded-lg text-xs border ${!canAdvanceGuided || guidedStep === guidedSteps.length - 1 ? 'border-gray-700 text-gray-500 cursor-not-allowed' : 'border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/10'}`}
                >
                  {guidedStep === guidedSteps.length - 1 ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Scan Controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Stocks to Scan</label>
              <select 
                value={settings.maxStocks}
                onChange={(e) => setSettings(s => ({ ...s, maxStocks: Number(e.target.value) }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value={20}>20 Stocks</option>
                <option value={50}>50 Stocks</option>
                <option value={100}>100 Stocks</option>
                <option value={200}>200 Stocks</option>
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Min Confidence</label>
              <select 
                value={settings.minConfidence}
                onChange={(e) => setSettings(s => ({ ...s, minConfidence: Number(e.target.value) }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value={50}>50%+</option>
                <option value={65}>65%+</option>
                <option value={75}>75%+</option>
                <option value={85}>85%+</option>
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Signal Type</label>
              <select 
                value={settings.signalType}
                onChange={(e) => setSettings(s => ({ ...s, signalType: e.target.value as 'all' | 'bullish' | 'bearish' }))}
                className="bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
              >
                <option value="all">All Signals</option>
                <option value="bullish">Bullish Only</option>
                <option value="bearish">Bearish Only</option>
              </select>
            </div>
            
            <motion.button 
              onClick={runScan}
              disabled={scanStatus.scanning}
              whileHover={{ scale: scanStatus.scanning ? 1 : 1.02 }}
              whileTap={{ scale: scanStatus.scanning ? 1 : 0.98 }}
              className={`
                px-8 py-3 rounded-xl font-semibold text-sm transition-all ml-auto
                ${scanStatus.scanning 
                  ? 'bg-cyan-500/30 text-cyan-300 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/30'
                }
              `}
            >
              {scanStatus.scanning ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >⟳</motion.span>
                  Scanning...
                </span>
              ) : (
                '🧠 Run AI Scan'
              )}
            </motion.button>

            <motion.button
              onClick={handleSaveReport}
              disabled={scanStatus.scanning || !signals || signals.length === 0 || saveState === 'saving'}
              whileHover={{ scale: scanStatus.scanning ? 1 : 1.02 }}
              whileTap={{ scale: scanStatus.scanning ? 1 : 0.98 }}
              className={`
                px-6 py-3 rounded-xl font-semibold text-sm transition-all
                ${scanStatus.scanning || !signals || signals.length === 0
                  ? 'bg-gray-700/40 text-gray-400 cursor-not-allowed'
                  : saveState === 'saved'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-900 border border-gray-700 text-white hover:border-cyan-500/50'}
              `}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save Scan'}
            </motion.button>
          </div>
        </motion.div>
        
        {/* Scan Progress */}
        {scanStatus.scanning && <ScanProgress status={scanStatus} mode={scanMode} />}
        
        {/* Signals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              Signals <span className="text-cyan-400">({signals === null ? '—' : signals.length})</span>
            </h2>
            {lastScan && (
              <span className="text-gray-500 text-sm">
                Last scan: {new Date(lastScan).toLocaleTimeString()}
              </span>
            )}
          </div>
          {saveState === 'saved' && savedReportId && (
            <div className="text-xs text-green-400">
              Saved report ID: {savedReportId}
            </div>
          )}
          
          {signals === null ? (
            <div className="text-center py-16 text-gray-400">
              {scanStatus.scanning ? (
                <>
                  <p className="text-4xl mb-4">🔎</p>
                  <p className="mb-4">Scanning…</p>
                </>
              ) : error ? (
                <>
                  <p className="text-4xl mb-4">⚠️</p>
                  <p className="mb-4">Scan failed — {error}</p>
                  <motion.button
                    onClick={runScan}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold text-sm"
                  >
                    Retry Scan
                  </motion.button>
                </>
              ) : (
                <>
                  <p className="text-5xl mb-4">🧠</p>
                  <p className="text-xl font-semibold text-white mb-2">Ready to Scan</p>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    Configure your filters above, then hit Run AI Scan to analyze {settings.maxStocks}+ stocks for trading signals.
                  </p>
                  <motion.button
                    onClick={runScan}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-lg hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    🧠 Run AI Scan Now
                  </motion.button>
                </>
              )}
            </div>
          ) : signals.length === 0 && !scanStatus.scanning ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-4">🔍</p>
              <p>No signals found. Try adjusting your filters or run a new scan.</p>
            </div>
          ) : (
            signals.map((signal, i) => (
              <SignalCard 
                key={`${signal.symbol}-${i}`} 
                signal={signal} 
                index={i}
                onAddToWatchlist={handleAddToWatchlist}
                onPaperTrade={handlePaperTrade}
                onStartGuidedFlow={handleStartGuidedFlow}
                onApplyCard={handleApplyCard}
                onOpenUdm={(symbol) => setUdmSymbol(symbol)}
                cardBalance={cardBalance}
              />
            ))
          )}
        </div>
        
        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="backdrop-blur-xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-6"
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <p className="text-yellow-400 font-bold text-lg mb-2">Not Financial Advice</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                AI signals are for educational and informational purposes only. NovaNexus AI is not a registered investment advisor. 
                Always do your own research, consult with a qualified financial advisor, and never invest more than you can afford to lose. 
                Past performance does not guarantee future results. Trading involves substantial risk of loss.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Phase 7.4: Decision Card Modal */}
      {cardRun && (
        <DecisionCardModal
          run={cardRun}
          onClose={() => setCardRun(null)}
          onConfirm={handleConfirmCard}
          isConfirming={isConfirmingCard}
        />
      )}

      {/* Card Error Toast */}
      {cardError && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl bg-red-500/90 text-white text-sm shadow-lg">
          {cardError}
          <button onClick={() => setCardError(null)} className="ml-3 font-bold">×</button>
        </div>
      )}

      {/* UDM v2: Universal Decision Matrix Panel */}
      {udmSymbol && (
        <UdmDecisionPanel
          symbol={udmSymbol}
          domain="stocks"
          onClose={() => setUdmSymbol(null)}
          onConfirm={(runId, executionId) => {
            console.log('UDM confirmed:', runId, executionId);
            setUdmSymbol(null);
          }}
        />
      )}
      
      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </DashboardLayout>
  );
}

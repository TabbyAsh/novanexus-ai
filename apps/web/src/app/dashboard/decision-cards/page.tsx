'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api } from '@/lib/api';

// ============================================================
// Life Cards — Zero input. Instant intelligence. Play your hand.
// ============================================================

type LifeCard = {
  id: string;
  symbol: string;
  verdict: 'Strong Buy' | 'Buy' | 'Lean Buy' | 'Hold' | 'Avoid';
  confidence: number;
  type: 'bullish' | 'bearish';
  pattern: string;
  price: number | null;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  probabilityOfProfit: number;
  expectedReturn: number;
  maxDownside: number;
  opportunityCost: string;
  reasoning: string;
  played: boolean;
};

function signalToLifeCard(signal: any, index: number): LifeCard {
  const confidence = Math.round(signal.confidence ?? 50);
  const entry = signal.entry ?? signal.price ?? 0;
  const target = signal.target ?? entry * 1.05;
  const stopLoss = signal.stopLoss ?? entry * 0.97;
  const riskReward = signal.riskReward ?? ((target - entry) / Math.max(entry - stopLoss, 0.01));
  const expectedReturn = entry > 0 ? ((target - entry) / entry) * 100 : 0;
  const maxDownside = entry > 0 ? ((entry - stopLoss) / entry) * 100 : 3;

  const baseProbability = confidence * 0.7 + Math.min(riskReward * 10, 30);
  const probabilityOfProfit = Math.min(95, Math.max(15, Math.round(baseProbability)));

  let verdict: LifeCard['verdict'];
  if (signal.type === 'bearish') {
    verdict = confidence >= 60 ? 'Avoid' : 'Hold';
  } else if (confidence >= 75 && riskReward >= 2) {
    verdict = 'Strong Buy';
  } else if (confidence >= 60 && riskReward >= 1.5) {
    verdict = 'Buy';
  } else if (confidence >= 45) {
    verdict = 'Lean Buy';
  } else if (confidence >= 30) {
    verdict = 'Hold';
  } else {
    verdict = 'Avoid';
  }

  const opportunityCost = expectedReturn > 5
    ? `Passing means missing a potential ${expectedReturn.toFixed(1)}% move`
    : expectedReturn > 2
    ? `Moderate upside — consider position sizing`
    : `Small edge — opportunity cost is low`;

  const reasoning = signal.reasoning
    || `${signal.pattern || 'Technical pattern'} detected with ${confidence}% confidence. Risk/reward ratio of ${riskReward.toFixed(1)}:1.`;

  return {
    id: `lc-${index}-${signal.symbol}`,
    symbol: signal.symbol,
    verdict,
    confidence,
    type: signal.type || 'bullish',
    pattern: signal.pattern || 'momentum',
    price: signal.price ?? null,
    entry: Math.round(entry * 100) / 100,
    target: Math.round(target * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    riskReward: Math.round(riskReward * 10) / 10,
    probabilityOfProfit,
    expectedReturn: Math.round(expectedReturn * 10) / 10,
    maxDownside: Math.round(maxDownside * 10) / 10,
    opportunityCost,
    reasoning,
    played: false,
  };
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; ring: string; glow: string }> = {
  'Strong Buy': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/50', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]' },
  'Buy': { bg: 'bg-green-500/15', text: 'text-green-400', ring: 'ring-green-500/40', glow: 'shadow-[0_0_20px_rgba(34,197,94,0.1)]' },
  'Lean Buy': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', ring: 'ring-cyan-500/40', glow: '' },
  'Hold': { bg: 'bg-yellow-500/15', text: 'text-yellow-400', ring: 'ring-yellow-500/30', glow: '' },
  'Avoid': { bg: 'bg-red-500/15', text: 'text-red-400', ring: 'ring-red-500/30', glow: '' },
};

function ConfidenceRing({ value, size = 64 }: { value: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (value / 100) * circumference;
  const color = value >= 70 ? '#10b981' : value >= 45 ? '#eab308' : '#ef4444';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth="4" fill="none"
        strokeDasharray={`${filled} ${circumference - filled}`} strokeLinecap="round" className="transition-all duration-700" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central"
        className="fill-white font-bold" fontSize={size * 0.25} transform={`rotate(90, ${size / 2}, ${size / 2})`}>
        {value}%
      </text>
    </svg>
  );
}

function MetricBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-300">{value > 0 ? '+' : ''}{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const PLACEHOLDER_CARDS: LifeCard[] = [
  {
    id: 'placeholder-1', symbol: '—', verdict: 'Hold', confidence: 0, type: 'bullish',
    pattern: 'Awaiting data', price: null, entry: 0, target: 0, stopLoss: 0,
    riskReward: 0, probabilityOfProfit: 0, expectedReturn: 0, maxDownside: 0,
    opportunityCost: 'Connect to Nova Intelligence to receive live cards',
    reasoning: 'Waiting for market data connection. Your Life Cards will appear automatically once the intelligence engine is online.',
    played: false,
  },
];

export default function LifeCardsPage() {
  const [cards, setCards] = useState<LifeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playMessage, setPlayMessage] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.runScreener({ maxSymbols: 20, minConfidence: 20, signalType: 'all' });
      if (result.success && result.data?.signals?.length) {
        const lifeCards = result.data.signals
          .slice(0, 12)
          .map((s: any, i: number) => signalToLifeCard(s, i))
          .sort((a: LifeCard, b: LifeCard) => b.confidence - a.confidence);
        setCards(lifeCards);
      } else {
        setCards(PLACEHOLDER_CARDS);
      }
    } catch {
      setCards(PLACEHOLDER_CARDS);
      setError('Intelligence engine connecting — cards will appear when online');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  const playCard = async (card: LifeCard) => {
    if (card.id.startsWith('placeholder')) return;
    setPlayMessage(null);
    try {
      const result = await api.createPaperTradeFromSignal({
        symbol: card.symbol,
        type: card.type,
        entry: card.entry,
        target: card.target,
        stopLoss: card.stopLoss,
        confidence: card.confidence,
        reasoning: card.reasoning,
      });
      if (result.success) {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, played: true } : c));
        setPlayMessage(`✅ ${card.symbol} paper trade opened at $${card.entry}`);
      } else {
        setPlayMessage(`Could not execute: ${result.error?.message || 'Try again'}`);
      }
    } catch {
      setPlayMessage('Paper trade unavailable — backend connecting');
    }
  };

  const dismissCard = (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Life Cards</h1>
            <p className="text-gray-400 mt-1">Your hand of opportunities. Read the card. Play or pass.</p>
          </div>
          <button
            onClick={loadCards}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 text-white font-medium hover:from-cyan-500 hover:to-purple-500 transition-all disabled:opacity-50"
          >
            {loading ? 'Dealing...' : '🔄 Deal New Hand'}
          </button>
        </div>

        {playMessage && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm">
            {playMessage}
          </motion.div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 rounded-2xl bg-gray-900/60 border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {cards.map((card) => {
                const style = VERDICT_STYLES[card.verdict] || VERDICT_STYLES['Hold'];
                const isExpanded = expandedId === card.id;
                const isPlaceholder = card.id.startsWith('placeholder');

                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, x: 100 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                    className={`relative rounded-2xl border cursor-pointer transition-all duration-300 ${style.bg} ${style.glow} ${
                      isExpanded ? `ring-2 ${style.ring}` : 'border-gray-800 hover:border-gray-600'
                    } ${card.played ? 'opacity-60' : ''}`}
                  >
                    <div className="p-5 pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-white">{card.symbol}</span>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style.bg} ${style.text} border border-current/20`}>
                              {card.verdict}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1 capitalize">{card.pattern}</p>
                        </div>
                        {!isPlaceholder && <ConfidenceRing value={card.confidence} size={56} />}
                      </div>
                    </div>

                    {!isPlaceholder && (
                      <>
                        <div className="px-5 pb-3 space-y-2">
                          <MetricBar label="Profit Probability" value={card.probabilityOfProfit} max={100} unit="%" color="bg-emerald-500" />
                          <MetricBar label="Expected Return" value={card.expectedReturn} max={20} unit="%" color="bg-cyan-500" />
                          <MetricBar label="Max Downside" value={-card.maxDownside} max={15} unit="%" color="bg-red-500" />
                        </div>

                        <div className="px-5 pb-3 flex items-center gap-4 text-xs text-gray-400">
                          <span>R:R <span className="text-white font-medium">{card.riskReward}:1</span></span>
                          {card.price != null && <span>Price <span className="text-white font-medium">${card.price.toFixed(2)}</span></span>}
                          <span>Entry <span className="text-white font-medium">${card.entry.toFixed(2)}</span></span>
                          <span>Target <span className="text-white font-medium">${card.target.toFixed(2)}</span></span>
                        </div>
                      </>
                    )}

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 space-y-3 border-t border-white/5 pt-3">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Intelligence</p>
                              <p className="text-sm text-gray-300">{card.reasoning}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Opportunity Cost</p>
                              <p className="text-sm text-gray-300">{card.opportunityCost}</p>
                            </div>

                            {!isPlaceholder && (
                              <div className="flex gap-3 pt-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); playCard(card); }}
                                  disabled={card.played}
                                  className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${
                                    card.played
                                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                      : 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500'
                                  }`}
                                >
                                  {card.played ? '✅ Played' : '🃏 Play This Card'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); dismissCard(card.id); }}
                                  className="px-4 py-2.5 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 text-sm transition-all"
                                >
                                  Pass
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {card.played && (
                      <div className="absolute top-3 right-3 text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        In Play
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🃏</p>
            <p className="text-xl font-semibold text-white">No cards in your hand</p>
            <p className="text-gray-400 mt-2">Hit &ldquo;Deal New Hand&rdquo; to scan for opportunities</p>
          </div>
        )}

        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">How Life Cards Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-lg">🔭</span>
              <div>
                <p className="text-white font-medium">Nova Scans</p>
                <p className="text-gray-500">AI screens the entire market for patterns and setups</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">🃏</span>
              <div>
                <p className="text-white font-medium">Cards Dealt</p>
                <p className="text-gray-500">Each opportunity becomes a card with a clear verdict</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">📊</span>
              <div>
                <p className="text-white font-medium">You Decide</p>
                <p className="text-gray-500">Probability, risk, reward — everything on one card</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-white font-medium">One Tap</p>
                <p className="text-gray-500">Play the card to open a paper trade instantly</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';

// ================================================================
// VALUE RADAR — Cross-market opportunity aggregator
// Scans across markets for mispriced assets, arbitrage, deals
// ================================================================

type Category = 'all' | 'stocks' | 'crypto' | 'retail' | 'services';

interface Opportunity {
  id: string;
  title: string;
  category: Category;
  source: string;
  currentPrice: number;
  estimatedValue: number;
  score: number; // 0-100
  tags: string[];
  detectedAt: string;
  url?: string;
}

const CATEGORIES: { id: Category; label: string; icon: string; color: string }[] = [
  { id: 'all', label: 'All', icon: '🌐', color: 'text-white' },
  { id: 'stocks', label: 'Stocks', icon: '📈', color: 'text-green-400' },
  { id: 'crypto', label: 'Crypto', icon: '₿', color: 'text-orange-400' },
  { id: 'retail', label: 'Retail', icon: '🛍️', color: 'text-pink-400' },
  { id: 'services', label: 'Services', icon: '🔧', color: 'text-cyan-400' },
];


function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'from-green-500 to-emerald-400 text-white'
      : score >= 60
        ? 'from-yellow-500 to-amber-400 text-black'
        : 'from-red-500 to-rose-400 text-white';
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${color} font-bold text-sm`}>
      {score}
    </span>
  );
}

function UpliftBadge({ current, estimated }: { current: number; estimated: number }) {
  if (current <= 0) return <span className="text-gray-500 text-xs">N/A</span>;
  const pct = ((estimated - current) / current) * 100;
  return (
    <span className={`text-xs font-medium ${pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function ValueRadarPage() {
  const [category, setCategory] = useState<Category>('all');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // Fetch live data from backend (falls back to seed data)
  const fetchOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getValueRadarOpportunities(category === 'all' ? undefined : category);
      if (res.success && res.data?.opportunities?.length) {
        setOpportunities(res.data.opportunities as Opportunity[]);
      }
    } catch {
      // keep seed data
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const filtered = opportunities.filter((o) => {
    const catMatch = category === 'all' || o.category === category;
    const wlMatch = !showWatchlistOnly || watchlist.has(o.id);
    return catMatch && wlMatch;
  });

  const toggleWatchlist = (id: string) =>
    setWatchlist((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Value <GradientText>Radar</GradientText>
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Cross-market opportunity aggregator — find mispriced assets, deals, and arbitrage across every sector
              </p>
            </div>
            <motion.div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-400 flex items-center justify-center"
              animate={{ boxShadow: ['0 0 15px rgba(244,114,182,0.3)', '0 0 25px rgba(244,114,182,0.5)', '0 0 15px rgba(244,114,182,0.3)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              <span className="text-lg">📡</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Category Tabs + Watchlist Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  category === cat.id
                    ? 'bg-white/15 border border-white/20 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${
              showWatchlistOnly
                ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            ★ Watchlist {watchlist.size > 0 && `(${watchlist.size})`}
          </button>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: 'Opportunities', value: filtered.length, color: 'text-pink-400' },
            { label: 'Avg Score', value: filtered.length ? Math.round(filtered.reduce((a, o) => a + o.score, 0) / filtered.length) : 0, color: 'text-cyan-400' },
            { label: 'Watchlist', value: watchlist.size, color: 'text-purple-400' },
          ].map((stat) => (
            <div key={stat.label} className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-500 text-xs">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Opportunity List */}
        <div className="space-y-3">
          {isLoading && filtered.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                📡
              </motion.div>
              <p className="mt-2 text-sm">Scanning markets...</p>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {filtered.map((opp, i) => (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard glowColor="pink" delay={0} className="!p-4">
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={opp.score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium text-sm truncate">{opp.title}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 whitespace-nowrap">
                          {opp.source}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {opp.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {opp.currentPrice > 0 && (
                        <p className="text-white text-sm font-medium">
                          ${opp.currentPrice.toLocaleString()}
                        </p>
                      )}
                      <UpliftBadge current={opp.currentPrice} estimated={opp.estimatedValue} />
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); toggleWatchlist(opp.id); }}
                      className={`text-lg transition-all ${watchlist.has(opp.id) ? 'text-pink-400' : 'text-gray-600 hover:text-pink-400'}`}
                    >
                      {watchlist.has(opp.id) ? '★' : '☆'}
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>

          {!isLoading && filtered.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-4xl mb-2">🔍</p>
              <p className="text-sm">
                {showWatchlistOnly
                  ? 'No items in your watchlist yet. Star an opportunity to save it.'
                  : 'No opportunities found for this category.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

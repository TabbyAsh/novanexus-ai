'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';

interface DecisionSummary {
  id: string;
  symbol: string;
  confidenceScore: number | null;
  status: string;
  createdAt: string;
}

interface SimulationSummary {
  id: string;
  symbol: string;
  result: {
    probabilityProfit?: number;
    expectedValue?: number;
    netProfitPercent?: number;
  } | null;
  createdAt: string;
}

interface PaperTradeSummary {
  id: string;
  symbol: string;
  side: string;
  status: string;
  pnl: number | null;
  pnlPercent: number | null;
  createdAt: string;
}

interface ReviewStats {
  totalDecisions: number;
  totalSimulations: number;
  totalPaperTrades: number;
  winRate: number;
  avgConfidence: number;
  streakDays: number;
  lastActivityDate: string | null;
}

export default function ReviewPage() {
  const [stats, setStats] = useState<ReviewStats>({
    totalDecisions: 0,
    totalSimulations: 0,
    totalPaperTrades: 0,
    winRate: 0,
    avgConfidence: 0,
    streakDays: 0,
    lastActivityDate: null,
  });
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTradeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReviewData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load decision cards
      const decisionsRes = await api.getDecisionCards({ limit: 10 });
      if (decisionsRes.success && decisionsRes.data?.cards) {
        const cards = decisionsRes.data.cards as any[];
        setDecisions(cards.map((c) => ({
          id: c.id,
          symbol: c.symbol,
          confidenceScore: c.confidenceScore,
          status: c.status,
          createdAt: c.createdAt,
        })));
      }

      // Load paper trades
      const tradesRes = await api.getPaperTrades();
      if (tradesRes.success && tradesRes.data?.trades) {
        const trades = tradesRes.data.trades as any[];
        setPaperTrades(trades.slice(0, 10).map((t) => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side,
          status: t.status,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          createdAt: t.createdAt || t.openedAt,
        })));

        // Calculate win rate
        const closedTrades = trades.filter((t: any) => t.status === 'closed');
        const wins = closedTrades.filter((t: any) => (t.pnl || 0) > 0);
        const winRate = closedTrades.length > 0 
          ? Math.round((wins.length / closedTrades.length) * 100) 
          : 0;

        // Calculate stats
        const avgConf = decisions.length > 0
          ? Math.round(decisions.reduce((sum, d) => sum + (d.confidenceScore || 0), 0) / decisions.length)
          : 0;

        // Calculate streak (simplified - days since first activity)
        const allDates = [
          ...decisions.map(d => d.createdAt),
          ...trades.map((t: any) => t.createdAt || t.openedAt),
        ].filter(Boolean);
        
        let streakDays = 0;
        let lastActivity: string | null = null;
        if (allDates.length > 0) {
          const sorted = allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          lastActivity = sorted[0];
          // Simple streak: consecutive days with activity
          const uniqueDays = new Set(sorted.map(d => new Date(d).toDateString()));
          streakDays = Math.min(uniqueDays.size, 7); // Cap at 7 for now
        }

        setStats({
          totalDecisions: decisions.length,
          totalSimulations: 0, // Will be updated when we have simulation tracking
          totalPaperTrades: trades.length,
          winRate,
          avgConfidence: avgConf,
          streakDays,
          lastActivityDate: lastActivity,
        });
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to load review data');
    } finally {
      setIsLoading(false);
    }
  }, [decisions.length]);

  useEffect(() => {
    loadReviewData();
  }, []);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            <GradientText>Review</GradientText> Your Progress
          </h1>
          <p className="text-gray-400">
            Track your decisions, simulations, and trading discipline over time.
          </p>
        </motion.div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300">
            {error}
          </div>
        )}

        {/* Stats Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
        >
          <GlassCard hover={false} glowColor="cyan" className="text-center">
            <p className="text-3xl font-bold text-cyan-400">{stats.totalDecisions}</p>
            <p className="text-gray-400 text-sm">Decisions</p>
          </GlassCard>
          <GlassCard hover={false} glowColor="purple" className="text-center">
            <p className="text-3xl font-bold text-purple-400">{stats.totalSimulations}</p>
            <p className="text-gray-400 text-sm">Simulations</p>
          </GlassCard>
          <GlassCard hover={false} glowColor="green" className="text-center">
            <p className="text-3xl font-bold text-green-400">{stats.totalPaperTrades}</p>
            <p className="text-gray-400 text-sm">Paper Trades</p>
          </GlassCard>
          <GlassCard hover={false} glowColor="pink" className="text-center">
            <p className={`text-3xl font-bold ${stats.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
              {stats.winRate}%
            </p>
            <p className="text-gray-400 text-sm">Win Rate</p>
          </GlassCard>
          <GlassCard hover={false} glowColor="cyan" className="text-center">
            <p className="text-3xl font-bold text-white">{stats.avgConfidence}%</p>
            <p className="text-gray-400 text-sm">Avg Confidence</p>
          </GlassCard>
          <GlassCard hover={false} glowColor="green" className="text-center">
            <p className="text-3xl font-bold text-green-400">🔥 {stats.streakDays}</p>
            <p className="text-gray-400 text-sm">Day Streak</p>
          </GlassCard>
        </motion.div>

        {/* Daily Discipline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard hover={false} glowColor="green">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🎯</span> Daily Discipline
              </h3>
              <span className="text-sm text-gray-400">
                {stats.lastActivityDate ? `Last active: ${formatDate(stats.lastActivityDate)}` : 'No activity yet'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex gap-1">
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-8 rounded ${
                        i < stats.streakDays
                          ? 'bg-gradient-to-t from-green-600 to-green-400'
                          : 'bg-white/5'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
              <div className="text-center px-6 py-4 bg-white/5 rounded-xl">
                <p className="text-4xl font-bold text-green-400">{stats.streakDays}</p>
                <p className="text-gray-400 text-sm">day streak</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Build your trading discipline by making decisions daily. Your streak grows with consistent activity.
            </p>
          </GlassCard>
        </motion.div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Decisions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard hover={false} glowColor="cyan">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>🎴</span> Recent Decisions
                </h3>
                <Link href="/dashboard/decision-cards" className="text-cyan-400 text-sm hover:text-cyan-300">
                  View all →
                </Link>
              </div>
              {isLoading ? (
                <div className="text-gray-500 text-center py-8">Loading...</div>
              ) : decisions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No decisions yet</p>
                  <Link
                    href="/dashboard/screener"
                    className="inline-block px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition"
                  >
                    Start Scanning →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {decisions.slice(0, 5).map((d) => (
                    <Link key={d.id} href={`/dashboard/decision-cards?id=${d.id}`} className="block">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                        <div>
                          <span className="font-medium text-white">{d.symbol}</span>
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                            d.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {d.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-white">{d.confidenceScore || 0}%</p>
                          <p className="text-gray-500 text-xs">{formatDate(d.createdAt)}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Recent Paper Trades */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard hover={false} glowColor="green">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>📄</span> Paper Trade Receipts
                </h3>
                <Link href="/dashboard/trading" className="text-green-400 text-sm hover:text-green-300">
                  View all →
                </Link>
              </div>
              {isLoading ? (
                <div className="text-gray-500 text-center py-8">Loading...</div>
              ) : paperTrades.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">No paper trades yet</p>
                  <Link
                    href="/dashboard/screener"
                    className="inline-block px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 transition"
                  >
                    Make First Trade →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {paperTrades.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                      <div>
                        <span className="font-medium text-white">{t.symbol}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                          t.side === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {t.side.toUpperCase()}
                        </span>
                        <span className={`ml-1 text-xs px-2 py-0.5 rounded ${
                          t.status === 'open' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-right">
                        {t.pnl !== null ? (
                          <p className={t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {t.pnl >= 0 ? '+' : ''}{t.pnlPercent?.toFixed(2) || 0}%
                          </p>
                        ) : (
                          <p className="text-gray-400">—</p>
                        )}
                        <p className="text-gray-500 text-xs">{formatDate(t.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* Confidence Calibration Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard hover={false} glowColor="purple">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📊</span> Confidence Calibration
            </h3>
            <div className="text-center py-8">
              <p className="text-gray-400 mb-2">
                Track how well your confidence scores predict actual outcomes.
              </p>
              <p className="text-gray-500 text-sm">
                Complete more trades to see your calibration curve.
              </p>
              <div className="mt-6 flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-400">—</p>
                  <p className="text-gray-500 text-xs">Calibration Score</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-cyan-400">—</p>
                  <p className="text-gray-500 text-xs">Accuracy Trend</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* CTA for continuing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center"
        >
          <Link
            href="/dashboard/screener"
            className="inline-block px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
          >
            Find Today's Opportunities →
          </Link>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

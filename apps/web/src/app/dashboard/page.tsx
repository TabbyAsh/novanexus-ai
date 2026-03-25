'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';
import OnboardingStepper, { UpgradeCTA } from '@/components/onboarding/OnboardingStepper';
import { useOnboarding } from '@/contexts/OnboardingContext';

interface QuickAction {
  name: string;
  description: string;
  href: string;
  icon: string;
  color: 'cyan' | 'purple' | 'pink' | 'green';
}

interface MarketQuote {
  symbol: string;
  price: number | null;
  change: number | null; // percent
}

// Latent opportunity signal from screener
interface OpportunitySignal {
  symbol: string;
  confidence: number;
  type: 'bullish' | 'bearish';
  pattern: string;
  qualification: string;
  entry: number;
  target: number;
  riskReward: number;
}

interface ActivityItem {
  action: string;
  target: string;
  time: string;
  type: 'signal' | 'simulation' | 'scan' | 'system';
}


// ================================================================
// CORE LOOP — The heartbeat of Nova
// Observe → Decide → Execute → Record → Learn → Upgrade
// ================================================================
const CORE_LOOP_PHASES = [
  { id: 'observe', label: 'Observe', icon: '🔭', color: 'from-cyan-500 to-cyan-400', desc: 'Watch markets, trends, signals' },
  { id: 'decide', label: 'Decide', icon: '🎯', color: 'from-blue-500 to-blue-400', desc: 'Score, rank, generate thesis' },
  { id: 'execute', label: 'Execute', icon: '⚡', color: 'from-green-500 to-green-400', desc: 'Trade, list, publish' },
  { id: 'record', label: 'Record', icon: '📝', color: 'from-purple-500 to-purple-400', desc: 'Append to event ledger' },
  { id: 'learn', label: 'Learn', icon: '🧠', color: 'from-pink-500 to-pink-400', desc: 'Evaluate outcomes, drift' },
  { id: 'upgrade', label: 'Upgrade', icon: '🚀', color: 'from-orange-500 to-orange-400', desc: 'Improve strategies, rules' },
];

// ================================================================
// SECTOR NODES — The universe of Nova
// ================================================================
const SECTOR_NODES = [
  {
    name: 'Flip Card',
    description: 'Evaluate any item — get resale estimate, fees, risk flags, and a buy/pass verdict',
    href: '/dashboard/analyze',
    icon: '💰',
    gradient: 'from-emerald-500/20 via-green-500/10 to-transparent',
    border: 'border-emerald-500/30 hover:border-emerald-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]',
    color: 'text-emerald-400',
  },
  {
    name: 'Wall Street',
    description: 'Trading intelligence, AI screening, backtesting, paper trading',
    href: '/dashboard/screener',
    icon: '📈',
    gradient: 'from-green-500/20 via-emerald-500/10 to-transparent',
    border: 'border-green-500/30 hover:border-green-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(34,197,94,0.15)]',
    color: 'text-green-400',
  },
  {
    name: 'Marketplace',
    description: 'Cross-market opportunity radar, deal scoring, arbitrage',
    href: '/dashboard/value-radar',
    icon: '🏪',
    gradient: 'from-pink-500/20 via-rose-500/10 to-transparent',
    border: 'border-pink-500/30 hover:border-pink-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(244,114,182,0.15)]',
    color: 'text-pink-400',
  },
  {
    name: 'Social',
    description: 'Content engine, growth flywheel, audience intelligence',
    href: '/dashboard/content-engine',
    icon: '📡',
    gradient: 'from-purple-500/20 via-violet-500/10 to-transparent',
    border: 'border-purple-500/30 hover:border-purple-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.15)]',
    color: 'text-purple-400',
  },
  {
    name: 'Research',
    description: 'Knowledge base, learning proposals, intelligence mining',
    href: '/dashboard/nexus',
    icon: '🔬',
    gradient: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    border: 'border-cyan-500/30 hover:border-cyan-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(0,245,255,0.15)]',
    color: 'text-cyan-400',
  },
  {
    name: 'Ops',
    description: 'Safety, governance, kill switch, audit, compliance',
    href: '/dashboard/safety',
    icon: '⚙️',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
    border: 'border-orange-500/30 hover:border-orange-400/60',
    glow: 'hover:shadow-[0_0_40px_rgba(249,115,22,0.15)]',
    color: 'text-orange-400',
  },
];

export default function DashboardPage() {
  const [marketData, setMarketData] = useState<MarketQuote[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunitySignal[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sectorStats, setSectorStats] = useState<Record<string, string>>({});
  
  // Onboarding state
  const { state: onboardingState, completeStep } = useOnboarding();
  
  // Mark opportunities step complete when data loads
  useEffect(() => {
    if (opportunities.length > 0 && !onboardingState.completedSteps.includes('opportunities')) {
      completeStep('opportunities');
    }
  }, [opportunities, onboardingState.completedSteps, completeStep]);

  const fetchData = useCallback(async () => {
    try {
      // Fetch top opportunities from screener with latent opportunity scoring
      // Uses a diverse universe, sorted by confidence (composite latent score)
      const screenerResult = await api.runScreener({
        maxSymbols: 30,
        minConfidence: 30, // Low threshold to get ranked universe
        signalType: 'all',
      });
      
      if (screenerResult.success && (screenerResult.data?.signals?.length ?? 0) > 0) {
        // Take top 5 qualified or near-qualified by confidence
        const topSignals = screenerResult.data!.signals!
          .filter((s: any) => s.qualification !== 'NOT_QUALIFIED')
          .slice(0, 5)
          .map((s: any): OpportunitySignal => ({
            symbol: s.symbol,
            confidence: s.confidence,
            type: s.type,
            pattern: s.pattern,
            qualification: s.qualification,
            entry: s.entry,
            target: s.target,
            riskReward: s.riskReward,
          }));
        setOpportunities(topSignals);
        
        // Also get quotes for these symbols
        const quotesPromises = topSignals.slice(0, 4).map(async (sig: OpportunitySignal) => {
          const result = await api.getMarketQuote(sig.symbol);
          if (result.success && result.data?.quote) {
            const price = result.data.quote.price;
            const change = result.data.quote.changePercent;
            return {
              symbol: sig.symbol,
              price: Number.isFinite(price) ? price : null,
              change: typeof change === 'number' && Number.isFinite(change) ? change : null,
            };
          }
          return { symbol: sig.symbol, price: sig.entry, change: null };
        });
        const quotes = await Promise.all(quotesPromises);
        setMarketData(quotes);
      } else {
        // Fallback to index ETFs if screener fails
        const quotesPromises = ['SPY', 'QQQ', 'IWM', 'DIA'].map(async (symbol) => {
          const result = await api.getMarketQuote(symbol);
          if (result.success && result.data?.quote) {
            const price = result.data.quote.price;
            const change = result.data.quote.changePercent;
            return {
              symbol,
              price: Number.isFinite(price) ? price : null,
              change: typeof change === 'number' && Number.isFinite(change) ? change : null,
            };
          }
          return null;
        });
        const quotes = (await Promise.all(quotesPromises)).filter((q): q is MarketQuote => q !== null);
        setMarketData(quotes);
      }

      // Fetch recent events
      const eventsResult = await api.getRecentEvents(10);
      if (eventsResult.success && eventsResult.data?.events) {
        const mappedActivities: ActivityItem[] = eventsResult.data.events.slice(0, 4).map((event) => {
          const timeAgo = getTimeAgo(new Date(event.ts));
          let action = event.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          let target = String(event.payload?.symbol || event.payload?.goalId || 'System');
          let type: ActivityItem['type'] = 'system';
          
          if (event.type.includes('SIGNAL') || event.type.includes('THESIS')) {
            type = 'signal';
          } else if (event.type.includes('BACKTEST') || event.type.includes('SIMULATION')) {
            type = 'simulation';
          } else if (event.type.includes('SCAN')) {
            type = 'scan';
          }
          
          return { action, target, time: timeAgo, type };
        });
        if (mappedActivities.length > 0) {
          setActivities(mappedActivities);
        }
      }
      // Fetch dashboard sector stats
      try {
        const statsResult = await api.getDashboardStats();
        if (statsResult.success && statsResult.data?.sectors) {
          const s = statsResult.data.sectors;
          const stats: Record<string, string> = {};
          if (s.wallStreet) stats['Wall Street'] = `${s.wallStreet.activeSignals} signals · ${s.wallStreet.openTrades} trades`;
          if (s.marketplace) stats['Marketplace'] = `${s.marketplace.trendingCategories} categories`;
          if (s.social) stats['Social'] = `${s.social.contentDrafts} drafts · ${s.social.scheduledPosts} scheduled`;
          if (s.research) stats['Research'] = `${s.research.eventsToday} events today`;
          if (s.ops) stats['Ops'] = s.ops.systemHealthy ? '✓ All systems healthy' : '⚠ Needs attention';
          setSectorStats(stats);
        }
      } catch {}
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // Determine active core loop phase from recent activity
  const activePhase = activities.length > 0
    ? activities[0].type === 'scan' ? 'observe'
      : activities[0].type === 'signal' ? 'decide'
      : activities[0].type === 'simulation' ? 'execute'
      : 'record'
    : 'observe';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Onboarding Stepper */}
        <OnboardingStepper showWelcome={true} />

        {/* ============================================ */}
        {/* NOVA PULSE + HEADER                          */}
        {/* ============================================ */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          {/* Nova Pulse — the living intelligence orb */}
          <div className="relative flex-shrink-0">
            <motion.div
              className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(0,245,255,0.3), 0 0 60px rgba(139,92,246,0.15)',
                  '0 0 30px rgba(0,245,255,0.5), 0 0 80px rgba(139,92,246,0.25)',
                  '0 0 20px rgba(0,245,255,0.3), 0 0 60px rgba(139,92,246,0.15)',
                ],
                scale: [1, 1.05, 1],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-bold text-xl">N</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Nova <GradientText>Command Center</GradientText>
            </h1>
            <p className="text-gray-400 text-sm">
              Governed intelligence — observe, decide, execute, record, learn, upgrade
            </p>
          </div>
        </motion.div>

        {/* ============================================ */}
        {/* CORE LOOP STRIP                              */}
        {/* ============================================ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-4"
        >
          <div className="flex items-center gap-1 overflow-x-auto">
            {CORE_LOOP_PHASES.map((phase, i) => {
              const isActive = phase.id === activePhase;
              return (
                <div key={phase.id} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
                    isActive
                      ? 'bg-gradient-to-r ' + phase.color + ' bg-opacity-20 border border-white/20 shadow-lg'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}>
                    <span className="text-lg">{phase.icon}</span>
                    <div className="hidden sm:block">
                      <p className={`text-xs font-bold ${isActive ? 'text-white' : 'text-gray-400'}`}>
                        {phase.label}
                      </p>
                      <p className="text-[10px] text-gray-500 whitespace-nowrap">{phase.desc}</p>
                    </div>
                    {isActive && (
                      <motion.div
                        className="w-2 h-2 rounded-full bg-white"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                  {i < CORE_LOOP_PHASES.length - 1 && (
                    <svg className="w-4 h-4 text-gray-600 flex-shrink-0 mx-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ============================================ */}
        {/* SECTOR GRID — The Nova Universe               */}
        {/* ============================================ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {SECTOR_NODES.map((sector, i) => (
              <Link key={sector.name} href={sector.href}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  whileHover={{ scale: 1.03, y: -3 }}
                  className={`relative overflow-hidden backdrop-blur-xl bg-gradient-to-br ${sector.gradient} border ${sector.border} rounded-2xl p-4 transition-all duration-300 ${sector.glow} cursor-pointer`}
                >
                  <span className="text-3xl block mb-2">{sector.icon}</span>
                  <h3 className={`font-bold text-sm ${sector.color}`}>{sector.name}</h3>
                  <p className="text-gray-500 text-[11px] mt-1 leading-tight">{sector.description}</p>
                  {sectorStats[sector.name] && (
                    <p className="text-[10px] mt-2 font-medium text-white/50 truncate">{sectorStats[sector.name]}</p>
                  )}
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* ============================================ */}
        {/* INTELLIGENCE FEED — Opportunities + Activity  */}
        {/* ============================================ */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top Opportunities */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard hover={false} glowColor="cyan">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-cyan-400">🎯</span> Top Opportunities
                <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">Live</span>
              </h3>
              <p className="text-gray-500 text-xs mb-3">Ranked by AI composite confidence score</p>
              <div className="space-y-3">
                {opportunities.length === 0 && marketData.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white/5 text-sm text-gray-400">
                    Scanning for opportunities...
                  </div>
                ) : opportunities.length > 0 ? (
                  opportunities.map((opp, idx) => (
                    <Link
                      key={opp.symbol}
                      href={`/dashboard/screener?symbol=${opp.symbol}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-cyan-500/30">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 text-xs w-4">#{idx + 1}</span>
                          <div>
                            <span className="font-medium text-white">{opp.symbol}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${opp.type === 'bullish' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {opp.type === 'bullish' ? '▲' : '▼'} {opp.pattern}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium">{opp.confidence}%</p>
                          <p className="text-gray-500 text-xs">R:R {opp.riskReward.toFixed(1)}</p>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  marketData.map((item) => (
                    <Link key={item.symbol} href={`/dashboard/screener?symbol=${item.symbol}`} className="block">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                        <span className="font-medium text-white">{item.symbol}</span>
                        <div className="text-right">
                          <p className="text-white">
                            {typeof item.price === 'number' && Number.isFinite(item.price)
                              ? `$${item.price.toLocaleString()}`
                              : '—'}
                          </p>
                          <p className={`text-sm ${typeof item.change === 'number' && Number.isFinite(item.change) ? item.change >= 0 ? 'text-green-400' : 'text-red-400' : 'text-gray-400'}`}>
                            {typeof item.change === 'number' && Number.isFinite(item.change)
                              ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              {isLoading && (
                <div className="mt-2 text-xs text-gray-500 text-center">Scanning markets...</div>
              )}
              <Link href="/dashboard/screener" className="block mt-3 text-center text-cyan-400 text-sm hover:text-cyan-300">
                View all opportunities →
              </Link>
            </GlassCard>
          </motion.div>

          {/* Recent Activity (Event Ledger) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
          >
            <GlassCard hover={false} glowColor="purple">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-purple-400">⚡</span> Event Ledger
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Live</span>
              </h3>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white/5 text-sm text-gray-400">
                    No recent events. Start scanning to populate the ledger.
                  </div>
                ) : (
                  activities.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.type === 'signal' ? 'bg-green-500/20 text-green-400' :
                        item.type === 'simulation' ? 'bg-purple-500/20 text-purple-400' :
                        item.type === 'scan' ? 'bg-cyan-500/20 text-cyan-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {item.type === 'signal' ? '📊' :
                         item.type === 'simulation' ? '🎲' :
                         item.type === 'scan' ? '🔍' : '⚙️'}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{item.action}</p>
                        <p className="text-gray-400 text-xs">{item.target}</p>
                      </div>
                      <span className="text-gray-500 text-xs">{item.time}</span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Upgrade CTA */}
        <UpgradeCTA visible={true} />
      </div>
    </DashboardLayout>
  );
}

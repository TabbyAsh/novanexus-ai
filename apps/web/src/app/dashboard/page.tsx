'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { api, type ScanOpportunity } from '@/lib/api';
import OnboardingStepper, { UpgradeCTA } from '@/components/onboarding/OnboardingStepper';
import { useOnboarding } from '@/contexts/OnboardingContext';

// ================================================================
// QUICK LAUNCH TOOLS — what actually works
// ================================================================
const QUICK_TOOLS = [
  {
    name: 'Flip Finder',
    desc: 'Scan Craigslist for real items worth buying and flipping. Every card is a live listing with a verdict.',
    href: '/dashboard/scanner',
    badge: 'LIVE',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: '🔍',
    gradient: 'from-emerald-500/15 to-transparent',
    border: 'border-emerald-500/25 hover:border-emerald-400/50',
    glow: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.12)]',
    cta: 'Scan Now →',
    ctaClass: 'text-emerald-400 hover:text-emerald-300',
  },
  {
    name: 'Flip Card',
    desc: 'Enter any item, get an instant resale estimate with real eBay sold comps and a buy/pass verdict.',
    href: '/dashboard/flip-card',
    badge: 'FREE',
    badgeColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    icon: '💰',
    gradient: 'from-cyan-500/15 to-transparent',
    border: 'border-cyan-500/25 hover:border-cyan-400/50',
    glow: 'hover:shadow-[0_0_30px_rgba(0,245,255,0.10)]',
    cta: 'Try It →',
    ctaClass: 'text-cyan-400 hover:text-cyan-300',
  },
  {
    name: 'Stock Screener',
    desc: 'AI momentum pattern scanner across 500+ stocks. Ranked signals with entry, target, and risk/reward.',
    href: '/dashboard/screener',
    badge: 'LIVE',
    badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: '📈',
    gradient: 'from-green-500/15 to-transparent',
    border: 'border-green-500/25 hover:border-green-400/50',
    glow: 'hover:shadow-[0_0_30px_rgba(34,197,94,0.10)]',
    cta: 'Screener →',
    ctaClass: 'text-green-400 hover:text-green-300',
  },
];

interface ActivityItem {
  action: string;
  target: string;
  time: string;
  type: 'signal' | 'simulation' | 'scan' | 'system';
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [flipOpps, setFlipOpps] = useState<ScanOpportunity[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Onboarding
  const { state: onboardingState, completeStep } = useOnboarding();
  useEffect(() => {
    if (flipOpps.length > 0 && !onboardingState.completedSteps.includes('opportunities')) {
      completeStep('opportunities');
    }
  }, [flipOpps, onboardingState.completedSteps, completeStep]);

  const fetchData = useCallback(async () => {
    try {
      // Recent flip opportunities
      const [oppsResult, eventsResult] = await Promise.allSettled([
        api.getScannerOpportunities({ limit: 5 }),
        api.getRecentEvents(8),
      ]);

      if (oppsResult.status === 'fulfilled' && oppsResult.value.success && oppsResult.value.data?.opportunities) {
        setFlipOpps(oppsResult.value.data.opportunities.slice(0, 4));
      }

      if (eventsResult.status === 'fulfilled' && eventsResult.value.success && eventsResult.value.data?.events) {
        const mapped: ActivityItem[] = eventsResult.value.data.events.slice(0, 5).map((event: any) => {
          const type: ActivityItem['type'] =
            event.type.includes('SIGNAL') || event.type.includes('THESIS') ? 'signal'
            : event.type.includes('BACKTEST') || event.type.includes('SIMULATION') ? 'simulation'
            : event.type.includes('SCAN') ? 'scan'
            : 'system';
          return {
            action: event.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            target: String(event.payload?.symbol || event.payload?.goalId || 'System'),
            time: getTimeAgo(new Date(event.ts)),
            type,
          };
        });
        setActivities(mapped);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Onboarding stepper */}
        <OnboardingStepper showWelcome={true} />

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0"
            animate={{
              boxShadow: [
                '0 0 16px rgba(0,245,255,0.25)',
                '0 0 28px rgba(139,92,246,0.30)',
                '0 0 16px rgba(0,245,255,0.25)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="text-white font-bold text-lg">N</span>
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Nova{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Command
              </span>
            </h1>
            <p className="text-gray-500 text-sm">Your intelligence platform — scan, decide, act, learn.</p>
          </div>
        </motion.div>

        {/* ── Quick Launch — 3 real tools ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <p className="text-xs font-bold tracking-widest uppercase text-emerald-400">Active Tools</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {QUICK_TOOLS.map((tool, i) => (
              <motion.div
                key={tool.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.07 }}
                whileHover={{ y: -3 }}
              >
                <Link
                  href={tool.href}
                  className={`block relative backdrop-blur-xl bg-gradient-to-br ${tool.gradient} border ${tool.border} rounded-2xl p-5 transition-all duration-300 ${tool.glow} group`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{tool.icon}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${tool.badgeColor}`}>
                      {tool.badge}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1">{tool.name}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed mb-3">{tool.desc}</p>
                  <span className={`text-xs font-medium transition-colors ${tool.ctaClass}`}>
                    {tool.cta}
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Intelligence Feed — Flip Opps + Event Ledger ── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Recent Flip Opportunities */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="text-pink-400">🔍</span> Flip Opportunities
              </h3>
              <Link href="/dashboard/scanner" className="text-xs text-pink-400 hover:text-pink-300 transition-colors">
                View all →
              </Link>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-pink-500 border-t-transparent animate-spin" />
              </div>
            ) : flipOpps.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 text-sm mb-3">No scan results yet.</p>
                <Link
                  href="/dashboard/scanner"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-400 rounded-lg text-sm font-medium transition-all"
                >
                  Run your first scan
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {flipOpps.map((opp) => (
                  <Link key={opp.decisionCardId} href="/dashboard/scanner" className="block">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                            opp.action === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}>
                            {opp.action === 'BUY' ? 'BUY' : 'OFFER'}
                          </span>
                          <span className="text-gray-500 text-xs truncate">{opp.city}</span>
                        </div>
                        <p className="text-white text-sm font-medium truncate">{opp.title}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-white text-sm font-semibold">${opp.askingPrice.toFixed(0)}</p>
                        <p className={`text-xs ${
                          opp.expectedNetProfit > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {opp.expectedNetProfit > 0 ? '+' : ''}{opp.expectedNetProfit.toFixed(0)} est.
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* Event Ledger */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-5"
          >
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-purple-400">⚡</span> Event Ledger
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">Live</span>
            </h3>
            <div className="space-y-2">
              {activities.length === 0 ? (
                <p className="text-gray-600 text-sm py-4 text-center">
                  No events yet. Activity populates as you use the platform.
                </p>
              ) : (
                activities.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                      item.type === 'signal' ? 'bg-green-500/20'
                      : item.type === 'scan' ? 'bg-pink-500/20'
                      : item.type === 'simulation' ? 'bg-purple-500/20'
                      : 'bg-gray-500/20'
                    }`}>
                      {item.type === 'signal' ? '📊' : item.type === 'scan' ? '🔍' : item.type === 'simulation' ? '🎲' : '⚙️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{item.action}</p>
                      <p className="text-gray-500 text-xs truncate">{item.target}</p>
                    </div>
                    <span className="text-gray-600 text-xs flex-shrink-0">{item.time}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        {/* Referral chip — viral growth nudge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-between gap-4 backdrop-blur-xl bg-violet-500/5 border border-violet-500/20 rounded-2xl px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-sm shrink-0">🎁</div>
            <div>
              <div className="text-sm font-semibold text-white">Refer a friend — both get $10 credit</div>
              <div className="text-xs text-gray-500 mt-0.5">Share your referral link. When they upgrade, you both win.</div>
            </div>
          </div>
          <Link
            href="/dashboard/referrals"
            className="shrink-0 px-4 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-sm font-medium text-white transition"
          >
            Get Link →
          </Link>
        </motion.div>

        {/* Upgrade CTA */}
        <UpgradeCTA visible={true} />
      </div>
    </DashboardLayout>
  );
}

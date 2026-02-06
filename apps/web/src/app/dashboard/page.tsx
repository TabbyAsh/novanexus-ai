'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';

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

interface ActivityItem {
  action: string;
  target: string;
  time: string;
  type: 'signal' | 'simulation' | 'scan' | 'system';
}


const quickActions: QuickAction[] = [
  {
    name: 'AI Screener',
    description: 'Scan markets for opportunities',
    href: '/dashboard/screener',
    icon: '🧠',
    color: 'cyan',
  },
  {
    name: 'Trading',
    description: 'Manage your portfolio',
    href: '/dashboard/trading',
    icon: '📈',
    color: 'green',
  },
  {
    name: 'Simulator',
    description: 'Backtest strategies',
    href: '/dashboard/simulator',
    icon: '🎲',
    color: 'purple',
  },
  {
    name: 'Marketplace',
    description: 'E-commerce operations',
    href: '/dashboard/marketplace',
    icon: '🛒',
    color: 'pink',
  },
];

export default function DashboardPage() {
  const [marketData, setMarketData] = useState<MarketQuote[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fetch market quotes
      const quotesPromises = ['SPY', 'QQQ', 'NVDA', 'AAPL'].map(async (symbol) => {
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
      if (quotes.length > 0) {
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to <GradientText>NovaNexus</GradientText>
          </h1>
          <p className="text-gray-400">
            Your AI-powered ecosystem for trading, commerce, and autonomous operations
          </p>
        </motion.div>
        
        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, i) => (
              <Link key={action.name} href={action.href}>
                <GlassCard glowColor={action.color} delay={0.1 * i} className="h-full">
                  <div className="flex flex-col items-center text-center">
                    <span className="text-4xl mb-3">{action.icon}</span>
                    <h3 className="font-semibold text-white mb-1">{action.name}</h3>
                    <p className="text-gray-400 text-sm">{action.description}</p>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </motion.div>
        
        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Market Overview */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard hover={false} glowColor="cyan">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-cyan-400">📈</span> Market Overview
              </h3>
              <div className="space-y-3">
                {marketData.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white/5 text-sm text-gray-400">
                    Market data unavailable.
                  </div>
                ) : (
                  marketData.map((item) => (
                    <div key={item.symbol} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                      <span className="font-medium text-white">{item.symbol}</span>
                      <div className="text-right">
                        <p className="text-white">
                          {typeof item.price === 'number' && Number.isFinite(item.price)
                            ? `$${item.price.toLocaleString()}`
                            : '—'}
                        </p>
                        <p
                          className={`text-sm ${
                            typeof item.change === 'number' && Number.isFinite(item.change)
                              ? item.change >= 0
                                ? 'text-green-400'
                                : 'text-red-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {typeof item.change === 'number' && Number.isFinite(item.change)
                            ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {isLoading && (
                <div className="mt-2 text-xs text-gray-500 text-center">Updating...</div>
              )}
            </GlassCard>
          </motion.div>
          
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard hover={false} glowColor="purple">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-purple-400">⚡</span> Recent Activity
              </h3>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white/5 text-sm text-gray-400">
                    No recent activity.
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
        
        {/* Welcome Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard hover={false} className="text-center !p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              Power to the <GradientText>User</GradientText>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-6">
              NovaNexus AI brings together the tools that were once exclusive to institutions. 
              Use AI-powered market intelligence, algorithmic trading, and autonomous commerce to build your empire.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link 
                href="/dashboard/screener"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
              >
                Start Scanning →
              </Link>
              <Link 
                href="/dashboard/simulator"
                className="px-6 py-3 rounded-xl border border-white/20 text-white font-medium hover:bg-white/10 transition-all"
              >
                Try Simulator
              </Link>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import StatCard from '@/components/dashboard/StatCard';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';

interface QuickAction {
  name: string;
  description: string;
  href: string;
  icon: string;
  color: 'cyan' | 'purple' | 'pink' | 'green';
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
    href: '/trading',
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
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Portfolio Value"
            value="$100,000"
            change={{ value: 0, label: 'Paper trading' }}
            icon={<span className="text-lg">💰</span>}
            color="green"
            delay={0}
          />
          <StatCard
            title="Active Signals"
            value="4"
            change={{ value: 12, label: 'vs last week' }}
            icon={<span className="text-lg">📊</span>}
            color="cyan"
            delay={0.1}
          />
          <StatCard
            title="Win Rate"
            value="62.3%"
            change={{ value: 5.2, label: 'improving' }}
            icon={<span className="text-lg">🎯</span>}
            color="purple"
            delay={0.2}
          />
          <StatCard
            title="AI Confidence"
            value="87%"
            change={{ value: 3, label: 'avg signal' }}
            icon={<span className="text-lg">🧠</span>}
            color="pink"
            delay={0.3}
          />
        </div>
        
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
                {[
                  { symbol: 'SPY', price: 502.34, change: 0.85 },
                  { symbol: 'QQQ', price: 438.67, change: 1.49 },
                  { symbol: 'BTC', price: 97543.21, change: 2.34 },
                  { symbol: 'ETH', price: 3842.56, change: -0.67 },
                ].map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                    <span className="font-medium text-white">{item.symbol}</span>
                    <div className="text-right">
                      <p className="text-white">${item.price.toLocaleString()}</p>
                      <p className={`text-sm ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.change >= 0 ? '+' : ''}{item.change}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
                {[
                  { action: 'AI Signal Generated', target: 'NVDA - Bullish', time: '2m ago', type: 'signal' },
                  { action: 'Backtest Complete', target: 'RSI Strategy', time: '15m ago', type: 'simulation' },
                  { action: 'Market Scan', target: '47 opportunities found', time: '1h ago', type: 'scan' },
                  { action: 'System Update', target: 'New patterns added', time: '3h ago', type: 'system' },
                ].map((item, i) => (
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
                ))}
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

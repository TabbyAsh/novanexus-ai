'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAuthStore } from '@/lib/store';
import { ArrowRight } from 'lucide-react';

const PATHS = [
  {
    emoji: '🃏',
    title: 'Get a card for my situation',
    desc: 'Describe what you\'re dealing with. Nova gives you the exact next move — checklist, script, action.',
    href: '/start',
    color: 'border-emerald-500/25 hover:border-emerald-400/50',
    bg: 'hover:bg-emerald-500/5',
    cta: 'Start here',
  },
  {
    emoji: '💰',
    title: 'Evaluate something to flip',
    desc: 'Enter any item. Get real eBay market prices, fee math, net profit, and a buy/pass verdict.',
    href: '/flip',
    color: 'border-cyan-500/25 hover:border-cyan-400/50',
    bg: 'hover:bg-cyan-500/5',
    cta: 'Open Flip Card',
  },
  {
    emoji: '📊',
    title: 'Track my gig or service income',
    desc: 'Log earnings from any gig work or service job. See your real hourly rate after expenses.',
    href: '/dashboard/income',
    color: 'border-violet-500/25 hover:border-violet-400/50',
    bg: 'hover:bg-violet-500/5',
    cta: 'Track Income',
  },
  {
    emoji: '🔍',
    title: 'Find items worth flipping',
    desc: 'Scan for marketplace deals in your area. Every result is automatically evaluated.',
    href: '/dashboard/scanner',
    color: 'border-pink-500/25 hover:border-pink-400/50',
    bg: 'hover:bg-pink-500/5',
    cta: 'Open Flip Finder',
  },
  {
    emoji: '📈',
    title: 'Research a stock setup',
    desc: 'Momentum pattern analysis across 500+ tickers. Paper trading only — not financial advice.',
    href: '/dashboard/screener',
    color: 'border-amber-500/25 hover:border-amber-400/50',
    bg: 'hover:bg-amber-500/5',
    cta: 'Open Screener',
  },
  {
    emoji: '🏢',
    title: 'Run my business',
    desc: 'Track leads, quotes, jobs, and revenue in one pipeline. Never forget a follow-up. Your business workspace.',
    href: '/dashboard/business',
    color: 'border-emerald-500/25 hover:border-emerald-400/50',
    bg: 'hover:bg-emerald-500/5',
    cta: 'Open Business OS',
  },
];

const QUICK_LINKS = [
  { label: 'Decision Cards',   href: '/decision-cards',        emoji: '🗂️' },
  { label: 'Outcomes',         href: '/dashboard/outcomes',    emoji: '✓'  },
  { label: 'Alerts',           href: '/dashboard/alerts',      emoji: '🔔' },
  { label: 'Flip History',     href: '/dashboard/flip-history',emoji: '🕐' },
  { label: 'Field Manual',     href: '/field-manual',          emoji: '📖' },
  { label: 'Refer & Earn',     href: '/dashboard/referrals',   emoji: '🎁' },
];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const name = (user as any)?.email?.split('@')[0] || 'there';

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-8">

        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold text-white">
            Hey {name}. <span className="text-gray-400 font-normal">What do you want to do today?</span>
          </h1>
        </motion.div>

        {/* Talk to Nova — the command center entry */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
          <Link href="/dashboard/nova"
            className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/5 p-5 hover:border-emerald-400/50 transition group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-xl text-white shrink-0">N</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Talk to Nova</div>
              <div className="text-xs text-gray-400 mt-0.5">Tell me what you're working on or stuck on. I'll help you think and take you to the right tool.</div>
            </div>
            <ArrowRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        </motion.div>

        {/* Main paths */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PATHS.map((path, i) => (
            <motion.div
              key={path.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link href={path.href}
                className={`flex flex-col h-full rounded-2xl border ${path.color} ${path.bg} bg-white/[0.02] p-5 transition-all group`}>
                <div className="text-2xl mb-3">{path.emoji}</div>
                <h3 className="text-sm font-semibold text-white mb-1.5 leading-snug">{path.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed flex-1">{path.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
                  {path.cta} <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Quick links */}
        <div>
          <div className="text-xs text-gray-600 uppercase tracking-widest mb-3">Quick access</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(link => (
              <Link key={link.label} href={link.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 bg-gray-900/50 hover:border-gray-700 text-xs text-gray-400 hover:text-white transition-all">
                <span>{link.emoji}</span> {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* First-time guidance */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4"
        >
          <div className="text-xs font-semibold text-emerald-400 mb-1">New to Nova?</div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Start with <Link href="/start" className="text-emerald-400 hover:text-emerald-300 transition">Get a Card</Link> — describe your situation in 2 sentences and Nova gives you a specific next move. No setup required.
          </p>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

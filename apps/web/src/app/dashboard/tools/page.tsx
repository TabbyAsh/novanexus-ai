'use client';

import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { ArrowRight } from 'lucide-react';

const GROUPS = [
  {
    title: 'Make money',
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
    tools: [
      { name: 'Flip Card', href: '/flip', desc: 'Evaluate any item to resell — real prices, fees, net profit, verdict.' },
      { name: 'Flip Finder', href: '/dashboard/scanner', desc: 'Scan Craigslist for items worth flipping in your area.' },
      { name: 'Flip History', href: '/dashboard/flip-history', desc: 'Every item you\'ve analyzed, saved and tracked.' },
      { name: 'Income Tracker', href: '/dashboard/income', desc: 'Track gig and service earnings. See your real hourly rate after expenses.' },
    ],
  },
  {
    title: 'Save money',
    color: 'text-cyan-400',
    border: 'border-cyan-500/20',
    tools: [
      { name: 'Shopping Cards', href: '/dashboard/shopping', desc: 'Find the cheapest place to buy anything. Bulk advice, coupon apps.' },
      { name: 'Expense Audit', href: '/dashboard/expense-audit', desc: 'Find $100–$400/month you\'re already losing to subscriptions and leaks.' },
    ],
  },
  {
    title: 'Run your business',
    color: 'text-violet-400',
    border: 'border-violet-500/20',
    tools: [
      { name: 'Business OS', href: '/dashboard/business', desc: 'Lead-to-paid pipeline. Never lose a follow-up.' },
      { name: 'Quote Builder', href: '/dashboard/quote-builder', desc: 'Generate a professional quote in 2 minutes. Print or copy.' },
      { name: 'Invoice Builder', href: '/dashboard/invoice-builder', desc: 'Professional invoices, printable, with payment options.' },
    ],
  },
  {
    title: 'Stay sharp',
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    tools: [
      { name: 'Alerts', href: '/dashboard/alerts', desc: 'Daily flip and market opportunities, delivered.' },
      { name: 'Refer & Earn', href: '/dashboard/referrals', desc: 'Invite others, earn credit.' },
    ],
  },
];

export default function ToolsPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Money Tools</h1>
          <p className="text-gray-500 text-sm mt-1">
            Every tool in one place. Or just ask Nova — it can run most of these for you in conversation.
          </p>
        </div>

        {GROUPS.map(group => (
          <div key={group.title}>
            <h2 className={`text-xs font-bold uppercase tracking-widest ${group.color} mb-3`}>{group.title}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {group.tools.map(tool => (
                <Link key={tool.name} href={tool.href}
                  className={`group flex flex-col rounded-xl border ${group.border} bg-white/[0.02] p-4 hover:bg-white/[0.04] transition`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-white">{tool.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition" />
                  </div>
                  <span className="text-xs text-gray-500 leading-relaxed">{tool.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
          <p className="text-sm text-gray-400">
            Don&apos;t want to dig through tools? <Link href="/dashboard/nova" className="text-emerald-400 hover:text-emerald-300 font-medium">Just ask Nova</Link> — describe what you need and it&apos;ll handle it or take you to the right place.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

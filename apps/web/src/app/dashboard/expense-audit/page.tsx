'use client';

/**
 * Expense Audit — find money you're already losing.
 *
 * Guides users through a systematic review of subscriptions, recurring charges,
 * and spending categories. Most people have $100-400/month in unnecessary expenses
 * they haven't looked at. Finding that money requires no new income — it's already there.
 *
 * Zero capital. Zero risk. Immediate result.
 */

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { CheckCircle, Circle, DollarSign, TrendingDown, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const AUDIT_CATEGORIES = [
  {
    category: 'Subscriptions you forgot about',
    icon: '📱',
    questions: [
      { label: 'Streaming services (Netflix, Hulu, Disney+, etc.)', monthly: 15, why: 'Most households have 3-5 streaming services and watch 1-2 regularly.' },
      { label: 'Music subscriptions (Spotify, Apple Music, etc.)', monthly: 10, why: 'If you have one, do you need the premium? Free tiers exist.' },
      { label: 'App subscriptions (apps you downloaded and forgot)', monthly: 20, why: 'Check your App Store subscriptions page — most people find 2-4 they forgot.' },
      { label: 'Software/tools you no longer use', monthly: 30, why: 'Adobe, Canva, design tools, productivity apps.' },
      { label: 'Free trials that auto-converted to paid', monthly: 15, why: 'Check your bank statement for charges from services you barely remember signing up for.' },
    ],
  },
  {
    category: 'Bills you\'ve never negotiated',
    icon: '📋',
    questions: [
      { label: 'Internet bill (most people never call to negotiate)', monthly: 30, why: 'ISPs routinely give discounts to retention callers. A 10-min call often saves $20-40/mo.' },
      { label: 'Cell phone plan (could you get the same service cheaper?)', monthly: 25, why: 'Prepaid carriers like Mint, Visible, and US Mobile offer the same coverage for 50% less.' },
      { label: 'Insurance (last price-shopped more than 1 year ago)', monthly: 40, why: 'Auto and renters insurance premiums creep up. 30 min of comparison shopping often saves $30-60/mo.' },
      { label: 'Gym membership you rarely use', monthly: 50, why: 'Most gym memberships go unused 3+ months/year. Pause or cancel and use free options.' },
    ],
  },
  {
    category: 'Spending leaks',
    icon: '💸',
    questions: [
      { label: 'Daily coffee or food purchases you could reduce', monthly: 80, why: '$5/day on coffee = $150/month. Even cutting by half saves $75.' },
      { label: 'Delivery fees and tips (Uber Eats, DoorDash, etc.)', monthly: 60, why: 'Average delivery order has $8-15 in fees on top of the food. Pickup eliminates this.' },
      { label: 'Impulse buys (clothes, gadgets, Amazon)', monthly: 100, why: 'A 24-hour rule before purchases eliminates most impulse buying.' },
      { label: 'Bank fees (overdraft, ATM fees, monthly maintenance)', monthly: 20, why: 'Free checking accounts eliminate all of these. Switching takes 30 minutes.' },
    ],
  },
];

export default function ExpenseAuditPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<'audit' | 'results'>('audit');

  const toggle = (key: string) => setChecked(p => ({ ...p, [key]: !p[key] }));

  const totalSavings = AUDIT_CATEGORIES.flatMap(c =>
    c.questions.map((q, i) => ({ key: `${c.category}-${i}`, monthly: q.monthly }))
  ).filter(q => checked[q.key]).reduce((s, q) => s + q.monthly, 0);

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Expense Audit</h1>
          <p className="text-gray-500 text-sm mt-1">
            Most people have $100–$400/month in expenses they&apos;re not getting value from.
            Check what applies to you. See your recovery potential.
          </p>
        </div>

        {/* Running total */}
        {checkedCount > 0 && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">Potential monthly recovery</div>
              <div className="text-3xl font-bold text-emerald-400">${totalSavings}/mo</div>
              <div className="text-sm text-emerald-500/80">${(totalSavings * 12).toLocaleString()}/year · {checkedCount} area{checkedCount !== 1 ? 's' : ''} identified</div>
            </div>
            <DollarSign className="w-12 h-12 text-emerald-400/30" />
          </div>
        )}

        {/* Audit categories */}
        <div className="space-y-5">
          {AUDIT_CATEGORIES.map(cat => (
            <div key={cat.category} className="rounded-2xl border border-gray-800 bg-gray-900/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
                <span className="text-xl">{cat.icon}</span>
                <h3 className="text-sm font-semibold text-white">{cat.category}</h3>
              </div>
              <div className="divide-y divide-gray-800/50">
                {cat.questions.map((q, i) => {
                  const key = `${cat.category}-${i}`;
                  const isChecked = !!checked[key];
                  return (
                    <button key={i} onClick={() => toggle(key)}
                      className={`w-full flex items-start gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02] ${isChecked ? 'bg-red-500/5' : ''}`}>
                      <div className="mt-0.5 shrink-0">
                        {isChecked
                          ? <CheckCircle className="w-5 h-5 text-red-400" />
                          : <Circle className="w-5 h-5 text-gray-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isChecked ? 'text-red-300' : 'text-gray-300'}`}>{q.label}</div>
                        <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">{q.why}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-sm font-bold ${isChecked ? 'text-red-400' : 'text-gray-600'}`}>
                          {isChecked ? `-$${q.monthly}/mo` : `~$${q.monthly}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Results / Action card */}
        {checkedCount > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Your next moves</h3>
            <ol className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                Open your bank app. Go to transactions. Find every recurring charge. Screenshot them.
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                Cancel or pause subscriptions you&apos;ve identified. Do it today before you forget.
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                Call your internet and cell carrier. Say &quot;I&apos;m considering cancelling. What retention offers do you have?&quot; Minimum 10-minute call.
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-600/30 text-emerald-400 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
                Log your recovery in the Income Tracker. Savings = income. Every $100/month saved is $1,200/year returned to your budget.
              </li>
            </ol>
            <Link href="/dashboard/income"
              className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition">
              Log savings to Income Tracker <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {checkedCount === 0 && (
          <p className="text-xs text-gray-600 text-center">
            Check the boxes that apply to you. The audit shows your potential monthly savings.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

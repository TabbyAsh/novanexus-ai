'use client';

/**
 * THE BAZAAR — one sector, one loop: appraise → source → track → sell.
 * The four old flip tools were the same thing wearing four names; this is
 * that thing, whole. (Rebuild Phase 0.)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const API = '/api/proxy';

interface Trend { term: string; category?: string; isProductOpportunity?: boolean }

const STAGES = [
  { key: 'appraise', name: 'Appraise', href: '/analyze', icon: '⚖', promise: 'Name any item + price → BUY/PASS verdict, resale band, fees, negotiation script.', accent: '#ffc773' },
  { key: 'source',   name: 'Source',   href: '/dashboard/trends', icon: '◎', promise: 'What is about to be worth buying — live demand before it peaks.', accent: '#f4a259' },
  { key: 'track',    name: 'Track & Sell', href: '/dashboard/flips', icon: '◇', promise: 'Every item from sourced → sold, with real P&L. Nova learns from each sale.', accent: '#e08a3c' },
];

export default function BazaarHub() {
  const [hot, setHot] = useState<Trend[]>([]);
  useEffect(() => {
    fetch(`${API}/v1/trends/public`).then(r => r.json()).then(d => {
      if (d?.success) setHot((d.data.cards || []).slice(0, 4));
    }).catch(() => {});
  }, []);

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-[#0a0a0f] text-white px-6 py-8 max-w-5xl mx-auto">
      <div className="text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: '#ffc773' }}>The Bazaar</div>
      <h1 className="text-2xl font-bold mb-1">Buy low. Sell high. Let Nova learn every sale.</h1>
      <p className="text-gray-400 text-sm mb-8">One loop, four stages. Money hidden in mispriced real-world things.</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {STAGES.map((s, i) => (
          <Link key={s.key} href={s.href} className="block rounded-xl border border-gray-800 bg-[#111117] p-5 hover:border-gray-700 transition no-underline">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg" style={{ color: s.accent }}>{s.icon}</span>
              <span className="text-[10px] text-gray-600">STAGE {i + 1}</span>
            </div>
            <div className="font-semibold text-white mb-1">{s.name}</div>
            <div className="text-xs text-gray-400 leading-relaxed">{s.promise}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-amber-900/30 bg-[#111117] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#ffc773' }}>What&apos;s hot to source now</h2>
          <Link href="/dashboard/trends" className="text-[11px] text-amber-400 no-underline">full radar →</Link>
        </div>
        {hot.length === 0 ? (
          <div className="text-sm text-gray-600">Reading live demand…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {hot.map((t, i) => (
              <div key={i} className="text-sm text-gray-300 rounded-lg bg-black/30 border border-gray-800 px-3 py-2">
                {t.term}{t.category ? <span className="text-gray-600"> · {t.category}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}

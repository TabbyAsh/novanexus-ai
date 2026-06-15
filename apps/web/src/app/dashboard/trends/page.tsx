'use client';

/**
 * Trend Radar — the demand-detection branch. ("Sell the shovel.")
 *
 * Detects what's heating up before it peaks and turns it into ranked
 * Trend Opportunity Cards for resellers and e-com sellers. Live Google
 * Trends + free AI classifier. No inventory, no shipping — pure signal.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Radar, TrendingUp, RefreshCw, MessageSquare, ArrowRight, Lock } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '');

interface TrendCard {
  term: string;
  isProductOpportunity: boolean;
  product: string;
  category: string;
  audience: string;
  whyNow: string;
  sourcing: string;
  velocity: number;
  stage: 'rising' | 'hot' | 'peaking';
  trafficLabel: string;
  regions: string[];
  regionCount: number;
}

const stageColor: Record<string, string> = {
  rising: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  hot: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  peaking: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

export default function TrendsPage() {
  const [cards, setCards] = useState<TrendCard[]>([]);
  const [meta, setMeta] = useState<{ scanned: number; productOpportunities: number; generatedAt?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [productsOnly, setProductsOnly] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // The radar can run cold on the first hit after a deploy — be patient and
    // retry once on a transient blip instead of failing the user immediately.
    let d: { success?: boolean; data?: { cards?: TrendCard[]; scanned?: number; productOpportunities?: number; generatedAt?: string } } | null = null;
    for (let attempt = 0; attempt < 2 && !d; attempt++) {
      try {
        const r = await fetch(`${API}/v1/trends?productsOnly=${productsOnly}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: AbortSignal.timeout(45000),
        });
        d = await r.json();
      } catch {
        if (attempt === 0) { await new Promise((res) => setTimeout(res, 1500)); continue; }
        setError('The radar is warming up — give it a few seconds and tap Rescan.');
      }
    }
    if (d) {
      if (d.success && d.data) {
        setCards(d.data.cards || []);
        setMeta({ scanned: d.data.scanned || 0, productOpportunities: d.data.productOpportunities || 0, generatedAt: d.data.generatedAt });
      } else {
        setError('Could not load the radar. Tap Rescan to try again.');
      }
    }
    setLoading(false);
  }, [productsOnly]);

  useEffect(() => { load(); }, [load]);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="w-6 h-6 text-violet-400" />
              <h1 className="text-2xl font-bold text-white">Trend Radar</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              What&apos;s heating up — before it peaks. Live demand signal, scored and sorted into product opportunities.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-sm font-semibold text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Scanning…' : 'Rescan'}
          </button>
        </div>

        {/* Meta strip */}
        {meta && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 border-y border-gray-800/60 py-3">
            <span><span className="text-white font-semibold">{meta.scanned}</span> live trends scanned</span>
            <span><span className="text-violet-400 font-semibold">{meta.productOpportunities}</span> product opportunities found</span>
            <span className="text-gray-600">Source: Google Trends + Nova AI classifier · refreshes every 30 min</span>
          </div>
        )}

        {/* Toggle */}
        <div className="flex gap-1.5">
          <button onClick={() => setProductsOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${productsOnly ? 'bg-white text-black' : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'}`}>
            Product opportunities
          </button>
          <button onClick={() => setProductsOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${!productsOnly ? 'bg-white text-black' : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'}`}>
            All trends
          </button>
        </div>

        {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

        {/* Cards */}
        {loading && cards.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">Reading live demand signal…</div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No product opportunities in the current batch — today&apos;s trends are news-heavy.</p>
            <p className="text-gray-600 text-xs mt-1">Try &quot;All trends,&quot; or rescan later. Richer product feeds are coming.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {cards.map((c, i) => (
              <div key={`${c.term}-${i}`}
                className={`rounded-xl border p-5 ${c.isProductOpportunity ? 'border-violet-500/25 bg-violet-500/[0.04]' : 'border-gray-800 bg-gray-900/30'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white leading-snug">{c.product || c.term}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.category}{c.trafficLabel ? ` · ${c.trafficLabel} searches` : ''}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stageColor[c.stage]}`}>{c.stage}</span>
                    <span className="text-xs font-mono text-gray-400">{c.velocity}/100</span>
                    {c.regionCount > 1 && (
                      <span className="text-[10px] font-semibold text-emerald-400" title={`Trending in: ${c.regions.join(', ')}`}>
                        🌍 {c.regionCount} countries
                      </span>
                    )}
                  </div>
                </div>

                {c.isProductOpportunity ? (
                  <div className="space-y-1.5 text-xs">
                    {c.whyNow && <p className="text-gray-300"><span className="text-gray-500">Why now: </span>{c.whyNow}</p>}
                    {c.audience && <p className="text-gray-300"><span className="text-gray-500">Buyers: </span>{c.audience}</p>}
                    {c.sourcing && <p className="text-gray-300"><span className="text-gray-500">Source it: </span>{c.sourcing}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">{c.whyNow || 'Trending search — not a product opportunity.'}</p>
                )}

                {c.isProductOpportunity && (
                  <Link href={`/dashboard/nova?q=${encodeURIComponent(`Should I sell ${c.product || c.term}? Where do I source it and what margin?`)}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300 transition">
                    <MessageSquare className="w-3.5 h-3.5" /> Ask Nova how to play it <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Honest footer */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            v1 reads live Google Trends and classifies it with Nova&apos;s AI. It&apos;s real, but trend coverage deepens as we add product-dense feeds
            (Amazon best-sellers, product communities, TikTok). This is the demand half of your reseller edge —{' '}
            <Link href="/flip" className="text-violet-400 hover:text-violet-300">pair it with Flip Card</Link> for the profit half.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

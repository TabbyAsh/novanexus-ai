'use client';

/**
 * Public Trend Radar funnel — the front door anyone can walk through.
 *
 * Live trending product opportunities, no login. Built to be screenshotted and
 * shared: the product IS the ad. Top 6 free, full board behind signup.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TrendCard {
  term: string;
  product: string;
  category: string;
  audience: string;
  whyNow: string;
  sourcing: string;
  velocity: number;
  stage: 'rising' | 'hot' | 'peaking';
  regions: string[];
  regionCount: number;
}

const stageColor: Record<string, string> = {
  rising: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  hot: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  peaking: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
};

export default function RadarClient() {
  const [cards, setCards] = useState<TrendCard[]>([]);
  const [meta, setMeta] = useState<{ productOpportunities: number; scanned: number; locked: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/v1/trends/public`);
        const d = await r.json();
        if (d.success && d.data) {
          setCards(d.data.cards || []);
          setMeta({ productOpportunities: d.data.productOpportunities || 0, scanned: d.data.scanned || 0, locked: d.data.locked || 0 });
        }
      } catch { /* keep empty */ } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen text-white" style={{ background: '#06060d' }}>
      {/* Nebula wash */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #6d28d9, transparent 70%)' }} />
        <div className="absolute top-20 right-0 w-[35rem] h-[35rem] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #0891b2, transparent 70%)' }} />
        <div className="absolute bottom-0 left-1/3 w-[30rem] h-[30rem] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #10b981, transparent 70%)' }} />
      </div>

      <nav className="relative border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Trend Radar</span>
        </Link>
        <Link href="/register" className="text-sm font-semibold px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 transition">
          Get the full board
        </Link>
      </nav>

      <main className="relative max-w-4xl mx-auto px-6 py-14 space-y-10">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-violet-300 bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 rounded-full mb-5">
            ◎ Live demand signal · updates every 30 min
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            What&apos;s about to sell — <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">before it peaks.</span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed">
            Nova scans what&apos;s surging across multiple countries right now and turns it into ranked product opportunities — with what to sell, who buys it, and where to source it. No inventory. No guessing.
          </p>
        </div>

        {/* Live board */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Reading live demand signal…</div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            The signal feed is briefly unreachable — the radar rescans every 30 minutes.{' '}
            <Link href="/register" className="text-violet-400 underline">Sign up</Link> to get the board delivered when it refreshes.
          </div>
        ) : (
          <>
            {meta && (
              <div className="text-center text-xs text-gray-500">
                <span className="text-white font-semibold">{meta.scanned}</span> live trends scanned ·
                <span className="text-violet-300 font-semibold"> {meta.productOpportunities}</span> product opportunities found right now
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              {cards.map((c, i) => (
                <div key={`${c.term}-${i}`} className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="text-sm font-bold leading-snug">{c.product || c.term}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{c.category}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stageColor[c.stage]}`}>{c.stage}</span>
                      <span className="text-xs font-mono text-gray-400">{c.velocity}/100</span>
                      {c.regionCount > 1 && (
                        <span className="text-[10px] font-semibold text-emerald-300" title={c.regions.join(', ')}>🌍 {c.regionCount} countries</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-gray-300">
                    {c.whyNow && <p><span className="text-gray-500">Why now: </span>{c.whyNow}</p>}
                    {c.audience && <p><span className="text-gray-500">Buyers: </span>{c.audience}</p>}
                    {c.sourcing && <p><span className="text-gray-500">Source it: </span>{c.sourcing}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Locked / CTA */}
            <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">
                {meta && meta.locked > 0 ? `+${meta.locked} more opportunities on your board right now` : 'See the full live board'}
              </h2>
              <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                Free account unlocks the full ranked board, the cross-border early signal, and one-tap &quot;how do I play it&quot; with Nova.
              </p>
              <Link href="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition">
                Unlock the full radar — free
              </Link>
              <p className="text-xs text-gray-600 mt-3">No card required.</p>
            </div>
          </>
        )}

        <p className="text-center text-xs text-gray-700">
          Signals are real, sourced from live search demand. Selling involves risk — research before you buy inventory.
        </p>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';

const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts'];
const PLATFORMS = ['eBay', 'Facebook Marketplace', 'Mercari', 'Poshmark', 'OfferUp', 'Craigslist'];

interface FlipResult {
  verdict: string;
  rationale_summary: string;
  item_title: string;
  item_category: string;
  condition_assessment: string;
  buy_price: number;
  est_resale_low: number;
  est_resale_mid: number;
  est_resale_high: number;
  est_platform_fees: number;
  est_shipping_cost: number;
  est_net_profit_low: number;
  est_net_profit_mid: number;
  est_net_profit_high: number;
  confidence_score: number;
  risk_score: number;
  risk_flags: string[];
  negotiation_target_price: number | null;
  assumptions: string[];
  comp_sources: { source: string; count: number; freshness: string }[];
  _usage?: { remaining?: number; limit?: number; unlimited?: boolean; signupUrl?: string };
}

export default function HomePage() {
  const [title, setTitle] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [condition, setCondition] = useState('Good');
  const [platform, setPlatform] = useState('eBay');
  const [shipping, setShipping] = useState<'shipping'|'pickup'>('shipping');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<FlipResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) => {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
    return n < 0 ? `-${f}` : f;
  };

  const analyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !buyPrice) return;
    setLoading(true); setError(null); setResult(null); setStep(0);
    const steps = [300, 800, 1200];
    steps.forEach((d, i) => setTimeout(() => setStep(i + 1), d));

    try {
      const res = await fetch('/api/proxy/v1/flip-card/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), buy_price: parseFloat(buyPrice), condition,
          shipping_or_pickup: shipping, target_platform: platform,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep(4);
        setTimeout(() => { setResult(data.data); setLoading(false); }, 300);
      } else {
        setError(data.error?.message || 'Analysis failed.');
        setLoading(false);
      }
    } catch {
      setError('Could not reach server. Try again.'); setLoading(false);
    }
  };

  const reset = () => { setResult(null); setError(null); setTitle(''); setBuyPrice(''); };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="px-6 py-4 border-b border-gray-800/50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">FC</span>
            </div>
            <span className="text-white font-semibold">Flip Card</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-gray-400 hover:text-white transition">Sign In</Link>
            <Link href="/register" className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition">Sign Up Free</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Hero + Form (no result yet) */}
        {!result && !loading && (
          <div>
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                Know if it&apos;s worth flipping<br />
                <span className="text-emerald-400">before you buy it.</span>
              </h1>
              <p className="text-gray-400 text-lg max-w-xl mx-auto">
                Enter an item below. Get a resale estimate, cost breakdown, and a clear
                <strong className="text-white"> buy</strong>,{' '}
                <strong className="text-white">negotiate</strong>, or{' '}
                <strong className="text-white">pass</strong> verdict.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
            )}

            <form onSubmit={analyze} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">What are you looking at? *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} required
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Asking price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                    <input type="number" step="0.01" min="0" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} required
                      placeholder="0.00"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none">
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Sell on</label>
                  <select value={platform} onChange={e => setPlatform(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none">
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Fulfillment</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShipping('shipping')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${shipping === 'shipping' ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>Ship</button>
                    <button type="button" onClick={() => setShipping('pickup')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${shipping === 'pickup' ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>Pickup</button>
                  </div>
                </div>
              </div>
              <button type="submit" className="w-full py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg transition">
                Get My Flip Card — Free
              </button>
              <p className="text-center text-xs text-gray-500">3 free analyses per day. No account needed.</p>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && !result && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin mb-8" />
            <div className="space-y-3 text-center">
              {['Evaluating opportunity...','Looking up recent sold prices...','Calculating fees and costs...','Generating your Flip Card...'].map((l, i) => (
                <p key={l} className={`text-sm transition-all duration-300 ${step >= i ? 'text-white' : 'text-gray-600'}`}>
                  {step > i ? '✓' : step === i ? '→' : '·'} {l}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div>
            {/* Verdict */}
            <div className={`text-center py-8 px-6 rounded-2xl mb-6 ${
              result.verdict === 'BUY' ? 'bg-emerald-900/40 border-2 border-emerald-500/60'
              : result.verdict === 'NEGOTIATE LOWER' ? 'bg-amber-900/40 border-2 border-amber-500/60'
              : 'bg-red-900/40 border-2 border-red-500/60'
            }`}>
              <div className={`text-5xl font-black mb-3 ${
                result.verdict === 'BUY' ? 'text-emerald-400' : result.verdict === 'NEGOTIATE LOWER' ? 'text-amber-400' : 'text-red-400'
              }`}>{result.verdict}</div>
              <p className="text-gray-300 max-w-xl mx-auto text-sm">{result.rationale_summary}</p>
            </div>

            {/* Economics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-bold text-white">{result.item_title}</div>
                  <div className="text-xs text-gray-500">{result.item_category} · {result.condition_assessment}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Confidence</div>
                  <div className="font-bold text-white">{result.confidence_score}%</div>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full mb-4">
                <div className={`h-full rounded-full ${result.confidence_score >= 60 ? 'bg-emerald-500' : result.confidence_score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${result.confidence_score}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div><div className="text-gray-500 text-xs">Buy</div><div className="text-white font-medium">{fmt(result.buy_price)}</div></div>
                <div><div className="text-gray-500 text-xs">Resale (mid)</div><div className="text-white font-medium">{fmt(result.est_resale_mid)}</div></div>
                <div><div className="text-gray-500 text-xs">Costs</div><div className="text-gray-400 font-medium">-{fmt(result.est_platform_fees + result.est_shipping_cost)}</div></div>
                <div><div className="text-gray-500 text-xs">Net profit</div>
                  <div className={`font-bold ${result.est_net_profit_mid > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(result.est_net_profit_mid)}</div>
                </div>
              </div>
            </div>

            {/* Negotiation */}
            {result.negotiation_target_price && (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-4 flex items-center gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <span className="text-amber-300 font-semibold">Negotiate to </span>
                  <span className="text-amber-400 font-bold">{fmt(result.negotiation_target_price)}</span>
                  <span className="text-gray-400 text-sm"> or less for a solid flip.</span>
                </div>
              </div>
            )}

            {/* Risk */}
            {result.risk_flags.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Risk Flags</div>
                {result.risk_flags.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-300 mb-1"><span className="text-amber-500">⚠</span>{f}</div>
                ))}
              </div>
            )}

            {/* Comps + Assumptions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Data Sources</div>
              {result.comp_sources.map((cs, i) => (
                <div key={i} className="flex justify-between text-sm"><span className="text-gray-300">{cs.source}</span><span className="text-gray-500">{cs.count > 0 ? `${cs.count} comps` : 'n/a'}</span></div>
              ))}
              <div className="text-xs font-semibold text-gray-400 uppercase mt-4 mb-2">Assumptions</div>
              {result.assumptions.map((a, i) => (
                <div key={i} className="text-xs text-gray-500 mb-1">· {a}</div>
              ))}
              <p className="mt-3 text-xs text-gray-600 italic">Structured estimate, not a guarantee. You decide.</p>
            </div>

            {/* Usage CTA */}
            {result._usage && !result._usage.unlimited && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-5 mb-4 text-center">
                <p className="text-emerald-300 font-medium mb-1">
                  {result._usage.remaining !== undefined && result._usage.remaining > 0
                    ? `${result._usage.remaining} free ${result._usage.remaining === 1 ? 'analysis' : 'analyses'} remaining today`
                    : 'You\'ve used all free analyses today'}
                </p>
                <p className="text-gray-400 text-sm mb-3">Sign up for unlimited analyses, saved history, and daily flip alerts.</p>
                <Link href="/register" className="inline-block px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition">
                  Sign Up Free — Unlimited Analyses
                </Link>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button onClick={reset} className="flex-1 py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition">Analyze Another</button>
              <Link href="/register" className="py-4 px-6 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition text-center">Sign Up</Link>
            </div>

            <p className="text-center text-xs text-gray-600 mt-6">Powered by Nova</p>
          </div>
        )}

        {/* Trust strip below form */}
        {!result && !loading && (
          <div className="mt-16 grid md:grid-cols-3 gap-6 text-center">
            <div><div className="text-2xl mb-2">🔍</div><div className="text-white font-semibold text-sm">Real Sold Prices</div><div className="text-gray-500 text-xs">From actual completed eBay sales</div></div>
            <div><div className="text-2xl mb-2">💰</div><div className="text-white font-semibold text-sm">True Cost Breakdown</div><div className="text-gray-500 text-xs">Fees, shipping, and profit calculated</div></div>
            <div><div className="text-2xl mb-2">✅</div><div className="text-white font-semibold text-sm">Clear Verdict</div><div className="text-gray-500 text-xs">BUY, NEGOTIATE, or PASS</div></div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-gray-800 mt-16">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Flip Card</span>
            <span className="text-gray-600 text-xs">· Powered by Nova</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-300">Terms</Link>
            <a href="mailto:wyatt@novanexus-ai.com" className="hover:text-gray-300">Contact</a>
          </div>
          <span className="text-gray-700 text-xs">© 2026 Nova Enterprises</span>
        </div>
        <p className="text-center text-xs text-gray-700 mt-3 max-w-2xl mx-auto">
          Structured estimates for resale opportunities. Not financial advice. Results may vary.
        </p>
      </footer>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calculator, TrendingUp, DollarSign, ArrowRight,
  CheckCircle, XCircle, AlertCircle, Package,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface FlipResult {
  decision: { action: string; offerPrice: number | null; rationale: string[] };
  financials: {
    askingPrice: number;
    expectedSalePrice: number;
    expectedNetProfit: number;
    expectedRoiPct: number;
    costs: { fees: number; shipping: number; taxes: number };
    downsideRisk: number;
  };
  confidence: { confidencePct: number; volatility: string; missingInformation: string[] };
  marketIntelligence: {
    soldRange: { low: number; mid: number; high: number };
    demandMomentum: string;
    sellThroughVelocity: string;
    expectedDaysToSale: { low: number; mid: number; high: number };
  };
  execution: { suggestedOffer: number | null; negotiationScript: string; bestPlatform: string };
}

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  BUY:    { label: 'BUY IT',      color: 'text-emerald-300', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', icon: CheckCircle  },
  OFFER:  { label: 'MAKE OFFER', color: 'text-cyan-300',    bg: 'bg-cyan-500/20',    border: 'border-cyan-500/40',    icon: AlertCircle  },
  SKIP:   { label: 'SKIP IT',    color: 'text-red-300',     bg: 'bg-red-500/20',     border: 'border-red-500/40',     icon: XCircle      },
  WAIT:   { label: 'WAIT',       color: 'text-amber-300',   bg: 'bg-amber-500/20',   border: 'border-amber-500/40',   icon: AlertCircle  },
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function FlipCalculatorClient() {
  const [item, setItem]           = useState('');
  const [buyPrice, setBuyPrice]   = useState('');
  const [condition, setCondition] = useState('Good');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<FlipResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API}/v1/flip/appraise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.trim(),
          asking_price: buyPrice ? parseFloat(buyPrice) : undefined,
          condition,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.card) {
        setResult(data.data.card);
      } else {
        setError(data.error?.message || 'Could not analyze this item. Try a more specific product name.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const action = result?.decision?.action;
  const cfg = action ? (ACTION_CONFIG[action] ?? ACTION_CONFIG.SKIP) : null;
  const Icon = cfg?.icon ?? AlertCircle;

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Nav */}
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center font-bold text-sm">N</div>
          <span className="font-semibold text-white">NovaNexus</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/flip" className="text-gray-400 hover:text-white text-sm transition">Flip Card</Link>
          <Link href="/register" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
            Sign Up Free
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Free · No signup · Real eBay data
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Free Flip Calculator
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Enter any item to see its estimated resale value, eBay fees, and whether it&apos;s worth flipping — based on real sold listings.
          </p>
        </div>

        {/* Calculator form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Item Name
            </label>
            <input
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="e.g. PlayStation 5, MacBook Air M2, Dyson V11"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500/60 focus:outline-none text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Your Buy Price (optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-7 pr-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500/60 focus:outline-none text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-emerald-500/60 focus:outline-none text-sm"
              >
                {['New', 'Like New', 'Good', 'Fair', 'Poor'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !item.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-white transition-all text-sm"
          >
            <Calculator className="w-4 h-4" />
            {loading ? 'Analyzing real eBay comps…' : 'Calculate Flip Profit'}
          </button>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
        </form>

        {/* Result */}
        {result && cfg && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* Verdict banner */}
            <div className={`flex items-center gap-4 rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}>
              <Icon className={`w-8 h-8 ${cfg.color} shrink-0`} />
              <div className="flex-1">
                <div className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</div>
                {result.execution.suggestedOffer !== null && (
                  <div className="text-sm text-gray-300 mt-0.5">
                    Suggested offer: <strong className="text-white">{fmt(result.execution.suggestedOffer)}</strong>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${result.financials.expectedNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.financials.expectedNetProfit >= 0 ? '+' : ''}{fmt(result.financials.expectedNetProfit)}
                </div>
                <div className="text-xs text-gray-500">est. net profit</div>
              </div>
            </div>

            {/* Numbers grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Est. Sale Price"    value={fmt(result.financials.expectedSalePrice)}                       sub="eBay sold comp median"   color="text-white"        />
              <StatCard label="ROI"                value={`${result.financials.expectedRoiPct.toFixed(1)}%`}              sub="on your buy price"       color={result.financials.expectedRoiPct >= 20 ? 'text-emerald-400' : 'text-amber-400'} />
              <StatCard label="eBay Fees"          value={fmt(result.financials.costs.fees)}                              sub="platform + payment"      color="text-gray-300"     />
              <StatCard label="Est. Shipping"      value={fmt(result.financials.costs.shipping)}                          sub="carrier estimate"        color="text-gray-300"     />
              <StatCard label="Days to Sell"       value={`${result.marketIntelligence.expectedDaysToSale.low}–${result.marketIntelligence.expectedDaysToSale.high}d`}  sub={result.marketIntelligence.sellThroughVelocity} color="text-gray-300" />
              <StatCard label="Confidence"         value={`${result.confidence.confidencePct.toFixed(0)}%`}               sub={result.confidence.volatility + ' volatility'} color="text-gray-300" />
            </div>

            {/* Sold range */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Sold Range (eBay comps)</div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-400">{fmt(result.marketIntelligence.soldRange.low)}</div>
                  <div className="text-xs text-gray-600">Low</div>
                </div>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-emerald-400 rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{fmt(result.marketIntelligence.soldRange.mid)}</div>
                  <div className="text-xs text-gray-600">Mid</div>
                </div>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-cyan-400">{fmt(result.marketIntelligence.soldRange.high)}</div>
                  <div className="text-xs text-gray-600">High</div>
                </div>
              </div>
            </div>

            {/* Negotiation script */}
            {result.execution.negotiationScript && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Negotiation Script</div>
                <p className="text-sm text-gray-300 italic leading-relaxed">"{result.execution.negotiationScript}"</p>
              </div>
            )}

            {/* Missing info warnings */}
            {result.confidence.missingInformation.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-xs font-semibold text-amber-400 mb-2">Missing information (estimate may be less accurate):</div>
                <ul className="space-y-1">
                  {result.confidence.missingInformation.map((m, i) => (
                    <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
                      <span className="text-amber-500/60 mt-0.5">•</span>{m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-600 text-center">
              Not financial advice. Estimates from real eBay sold listings — actual results may vary.
            </p>
          </div>
        )}

        {/* Upgrade CTA */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 text-center space-y-4">
          <Package className="w-10 h-10 text-emerald-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Want Nova to find flips automatically?</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
            The <strong className="text-white">Flip Finder</strong> scans Craigslist across your city every day for items worth flipping —
            with instant appraisals, negotiation scripts, and email alerts when deals appear.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 font-semibold text-white text-sm transition"
            >
              Sign Up Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/scanner"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-white transition"
            >
              Try Flip Finder
            </Link>
          </div>
          <p className="text-xs text-gray-600">Free plan includes 3 flip scans/day. No credit card required.</p>
        </div>

        {/* FAQ for SEO */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Frequently Asked Questions</h2>
          {[
            {
              q: 'How does the flip calculator work?',
              a: 'It queries real eBay sold listings for your item, computes the median, low, and high sold prices, then subtracts estimated fees, shipping, and taxes to give you an honest net profit estimate.',
            },
            {
              q: 'Is this free?',
              a: 'Yes — the basic calculator is completely free, no account needed. Sign up for a free account to unlock the Flip Finder (automated Craigslist scanning) and full deal history.',
            },
            {
              q: 'What fees does it include?',
              a: 'eBay platform fees (~12%), payment processing (~3%), estimated shipping, and applicable taxes. You can override the buy price to model different scenarios.',
            },
            {
              q: 'How accurate are the estimates?',
              a: 'Accuracy depends on how many comparable sales exist. The confidence score tells you how much data backed the estimate. Sparse comps show lower confidence.',
            },
            {
              q: 'What is a good ROI for flipping?',
              a: 'Most experienced flippers target 20–50%+ ROI on smaller items. Lower margins can still be worth it for high-volume or easy items. Factor in your time.',
            },
          ].map((faq, i) => (
            <details key={i} className="rounded-xl border border-gray-800 bg-gray-900/50 group">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-medium text-white">
                {faq.q}
                <span className="text-gray-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-5 pb-4 text-sm text-gray-400 leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>

      </main>

      <footer className="border-t border-gray-800/60 px-6 py-8 text-center text-xs text-gray-600">
        <Link href="/" className="text-gray-500 hover:text-white transition">NovaNexus</Link>
        {' · '}
        <Link href="/pricing" className="text-gray-500 hover:text-white transition">Pricing</Link>
        {' · '}
        <Link href="/flip" className="text-gray-500 hover:text-white transition">Flip Card</Link>
        {' · '}
        <Link href="/dashboard/scanner" className="text-gray-500 hover:text-white transition">Flip Finder</Link>
        <br />
        <span className="mt-2 block">Not financial advice. Estimates based on real eBay sold listings.</span>
      </footer>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{sub}</div>
    </div>
  );
}

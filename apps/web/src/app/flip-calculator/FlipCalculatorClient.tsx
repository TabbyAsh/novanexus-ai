'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calculator, ArrowRight, ExternalLink,
  CheckCircle, XCircle, AlertCircle, Package,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Shape of POST /v1/flip/appraise — the appraisal payload is spread at the
// top level of data (legacy card fields also present; we only read these).
interface AppraisalResult {
  decision: 'BUY' | 'NEGOTIATE' | 'PASS' | 'WATCH';
  estimateBasis: 'MANUAL_COMPS' | 'LIVE_COMPS' | 'CATEGORY_MODEL';
  flipAccuracy: { category: string; samples: number; medianAbsErrorPct: number; earned: boolean } | null;
  maxBuyPrice: number | null;
  expectedResaleLow: number | null;
  expectedResaleHigh: number | null;
  fastSalePrice: number | null;
  estimatedFees: number | null;
  estimatedShipping: number | null;
  expectedNetProfitLow: number | null;
  expectedNetProfitHigh: number | null;
  expectedNetProfitMid: number | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  reasons: string[];
  warnings: string[];
  negotiationScript: string;
  share_url?: string;
  est_days_to_sell?: string;
  item_category?: string;
  _usage?: { remaining?: number; limit?: number; unlimited?: boolean };
}

const ACTION_CONFIG: Record<AppraisalResult['decision'], { label: string; color: string; bg: string; border: string; icon: typeof CheckCircle }> = {
  BUY:       { label: 'BUY IT',     color: 'text-emerald-300', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', icon: CheckCircle },
  NEGOTIATE: { label: 'MAKE OFFER', color: 'text-cyan-300',    bg: 'bg-cyan-500/20',    border: 'border-cyan-500/40',    icon: AlertCircle },
  PASS:      { label: 'PASS',       color: 'text-red-300',     bg: 'bg-red-500/20',     border: 'border-red-500/40',     icon: XCircle },
  WATCH:     { label: 'NEED DATA',  color: 'text-amber-300',   bg: 'bg-amber-500/20',   border: 'border-amber-500/40',   icon: AlertCircle },
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function fmtOrDash(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? fmt(n) : '—';
}

function parseComps(raw: string): number[] {
  return raw
    .split(/[,\n\s]+/)
    .map((v) => Number(v.replace(/[^0-9.]/g, '')))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export default function FlipCalculatorClient() {
  const [item, setItem]           = useState('');
  const [buyPrice, setBuyPrice]   = useState('');
  const [condition, setCondition] = useState('Good');
  const [compsRaw, setCompsRaw]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<AppraisalResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const parsedComps = useMemo(() => parseComps(compsRaw), [compsRaw]);

  const ebaySoldUrl = item.trim()
    ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.trim())}&LH_Sold=1&LH_Complete=1`
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim() || !buyPrice) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API}/v1/flip/appraise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.trim(),
          askingPrice: parseFloat(buyPrice),
          condition,
          manualComps: parsedComps.length > 0 ? parsedComps : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.decision) {
        setResult(data.data as AppraisalResult);
      } else {
        setError(data.error?.message || 'Could not analyze this item. Try a more specific product name.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cfg = result ? (ACTION_CONFIG[result.decision] ?? ACTION_CONFIG.WATCH) : null;
  const Icon = cfg?.icon ?? AlertCircle;
  const roiPct =
    result && typeof result.expectedNetProfitMid === 'number' && buyPrice && parseFloat(buyPrice) > 0
      ? (result.expectedNetProfitMid / parseFloat(buyPrice)) * 100
      : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Nav */}
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center font-bold text-sm">N</div>
          <span className="font-semibold text-white">NovaNexus</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/analyze" className="text-gray-400 hover:text-white text-sm transition">Full Appraiser</Link>
          <Link href="/register" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
            Sign Up Free
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Free · No signup · Honest math
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Free Flip Calculator
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Paste real sold prices from eBay (one click below) and get an honest verdict:
            net profit after fees, a safe max-buy price, and a negotiation script.
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
                Asking Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="What they want for it"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-7 pr-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500/60 focus:outline-none text-sm"
                  required
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Real Sold Prices <span className="text-gray-600 normal-case">(3+ unlocks a real verdict)</span>
              </label>
              {ebaySoldUrl && (
                <a
                  href={ebaySoldUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
                >
                  See real sold prices on eBay <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <textarea
              value={compsRaw}
              onChange={(e) => setCompsRaw(e.target.value)}
              rows={2}
              placeholder="Paste sold prices like: 145, 160, 152, 170"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500/60 focus:outline-none text-sm resize-none"
            />
            <p className="text-xs text-gray-600 mt-1.5">
              {parsedComps.length > 0
                ? `${parsedComps.length} price${parsedComps.length === 1 ? '' : 's'} detected${parsedComps.length < 3 ? ` — add ${3 - parsedComps.length} more for a comps-backed verdict` : ' — verdict will be based on your comps'}`
                : 'Without sold prices you get a clearly-labeled category estimate — never fake comps.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !item.trim() || !buyPrice}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-white transition-all text-sm"
          >
            <Calculator className="w-4 h-4" />
            {loading ? 'Running the numbers…' : 'Calculate Flip Profit'}
          </button>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
        </form>

        {/* Result */}
        {result && cfg && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* Basis chip — the Trust Law rendered: every number says where it came from */}
            {result.estimateBasis === 'MANUAL_COMPS' ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                Verdict based on the <strong>{parsedComps.length} real sold prices you provided</strong>.
              </div>
            ) : result.estimateBasis === 'LIVE_COMPS' ? (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
                Verdict based on live sold-listing comps.
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                <strong>Category estimate — NOT real comps.</strong> Paste 3+ sold prices above for a real verdict.
                {result.flipAccuracy?.earned && (
                  <span className="block text-xs text-amber-400/80 mt-1">
                    This category&apos;s model has been within ~{result.flipAccuracy.medianAbsErrorPct}% on the last {result.flipAccuracy.samples} real sales.
                  </span>
                )}
              </div>
            )}

            {/* Verdict banner */}
            <div className={`flex items-center gap-4 rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}>
              <Icon className={`w-8 h-8 ${cfg.color} shrink-0`} />
              <div className="flex-1">
                <div className={`text-2xl font-bold ${cfg.color}`}>{cfg.label}</div>
                {result.maxBuyPrice !== null && (
                  <div className="text-sm text-gray-300 mt-0.5">
                    {result.decision === 'NEGOTIATE' ? 'Offer' : 'Safe buy ceiling'}:{' '}
                    <strong className="text-white">{fmt(result.maxBuyPrice)}</strong>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${typeof result.expectedNetProfitMid === 'number' && result.expectedNetProfitMid >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {typeof result.expectedNetProfitMid === 'number'
                    ? `${result.expectedNetProfitMid >= 0 ? '+' : ''}${fmt(result.expectedNetProfitMid)}`
                    : '—'}
                </div>
                <div className="text-xs text-gray-500">est. net profit</div>
              </div>
            </div>

            {/* Numbers grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Resale Range"
                value={`${fmtOrDash(result.expectedResaleLow)}–${fmtOrDash(result.expectedResaleHigh)}`}
                sub={result.estimateBasis === 'MANUAL_COMPS' ? 'from your sold comps' : result.estimateBasis === 'LIVE_COMPS' ? 'from live comps' : 'category estimate'}
                color="text-white"
              />
              <StatCard
                label="Max Buy Price"
                value={fmtOrDash(result.maxBuyPrice)}
                sub="your safe ceiling"
                color="text-emerald-400"
              />
              <StatCard label="eBay Fees"     value={fmtOrDash(result.estimatedFees)}     sub="platform + payment" color="text-gray-300" />
              <StatCard label="Est. Shipping" value={fmtOrDash(result.estimatedShipping)} sub="carrier estimate"   color="text-gray-300" />
              <StatCard label="Days to Sell"  value={result.est_days_to_sell || '—'}      sub={`${result.riskLevel.toLowerCase()} risk`} color="text-gray-300" />
              <StatCard
                label="Confidence"
                value={`${Math.round(result.confidence * 100)}%`}
                sub={roiPct !== null ? `${roiPct.toFixed(0)}% ROI at asking` : 'data-driven score'}
                color={result.confidence >= 0.5 ? 'text-emerald-400' : 'text-amber-400'}
              />
            </div>

            {/* Why */}
            {result.reasons.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Why</div>
                <ul className="space-y-1.5">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-emerald-500/60 mt-0.5">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Negotiation script */}
            {result.negotiationScript && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Negotiation Script</div>
                <p className="text-sm text-gray-300 italic leading-relaxed">&quot;{result.negotiationScript}&quot;</p>
              </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="text-xs font-semibold text-amber-400 mb-2">Watch out:</div>
                <ul className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-gray-500 flex items-start gap-2">
                      <span className="text-amber-500/60 mt-0.5">•</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Share + usage */}
            <div className="text-center space-y-1">
              {result.share_url && (
                <a
                  href={result.share_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-400 hover:text-emerald-300 transition"
                >
                  Share this analysis →
                </a>
              )}
              {typeof result._usage?.remaining === 'number' && result._usage.remaining >= 0 && (
                <p className="text-xs text-gray-600">
                  {result._usage.remaining} of {result._usage.limit} free analyses left today — analyses with 3+ pasted comps are always free.
                </p>
              )}
            </div>

            <p className="text-xs text-gray-600 text-center">
              Not financial advice. With pasted comps, figures derive from the sold prices you provide;
              without them, estimates are clearly labeled as category models.
            </p>
          </div>
        )}

        {/* Upgrade CTA */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 text-center space-y-4">
          <Package className="w-10 h-10 text-emerald-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Want the full appraiser?</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
            The <strong className="text-white">Nova Appraiser</strong> adds seller questions to ask before you buy,
            ready-to-post listing copy, and shareable flip cards — and tracks your results so estimates get sharper over time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 font-semibold text-white text-sm transition"
            >
              Sign Up Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/analyze"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-white transition"
            >
              Open Full Appraiser
            </Link>
          </div>
          <p className="text-xs text-gray-600">3 free analyses per day — comps-backed analyses don&apos;t count against it.</p>
        </div>

        {/* FAQ for SEO */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Frequently Asked Questions</h2>
          {[
            {
              q: 'How does the flip calculator work?',
              a: 'You paste real sold prices from eBay’s public sold-listings search (the form links you straight to it for your item). The calculator builds a resale range from your comps, subtracts eBay fees (~13.25% + $0.30), payment processing, and estimated shipping, then gives a verdict: buy, make an offer at a specific number, or pass — plus a safe max-buy ceiling.',
            },
            {
              q: 'Where do I find sold prices?',
              a: 'On eBay, search your item and check the “Sold Items” filter — or use the “See real sold prices on eBay” link that appears next to the comps field. Use 3 or more recent sales in the same condition as your item for the most honest verdict.',
            },
            {
              q: 'What happens if I don’t paste any sold prices?',
              a: 'You still get an estimate, but it’s clearly labeled as a category model — not real comps — and the calculator refuses to give buy/offer numbers on that basis. We never present modeled numbers as real market data.',
            },
            {
              q: 'Is this free?',
              a: 'Yes — no account needed. You get 3 category-estimate analyses per day, and analyses where you paste 3+ sold prices are always free and unlimited.',
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
        <Link href="/analyze" className="text-gray-500 hover:text-white transition">Full Appraiser</Link>
        <br />
        <span className="mt-2 block">Not financial advice. Verdicts are only as good as the sold prices behind them — which is why we label the basis of every number.</span>
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

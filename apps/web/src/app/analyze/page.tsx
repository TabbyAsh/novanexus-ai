'use client';

import { useState } from 'react';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────
interface FlipCard {
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
  roi_percent?: number;
  est_days_to_sell?: string;
  verdict: 'BUY' | 'NEGOTIATE LOWER' | 'PASS';
  rationale_summary: string;
  negotiation_target_price: number | null;
  assumptions: string[];
  comp_sources: { source: string; count: number; freshness: string }[];
  generated_at: string;
}

type Step = 'input' | 'processing' | 'result';

const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts'] as const;
const PLATFORMS = ['eBay', 'Facebook Marketplace', 'Mercari', 'Poshmark', 'OfferUp', 'Craigslist', 'General'] as const;
const CATEGORIES = [
  '', 'Phones & Tablets', 'Laptops', 'Gaming', 'Audio', 'Electronics', 'Cameras',
  'Instruments', 'Shoes', 'Clothing', 'Tools', 'Furniture', 'Small Appliances',
  'Large Appliances', 'Bikes', 'Collectibles', 'Sports & Fitness', 'Baby', 'Other',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────
const fmt = (n: number) => {
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(abs);
  return n < 0 ? `-${formatted}` : formatted;
};

function confidenceLabel(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Low';
}

// ─── Component ───────────────────────────────────────────────────────
export default function AnalyzePage() {
  const [step, setStep] = useState<Step>('input');
  const [result, setResult] = useState<FlipCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [condition, setCondition] = useState<string>('Good');
  const [category, setCategory] = useState('');
  const [shippingOrPickup, setShippingOrPickup] = useState<'shipping' | 'pickup'>('shipping');
  const [platform, setPlatform] = useState('eBay');
  const [location, setLocation] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !buyPrice) return;

    setStep('processing');
    setError(null);

    try {
      const res = await fetch('/api/proxy/v1/flip-card/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          buy_price: parseFloat(buyPrice),
          condition,
          category: category || undefined,
          shipping_or_pickup: shippingOrPickup,
          target_platform: platform,
          location: location.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.success && data.data) {
        setResult(data.data);
        setStep('result');
      } else {
        setError(data.error?.message || 'Analysis failed. Please try again.');
        setStep('input');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
      setStep('input');
    }
  };

  const reset = () => {
    setStep('input');
    setResult(null);
    setError(null);
    setTitle('');
    setDescription('');
    setBuyPrice('');
    setCondition('Good');
    setCategory('');
    setShippingOrPickup('shipping');
    setPlatform('eBay');
    setLocation('');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 backdrop-blur-xl bg-[#0a0a0f]/80">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white font-semibold">NovaNexus</span>
              <span className="text-gray-500 text-sm">/ Flip Card</span>
            </div>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-gray-400 hover:text-white transition">Sign In</Link>
            <Link href="/register" className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Input Form */}
        {step === 'input' && (
          <div>
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold mb-3">Analyze a Flip</h1>
              <p className="text-gray-400">
                Describe the item you&apos;re considering. We&apos;ll estimate resale value, costs, and give you a clear verdict.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Item title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sony WH-1000XM5 Headphones" required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description <span className="text-gray-500">(optional)</span></label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Any extra details — model, color, damage..." rows={2}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Asking price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                    <input type="number" step="0.01" min="0" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="0.00" required
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition">
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Category <span className="text-gray-500">(optional)</span></label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition">
                    <option value="">Auto-detect</option>
                    {CATEGORIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Sell on</label>
                  <select value={platform} onChange={e => setPlatform(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition">
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Fulfillment</label>
                <div className="flex gap-3">
                  {(['shipping', 'pickup'] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setShippingOrPickup(opt)}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${
                        shippingOrPickup === opt
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                          : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}>
                      {opt === 'shipping' ? 'Ship it' : 'Local pickup'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Location <span className="text-gray-500">(optional)</span></label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Los Angeles, CA"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition" />
              </div>

              <button type="submit" className="w-full py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg transition">
                Get My Flip Card
              </button>
              <p className="text-center text-xs text-gray-500">3 free analyses per day. No account required.</p>
            </form>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin mb-8" />
            <p className="text-gray-400">Looking up sold prices and calculating...</p>
          </div>
        )}

        {/* Result */}
        {step === 'result' && result && (
          <div>
            {/* Verdict Banner */}
            <div className={`text-center py-8 px-6 rounded-2xl mb-8 ${
              result.verdict === 'BUY' ? 'bg-emerald-900/40 border-2 border-emerald-500/60'
              : result.verdict === 'NEGOTIATE LOWER' ? 'bg-amber-900/40 border-2 border-amber-500/60'
              : 'bg-red-900/40 border-2 border-red-500/60'
            }`}>
              <div className={`text-5xl font-black mb-3 ${
                result.verdict === 'BUY' ? 'text-emerald-400'
                : result.verdict === 'NEGOTIATE LOWER' ? 'text-amber-400'
                : 'text-red-400'
              }`}>
                {result.verdict}
              </div>
              <p className="text-gray-300 max-w-xl mx-auto">{result.rationale_summary}</p>
            </div>

            {/* Item Summary + Confidence */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold text-white">{result.item_title}</h2>
                  <p className="text-sm text-gray-400">{result.item_category} · {result.condition_assessment}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">{confidenceLabel(result.confidence_score)} confidence</div>
                  <div className="text-lg font-bold text-white">{result.confidence_score}%</div>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  result.confidence_score >= 60 ? 'bg-emerald-500' : result.confidence_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                }`} style={{ width: `${result.confidence_score}%` }} />
              </div>
            </div>

            {/* Economics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Economics</h3>
              <div className="space-y-3">
                <Row label="Your buy price" value={fmt(result.buy_price)} />
                {result.roi_percent !== undefined && (
                  <Row label="Return on investment" value={`${result.roi_percent > 0 ? '+' : ''}${result.roi_percent}%`} highlight={result.roi_percent > 0} />
                )}
                {result.est_days_to_sell && (
                  <Row label="Estimated time to sell" value={result.est_days_to_sell} dim />
                )}
                <div className="border-t border-gray-800 pt-3">
                  <div className="text-xs text-gray-500 mb-2">Estimated resale</div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><div className="text-sm text-gray-400">Low</div><div className="text-lg font-semibold text-white">{fmt(result.est_resale_low)}</div></div>
                    <div><div className="text-sm text-gray-400">Mid</div><div className="text-lg font-bold text-white">{fmt(result.est_resale_mid)}</div></div>
                    <div><div className="text-sm text-gray-400">High</div><div className="text-lg font-semibold text-white">{fmt(result.est_resale_high)}</div></div>
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-3">
                  <Row label="Platform fees (est.)" value={`-${fmt(result.est_platform_fees)}`} dim />
                  <Row label="Shipping (est.)" value={result.est_shipping_cost > 0 ? `-${fmt(result.est_shipping_cost)}` : 'Free (pickup)'} dim />
                </div>
                <div className="border-t border-gray-800 pt-3">
                  <div className="text-xs text-gray-500 mb-2">Expected net profit</div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><div className="text-sm text-gray-400">Low</div><ProfitValue value={result.est_net_profit_low} /></div>
                    <div><div className="text-sm text-gray-400">Mid</div><ProfitValue value={result.est_net_profit_mid} bold /></div>
                    <div><div className="text-sm text-gray-400">High</div><ProfitValue value={result.est_net_profit_high} /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Negotiation Target */}
            {result.negotiation_target_price && (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💡</span>
                  <div>
                    <div className="text-amber-300 font-semibold">Negotiation target</div>
                    <p className="text-gray-300 text-sm">
                      Offer <span className="text-amber-400 font-bold">{fmt(result.negotiation_target_price)}</span> or less — at that price, this becomes a solid flip.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Next Steps */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">What to do next</h3>
              {result.verdict === 'BUY' && (
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span> Secure the item at {fmt(result.buy_price)} or negotiate lower for extra margin</li>
                  <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span> List on {platform} with clean photos and detailed description</li>
                  <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span> Price competitively around {fmt(result.est_resale_mid)} based on recent sold comps</li>
                </ul>
              )}
              {result.verdict === 'NEGOTIATE LOWER' && (
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span> Don&apos;t buy at the asking price — the margin is too thin</li>
                  {result.negotiation_target_price && (
                    <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span> Counter-offer at {fmt(result.negotiation_target_price)} for a worthwhile flip</li>
                  )}
                  <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span> If they won&apos;t negotiate, walk away — there are always more deals</li>
                </ul>
              )}
              {result.verdict === 'PASS' && (
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">→</span> Skip this one — the numbers don&apos;t work at this price</li>
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">→</span> Look for the same item at a lower buy price or in better condition</li>
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">→</span> High-demand categories like phones, gaming, and audio tend to flip faster</li>
                </ul>
              )}
            </div>

            {/* Risk Flags */}
            {result.risk_flags.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Risk Flags
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    result.risk_score >= 60 ? 'bg-red-900/50 text-red-400'
                    : result.risk_score >= 30 ? 'bg-amber-900/50 text-amber-400'
                    : 'bg-gray-800 text-gray-400'
                  }`}>{result.risk_score}/100</span>
                </h3>
                <ul className="space-y-2">
                  {result.risk_flags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-amber-500 mt-0.5">⚠</span> {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Comp Sources */}
            {result.comp_sources.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Data Sources</h3>
                {result.comp_sources.map((cs, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{cs.source}</span>
                    <span className="text-gray-500">{cs.count > 0 ? `${cs.count} comps · ${cs.freshness}` : cs.freshness}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Assumptions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Assumptions</h3>
              <ul className="space-y-1.5">
                {result.assumptions.map((a, i) => (
                  <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                    <span className="text-gray-600">·</span> {a}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-gray-600 italic">
                This is a structured estimate, not a guarantee. Actual results depend on condition, timing, local demand, and buyer negotiation.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button onClick={reset} className="flex-1 py-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition">
                Analyze Another
              </button>
              <Link href="/register" className="py-4 px-6 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-lg hover:shadow-cyan-500/20 text-white font-medium transition text-center">
                Unlock Unlimited
              </Link>
            </div>

            <p className="text-center text-xs text-gray-600 mt-8">
              Powered by NovaNexus · {new Date(result.generated_at).toLocaleString()}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────
function Row({ label, value, dim, highlight }: { label: string; value: string; dim?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={dim ? 'text-sm text-gray-500' : 'text-sm text-gray-300'}>{label}</span>
      <span className={highlight ? 'text-sm font-medium text-emerald-400' : dim ? 'text-sm text-gray-400' : 'text-sm font-medium text-white'}>{value}</span>
    </div>
  );
}

function ProfitValue({ value, bold }: { value: number; bold?: boolean }) {
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
  const display = value < 0 ? `-${formatted}` : formatted;
  return (
    <div className={`text-lg ${bold ? 'font-bold' : 'font-semibold'} ${
      value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-gray-400'
    }`}>
      {display}
    </div>
  );
}

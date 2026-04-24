'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface FlipResult {
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

const fmt = (n: number) => {
  const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
  return n < 0 ? `-${f}` : f;
};

export default function SharedResultPage() {
  const params = useParams();
  const id = params?.id as string;
  const [result, setResult] = useState<FlipResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/proxy/v1/flip-card/result/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.result) {
          setResult(data.data.result);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Analysis not found</h1>
        <p className="text-gray-400">This analysis may have expired or the link is invalid.</p>
        <Link href="/analyze" className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition">
          Run Your Own Analysis
        </Link>
      </div>
    );
  }

  const verdictColor = result.verdict === 'BUY' ? 'emerald' : result.verdict === 'NEGOTIATE LOWER' ? 'amber' : 'red';

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
          <Link href="/analyze" className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-medium hover:shadow-lg transition-all">
            Analyze Your Own
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Shared badge */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
            Shared Flip Card Analysis
          </span>
        </div>

        {/* Verdict */}
        <div className={`text-center py-8 px-6 rounded-2xl mb-8 bg-${verdictColor}-900/40 border-2 border-${verdictColor}-500/60`}>
          <div className={`text-5xl font-black mb-3 text-${verdictColor}-400`}>
            {result.verdict}
          </div>
          <p className="text-gray-300 max-w-xl mx-auto">{result.rationale_summary}</p>
        </div>

        {/* Item + Confidence */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold text-white">{result.item_title}</h2>
              <p className="text-sm text-gray-400">{result.item_category} · {result.condition_assessment}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">
                {result.confidence_score >= 70 ? 'High' : result.confidence_score >= 40 ? 'Moderate' : 'Low'} confidence
              </div>
              <div className="text-lg font-bold text-white">{result.confidence_score}%</div>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${
              result.confidence_score >= 60 ? 'bg-emerald-500' : result.confidence_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
            }`} style={{ width: `${result.confidence_score}%` }} />
          </div>
        </div>

        {/* Economics */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Economics</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Buy price</span>
              <span className="text-white font-medium">{fmt(result.buy_price)}</span>
            </div>
            {result.roi_percent !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Return on investment</span>
                <span className={result.roi_percent > 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                  {result.roi_percent > 0 ? '+' : ''}{result.roi_percent}%
                </span>
              </div>
            )}
            {result.est_days_to_sell && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Est. time to sell</span>
                <span className="text-gray-400">{result.est_days_to_sell}</span>
              </div>
            )}
            <div className="border-t border-gray-800 pt-3 grid grid-cols-3 gap-3 text-center">
              <div><div className="text-sm text-gray-400">Low</div><div className="text-lg font-semibold text-white">{fmt(result.est_resale_low)}</div></div>
              <div><div className="text-sm text-gray-400">Mid</div><div className="text-lg font-bold text-white">{fmt(result.est_resale_mid)}</div></div>
              <div><div className="text-sm text-gray-400">High</div><div className="text-lg font-semibold text-white">{fmt(result.est_resale_high)}</div></div>
            </div>
            <div className="border-t border-gray-800 pt-3 grid grid-cols-3 gap-3 text-center">
              <div><div className="text-sm text-gray-400">Low</div><div className={`text-lg font-semibold ${result.est_net_profit_low > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(result.est_net_profit_low)}</div></div>
              <div><div className="text-sm text-gray-400">Profit</div><div className={`text-lg font-bold ${result.est_net_profit_mid > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(result.est_net_profit_mid)}</div></div>
              <div><div className="text-sm text-gray-400">High</div><div className={`text-lg font-semibold ${result.est_net_profit_high > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(result.est_net_profit_high)}</div></div>
            </div>
          </div>
        </div>

        {/* Risk Flags */}
        {result.risk_flags.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Risk Flags</h3>
            <ul className="space-y-2">
              {result.risk_flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-amber-500 mt-0.5">⚠</span> {flag}
                </li>
              ))}
            </ul>
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
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <Link
            href="/analyze"
            className="inline-block px-8 py-4 rounded-xl text-lg font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/30 transition-all"
          >
            Run Your Own Flip Card Analysis — Free
          </Link>
          <p className="text-xs text-gray-500">3 free per day · No account needed · Real eBay sold data</p>
        </div>

        <p className="text-center text-xs text-gray-700 mt-8">
          Powered by NovaNexus · {new Date(result.generated_at).toLocaleString()}
        </p>
      </main>
    </div>
  );
}

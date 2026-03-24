'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg" />
            <span className="text-2xl font-bold text-white">NovaNexus</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Billing successful</h1>
          <p className="text-gray-400">
            Your checkout completed successfully. Subscription access may take a moment to activate.
          </p>
        </div>

        {sessionId && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
            <p className="text-gray-400 text-sm mb-1">Checkout session</p>
            <p className="text-white font-mono text-sm break-all">{sessionId}</p>
          </div>
        )}

        {/* What happens next */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-cyan-400 mb-4">What happens next</h2>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
              <div><span className="text-white font-medium">Daily Brief — Pre-Market</span><br /><span className="text-gray-400">Every weekday before 9:00 AM ET, you’ll receive a curated watchlist with structured setups: entry, stop, target, confidence tier, and regime context.</span></div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
              <div><span className="text-white font-medium">Outcome Tracking</span><br /><span className="text-gray-400">After market close, we track what happened to every setup. This feeds into our accuracy metrics.</span></div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
              <div><span className="text-white font-medium">Dashboard Access</span><br /><span className="text-gray-400">AI screener, decision cards, journal, and paper trading are now unlocked.</span></div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
              <div><span className="text-white font-medium">Welcome Email</span><br /><span className="text-gray-400">Check your inbox for a welcome message with full details on how to get the most from your subscription.</span></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/screener"
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium transition text-center"
          >
            Open AI Screener →
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-3 rounded-xl border border-white/15 hover:bg-white/10 text-white font-medium transition text-center"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/dashboard/settings"
            className="px-5 py-3 rounded-xl border border-white/15 hover:bg-white/10 text-gray-300 font-medium transition text-center"
          >
            Manage Subscription
          </Link>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
          <p className="text-xs text-gray-400">
            <span className="text-yellow-400 font-medium">Disclaimer:</span> Nova provides structured market analysis, not financial advice. 
            Past performance does not predict future results. All trading involves risk. You make all trading decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

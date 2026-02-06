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

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/settings"
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-center"
          >
            Go to Settings
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-3 rounded-xl border border-white/15 hover:bg-white/10 text-white font-medium transition text-center"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="mt-8 text-xs text-gray-500">
          If you don’t see access updates, refresh the page or open Settings → Billing.
        </div>
      </div>
    </div>
  );
}

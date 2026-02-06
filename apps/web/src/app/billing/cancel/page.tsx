import Link from 'next/link';

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg" />
            <span className="text-2xl font-bold text-white">NovaNexus</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Checkout canceled</h1>
          <p className="text-gray-400">
            No payment was completed. You can return to pricing and try again at any time.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/pricing"
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition text-center"
          >
            Back to Pricing
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-3 rounded-xl border border-white/15 hover:bg-white/10 text-white font-medium transition text-center"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

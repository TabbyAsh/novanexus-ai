import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
            <span className="text-2xl font-bold text-white">NovaNexus</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-gray-400">Last updated: February 6, 2026</p>
        </div>

        <div className="prose prose-invert prose-gray max-w-none">
          <p className="text-gray-300">
            These Terms of Service govern your use of NovaNexus. By using the service, you agree to these terms.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">1. No financial advice</h2>
          <p className="text-gray-300">
            NovaNexus provides analytical and educational tooling. Nothing in the service constitutes financial,
            investment, legal, or tax advice.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">2. Governance and safety</h2>
          <p className="text-gray-300">
            Intelligence does not execute by default. Actions may be gated by policy, approvals, and safety controls.
            You are responsible for all decisions made using the platform.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">3. Accounts</h2>
          <ul className="text-gray-300 space-y-2">
            <li>You must provide accurate account information.</li>
            <li>You are responsible for safeguarding access credentials and tokens.</li>
            <li>You must not misuse or attempt to bypass authorization, rate limits, or governance controls.</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">4. Payments</h2>
          <p className="text-gray-300">
            If you purchase a subscription, billing is handled by our payment processor. Subscription access is
            controlled by entitlements.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">5. Limitation of liability</h2>
          <p className="text-gray-300">
            The service is provided “as is” without warranties. To the maximum extent permitted by law, we are not
            liable for any losses arising from your use of the service.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">6. Contact</h2>
          <p className="text-gray-300">
            For questions, contact{' '}
            <a href="mailto:legal@nova-enterprises.dev" className="text-blue-400 hover:underline">
              legal@nova-enterprises.dev
            </a>
            .
          </p>
        </div>

        <div className="mt-12 flex gap-4">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            Home
          </Link>
          <Link href="/privacy" className="text-blue-400 hover:text-blue-300 transition">
            Privacy
          </Link>
          <Link href="/legal/risk-disclosure" className="text-gray-400 hover:text-white transition">
            Risk Disclosure
          </Link>
        </div>
      </div>
    </div>
  );
}

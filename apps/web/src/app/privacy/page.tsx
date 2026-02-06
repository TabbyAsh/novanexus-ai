import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
            <span className="text-2xl font-bold text-white">NovaNexus</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-gray-400">Last updated: February 6, 2026</p>
        </div>

        <div className="prose prose-invert prose-gray max-w-none">
          <p className="text-gray-300">
            This Privacy Policy describes how Nova Enterprises ("we") collects, uses, and protects
            information when you use NovaNexus.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">1. Information we collect</h2>
          <ul className="text-gray-300 space-y-2">
            <li>
              <strong>Account data</strong> (e.g., email address, organization name) required to create and secure
              your account.
            </li>
            <li>
              <strong>Usage and audit data</strong> (e.g., events, request identifiers, and system logs) required for
              governance, reliability, and security.
            </li>
            <li>
              <strong>Billing metadata</strong> (e.g., Stripe customer/subscription identifiers) when you subscribe.
              We do not store full card numbers.
            </li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">2. How we use information</h2>
          <ul className="text-gray-300 space-y-2">
            <li>To provide the service (authentication, entitlements, and core product functionality).</li>
            <li>To maintain an auditable system of record (truth/trust ledgers and governance artifacts).</li>
            <li>To prevent fraud, abuse, and unauthorized access.</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">3. Data retention</h2>
          <p className="text-gray-300">
            We retain audit and ledger data to support integrity, compliance, and replayability. Where applicable,
            retention is minimized to what is necessary for operational and legal requirements.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">4. Sharing</h2>
          <p className="text-gray-300">
            We may share limited data with service providers strictly to operate the platform (e.g., Stripe for billing).
            We do not sell personal information.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">5. Security</h2>
          <p className="text-gray-300">
            We use technical and organizational safeguards designed to protect your information. No system is
            perfectly secure.
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">6. Contact</h2>
          <p className="text-gray-300">
            For privacy questions, contact{' '}
            <a href="mailto:privacy@nova-enterprises.dev" className="text-blue-400 hover:underline">
              privacy@nova-enterprises.dev
            </a>
            .
          </p>
        </div>

        <div className="mt-12 flex gap-4">
          <Link href="/" className="text-gray-400 hover:text-white transition">
            Home
          </Link>
          <Link href="/terms" className="text-blue-400 hover:text-blue-300 transition">
            Terms
          </Link>
          <Link href="/legal/risk-disclosure" className="text-gray-400 hover:text-white transition">
            Risk Disclosure
          </Link>
        </div>
      </div>
    </div>
  );
}

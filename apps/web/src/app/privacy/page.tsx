import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Nova Enterprises',
  description: 'How Nova Enterprises collects, uses, and protects your personal information.',
};

const SECTIONS = [
  {
    title: '1. Information We Collect',
    items: [
      'Account information: email address, hashed password (never stored in plaintext), and organization name when you register.',
      'Usage data: features you use, cards you generate, outcomes you log, and actions you take. This powers the calibration and learning systems.',
      'Financial data: if you connect a broker account (e.g., Alpaca), we store encrypted API credentials. We do not store balances or execute trades without your explicit action.',
      'Payment data: processed by Stripe. We do not store credit card numbers. We receive payment confirmation and your subscription tier.',
      'Communication data: if you contact us by email, we retain that correspondence.',
      'Device and access data: IP addresses, browser type, and timestamps for security and fraud prevention.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    items: [
      'To provide, operate, and improve the Platform.',
      'To generate personalized Decision Cards and calibrate recommendations from your logged outcomes.',
      'To send transactional emails: account confirmations, receipts, and alerts you have opted into.',
      'To detect and prevent fraud, abuse, and unauthorized access.',
      'To comply with applicable laws and respond to legal requests.',
      'We do not sell your personal information to third parties.',
      'We do not use your data to train AI models sold to other companies.',
    ],
  },
  {
    title: '3. Data Retention',
    items: [
      'Your account data is retained as long as your account is active.',
      'If you delete your account, personal information is removed within 30 days. Aggregated, anonymized data may be retained.',
      'Outcome and decision data is stored to calibrate your personal recommendations. You may request deletion at any time.',
    ],
  },
  {
    title: '4. Third-Party Services',
    items: [
      'Stripe: payment processing. Stripe\'s privacy policy governs data handled during payment.',
      'Resend: email delivery infrastructure.',
      'Railway and Vercel: cloud hosting and infrastructure.',
      'Alpaca Markets: optional broker integration. Your Alpaca account is subject to Alpaca\'s own terms.',
      'Google Gemini / Groq: AI card generation. Situation descriptions you enter are sent to generate responses. We do not retain prompts beyond the active request.',
    ],
  },
  {
    title: '5. Cookies and Local Storage',
    items: [
      'We use browser local storage to maintain your login session and store some tool data locally (e.g., income tracker sessions).',
      'We use minimal cookies for authentication only. We do not use advertising cookies or third-party tracking.',
    ],
  },
  {
    title: '6. Security',
    items: [
      'All data is transmitted over HTTPS.',
      'Passwords are hashed using bcrypt and never stored in plaintext.',
      'Broker API keys are encrypted at rest.',
      'The event log uses hash chaining to maintain audit integrity.',
      'If you discover a security vulnerability, contact hello@novanexus-ai.com.',
    ],
  },
  {
    title: '7. Your Rights',
    items: [
      'Access: request a copy of your personal data at any time.',
      'Correction: update account information through the Settings page.',
      'Deletion: request deletion of your account and associated data.',
      'Portability: export your decision cards, outcomes, and journal entries using the built-in CSV export features.',
      'To exercise any of these rights, email hello@novanexus-ai.com.',
    ],
  },
  {
    title: '8. Children\'s Privacy',
    items: [
      'The Platform is not intended for individuals under 18. We do not knowingly collect personal information from minors. If you believe a minor has registered, contact us immediately.',
    ],
  },
  {
    title: '9. International Users',
    items: [
      'The Platform is operated from the United States. If you access it from outside the US, your data may be transferred to and processed in the United States.',
      'We apply GDPR principles of data minimization, purpose limitation, and user rights to all users regardless of location.',
    ],
  },
  {
    title: '10. Nova Lens Browser Extension',
    items: [
      'Nova Lens runs only on eBay listing pages (ebay.com/itm/…). It does not run on any other site, and it has no access to your browsing history or other tabs.',
      'What it reads: the title, asking price, condition, and shipping cost shown on the listing you are viewing, plus recent sold prices for that item fetched from eBay\'s own public sold-listings search using your existing browser session.',
      'What it sends: that item description and the list of sold prices are sent to Nova\'s appraisal service to compute the verdict. Nothing else leaves your browser.',
      'What we log: the appraisal request, its verdict, and the requesting IP address, for abuse prevention and free-tier rate limiting. No account is required to use the extension.',
      'What it never collects: your eBay credentials, cookies, session tokens, payment details, messages, purchase history, or any personally identifying information. Nova Lens reads page content only — it never authenticates as you.',
      'We do not sell extension data, use it for advertising, or transfer it to third parties beyond the AI and hosting providers listed in section 4.',
      'Remove it at any time from chrome://extensions. Uninstalling stops all collection immediately.',
    ],
  },
  {
    title: '11. Changes to This Policy',
    items: [
      'We may update this Privacy Policy. We will notify registered users of material changes by email. Continued use after changes constitutes acceptance of the updated policy.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <Link href="/terms" className="text-gray-500 text-sm hover:text-white transition">Terms of Service</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-14 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: June 4, 2026</p>
          <p className="text-gray-400 text-sm mt-4 leading-relaxed">
            Nova Enterprises operates NovaNexus and related services (the &quot;Platform&quot;). This policy explains what
            information we collect, how we use it, and your rights regarding that information. By using the Platform, you agree
            to this policy.
          </p>
        </div>

        {SECTIONS.map(s => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-white mb-3">{s.title}</h2>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className="text-gray-400 text-sm leading-relaxed flex items-start gap-2">
                  <span className="text-gray-700 mt-1.5 shrink-0">•</span>{item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="pt-6 border-t border-gray-800">
          <h2 className="text-base font-semibold text-white mb-2">Contact</h2>
          <div className="text-gray-400 text-sm space-y-1">
            <p>Nova Enterprises</p>
            <p>Email: <a href="mailto:hello@novanexus-ai.com" className="text-emerald-400 hover:text-emerald-300">hello@novanexus-ai.com</a></p>
            <p>Website: <a href="https://novanexus-ai.com" className="text-emerald-400 hover:text-emerald-300">novanexus-ai.com</a></p>
          </div>
        </div>

        <div className="text-xs text-gray-600 flex gap-4 pt-2">
          <Link href="/terms"                className="hover:text-gray-400 transition">Terms of Service</Link>
          <Link href="/legal/risk-disclosure" className="hover:text-gray-400 transition">Risk Disclosure</Link>
          <Link href="/"                     className="hover:text-gray-400 transition">Home</Link>
        </div>
      </main>
    </div>
  );
}

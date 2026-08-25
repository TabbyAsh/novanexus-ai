import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Nova Enterprises',
  description: 'Terms and conditions for using Nova Enterprises and the NovaNexus platform.',
};

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    items: [
      'By accessing or using the Platform, you agree to be bound by these Terms. If you do not agree, do not use the Platform.',
      'You must be at least 18 years old to use the Platform.',
      'If you are using the Platform on behalf of an organization, you represent that you have authority to bind that organization to these Terms.',
    ],
  },
  {
    title: '2. Description of Service',
    items: [
      'Nova Enterprises provides a private operator workspace, limited research and paper-workflow tools, and separately scoped human-delivered business services.',
      'Capabilities labeled Preview, unavailable, paper, or sandbox are not represented as complete, live, or able to affect real funds.',
      'The public Workflow Setup Pilot is a one-time human-delivered service. It does not include a software subscription or automated business administration.',
    ],
  },
  {
    title: '3. Not Financial Advice',
    items: [
      'IMPORTANT: Nothing on the Platform constitutes financial, investment, trading, or legal advice.',
      'Stock screener outputs, trade signals, thesis cards, and all market-related tools are for informational and research purposes only.',
      'Past pattern performance does not guarantee future results. You may lose money. All trading decisions are solely yours.',
      'Flip card resale estimates are approximations based on available market data. Actual resale prices may differ significantly.',
      'Always consult a licensed financial advisor, attorney, or tax professional for decisions that affect your finances.',
    ],
  },
  {
    title: '4. Account Responsibilities',
    items: [
      'You are responsible for maintaining the confidentiality of your account credentials.',
      'You are responsible for all activity that occurs under your account.',
      'You agree to notify us immediately of any unauthorized access to your account.',
      'You may not share your account credentials with others or create accounts for automated access without permission.',
    ],
  },
  {
    title: '5. Billing, Pilot Scope, and Refunds',
    items: [
      'The public Workflow Setup Pilot costs $150 as a one-time payment. It does not renew and does not create a subscription.',
      'Submitting an intake or making payment does not by itself mean that scope has been accepted or that work has begun.',
      'Before work begins, we will confirm the accepted scope and the access or information required from you in writing.',
      'You may request a full refund of the Workflow Setup Pilot payment at any time before work begins by emailing hello@novanexus-ai.com with your service receipt.',
      'Once work begins, any cancellation, refund, or change is handled under the written scope agreed with you and applicable law.',
      'The seven-business-day delivery target begins only after written scope acceptance and receipt of the required access and information. It is a target, not a guarantee, and pauses while required client input is missing.',
      'Nova subscriptions are not currently offered for public self-serve purchase. Any future or privately offered recurring plan will disclose its price, renewal, cancellation, and refund terms before purchase.',
    ],
  },
  {
    title: '6. Acceptable Use',
    items: [
      'You may not use the Platform for any unlawful purpose or in violation of these Terms.',
      'You may not attempt to bypass security controls, access other users\' data, or reverse-engineer the Platform.',
      'You may not use automated tools to scrape, crawl, or extract data from the Platform without written permission.',
      'You may not use the Platform to generate content that harasses, threatens, or harms others.',
      'You may not misrepresent your identity, affiliation, or the nature of your business.',
    ],
  },
  {
    title: '7. Intellectual Property',
    items: [
      'The Platform, its code, design, content, and branding are the property of Nova Enterprises.',
      'Decision Cards you generate using the Platform based on your own input are yours. Generic template content remains our property.',
      'You retain ownership of your business data. For an accepted Workflow Setup Pilot, you own the client-specific records and workspace we create for you; our pre-existing methods and generic templates remain ours, with a perpetual right for you to use the delivered copies in your business.',
      'You grant us a license to use data you log (outcomes, decisions) in anonymized, aggregated form to improve the Platform.',
      'You may not copy, modify, distribute, or create derivative works of the Platform without written permission.',
    ],
  },
  {
    title: '8. Third-Party Integrations',
    items: [
      'The Platform uses third-party services including Stripe, Resend, hosting providers, and selected data or AI providers where a capability is enabled.',
      'Your use of third-party services is subject to those services\' own terms and policies.',
      'We are not responsible for the availability, accuracy, or actions of third-party services.',
      'Nova does not currently offer public live-broker execution. Any future broker connection will require separate authorization and does not transfer responsibility for trading decisions to Nova Enterprises.',
    ],
  },
  {
    title: '9. Disclaimers and Limitation of Liability',
    items: [
      'THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.',
      'WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT DATA WILL BE ACCURATE OR COMPLETE.',
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, NOVA ENTERPRISES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING TRADING LOSSES, LOST PROFITS, OR LOSS OF DATA.',
      'OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE PLATFORM SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.',
    ],
  },
  {
    title: '10. Indemnification',
    items: [
      'You agree to indemnify and hold harmless Nova Enterprises from any claims, damages, or expenses arising from your use of the Platform, your violation of these Terms, or your violation of any third-party rights.',
    ],
  },
  {
    title: '11. Termination',
    items: [
      'We may suspend or terminate your account for violation of these Terms, suspected fraud, or for any other reason with reasonable notice.',
      'Upon termination, your right to use the Platform ends immediately. You may request an export of your data within 30 days of termination.',
    ],
  },
  {
    title: '12. Governing Law',
    items: [
      'These Terms are governed by the laws of the United States. Disputes shall be resolved through binding arbitration or in courts of competent jurisdiction.',
    ],
  },
  {
    title: '13. Changes to Terms',
    items: [
      'We may update these Terms. Material changes will be communicated by email to registered users. Continued use after changes constitutes acceptance.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <Link href="/privacy" className="text-gray-500 text-sm hover:text-white transition">Privacy Policy</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-14 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-gray-500 text-sm">Last updated: August 25, 2026</p>
          <p className="text-gray-400 text-sm mt-4 leading-relaxed">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the services provided by Nova Enterprises,
            including the NovaNexus platform and all associated tools and products (collectively, the &quot;Platform&quot;).
            Please read these Terms carefully before using the Platform.
          </p>
        </div>

        {SECTIONS.map(s => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-white mb-3">{s.title}</h2>
            <ul className="space-y-2">
              {s.items.map((item, i) => (
                <li key={i} className={`text-sm leading-relaxed flex items-start gap-2 ${
                  item.startsWith('IMPORTANT') || item.toUpperCase() === item
                    ? 'text-amber-300/80' : 'text-gray-400'
                }`}>
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
          </div>
        </div>

        <div className="text-xs text-gray-600 flex gap-4 pt-2">
          <Link href="/privacy"              className="hover:text-gray-400 transition">Privacy Policy</Link>
          <Link href="/legal/risk-disclosure" className="hover:text-gray-400 transition">Risk Disclosure</Link>
          <Link href="/"                     className="hover:text-gray-400 transition">Home</Link>
        </div>
      </main>
    </div>
  );
}

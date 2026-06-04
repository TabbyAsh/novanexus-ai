import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Young Operator Playbook — Nova Enterprises',
  description: 'A practical guide for becoming more professional, more articulate, and more useful in rooms where opportunity moves. For people who did not grow up around business language.',
};

const MODULES = [
  { num: '01', title: 'How to Write Professionally', desc: 'Emails, follow-ups, thank-you messages, introductions.' },
  { num: '02', title: 'How to Speak in Meetings', desc: 'Questions, summaries, disagreement, confidence without arrogance.' },
  { num: '03', title: 'How to Follow Up', desc: 'After interviews, sales calls, networking, client meetings.' },
  { num: '04', title: 'How to Ask for Favors', desc: 'Without sounding needy, vague, or transactional.' },
  { num: '05', title: 'How to Look Serious', desc: 'Presentation, punctuality, preparation, documentation.' },
  { num: '06', title: 'How to Become Useful', desc: 'Turning yourself into the person who reduces confusion for others.' },
];

export default function PlaybookPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <Link href="/decision-cards" className="text-gray-500 text-sm hover:text-white transition">Decision Cards</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mb-6">
            Digital Guide · PDF + Templates
          </div>
          <h1 className="text-4xl font-bold text-white mb-5">Young Operator Playbook</h1>
          <p className="text-gray-400 text-lg leading-relaxed mb-3">
            A practical guide for becoming more professional, more articulate, and more useful in rooms where opportunity moves.
          </p>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            For people who did not grow up around business language, professional rooms, networking, money conversations, or white-collar expectations.
          </p>
        </div>

        {/* Modules */}
        <div className="space-y-3">
          {MODULES.map(mod => (
            <div key={mod.num} className="flex items-start gap-4 rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4">
              <span className="text-2xl font-bold text-gray-700 shrink-0 tabular-nums">{mod.num}</span>
              <div>
                <div className="text-sm font-semibold text-white">{mod.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{mod.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white text-center">Get the Playbook</h2>
          {[
            { name: 'PDF Guide', price: '$27', includes: '6-module guide, immediately downloadable' },
            { name: 'Guide + Templates', price: '$47', includes: 'PDF guide + email templates, scripts, and follow-up frameworks', highlight: true },
            { name: 'Full Package', price: '$97', includes: 'Guide + templates + video walkthrough of each module' },
          ].map(tier => (
            <div key={tier.name}
              className={`rounded-2xl border p-5 flex items-center justify-between ${
                tier.highlight ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-900/40'
              }`}>
              <div>
                <div className={`text-sm font-bold ${tier.highlight ? 'text-amber-400' : 'text-white'}`}>{tier.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{tier.includes}</div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xl font-bold text-white">{tier.price}</span>
                <a href="mailto:hello@novanexus-ai.com?subject=Young Operator Playbook"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    tier.highlight
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'border border-gray-700 text-gray-400 hover:text-white'
                  }`}>
                  Get It
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-600 mb-4">Or start free with the Field Manual — same principles, no paywall.</p>
          <Link href="/field-manual"
            className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition">
            Read the Field Manual <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}

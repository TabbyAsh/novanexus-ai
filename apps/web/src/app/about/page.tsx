import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About — Nova Enterprises',
  description: 'Nova Enterprises is building decision intelligence for ordinary people. The tools that help anyone make a better move.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/careers"   className="text-gray-500 hover:text-white transition">Careers</Link>
          <Link href="/enterprise" className="text-gray-500 hover:text-white transition">Enterprise</Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div>
          <h1 className="text-4xl font-bold text-white mb-5">About Nova Enterprises</h1>
          <p className="text-xl text-gray-400 leading-relaxed">
            Nova exists to give ordinary people access to decision power.
          </p>
        </div>

        <div className="space-y-5 text-gray-400 leading-relaxed">
          <p>
            Most tools that help people make better decisions — real market intelligence, business operating systems,
            financial analysis, outcome tracking — are designed for institutions. They require capital, expertise,
            or access that most people don&apos;t have.
          </p>
          <p>
            Nova is the attempt to change that. Not with vague AI promises, but with specific, honest tools
            that help anyone — a contractor pricing a job, a gig worker tracking real earnings,
            a first-time operator setting up their back office, a person who doesn&apos;t know what to do next —
            find the clearest path forward.
          </p>
          <p>
            Every tool we build follows the same structure: input → analysis → recommendation → action → outcome → learning.
            The system gets better the more you use it. What worked, what didn&apos;t, what to do next time.
            That loop is the product.
          </p>
        </div>

        <div className="border-t border-gray-800 pt-8">
          <h2 className="text-lg font-bold text-white mb-4">The Laws</h2>
          <ul className="space-y-3 text-sm text-gray-400">
            {[
              'No fake numbers. If data is unavailable, it says unavailable.',
              'No automation without governance. Nova asks before it acts.',
              'No public claims without evidence. Features exist before they\'re advertised.',
              'No hype. Tools either work or they don\'t.',
              'Truth over appearance. Proof over branding.',
            ].map((law, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-emerald-500 shrink-0 mt-0.5">—</span>
                {law}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-800 pt-8">
          <h2 className="text-lg font-bold text-white mb-4">What we&apos;re building</h2>
          <div className="space-y-4 text-sm text-gray-400">
            <p>
              The immediate product: decision cards, income tools, business operating systems, resale intelligence,
              and market research — for anyone who needs a clearer next move and can&apos;t afford to wait for access.
            </p>
            <p>
              The longer product: a governed decision engine that compounds over time.
              Every outcome logged makes the next recommendation sharper. Every card generated feeds the ledger.
              The system learns from what actually happened, not what was predicted.
            </p>
            <p>
              The eventual product: decision intelligence infrastructure that extends from software
              to hardware — edge devices, distributed compute, and systems that help people and institutions
              act on what they know.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8">
          <h2 className="text-lg font-bold text-white mb-4">Contact</h2>
          <div className="space-y-2 text-sm text-gray-400">
            <p>General: <a href="mailto:hello@novanexus-ai.com" className="text-emerald-400 hover:text-emerald-300">hello@novanexus-ai.com</a></p>
            <p>Enterprise: <a href="mailto:hello@novanexus-ai.com?subject=Enterprise Inquiry" className="text-emerald-400 hover:text-emerald-300">hello@novanexus-ai.com</a></p>
            <p>Careers: <a href="/careers" className="text-emerald-400 hover:text-emerald-300">novanexus-ai.com/careers</a></p>
            <p>Press: <a href="mailto:hello@novanexus-ai.com?subject=Press Inquiry" className="text-emerald-400 hover:text-emerald-300">hello@novanexus-ai.com</a></p>
          </div>
        </div>

        <div className="text-xs text-gray-600 flex gap-4 pt-4 border-t border-gray-800">
          <Link href="/privacy" className="hover:text-gray-400 transition">Privacy</Link>
          <Link href="/terms"   className="hover:text-gray-400 transition">Terms</Link>
          <Link href="/legal/risk-disclosure" className="hover:text-gray-400 transition">Risk Disclosure</Link>
          <Link href="/"        className="hover:text-gray-400 transition">Home</Link>
        </div>
      </main>
    </div>
  );
}

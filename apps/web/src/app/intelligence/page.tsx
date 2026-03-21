'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const sampleSetup = {
  symbol: 'NVDA',
  type: 'Trend Pullback',
  setup: 'Pulled back to rising 20 SMA in strong uptrend (ADX 32)',
  entry: '$875–880 zone',
  stop: '$858 (below 50 SMA)',
  target1: '$910 (+3.8%)',
  target2: '$940 (+7.2%)',
  rr: '1:2.1',
  confidence: 4,
  regimeFit: 'Strong trend + pullback to support = high-probability',
  caution: 'Sector rotation risk — watch SOX index',
  invalidation: 'Closes below 50 SMA on heavy volume',
};

function ConfidenceDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${
            i <= level ? 'bg-emerald-400' : 'bg-gray-700'
          }`}
        />
      ))}
    </span>
  );
}

export default function IntelligencePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-lg">
              Nova<span className="text-cyan-400">Nexus</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-gray-400 hover:text-white text-sm transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 mb-8">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-400 text-sm font-medium">
                Founding Members — 50 Seats Only
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Structured breakout intelligence,
              <br />
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                delivered daily.
              </span>
            </h1>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              Nova scans 200+ names so you don&apos;t have to. You get 5–12 curated
              setups every morning with entry, stop, target, and invalidation —
              not tips, not signals, structured logic you can verify.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#pricing"
                className="px-8 py-4 rounded-xl text-lg font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 shadow-lg shadow-amber-900/30 transition-all"
              >
                Become a Founding Member — $29/mo
              </a>
              <a
                href="#sample"
                className="px-8 py-4 rounded-xl text-lg font-medium border border-gray-700 hover:border-gray-500 transition-colors"
              >
                See a Sample Brief
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-16 px-6 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🎯',
                title: 'Not signals. Structured setups.',
                desc: 'Every name comes with setup type, entry, stop, target, R:R, confidence tier, and invalidation. You decide what to act on.',
              },
              {
                icon: '⚡',
                title: 'Skip the 2-hour morning scan.',
                desc: "Nova's engine screens 200+ tickers across breakout, pullback, mean-reversion, and short boards. You get the filtered output.",
              },
              {
                icon: '🧠',
                title: 'Regime-aware context.',
                desc: "Every brief includes market regime (trending/ranging/high-vol), SPY/VIX context, and event flags. Because setups don't exist in a vacuum.",
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="bg-gray-900/50 border border-gray-800 rounded-xl p-6"
              >
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Brief */}
      <section id="sample" className="py-16 px-6 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            What you get every morning
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-xl mx-auto">
            A real setup from a real Nova Daily Brief. Every name follows the same
            structure. No vague commentary.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 md:p-8 font-mono text-sm"
          >
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
              <span className="text-cyan-400 font-bold">PRIORITY SETUP</span>
              <span className="text-gray-500">Nova Daily Brief — Sample</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-white">{sampleSetup.symbol}</span>
                <span className="text-purple-400 font-medium">— {sampleSetup.type}</span>
              </div>

              <div className="text-gray-300">{sampleSetup.setup}</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3">
                <div>
                  <div className="text-gray-500 text-xs uppercase">Entry</div>
                  <div className="text-emerald-400 font-medium">{sampleSetup.entry}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase">Stop</div>
                  <div className="text-red-400 font-medium">{sampleSetup.stop}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase">Target 1</div>
                  <div className="text-emerald-400 font-medium">{sampleSetup.target1}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs uppercase">R:R</div>
                  <div className="text-white font-medium">{sampleSetup.rr}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <span className="text-gray-500 text-xs uppercase">Confidence</span>
                <ConfidenceDots level={sampleSetup.confidence} />
                <span className="text-gray-400 text-xs">(A-tier)</span>
              </div>

              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Regime fit: </span>
                  <span className="text-gray-300">{sampleSetup.regimeFit}</span>
                </div>
                <div>
                  <span className="text-amber-500">⚠ Caution: </span>
                  <span className="text-gray-300">{sampleSetup.caution}</span>
                </div>
                <div>
                  <span className="text-red-400">✕ Invalidation: </span>
                  <span className="text-gray-300">{sampleSetup.invalidation}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800 text-gray-600 text-xs">
              This is one of 5–12 setups in a typical Nova Daily Brief.
              Supporting setups, watch-only names, and full regime context included.
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 px-6 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
          <p className="text-gray-400 text-center mb-12">
            Lock in the founding rate. It never goes up.
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Founding */}
            <div className="relative bg-gradient-to-b from-amber-900/30 to-gray-900 border-2 border-amber-500/50 rounded-2xl p-8">
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-amber-500 rounded-full text-xs font-bold text-black uppercase">
                Founding Member
              </div>
              <div className="mt-2">
                <div className="text-4xl font-bold mb-1">
                  $29<span className="text-lg text-gray-400 font-normal">/month</span>
                </div>
                <div className="text-amber-400 text-sm mb-6">Locked for life. 50 seats only.</div>
                <ul className="space-y-3 text-sm text-gray-300 mb-8">
                  {[
                    'Daily Brief — pre-market, every weekday',
                    '5–12 curated setups with full logic',
                    'Entry, stop, target, R:R on every name',
                    'Confidence tiers + regime context',
                    'Mid-week update on active setups',
                    'Founding member Discord access',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register?plan=founding"
                  className="block w-full text-center px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 font-semibold transition-all"
                >
                  Claim Founding Seat
                </Link>
              </div>
            </div>

            {/* Standard (future) */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <div className="text-gray-500 text-xs font-medium uppercase mb-4">After founding closes</div>
              <div className="text-4xl font-bold mb-1">
                $49<span className="text-lg text-gray-400 font-normal">/month</span>
              </div>
              <div className="text-gray-500 text-sm mb-6">Standard rate.</div>
              <ul className="space-y-3 text-sm text-gray-400 mb-8">
                {[
                  'Daily Brief — pre-market, every weekday',
                  '5–12 curated setups with full logic',
                  'Entry, stop, target, R:R on every name',
                  'Confidence tiers + regime context',
                  'Mid-week update on active setups',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-gray-600 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="block w-full text-center px-6 py-3 rounded-xl border border-gray-700 text-gray-500 cursor-not-allowed">
                Available after founding closes
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Common questions</h2>
          <div className="space-y-6">
            {[
              {
                q: 'Is this financial advice?',
                a: 'No. Nova provides structured analysis and setup identification. It is not a recommendation to buy or sell any security. You make your own trading decisions.',
              },
              {
                q: 'What markets does this cover?',
                a: 'US equities (NYSE/NASDAQ). We screen 200+ liquid names daily across mega-cap, large-cap, and high-volume mid-caps.',
              },
              {
                q: 'How is this different from a stock picking service?',
                a: "We don't pick stocks. We identify structured setups — breakouts, pullbacks, mean-reversion, short breakdowns — with entry/stop/target logic. You decide whether to act.",
              },
              {
                q: 'What does "founding member" mean?',
                a: 'First 50 subscribers lock in $29/mo forever. When founding closes, the price goes to $49/mo. Founding members also get Discord access and direct input on what we build next.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. No contracts, no commitments. Cancel anytime from your account.',
              },
            ].map((item) => (
              <div key={item.q} className="border-b border-gray-800 pb-5">
                <h3 className="font-semibold text-white mb-2">{item.q}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            The watchlist you&apos;d build if you had 3 hours every morning.
          </h2>
          <p className="text-gray-400 mb-8">
            We do the scanning. You do the trading.
          </p>
          <Link
            href="/register?plan=founding"
            className="inline-block px-8 py-4 rounded-xl text-lg font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 shadow-lg shadow-amber-900/30 transition-all"
          >
            Become a Founding Member — $29/mo
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div>© {new Date().getFullYear()} Nova Enterprises. Not financial advice.</div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/legal/risk-disclosure" className="hover:text-gray-300 transition-colors">Risk Disclosure</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

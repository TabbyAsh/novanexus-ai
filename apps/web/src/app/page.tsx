'use client';

import Link from 'next/link';

// ============================================================================
// Homepage — Flip Card
// ============================================================================
// This page answers in under 10 seconds:
//   What is this? → A flip decision tool
//   What does it do? → Tells you if something is worth flipping
//   Why should I care? → Saves you from bad buys
//   What can I do right now? → Analyze a listing

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <ExampleFlipCard />
      <TrustSection />
      <PricingTeaser />
      <Footer />
    </div>
  );
}

// ============================================================================
// Navbar
// ============================================================================

function Navbar() {
  return (
    <nav className="px-6 py-4 border-b border-gray-800/50">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">FC</span>
          </div>
          <span className="text-white font-semibold text-lg">Flip Card</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <a href="#how-it-works" className="text-gray-400 hover:text-white transition">How It Works</a>
          <Link href="/pricing" className="text-gray-400 hover:text-white transition">Pricing</Link>
          <Link href="/login" className="text-gray-400 hover:text-white transition">Sign In</Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition"
          >
            Get Started
          </Link>
        </div>
        <Link
          href="/register"
          className="sm:hidden px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}

// ============================================================================
// Hero
// ============================================================================

function Hero() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
          Know if it&apos;s worth flipping
          <br />
          <span className="text-emerald-400">before you buy it.</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Paste a listing and get a resale estimate, profit range, risk flags,
          and a clear <strong className="text-white">buy</strong>, <strong className="text-white">negotiate</strong>, or <strong className="text-white">pass</strong> decision.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          <Link
            href="/register"
            className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold transition shadow-lg shadow-emerald-900/30"
          >
            Get Started Free
          </Link>
          <a
            href="#how-it-works"
            className="px-8 py-4 rounded-xl bg-gray-800/60 hover:bg-gray-800 text-gray-300 text-lg font-medium transition"
          >
            See how it works
          </a>
        </div>
        <p className="text-sm text-gray-500">
          Structured estimates. Transparent assumptions. Clear action.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// How It Works
// ============================================================================

function HowItWorks() {
  const steps = [
    {
      num: '1',
      title: 'Describe the item',
      desc: 'Enter what you\'re looking at — item name, asking price, condition, and where you\'d sell it.',
    },
    {
      num: '2',
      title: 'We evaluate it',
      desc: 'We look up real sold prices, calculate platform fees and shipping, and assess the risk.',
    },
    {
      num: '3',
      title: 'Get your Flip Card',
      desc: 'A clear verdict — BUY, NEGOTIATE, or PASS — with the numbers and rationale behind it.',
    },
  ];

  return (
    <section id="how-it-works" className="px-6 py-16 bg-gray-900/30">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map(s => (
            <div key={s.num} className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <span className="text-emerald-400 font-bold text-lg">{s.num}</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Example Flip Card
// ============================================================================

function ExampleFlipCard() {
  return (
    <section className="px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-3">
          Example Flip Card
        </h2>
        <p className="text-gray-400 text-center mb-10">
          Here&apos;s what a real analysis looks like.
        </p>

        {/* Mock Flip Card */}
        <div className="rounded-2xl border border-gray-800 overflow-hidden">
          {/* Verdict */}
          <div className="bg-emerald-900/40 border-b border-emerald-500/30 px-6 py-5 text-center">
            <div className="text-4xl font-black text-emerald-400 mb-1">BUY</div>
            <p className="text-gray-300 text-sm max-w-md mx-auto">
              At $80, this looks like a solid flip opportunity. Based on 18 recent sold comps, the expected resale is around $170.
              After eBay fees (~$22.83) and shipping (~$10), your estimated net profit is $57.17.
            </p>
          </div>

          {/* Details */}
          <div className="bg-gray-900 px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Sony WH-1000XM5 Headphones</div>
                <div className="text-xs text-gray-500">Audio · Good condition</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Confidence</div>
                <div className="font-bold text-white">72%</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              <div>
                <div className="text-gray-500 text-xs">Buy</div>
                <div className="text-white font-medium">$80</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Resale (mid)</div>
                <div className="text-white font-medium">$170</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Costs</div>
                <div className="text-gray-400 font-medium">-$32.83</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Net profit</div>
                <div className="text-emerald-400 font-bold">$57.17</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-900/20 rounded-lg px-3 py-2">
              <span>⚠</span>
              <span>Limited comps — price range may be wider than shown</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Real data from eBay sold listings. No fake numbers.
        </p>
      </div>
    </section>
  );
}

// ============================================================================
// Trust Section
// ============================================================================

function TrustSection() {
  const points = [
    {
      title: 'Real sold prices',
      desc: 'We look up actual completed sales, not listing prices. You see what items actually sold for.',
    },
    {
      title: 'Every number explained',
      desc: 'Platform fees, shipping estimates, and condition adjustments are all shown with their assumptions.',
    },
    {
      title: 'Honest confidence',
      desc: 'If we don\'t have enough data, we say so. Low confidence means low confidence — not hidden uncertainty.',
    },
    {
      title: 'Never guaranteed profit',
      desc: 'We give you structured estimates and a clear verdict. The final decision is always yours.',
    },
  ];

  return (
    <section className="px-6 py-16 bg-gray-900/30">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-3">
          Built on trust, not theatrics
        </h2>
        <p className="text-gray-400 text-center mb-10">
          Every Flip Card shows its work. No hidden assumptions. No fake certainty.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {points.map(p => (
            <div key={p.title} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-2">{p.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Pricing Teaser
// ============================================================================

function PricingTeaser() {
  return (
    <section className="px-6 py-16">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Try it free
        </h2>
        <p className="text-gray-400 mb-8">
          Your first analyses are free. No account required.
          <br />
          Avoid one bad buy and it pays for itself.
        </p>
        <Link
          href="/register"
          className="inline-block px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold transition shadow-lg shadow-emerald-900/30"
        >
          Get Started Free
        </Link>
        <div className="mt-4">
          <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-300 transition">
            View pricing plans →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Footer
// ============================================================================

function Footer() {
  return (
    <footer className="px-6 py-8 border-t border-gray-800">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-600/30 flex items-center justify-center">
              <span className="text-emerald-400 text-xs font-bold">FC</span>
            </div>
            <span className="text-gray-400 text-sm">Flip Card</span>
            <span className="text-gray-600 text-xs">· Powered by Nova</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition">Terms</Link>
            <a href="mailto:wyatt@novanexus-ai.com" className="hover:text-gray-300 transition">Contact</a>
          </div>
          <span className="text-gray-600 text-xs">© 2026 Nova Enterprises</span>
        </div>
        <p className="mt-4 text-xs text-gray-700 text-center max-w-3xl mx-auto">
          Flip Card provides structured estimates for resale opportunities. It is not financial advice.
          All estimates are based on publicly available sold data and category heuristics. Actual results may vary.
          You are responsible for your own buying and selling decisions.
        </p>
      </div>
    </footer>
  );
}

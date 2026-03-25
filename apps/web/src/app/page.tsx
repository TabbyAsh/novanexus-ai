'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import GlassCard, { GlassButton, GradientText } from '@/components/ui/GlassCard';
import ParticleField from '@/components/three/ParticleField';

const features = [
  {
    icon: '🤖',
    title: 'Autonomous Agent Engine',
    description: 'AI agents that execute multi-step workflows end-to-end. Scanner, FlipFinder, Rebalancer, Compliance — not chatbots, executors.',
    color: 'cyan' as const,
  },
  {
    icon: '📈',
    title: 'AI Stock Screener',
    description: 'Real-time market screening with direct Alpaca + Yahoo data. RSI, MACD, SMA crossovers — signals ranked by confidence, auto-generated decision cards.',
    color: 'purple' as const,
  },
  {
    icon: '💰',
    title: 'Flip Arbitrage Engine',
    description: 'Scrapes eBay active + sold listings, computes real flip margins, auto-generates flip plans. Find $50+ profit items while you sleep.',
    color: 'pink' as const,
  },
  {
    icon: '📊',
    title: 'Outcome Ledger & ROI Tracking',
    description: 'Every agent run produces measurable outcomes. Track profit, time saved, opportunities found — see real ROI within 2 weeks.',
    color: 'green' as const,
  },
];

function Navbar() {
  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">N</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">
            Nova<span className="text-cyan-400">Nexus</span>
          </span>
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-gray-300 hover:text-white transition-colors">Features</Link>
          <Link href="#about" className="text-gray-300 hover:text-white transition-colors">About</Link>
          <Link href="/pricing" className="text-amber-400 hover:text-amber-300 transition-colors font-medium">Pricing</Link>
          <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/login">
            <GlassButton variant="secondary" className="!py-2 !px-4 text-sm">
              Sign In
            </GlassButton>
          </Link>
          <Link href="/register">
            <GlassButton variant="primary" className="!py-2 !px-4 text-sm">
              Get Started
            </GlassButton>
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
      <div className="max-w-5xl mx-auto text-center z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-400 text-sm font-medium">Founding Members — Only 50 Seats Available</span>
          </motion.div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 leading-tight">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="block"
            >
              Power to the
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <GradientText className="block">User</GradientText>
            </motion.span>
          </h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12"
          >
            The AI-powered ecosystem that brings together intelligent trading, algorithmic commerce, 
            and autonomous operations. Tools that were once exclusive to the elite, now in your hands.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/pricing">
              <button className="px-8 py-4 rounded-xl text-lg font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg shadow-amber-900/30 transition-all">
                Become a Founding Member →
              </button>
            </Link>
            <Link href="/register">
              <GlassButton variant="secondary" className="text-lg">
                Start Free
              </GlassButton>
            </Link>
          </motion.div>
        </motion.div>
        
        {/* Floating badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center gap-2 text-gray-500"
          >
            <span className="text-sm">Scroll to explore</span>
            <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Your <GradientText>Unfair Advantage</GradientText>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Tools that level the playing field. AI that works while you sleep.
          </p>
        </motion.div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <GlassCard key={feature.title} glowColor={feature.color} delay={i * 0.1}>
              <div className="flex items-start gap-4">
                <div className="text-4xl">{feature.icon}</div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function MissionSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start']
  });
  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  
  return (
    <section id="about" ref={ref} className="relative py-32 px-6 overflow-hidden">
      <motion.div style={{ y }} className="absolute inset-0 flex items-center justify-center opacity-5">
        <span className="text-[20rem] font-bold text-white">N</span>
      </motion.div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <GlassCard hover={false} className="!p-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              This isn't about personal gain.
            </h2>
            <p className="text-xl text-gray-300 leading-relaxed mb-8">
              The world doesn't give people a leg up. The tools that create wealth—algorithmic trading, 
              market intelligence, automated commerce—have always been locked behind walls of capital and connections.
            </p>
            <p className="text-xl text-gray-300 leading-relaxed mb-8">
              <GradientText className="font-bold">NovaNexus AI</GradientText> tears down those walls. 
              This digital ecosystem brings together everything a person needs to compete on equal footing 
              with institutions and the privileged few.
            </p>
            <p className="text-2xl font-bold text-white">
              This is your legacy. <GradientText>This is power to the user.</GradientText>
            </p>
          </motion.div>
        </GlassCard>
      </div>
    </section>
  );
}

function LiveStatsSection() {
  const [stats, setStats] = useState<{
    totalUsers: number; agentRunsCompleted: number; timeSavedMinutes: number; flipsTracked: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/v1/platform/stats')
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setStats(d.data); })
      .catch(() => {});
  }, []);

  const counters = [
    { label: 'Active Users', value: stats ? stats.totalUsers : '—', icon: '👥' },
    { label: 'Agent Runs', value: stats ? stats.agentRunsCompleted : '—', icon: '🤖' },
    { label: 'Hours Saved', value: stats ? `${(stats.timeSavedMinutes / 60).toFixed(0)}+` : '—', icon: '⏱️' },
    { label: 'Flips Tracked', value: stats ? stats.flipsTracked : '—', icon: '💰' },
  ];

  return (
    <section className="relative py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
            The Machine is <GradientText>Running</GradientText>
          </h2>
          <p className="text-gray-400">Live platform activity — updated in real-time</p>
        </motion.div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {counters.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 text-center"
            >
              <div className="text-3xl mb-2">{c.icon}</div>
              <div className="text-3xl font-bold text-white mb-1">{c.value}</div>
              <div className="text-sm text-gray-400">{c.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TryFlipCard() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fmt = (n: number) => {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
    return n < 0 ? `-${f}` : f;
  };

  const analyze = async () => {
    if (!title.trim() || !price) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/proxy/v1/flip-card/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), buy_price: parseFloat(price), condition: 'Good', shipping_or_pickup: 'shipping', target_platform: 'eBay' }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
    } catch {} finally { setLoading(false); }
  };

  return (
    <section className="relative py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-6"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Try <GradientText>Flip Card</GradientText> — Free
          </h2>
          <p className="text-gray-400">Enter any item and get an instant buy/pass verdict with real sold data</p>
        </motion.div>

        {!open ? (
          <div className="text-center">
            <button
              onClick={() => setOpen(true)}
              className="px-8 py-4 rounded-xl text-lg font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/30 transition-all"
            >
              Analyze an Item →
            </button>
          </div>
        ) : (
          <GlassCard hover={false} glowColor="green">
            {!result ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">What are you looking at?</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Sony WH-1000XM5 Headphones"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Asking price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                    <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/30 border border-white/10 rounded-lg pl-7 pr-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500 focus:outline-none" />
                  </div>
                </div>
                <button onClick={analyze} disabled={loading || !title.trim() || !price}
                  className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition">
                  {loading ? 'Analyzing...' : 'Get Verdict'}
                </button>
                <p className="text-center text-xs text-gray-600">3 free per day · No account needed</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`text-center py-4 rounded-xl ${
                  result.verdict === 'BUY' ? 'bg-emerald-500/20' : result.verdict === 'NEGOTIATE LOWER' ? 'bg-amber-500/20' : 'bg-red-500/20'
                }`}>
                  <div className={`text-3xl font-black ${
                    result.verdict === 'BUY' ? 'text-emerald-400' : result.verdict === 'NEGOTIATE LOWER' ? 'text-amber-400' : 'text-red-400'
                  }`}>{result.verdict}</div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div><div className="text-gray-500 text-xs">Buy</div><div className="text-white font-medium">{fmt(result.buy_price)}</div></div>
                  <div><div className="text-gray-500 text-xs">Resale</div><div className="text-white font-medium">{fmt(result.est_resale_mid)}</div></div>
                  <div><div className="text-gray-500 text-xs">Costs</div><div className="text-gray-400">{fmt(result.est_platform_fees + result.est_shipping_cost)}</div></div>
                  <div><div className="text-gray-500 text-xs">Profit</div><div className={result.est_net_profit_mid > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{fmt(result.est_net_profit_mid)}</div></div>
                </div>
                <p className="text-sm text-gray-400 text-center">{result.rationale_summary}</p>
                <div className="flex gap-3">
                  <button onClick={() => { setResult(null); setTitle(''); setPrice(''); }}
                    className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition">Try Another</button>
                  <Link href="/register" className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition text-center">Sign Up for Unlimited</Link>
                </div>
                <p className="text-center text-xs text-gray-600">Based on {result.comp_sources?.[0]?.count || 0} eBay sold comps · Confidence {result.confidence_score}%</p>
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to take <GradientText>control</GradientText>?
          </h2>
          <p className="text-xl text-gray-400 mb-2">
            50 Founding Member seats. $99/month. Unlimited everything. Lock it in forever.
          </p>
          <p className="text-amber-400 font-medium mb-2">
            Refer a friend → you both get $10 credit.
          </p>
          <p className="text-gray-500 mb-10">
            Or start free — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/pricing">
              <button className="px-10 py-5 rounded-xl text-xl font-semibold bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg shadow-amber-900/30 transition-all">
                Claim Your Founding Seat →
              </button>
            </Link>
            <Link href="/register">
              <GlassButton variant="secondary" className="text-lg !px-8 !py-4">
                Start Free
              </GlassButton>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative py-12 px-6 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold">N</span>
            </div>
            <span className="text-white font-semibold">NovaNexus AI</span>
          </div>
          
          <div className="flex items-center gap-8 text-gray-400 text-sm">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href="mailto:wyatt@novanexus-ai.com" className="hover:text-white transition-colors">Contact</a>
          </div>
          
          <p className="text-gray-500 text-sm">
            © 2026 NovaNexus AI. All rights reserved.
          </p>
        </div>
        
        <div className="mt-8 pt-6 border-t border-white/5">
          <p className="text-gray-600 text-xs leading-relaxed text-center max-w-4xl mx-auto">
            <strong className="text-gray-500">Risk Disclosure:</strong> NovaNexus AI provides informational tools only. 
            Nothing on this platform constitutes financial, investment, or trading advice. All trading and investment decisions 
            are made by you. Past performance, backtests, and AI-generated signals do not guarantee future results. 
            You may lose money. Use at your own risk.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <ParticleField />
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <TryFlipCard />
      <LiveStatsSection />
      <MissionSection />
      <CTASection />
      <Footer />
    </main>
  );
}

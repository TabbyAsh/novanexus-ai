'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import {
  CreditCard, TrendingUp, ShoppingBag, Radio,
  FlaskConical, Shield, ArrowRight, ChevronDown,
  ExternalLink, Sparkles,
} from 'lucide-react';

// ─── 3D Nova — SSR-safe dynamic import ───────────────────────────────
const NovaStar = dynamic(() => import('@/components/three/NovaStar'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div
        className="w-48 h-48 rounded-full opacity-40 animate-pulse"
        style={{
          background: 'radial-gradient(circle, #00f5ff 0%, #7c3aed 40%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />
    </div>
  ),
});

// ─── Flip Card Widget Constants ──────────────────────────────────────
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'Poor'] as const;
const PLATFORMS = ['eBay', 'Facebook Marketplace', 'Mercari', 'Poshmark', 'General'] as const;

// ─── Division Data ───────────────────────────────────────────────────
const DIVISIONS = [
  {
    name: 'Flip Card',
    desc: 'Evaluate resale opportunities with real sold comps, fee calculations, and a clear buy/pass verdict.',
    icon: CreditCard,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]',
    bg: 'from-emerald-500/10',
    status: 'Live',
    statusColor: 'bg-emerald-500/20 text-emerald-400',
    href: '/dashboard/analyze',
  },
  {
    name: 'Wall Street',
    desc: 'Stock screening, momentum patterns, paper trading, and tracked outcomes.',
    icon: TrendingUp,
    color: 'text-green-400',
    border: 'border-green-500/20 hover:border-green-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(34,197,94,0.15)]',
    bg: 'from-green-500/10',
    status: 'Live',
    statusColor: 'bg-green-500/20 text-green-400',
    href: '/dashboard/screener',
  },
  {
    name: 'Marketplace',
    desc: 'Cross-platform deal scoring, value radar, and arbitrage detection.',
    icon: ShoppingBag,
    color: 'text-pink-400',
    border: 'border-pink-500/20 hover:border-pink-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(244,114,182,0.15)]',
    bg: 'from-pink-500/10',
    status: 'Beta',
    statusColor: 'bg-amber-500/20 text-amber-400',
    href: '/dashboard/marketplace',
  },
  {
    name: 'Social',
    desc: 'Content scheduling, audience growth tools, and distribution planning.',
    icon: Radio,
    color: 'text-violet-400',
    border: 'border-violet-500/20 hover:border-violet-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.15)]',
    bg: 'from-violet-500/10',
    status: 'Coming Soon',
    statusColor: 'bg-gray-500/20 text-gray-400',
    href: '/dashboard/social-hub',
  },
  {
    name: 'Research',
    desc: 'Experiment tracking, decision logs, and structured postmortems.',
    icon: FlaskConical,
    color: 'text-sky-400',
    border: 'border-sky-500/20 hover:border-sky-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(14,165,233,0.15)]',
    bg: 'from-sky-500/10',
    status: 'Coming Soon',
    statusColor: 'bg-gray-500/20 text-gray-400',
    href: '/dashboard/nexus',
  },
  {
    name: 'Operations',
    desc: 'Governance, safety controls, health monitoring, and compliance.',
    icon: Shield,
    color: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-400/50',
    glow: 'hover:shadow-[0_0_40px_rgba(245,158,11,0.15)]',
    bg: 'from-amber-500/10',
    status: 'Live',
    statusColor: 'bg-emerald-500/20 text-emerald-400',
    href: '/dashboard/safety',
  },
];

// ─── Currency Formatter ──────────────────────────────────────────────
const fmt = (n: number) => {
  const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
  return n < 0 ? `-${f}` : f;
};

// ═════════════════════════════════════════════════════════════════════
// NAVBAR
// ═════════════════════════════════════════════════════════════════════
function Navbar() {
  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl bg-[#0a0a0f]/70 border-b border-white/5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="text-white font-bold text-xl">N</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">
            Nova<span className="text-cyan-400">Nexus</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#divisions" className="text-gray-400 hover:text-white transition-colors text-sm">Divisions</a>
          <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm">Pricing</Link>
          <a href="#about" className="text-gray-400 hover:text-white transition-colors text-sm">About</a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-gray-400 hover:text-white transition-colors text-sm px-4 py-2">
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-5 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
          >
            Get Started
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

// ═════════════════════════════════════════════════════════════════════
// HERO — Identity left, 3D Nova right
// ═════════════════════════════════════════════════════════════════════
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center px-6 pt-24 pb-16 overflow-hidden">
      {/* Background nebula */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #00f5ff 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center">
        {/* Left — Text */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] mb-6">
            The Dawn of a{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              New Light
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-xl mb-8 leading-relaxed">
            Market intelligence, resale analytics, and operational infrastructure — built to compound.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <a
              href="#try-it"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/30 transition-all"
            >
              Try Flip Card — Free <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#divisions"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-medium backdrop-blur-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              Explore the Platform
            </a>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Real data
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              Transparent assumptions
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
              No guarantees
            </span>
          </div>
        </motion.div>

        {/* Right — 3D Nova */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
          className="hidden lg:block h-[500px]"
        >
          <NovaStar />
        </motion.div>
      </div>

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-gray-600"
      >
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// TRY IT — Flip Card Sales Wedge
// ═════════════════════════════════════════════════════════════════════
function TryItSection() {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('Good');
  const [platform, setPlatform] = useState('eBay');
  const [shipping, setShipping] = useState<'shipping' | 'pickup'>('shipping');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    if (!title.trim() || !price) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/proxy/v1/flip-card/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          buy_price: parseFloat(price),
          condition,
          shipping_or_pickup: shipping,
          target_platform: platform,
        }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
    } catch { /* fail silently */ } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setTitle('');
    setPrice('');
    setCondition('Good');
    setPlatform('eBay');
    setShipping('shipping');
  };

  return (
    <section id="try-it" className="relative py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-medium">Try it now — no account needed</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Know if it&apos;s worth flipping — before you buy.
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Enter any item and get an instant verdict backed by real eBay sold data.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-8 shadow-2xl"
        >
          {!result ? (
            <div className="space-y-5">
              {/* Item title */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">What are you looking at?</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500 focus:outline-none transition"
                />
              </div>

              {/* Price + Condition */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Asking price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/30 border border-white/10 rounded-lg pl-7 pr-4 py-3 text-white placeholder-gray-600 focus:border-emerald-500 focus:outline-none transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition appearance-none"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c} className="bg-gray-900">{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Platform + Shipping */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Sell on</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition appearance-none"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p} className="bg-gray-900">{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Fulfillment</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShipping('shipping')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${
                        shipping === 'shipping'
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                          : 'bg-black/20 border-white/10 text-gray-500 hover:border-white/20'
                      }`}
                    >
                      Ship
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipping('pickup')}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${
                        shipping === 'pickup'
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                          : 'bg-black/20 border-white/10 text-gray-500 hover:border-white/20'
                      }`}
                    >
                      Local
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={analyze}
                disabled={loading || !title.trim() || !price}
                className="w-full py-3.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white font-semibold transition-all shadow-lg shadow-emerald-900/20"
              >
                {loading ? 'Analyzing...' : 'Get Verdict'}
              </button>
              <p className="text-center text-xs text-gray-600">3 free analyses per day · No account needed</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Verdict */}
              <div
                className={`text-center py-5 rounded-xl ${
                  result.verdict === 'BUY'
                    ? 'bg-emerald-500/15 border border-emerald-500/30'
                    : result.verdict === 'NEGOTIATE LOWER'
                    ? 'bg-amber-500/15 border border-amber-500/30'
                    : 'bg-red-500/15 border border-red-500/30'
                }`}
              >
                <div
                  className={`text-3xl font-black ${
                    result.verdict === 'BUY'
                      ? 'text-emerald-400'
                      : result.verdict === 'NEGOTIATE LOWER'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                >
                  {result.verdict}
                </div>
              </div>

              {/* Economics */}
              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Buy</div>
                  <div className="text-white font-medium">{fmt(result.buy_price)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Resale</div>
                  <div className="text-white font-medium">{fmt(result.est_resale_mid)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Costs</div>
                  <div className="text-gray-400">{fmt(result.est_platform_fees + result.est_shipping_cost)}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Profit</div>
                  <div className={result.est_net_profit_mid > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {fmt(result.est_net_profit_mid)}
                  </div>
                </div>
              </div>

              {/* Rationale */}
              <p className="text-sm text-gray-400 text-center leading-relaxed">{result.rationale_summary}</p>

              {/* Confidence + Comps */}
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                <span>
                  {result.confidence_score >= 70 ? 'High' : result.confidence_score >= 40 ? 'Moderate' : 'Low'} confidence ({result.confidence_score}%)
                </span>
                <span>·</span>
                <span>{result.comp_sources?.[0]?.count || 0} sold comps</span>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition"
                >
                  Try Another
                </button>
                <Link
                  href="/register"
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-medium text-center transition hover:shadow-lg hover:shadow-cyan-500/20"
                >
                  Unlock Unlimited
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// DIVISIONS — All six, equal weight
// ═════════════════════════════════════════════════════════════════════
function DivisionsSection() {
  return (
    <section id="divisions" className="relative py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            One Platform.{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Six Divisions.
            </span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Each division compounds on the others. Use one or use them all.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {DIVISIONS.map((div, i) => {
            const Icon = div.icon;
            return (
              <motion.div
                key={div.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
              >
                <Link
                  href={div.href}
                  className={`block relative backdrop-blur-xl bg-white/[0.03] border ${div.border} rounded-2xl p-6 transition-all duration-300 ${div.glow} group`}
                >
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${div.bg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2.5 rounded-xl bg-white/5 ${div.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${div.statusColor}`}>
                        {div.status}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{div.name}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{div.desc}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                      <span>Explore</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MISSION — Why this exists
// ═════════════════════════════════════════════════════════════════════
function MissionSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section id="about" ref={ref} className="relative py-24 px-6 overflow-hidden">
      {/* Floating N watermark */}
      <motion.div style={{ y }} className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
        <span className="text-[20rem] font-bold text-white select-none">N</span>
      </motion.div>

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-10 md:p-14 text-center"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
            The tools that create wealth have always been locked behind walls of capital and access.
          </h2>
          <p className="text-lg text-gray-400 leading-relaxed mb-6">
            NovaNexus opens those walls. We build software that gives individuals the same analytical infrastructure that institutions take for granted — stock screening, resale economics, operational governance — distilled into tools anyone can use.
          </p>
          <p className="text-gray-500 leading-relaxed mb-8">
            Every number is backed by real data. Every assumption is shown. Nothing is guaranteed. That honesty is the product.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-cyan-400/80">
            <span className="w-8 h-px bg-cyan-400/30" />
            NovaNexus
            <span className="w-8 h-px bg-cyan-400/30" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PRICING TEASER
// ═════════════════════════════════════════════════════════════════════
function PricingTeaser() {
  return (
    <section className="relative py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Start free. Upgrade when it pays for itself.
          </h2>
          <p className="text-gray-400">Avoid one bad buy and the subscription pays for itself.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0 }}
            viewport={{ once: true }}
            className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-2xl p-8"
          >
            <div className="text-sm text-gray-400 mb-1">Free</div>
            <div className="text-4xl font-bold text-white mb-1">$0</div>
            <div className="text-sm text-gray-500 mb-6">No account needed</div>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              {['3 Flip Card analyses per day', 'Real eBay sold comps', 'Full cost breakdown', 'Buy / negotiate / pass verdict'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="#try-it"
              className="block w-full py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium text-center transition"
            >
              Try It Now
            </a>
          </motion.div>

          {/* Pro */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            className="relative backdrop-blur-xl bg-gradient-to-b from-emerald-900/20 to-white/[0.03] border-2 border-emerald-500/30 rounded-2xl p-8"
          >
            <div className="text-sm text-emerald-400 font-medium mb-1">Flip Card Pro</div>
            <div className="text-4xl font-bold text-white mb-1">$9<span className="text-lg text-gray-400 font-normal">/mo</span></div>
            <div className="text-sm text-gray-500 mb-6">Cancel anytime</div>
            <ul className="space-y-3 text-sm text-gray-300 mb-8">
              {[
                'Unlimited Flip Card analyses',
                'Saved analysis history',
                'Daily Flip Alert emails',
                'Full platform access',
                'Priority comp data',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="block w-full py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-semibold text-center transition-all shadow-lg shadow-emerald-900/20"
            >
              Get Started
            </Link>
          </motion.div>
        </div>

        <div className="text-center mt-6">
          <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            View all plans including Founding Member →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// FOOTER
// ═════════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer className="relative py-16 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">N</span>
              </div>
              <span className="text-white font-semibold">NovaNexus</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Market intelligence and operational infrastructure — built to compound.
            </p>
          </div>

          {/* Divisions */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-4">Divisions</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/dashboard/analyze" className="hover:text-white transition">Flip Card</Link></li>
              <li><Link href="/dashboard/screener" className="hover:text-white transition">Wall Street</Link></li>
              <li><Link href="/dashboard/marketplace" className="hover:text-white transition">Marketplace</Link></li>
              <li><Link href="/dashboard/social-hub" className="hover:text-white transition">Social</Link></li>
              <li><Link href="/dashboard/safety" className="hover:text-white transition">Operations</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
              <li><Link href="/legal/risk-disclosure" className="hover:text-white transition">Risk Disclosure</Link></li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-4">Account</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/login" className="hover:text-white transition">Sign In</Link></li>
              <li><Link href="/register" className="hover:text-white transition">Create Account</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
              <li><a href="mailto:wyatt@novanexus-ai.com" className="hover:text-white transition">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-600 text-sm">© 2026 NovaNexus. All rights reserved.</p>
          </div>
          <p className="mt-4 text-gray-700 text-xs leading-relaxed text-center max-w-4xl mx-auto">
            <strong className="text-gray-600">Risk Disclosure:</strong> NovaNexus provides informational tools only.
            Nothing on this platform constitutes financial, investment, or trading advice. All decisions are made by you.
            Past performance and estimates do not guarantee future results. You may lose money. Use at your own risk.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PAGE COMPOSITION
// ═════════════════════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 -z-10 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <Navbar />
      <HeroSection />
      <TryItSection />
      <DivisionsSection />
      <MissionSection />
      <PricingTeaser />
      <Footer />
    </main>
  );
}

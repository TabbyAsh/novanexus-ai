'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useRef } from 'react';
import GlassCard, { GlassButton, GradientText } from '@/components/ui/GlassCard';
import ParticleField from '@/components/three/ParticleField';

const features = [
  {
    icon: '🧠',
    title: 'AI Trading Intelligence',
    description: 'Advanced market screening powered by AI. Pattern recognition, anomaly detection, and predictive signals that identify opportunities before they happen.',
    color: 'cyan' as const,
  },
  {
    icon: '📈',
    title: 'Strategy Simulator',
    description: 'Backtest strategies against years of market data. Monte Carlo simulations provide probability-weighted outcomes for informed decisions.',
    color: 'purple' as const,
  },
  {
    icon: '🛒',
    title: 'Algorithmic Commerce',
    description: 'Dynamic product discovery that analyzes market trends in real-time. Automated pricing optimization maximizes margins while staying competitive.',
    color: 'pink' as const,
  },
  {
    icon: '🚀',
    title: 'Autonomous Operations',
    description: 'From dropshipping to day trading, our AI handles the heavy lifting. Set your parameters and let the system work for you 24/7.',
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
          <p className="text-xl text-gray-400 mb-4">
            50 Founding Member seats. $99/month. Unlimited everything. Lock it in forever.
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
      <MissionSection />
      <CTASection />
      <Footer />
    </main>
  );
}

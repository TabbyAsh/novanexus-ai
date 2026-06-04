'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';

// ─── Currency formatter ──────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));

// ═════════════════════════════════════════════════════════════════════
// NAVBAR
// ═════════════════════════════════════════════════════════════════════
function Navbar() {
  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Nova</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/services/back-office-os" className="text-gray-400 hover:text-white transition">Services</Link>
          <Link href="/decision-cards"          className="text-gray-400 hover:text-white transition">Decision Cards</Link>
          <Link href="/field-manual"            className="text-gray-400 hover:text-white transition">Field Manual</Link>
          <Link href="/flip"                    className="text-gray-400 hover:text-white transition">Flip Tool</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login"    className="text-gray-400 hover:text-white text-sm transition px-3 py-2">Sign In</Link>
          <Link href="/register" className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition">
            Get Started
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

// ═════════════════════════════════════════════════════════════════════
// HERO
// ═════════════════════════════════════════════════════════════════════
function HeroSection() {
  return (
    <section className="relative pt-36 pb-24 px-6 text-center overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-10 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 text-xs px-4 py-1.5 rounded-full mb-8">
            Tools and services for small businesses, entrepreneurs, and operators
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-6">
            Turn business confusion<br />
            <span className="text-emerald-400">into clean action.</span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Nova Enterprises builds practical systems for people building something real:
            admin workspaces, decision cards, templates, scripts, and back-office support.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/services/back-office-os"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/30">
              Build My Back Office <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/decision-cards"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-base font-medium border border-white/10 text-gray-300 hover:bg-white/5 transition-all">
              Explore Decision Cards
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// THREE PATHS
// ═════════════════════════════════════════════════════════════════════
function ThreePaths() {
  const paths = [
    {
      emoji: '🗂️',
      label: 'For Businesses',
      name: 'Back Office OS',
      desc: 'A done-for-you monthly admin system. Estimates, invoices, expense tracking, customer scripts, weekly P&L. You run your business. We handle the paperwork.',
      cta: 'View Services',
      href: '/services/back-office-os',
      border: 'border-emerald-500/25 hover:border-emerald-400/50',
      bg: 'hover:bg-emerald-500/5',
      badge: 'Service',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      price: 'From $150/mo',
    },
    {
      emoji: '🃏',
      label: 'For Operators',
      name: 'Decision Cards',
      desc: 'Every business situation has a next move. Pick a card — Customer Hasn\'t Paid, Price a Job, New Client Intake — get the checklist, script, and template for that exact moment.',
      cta: 'Open Card Library',
      href: '/decision-cards',
      border: 'border-cyan-500/25 hover:border-cyan-400/50',
      bg: 'hover:bg-cyan-500/5',
      badge: 'Product',
      badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
      price: 'From $9/mo',
    },
    {
      emoji: '📖',
      label: 'To Learn',
      name: 'Field Manual',
      desc: 'Old business rules rebuilt for modern operators. Each piece turns a principle into an action card. Feeds everything else Nova offers.',
      cta: 'Read the Field Manual',
      href: '/field-manual',
      border: 'border-amber-500/25 hover:border-amber-400/50',
      bg: 'hover:bg-amber-500/5',
      badge: 'Free',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      price: 'Always free',
    },
  ];

  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-5">
          {paths.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
            >
              <Link href={p.href}
                className={`block h-full rounded-2xl border ${p.border} ${p.bg} bg-white/[0.02] p-6 transition-all duration-300 group`}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-2xl">{p.emoji}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.badgeColor}`}>{p.badge}</span>
                </div>
                <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">{p.label}</div>
                <h3 className="text-lg font-bold text-white mb-3">{p.name}</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-5">{p.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{p.price}</span>
                  <span className="text-sm font-medium text-gray-300 group-hover:text-white transition flex items-center gap-1">
                    {p.cta} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// DECISION CARDS PREVIEW — show what they are concretely
// ═════════════════════════════════════════════════════════════════════
function DecisionCardsPreview() {
  const cards = [
    { title: 'Customer Hasn\'t Paid', desc: 'Reminder message, payment deadline, escalation steps, invoice follow-up.', tag: 'Collections' },
    { title: 'Price a Job', desc: 'Cost breakdown, margin calculator, quote structure, upsell prompts.', tag: 'Pricing' },
    { title: 'New Client Intake', desc: 'Intake form, quote checklist, customer script, job notes template.', tag: 'Intake' },
    { title: 'Friend Business Deal', desc: 'Risk checklist, agreement template, ownership questions, red flags.', tag: 'Deals' },
    { title: 'Invoice Follow-Up', desc: 'Follow-up sequence, payment link, final notice template.', tag: 'Admin' },
    { title: 'Hiring Help', desc: 'Role checklist, pay terms, expectations agreement, trial period structure.', tag: 'Hiring' },
  ];

  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mb-10"
        >
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Every situation has a card.</h2>
              <p className="text-gray-500 max-w-xl">
                Choose the card for your moment. Get the checklist, script, template, and next action — specific to your situation.
              </p>
            </div>
            <Link href="/decision-cards" className="hidden md:flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition">
              See all cards <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              viewport={{ once: true }}
            >
              <Link href="/decision-cards"
                className="block rounded-xl border border-gray-800 bg-gray-900/50 p-5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-600 bg-gray-800 px-2 py-0.5 rounded">{card.tag}</span>
                  <span className="text-gray-700 group-hover:text-cyan-500 transition text-lg">→</span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-2">{card.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/decision-cards"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-sm text-gray-300 hover:text-white transition">
            Open the Card Library — 3 free per month
          </Link>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BACK OFFICE OS PITCH — service section
// ═════════════════════════════════════════════════════════════════════
function BackOfficeSection() {
  const deliverables = [
    'Estimate template',
    'Invoice template',
    'Expense tracker',
    'Customer intake form',
    'Customer follow-up scripts',
    'Weekly profit/loss sheet',
    'Task tracker',
    'Monthly admin review',
  ];

  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Service · From $150/month</div>
            <h2 className="text-3xl font-bold text-white mb-5">
              Stop losing time to scattered paperwork.
            </h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Nova Back Office OS gives your business a clean admin system — forms, invoices, scripts, expense tracking, and weekly visibility — built for you and maintained monthly.
            </p>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              Best for: contractors, clothing brands, freelancers, local service businesses, small operations that need systems but not a full-time admin.
            </p>
            <Link href="/services/back-office-os"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all">
              Get Your Back Office Built <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6"
          >
            <div className="text-sm font-semibold text-emerald-400 mb-4">Every client receives:</div>
            <ul className="space-y-3">
              {deliverables.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-4 border-t border-emerald-500/20 text-xs text-gray-500">
              Delivered in Google Drive or Notion. Monthly maintenance included.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PRODUCT LADDER
// ═════════════════════════════════════════════════════════════════════
function ProductLadder() {
  const tiers = [
    { level: 'Free',    product: 'Field Manual',           desc: 'Business principles → action cards. Feeds everything.',        price: 'Always free',   href: '/field-manual',            color: 'text-gray-400' },
    { level: 'Entry',   product: 'Young Operator Playbook', desc: 'How to write, speak, follow up, and move professionally.',     price: '$27–$97',       href: '/playbook',                color: 'text-amber-400' },
    { level: 'Core',    product: 'Decision Cards',          desc: 'Exact next moves for exact business situations.',              price: '$9–$79/month',  href: '/decision-cards',          color: 'text-cyan-400' },
    { level: 'Service', product: 'Local Admin Service',     desc: 'Online presence, scripts, forms, monthly cleanup.',            price: '$200–$500/mo',  href: '/services/local-admin',    color: 'text-violet-400' },
    { level: 'Premium', product: 'Back Office OS',          desc: 'Full done-for-you admin system, maintained monthly.',          price: '$150–$500/mo',  href: '/services/back-office-os', color: 'text-emerald-400' },
  ];

  return (
    <section className="py-20 px-6 border-t border-white/5">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-white mb-3">Start where you are. Scale as you grow.</h2>
          <p className="text-gray-500">Every product feeds the next. Start free. Upgrade when it pays for itself.</p>
        </motion.div>

        <div className="space-y-3">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.product}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              viewport={{ once: true }}
            >
              <Link href={tier.href}
                className="flex items-center gap-5 rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4 hover:border-gray-600 hover:bg-gray-900 transition-all group">
                <div className="w-16 shrink-0 text-right">
                  <span className="text-xs text-gray-600 uppercase tracking-wider">{tier.level}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${tier.color}`}>{tier.product}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{tier.desc}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-gray-400">{tier.price}</div>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition ml-auto mt-1" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// RESALE + TRADING TOOLS — not hidden, just in context
// ═════════════════════════════════════════════════════════════════════
function TradeToolsStrip() {
  return (
    <section className="py-12 px-6 border-t border-white/5 bg-white/[0.01]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-xs text-gray-600 uppercase tracking-widest">Also inside Nova</p>
          <h3 className="text-lg font-semibold text-white mt-1">Resale &amp; trading intelligence tools</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/flip"
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 hover:border-emerald-500/30 transition group">
            <span className="text-xl">💰</span>
            <div>
              <div className="text-sm font-semibold text-white">Flip Card</div>
              <div className="text-xs text-gray-500">Enter any item → real eBay comps → net profit → verdict</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-emerald-400 transition ml-auto" />
          </Link>
          <Link href="/dashboard/scanner"
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 hover:border-pink-500/30 transition group">
            <span className="text-xl">🔍</span>
            <div>
              <div className="text-sm font-semibold text-white">Flip Finder</div>
              <div className="text-xs text-gray-500">Craigslist scanner → auto-scored deals</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-pink-400 transition ml-auto" />
          </Link>
          <Link href="/dashboard/screener"
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 hover:border-violet-500/30 transition group">
            <span className="text-xl">📈</span>
            <div>
              <div className="text-sm font-semibold text-white">Stock Screener</div>
              <div className="text-xs text-gray-500">Momentum patterns · Not financial advice</div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-violet-400 transition ml-auto" />
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
    <footer className="py-16 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">N</span>
              </div>
              <span className="text-white font-semibold">Nova Enterprises</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Practical systems for people building something real.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Services</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/services/back-office-os" className="hover:text-white transition">Back Office OS</Link></li>
              <li><Link href="/services/local-admin"    className="hover:text-white transition">Local Admin Service</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Products</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/decision-cards"  className="hover:text-white transition">Decision Cards</Link></li>
              <li><Link href="/playbook"        className="hover:text-white transition">Young Operator Playbook</Link></li>
              <li><Link href="/flip"            className="hover:text-white transition">Flip Card</Link></li>
              <li><Link href="/flip-calculator" className="hover:text-white transition">Flip Calculator</Link></li>
              <li><Link href="/dashboard/screener" className="hover:text-white transition">Stock Screener</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Learn</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/field-manual" className="hover:text-white transition">Field Manual</Link></li>
              <li><Link href="/pricing"      className="hover:text-white transition">Pricing</Link></li>
              <li><Link href="/login"        className="hover:text-white transition">Sign In</Link></li>
              <li><Link href="/register"     className="hover:text-white transition">Create Account</Link></li>
              <li><a href="mailto:hello@novanexus-ai.com" className="hover:text-white transition">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5">
          <p className="text-gray-600 text-xs">© 2026 Nova Enterprises. All rights reserved.</p>
          <p className="mt-3 text-gray-700 text-xs leading-relaxed max-w-3xl">
            <strong className="text-gray-600">Risk Disclosure:</strong> Stock screener and trading tools are for informational purposes only.
            Nothing on this platform constitutes financial or investment advice. Resale estimates are based on historical market data and may not reflect actual sale prices.
            All decisions are yours. You may lose money.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <div className="fixed inset-0 -z-10 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <Navbar />
      <HeroSection />
      <ThreePaths />
      <DecisionCardsPreview />
      <BackOfficeSection />
      <ProductLadder />
      <TradeToolsStrip />
      <Footer />
    </main>
  );
}

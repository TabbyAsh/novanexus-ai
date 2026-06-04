'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Sparkles, ChevronRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ═════════════════════════════════════════════════════════════════════
// NAVBAR
// ═════════════════════════════════════════════════════════════════════
function Navbar() {
  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
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
          <Link href="/start"                  className="text-gray-400 hover:text-white transition">Get My Card</Link>
          <Link href="/decision-cards"          className="text-gray-400 hover:text-white transition">Card Library</Link>
          <Link href="/services/back-office-os" className="text-gray-400 hover:text-white transition">Services</Link>
          <Link href="/field-manual"            className="text-gray-400 hover:text-white transition">Field Manual</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login"    className="text-gray-400 hover:text-white text-sm transition px-3 py-2">Sign In</Link>
          <Link href="/start"    className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition">
            Get My Move
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

// ═════════════════════════════════════════════════════════════════════
// HERO — Situation intake, not a pitch
// ═════════════════════════════════════════════════════════════════════

const HAVE_OPTIONS = [
  { id: 'skill',     label: 'A skill or craft',         emoji: '🛠️' },
  { id: 'following', label: 'Followers or a community',  emoji: '👥' },
  { id: 'knowledge', label: 'Deep knowledge of something', emoji: '🧠' },
  { id: 'idea',      label: 'An idea or plan',           emoji: '💡' },
  { id: 'business',  label: 'A business or side hustle', emoji: '🏃' },
  { id: 'problem',   label: 'A situation I need to solve', emoji: '🔧' },
];

function HeroSection() {
  const [selected, setSelected] = useState<string[]>([]);
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const generate = async () => {
    if (!situation.trim() && selected.length === 0) return;
    setLoading(true);
    setCard(null);
    setError(null);
    try {
      const context = [
        selected.length > 0 ? `I have: ${selected.map(s => HAVE_OPTIONS.find(o => o.id === s)?.label).join(', ')}.` : '',
        situation.trim() ? situation.trim() : '',
      ].filter(Boolean).join(' ');

      const res = await fetch(`${API}/v1/cards/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const d = await res.json();
      if (d.success) { setCard(d.data?.content || null); }
      else { setError('Could not generate your card. Try describing your situation in a bit more detail.'); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-8 blur-[140px]"
          style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-3xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>

          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/8 text-gray-500 text-xs px-4 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            For anyone — no business required
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-5">
            You have more to work with<br />
            <span className="text-emerald-400">than you think.</span>
          </h1>

          <p className="text-xl text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Tell Nova what you have and what you&apos;re dealing with.
            Get the exact next move — checklist, script, and action — for your specific situation.
          </p>

          {/* Intake widget */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 text-left space-y-5 max-w-2xl mx-auto">

            {/* Step 1 */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                What do you have? <span className="text-gray-700 normal-case font-normal">(pick any that apply)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {HAVE_OPTIONS.map(opt => (
                  <button key={opt.id} onClick={() => toggle(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                      selected.includes(opt.id)
                        ? 'bg-emerald-600 text-white border border-emerald-500'
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20 hover:text-white'
                    }`}>
                    <span>{opt.emoji}</span> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                What&apos;s your situation right now?
              </div>
              <textarea
                value={situation}
                onChange={e => setSituation(e.target.value)}
                placeholder="Describe in one or two sentences — what do you want to happen, and what's in the way? The more specific, the better the card."
                rows={3}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none"
              />
            </div>

            <button
              onClick={generate}
              disabled={loading || (selected.length === 0 && !situation.trim())}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Nova is reading your situation…' : 'Get My Card — Free'}
            </button>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            {/* Generated card */}
            <AnimatePresence>
              {card && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-xs font-bold text-white shrink-0">N</div>
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Your Card</span>
                  </div>
                  <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{card}</div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-gray-600">Sign up to save this and generate unlimited cards</p>
                    <Link href="/register" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1">
                      Save & Unlock More <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-xs text-gray-700 mt-4">
            No account needed to try. Sign up to save cards and access the full library.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SITUATIONS — not categories, real moments people recognize
// ═════════════════════════════════════════════════════════════════════
function SituationsSection() {
  const situations = [
    { text: '"I have 4,000 followers but make $0 from them."',              tag: 'Creator',     color: 'text-pink-400',   bg: 'bg-pink-500/8   border-pink-500/20'   },
    { text: '"I know everything about vintage sneakers. It\'s just a hobby."', tag: 'Collector',   color: 'text-amber-400',  bg: 'bg-amber-500/8  border-amber-500/20'  },
    { text: '"I run a Discord with 3,000 people who love anime."',          tag: 'Community',   color: 'text-violet-400', bg: 'bg-violet-500/8 border-violet-500/20' },
    { text: '"I make things by hand and give most of them away."',          tag: 'Maker',       color: 'text-cyan-400',   bg: 'bg-cyan-500/8   border-cyan-500/20'   },
    { text: '"Everyone asks me for advice on [X] but nobody pays me."',     tag: 'Expert',      color: 'text-emerald-400',bg: 'bg-emerald-500/8 border-emerald-500/20'},
    { text: '"I have a business but the back office is a disaster."',       tag: 'Operator',    color: 'text-blue-400',   bg: 'bg-blue-500/8   border-blue-500/20'   },
    { text: '"A client owes me money and is avoiding me."',                 tag: 'Collections', color: 'text-red-400',    bg: 'bg-red-500/8    border-red-500/20'    },
    { text: '"I want to turn my [skill] into something that pays."',        tag: 'Launch',      color: 'text-green-400',  bg: 'bg-green-500/8  border-green-500/20'  },
  ];

  return (
    <section className="py-16 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl font-bold text-white mb-3">Recognize yourself in here?</h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Nova works for anyone with something to work with — a skill, a community, a craft, a problem, an idea. There&apos;s always a next move.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-3">
          {situations.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              viewport={{ once: true }}
            >
              <Link href="/start"
                className={`flex items-center justify-between gap-4 rounded-xl border ${s.bg} px-5 py-4 hover:border-opacity-60 transition group`}>
                <div className="flex items-start gap-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.color} border shrink-0 mt-0.5`}>{s.tag}</span>
                  <p className="text-sm text-gray-300 italic leading-relaxed">{s.text}</p>
                </div>
                <ChevronRight className={`w-4 h-4 ${s.color} shrink-0 opacity-50 group-hover:opacity-100 transition`} />
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link href="/start"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 text-sm text-gray-300 hover:text-white transition">
            Describe your situation → get your card
          </Link>
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// CARD PREVIEW — show a few cards but frame them as situations
// ═════════════════════════════════════════════════════════════════════
function CardPreviewSection() {
  const cards = [
    { situation: 'Customer hasn\'t paid',           what: 'Reminder script, escalation steps, final notice, invoice follow-up', tag: 'Collections' },
    { situation: 'I need to price a job',           what: 'Cost breakdown, margin calc, quote structure, upsell prompts',       tag: 'Pricing'     },
    { situation: 'Turn my following into income',   what: 'Monetization options by audience size, first offer, pricing guide',  tag: 'Creator'     },
    { situation: 'New client — capture everything', what: 'Intake form, quote checklist, job notes, customer script',          tag: 'Intake'      },
    { situation: 'I know a niche deeply',           what: 'How to package knowledge, pricing, first product or service',       tag: 'Expert'      },
    { situation: 'Friend business deal',            what: 'Risk checklist, agreement template, ownership questions',           tag: 'Deals'       },
  ];

  return (
    <section className="py-16 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex items-end justify-between mb-8"
        >
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Every situation has a card.</h2>
            <p className="text-gray-500">Checklist. Script. Template. Next action. For your exact moment.</p>
          </div>
          <Link href="/decision-cards" className="hidden md:flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 transition">
            Browse all <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <motion.div
              key={c.situation}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              viewport={{ once: true }}
            >
              <Link href="/decision-cards"
                className="block rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:border-gray-600 hover:bg-gray-900 transition-all group h-full">
                <div className="text-[10px] font-bold text-gray-600 bg-gray-800 px-2 py-0.5 rounded inline-block mb-3">{c.tag}</div>
                <h4 className="text-sm font-semibold text-white mb-2">{c.situation}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{c.what}</p>
                <div className="mt-4 text-xs text-gray-700 group-hover:text-gray-400 transition flex items-center gap-1">Open card <ArrowRight className="w-3 h-3" /></div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// NICHE COMMUNITIES — the specific angle they identified
// ═════════════════════════════════════════════════════════════════════
function NicheSection() {
  const niches = [
    { name: 'Content Creators',    desc: 'You make content. Nova shows you how to make income from it — without losing what makes it real.',    emoji: '🎬' },
    { name: 'Collectors & Hobbyists', desc: 'If you know something deeply, someone will pay for that knowledge. Nova shows you how to extract it.', emoji: '🧩' },
    { name: 'Community Leaders',   desc: 'A Discord, subreddit, group chat, or loyal following is worth more than you know. Nova helps you use it.', emoji: '🌐' },
    { name: 'Makers & Craftspeople', desc: 'You make things. Nova helps you price them, sell them, and build something repeatable from the craft.', emoji: '✂️' },
    { name: 'The Go-To Person',    desc: 'Everyone asks you for advice on something. That\'s a product. Nova helps you package and sell it.',     emoji: '🎯' },
    { name: 'Service Businesses',  desc: 'Contractors, cleaners, designers, fixers. Nova handles the admin so you can handle the work.',         emoji: '🔨' },
  ];

  return (
    <section className="py-16 px-6 border-t border-white/5 bg-white/[0.01]">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl font-bold text-white mb-3">Got something? <span className="text-emerald-400">That&apos;s enough to start.</span></h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            You don&apos;t need a business plan, a logo, or an LLC. You need to know the next move.
            Nova works for anyone who has something — and wants to do something with it.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {niches.map((n, i) => (
            <motion.div
              key={n.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              viewport={{ once: true }}
            >
              <Link href="/start"
                className="block rounded-2xl border border-gray-800 bg-gray-900/40 p-5 hover:border-emerald-500/30 hover:bg-emerald-500/3 transition group h-full">
                <div className="text-3xl mb-3">{n.emoji}</div>
                <h3 className="text-sm font-bold text-white mb-2">{n.name}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{n.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SERVICES STRIP — for people who want it done for them
// ═════════════════════════════════════════════════════════════════════
function ServicesStrip() {
  return (
    <section className="py-14 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <Link href="/services/back-office-os"
              className="flex items-start gap-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 hover:border-emerald-500/40 transition group">
              <div className="text-3xl shrink-0">🗂️</div>
              <div>
                <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">Done for you · Service</div>
                <h3 className="text-lg font-bold text-white mb-2">Back Office OS</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">
                  Your business runs. We build the system behind it — invoices, estimates, scripts, expense tracking, and weekly cleanup.
                </p>
                <span className="text-xs text-emerald-400 flex items-center gap-1 group-hover:gap-2 transition-all">
                  From $150/month <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <Link href="/field-manual"
              className="flex items-start gap-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 hover:border-amber-500/40 transition group">
              <div className="text-3xl shrink-0">📖</div>
              <div>
                <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Always free · Learn</div>
                <h3 className="text-lg font-bold text-white mb-2">Field Manual</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">
                  Old business rules rebuilt for modern operators. Each piece ends in an action card. No fluff.
                </p>
                <span className="text-xs text-amber-400 flex items-center gap-1 group-hover:gap-2 transition-all">
                  Read the Field Manual <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
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
    { level: 'Free',    product: 'Situation Intake',         desc: 'Describe what you have. Get your specific first move.',            price: 'Always free',  href: '/start',                   color: 'text-emerald-400' },
    { level: 'Free',    product: 'Field Manual',             desc: 'Principles that turn into cards. Free, always.',                  price: 'Always free',  href: '/field-manual',            color: 'text-amber-400'  },
    { level: 'Entry',   product: 'Young Operator Playbook',  desc: 'How to write, speak, follow up, and move in opportunity rooms.',  price: '$27–$97',      href: '/playbook',                color: 'text-amber-400'  },
    { level: 'Core',    product: 'Decision Card Library',    desc: 'Every situation has a card. Checklist, script, template, action.', price: '$9–$79/month', href: '/decision-cards',          color: 'text-cyan-400'   },
    { level: 'Service', product: 'Local Admin Service',      desc: 'Online presence, scripts, forms, monthly cleanup.',               price: '$200–$500/mo', href: '/services/local-admin',    color: 'text-violet-400' },
    { level: 'Premium', product: 'Back Office OS',           desc: 'Full done-for-you admin system, maintained monthly.',             price: '$150–$500/mo', href: '/services/back-office-os', color: 'text-emerald-400'},
  ];

  return (
    <section className="py-16 px-6 border-t border-white/5">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Start where you are.</h2>
          <p className="text-gray-500 text-sm">Every level feeds the next. Start free, upgrade when it pays for itself.</p>
        </motion.div>

        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.product}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              viewport={{ once: true }}
            >
              <Link href={tier.href}
                className="flex items-center gap-5 rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4 hover:border-gray-700 hover:bg-gray-900 transition group">
                <div className="w-14 shrink-0 text-right">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">{tier.level}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${tier.color}`}>{tier.product}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{tier.desc}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-gray-500">{tier.price}</div>
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
// RESALE + TRADING TOOLS
// ═════════════════════════════════════════════════════════════════════
function TradeToolsStrip() {
  return (
    <section className="py-10 px-6 border-t border-white/5 bg-white/[0.01]">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs text-gray-600 uppercase tracking-widest text-center mb-5">Also inside Nova</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {[
            { href: '/flip',                emoji: '💰', name: 'Flip Card',      desc: 'Enter any item → real eBay comps → net profit → verdict', hover: 'emerald' },
            { href: '/dashboard/scanner',   emoji: '🔍', name: 'Flip Finder',   desc: 'Craigslist scanner → auto-scored deals',                  hover: 'pink'    },
            { href: '/dashboard/screener',  emoji: '📈', name: 'Stock Screener',desc: 'Momentum patterns · Not financial advice',               hover: 'violet'  },
          ].map(t => (
            <Link key={t.name} href={t.href}
              className={`flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4 hover:border-${t.hover}-500/30 transition group flex-1`}>
              <span className="text-xl shrink-0">{t.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-gray-500">{t.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition ml-auto shrink-0" />
            </Link>
          ))}
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
    <footer className="py-14 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
              <span className="text-white font-semibold text-sm">Nova Enterprises</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">Whatever you have, whatever you&apos;re dealing with — there&apos;s a next move.</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Get Started</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><Link href="/start"          className="hover:text-white transition">Get My Card — Free</Link></li>
              <li><Link href="/decision-cards" className="hover:text-white transition">Card Library</Link></li>
              <li><Link href="/playbook"       className="hover:text-white transition">Young Operator Playbook</Link></li>
              <li><Link href="/field-manual"   className="hover:text-white transition">Field Manual</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Services</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><Link href="/services/back-office-os" className="hover:text-white transition">Back Office OS</Link></li>
              <li><Link href="/services/local-admin"    className="hover:text-white transition">Local Admin Service</Link></li>
              <li><Link href="/flip"                    className="hover:text-white transition">Flip Card</Link></li>
              <li><Link href="/dashboard/screener"      className="hover:text-white transition">Stock Screener</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Account</h4>
            <ul className="space-y-2 text-xs text-gray-500">
              <li><Link href="/login"    className="hover:text-white transition">Sign In</Link></li>
              <li><Link href="/register" className="hover:text-white transition">Create Account</Link></li>
              <li><Link href="/pricing"  className="hover:text-white transition">Pricing</Link></li>
              <li><a href="mailto:hello@novanexus-ai.com" className="hover:text-white transition">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 border-t border-white/5">
          <p className="text-gray-700 text-xs">© 2026 Nova Enterprises.</p>
          <p className="mt-2 text-gray-700 text-xs leading-relaxed max-w-2xl">
            Stock screener and trading tools are for informational purposes only and do not constitute financial or investment advice.
            Resale estimates are based on market data and may not reflect actual sale prices. All decisions are yours.
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
      <SituationsSection />
      <NicheSection />
      <CardPreviewSection />
      <ServicesStrip />
      <ProductLadder />
      <TradeToolsStrip />
      <Footer />
    </main>
  );
}

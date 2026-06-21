'use client';

/**
 * Nova Studio — the services storefront. The cash engine.
 *
 * Nova Enterprises does paid client work (clean websites + lead systems for
 * local businesses and brands). That income funds the product side. This page
 * exists for ONE job: turn a visitor into a paid project. Contact lands directly
 * in the founder's inbox (mailto) — no backend that can silently drop a lead.
 */

import { useState } from 'react';
import Link from 'next/link';

const FOUNDER_EMAIL = 'kibblewyatt@gmail.com';

export default function StudioClient() {
  const [form, setForm] = useState({ name: '', business: '', need: '' });

  const startProject = () => {
    const subject = encodeURIComponent(`New project inquiry${form.business ? ` — ${form.business}` : ''}`);
    const body = encodeURIComponent(
      `Name: ${form.name || '(your name)'}\n` +
      `Business / brand: ${form.business || '(your business)'}\n\n` +
      `What I need:\n${form.need || '(describe what you want built)'}\n\n` +
      `— Sent from Nova Studio`
    );
    window.location.href = `mailto:${FOUNDER_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-[#08080c] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#08080c]/80 border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.25em]">NOVA STUDIO</span>
          <div className="flex items-center gap-6 text-sm">
            <a href="#work" className="text-gray-400 hover:text-white transition hidden sm:block">Work</a>
            <a href="#services" className="text-gray-400 hover:text-white transition hidden sm:block">Services</a>
            <a href="#start" className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 transition">Start a project</a>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6">
        {/* Hero */}
        <section className="py-24 md:py-32 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 border border-white/10 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> A division of Nova Enterprises
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] mb-6">
            Websites that make you look like <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">the real thing.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 leading-relaxed mb-10">
            Clean, fast, modern websites and lead systems for local businesses and brands — designed and built in <span className="text-white">days</span>, not months, and not at $10k agency prices.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#start" className="px-8 py-4 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition">Start a project</a>
            <a href="#work" className="px-8 py-4 rounded-xl border border-white/15 text-white font-semibold hover:bg-white/5 transition">See recent work</a>
          </div>
        </section>

        {/* Work */}
        <section id="work" className="py-16 border-t border-white/5">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-gray-400">Recent Work</h2>
            <span className="text-xs text-gray-600">Live · built start to finish</span>
          </div>
          <a href="https://yalanti-poc-production.up.railway.app" target="_blank" rel="noopener noreferrer"
            className="group block rounded-2xl border border-white/10 overflow-hidden hover:border-white/25 transition">
            <div className="aspect-[16/7] bg-gradient-to-br from-[#141414] to-[#0a0a0a] flex items-center justify-center relative">
              <span className="text-5xl md:text-7xl font-thin tracking-[0.4em] pl-[0.4em] text-white/90">YALANTI</span>
              <span className="absolute bottom-4 right-5 text-[10px] tracking-widest uppercase text-gray-500 group-hover:text-emerald-400 transition">View live ↗</span>
            </div>
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Yalanti — Designer Clothing Brand</div>
                <div className="text-sm text-gray-500 mt-0.5">Black-and-white storefront, lookbook, and live waitlist capture.</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['Storefront', 'Brand design', 'Waitlist backend'].map(t => (
                  <span key={t} className="text-[11px] text-gray-400 border border-white/10 rounded-full px-3 py-1">{t}</span>
                ))}
              </div>
            </div>
          </a>
        </section>

        {/* Services + pricing */}
        <section id="services" className="py-16 border-t border-white/5">
          <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-gray-400 mb-8">What I Build</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'Launch Site', price: '$800', sub: 'one-time', items: ['Up to 5 sections', 'Mobile-perfect', 'Contact / booking form', 'Live in ~1 week'], hl: false },
              { name: 'Site + Lead System', price: '$1,500', sub: 'one-time', items: ['Everything in Launch', 'Lead capture + follow-up', 'Quote / invoice tools', 'Set up to actually book jobs'], hl: true },
              { name: 'Care Plan', price: '$99', sub: '/month', items: ['Hosting + uptime', 'Edits & updates', 'New sections on request', 'Cancel anytime'], hl: false },
            ].map(t => (
              <div key={t.name} className={`rounded-2xl border p-6 ${t.hl ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                {t.hl && <div className="text-[11px] font-bold text-emerald-400 mb-2 tracking-wider">MOST POPULAR</div>}
                <div className="font-semibold">{t.name}</div>
                <div className="mt-2 mb-4"><span className="text-3xl font-bold">{t.price}</span> <span className="text-gray-500 text-sm">{t.sub}</span></div>
                <ul className="space-y-2">
                  {t.items.map(i => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300"><span className="text-emerald-400 mt-0.5">✓</span> {i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-600 mt-5">Half up front, half on launch. No surprises.</p>
        </section>

        {/* Process */}
        <section className="py-16 border-t border-white/5">
          <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-gray-400 mb-8">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { n: '01', t: 'Tell me what you do', d: 'One short call or message. I figure out what you actually need — usually less than you think.' },
              { n: '02', t: 'I build it', d: 'You see a working draft in days. We adjust until it’s right. You don’t lift a finger.' },
              { n: '03', t: 'Launch', d: 'It goes live on your domain. You look legit. Customers can find and contact you.' },
            ].map(s => (
              <div key={s.n}>
                <div className="text-2xl font-bold text-white/20 mb-2">{s.n}</div>
                <div className="font-semibold mb-1">{s.t}</div>
                <div className="text-sm text-gray-500 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Start a project */}
        <section id="start" className="py-20 border-t border-white/5">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="text-3xl font-bold mb-2">Start a project</h2>
            <p className="text-gray-500 text-sm mb-8">Tell me what you need. This opens an email straight to me — I reply within a day.</p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4 text-left">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Your name" className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500/50" />
              <input value={form.business} onChange={e => setForm(p => ({ ...p, business: e.target.value }))}
                placeholder="Business or brand (e.g. lawn care, clothing line)" className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500/50" />
              <textarea value={form.need} onChange={e => setForm(p => ({ ...p, need: e.target.value }))} rows={3}
                placeholder="What do you want built? A new site, a booking system, a brand storefront…" className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500/50 resize-none" />
              <button onClick={startProject}
                className="w-full py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition">
                Send it →
              </button>
              <p className="text-center text-xs text-gray-600">or email directly: <a href={`mailto:${FOUNDER_EMAIL}`} className="text-emerald-400 hover:text-emerald-300">{FOUNDER_EMAIL}</a></p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-10 px-6 text-center">
        <div className="text-sm font-semibold tracking-[0.25em] mb-2">NOVA STUDIO</div>
        <div className="text-xs text-gray-600">A division of Nova Enterprises · Built start to finish · <Link href="/" className="hover:text-gray-400">novanexus-ai.com</Link></div>
      </footer>
    </div>
  );
}

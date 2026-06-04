'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, ArrowRight, Send } from 'lucide-react';

const RESEND_API = 'https://api.resend.com/emails';

export default function BackOfficeClient() {
  const [form, setForm] = useState({ name: '', email: '', business: '', challenge: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setStatus('sending');
    try {
      // Send via the nova-hub contact endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, service: 'Back Office OS' }),
      });
      if (res.ok) { setStatus('sent'); }
      else { setStatus('error'); }
    } catch { setStatus('error'); }
  };

  const tiers = [
    {
      name: 'Starter',
      price: '$150',
      period: '/month',
      desc: 'Core admin system, built and maintained.',
      items: [
        'Estimate template',
        'Invoice template',
        'Expense tracker',
        'Customer intake form',
        'Basic task tracker',
        'Monthly admin cleanup',
      ],
      cta: 'Get Starter',
      highlight: false,
    },
    {
      name: 'Operator',
      price: '$300',
      period: '/month',
      desc: 'Full system plus weekly visibility and customer scripts.',
      items: [
        'Everything in Starter',
        'Customer follow-up scripts',
        'Weekly profit/loss sheet',
        'Weekly review call or report',
        'Business dashboard (Google Sheets)',
        'Priority response',
      ],
      cta: 'Get Operator',
      highlight: true,
    },
    {
      name: 'Growth',
      price: '$500',
      period: '/month',
      desc: 'For businesses ready to look and operate at a higher level.',
      items: [
        'Everything in Operator',
        'Website updates (basic)',
        'Google Business Profile maintenance',
        'CRM tracking setup',
        'Offer improvement support',
        'Monthly strategy review',
      ],
      cta: 'Get Growth',
      highlight: false,
    },
  ];

  const forWho = [
    'Contractors and tradespeople',
    'Clothing brands and designers',
    'Freelancers and consultants',
    'Local service businesses',
    'Coaches and service providers',
    'Anyone running a real business from their phone',
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/decision-cards"     className="text-gray-500 text-sm hover:text-white transition">Decision Cards</Link>
          <Link href="/services/local-admin" className="text-gray-500 text-sm hover:text-white transition">Local Admin</Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-20">

        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full mb-6">
            Service · Done for you · Monthly
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
            Stop losing time to scattered paperwork.
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-3">
            Nova Back Office OS gives your business a clean admin system — forms, invoices, scripts, expense tracking, and weekly visibility — built for you and maintained every month.
          </p>
          <p className="text-gray-600 text-sm">You run the business. We handle the paperwork.</p>
          <div className="mt-8">
            <a href="#contact"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-lg shadow-emerald-900/30">
              Get Your Back Office Built <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* For who */}
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold text-white mb-3">Built for operators, not corporations.</h2>
            <p className="text-gray-500 leading-relaxed mb-5">
              If you are running a real business from your phone — taking jobs, sending invoices, chasing payments, tracking expenses — and your back office is a mess of notes, screenshots, and memory, this is for you.
            </p>
            <ul className="space-y-2">
              {forWho.map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-3">
            <div className="text-sm font-semibold text-emerald-400 mb-2">Every client gets:</div>
            {[
              'Google Drive or Notion workspace, set up and organized',
              'Estimate template — professional, itemized',
              'Invoice template — with payment terms and follow-up triggers',
              'Expense tracker — log it, see where the money goes',
              'Customer intake form — capture the right info upfront',
              'Customer follow-up scripts — what to say and when',
              'Weekly profit/loss sheet — know your numbers',
              'Basic task tracker — what's open, what's done',
              'Monthly admin review — we clean it up every month',
            ].map(item => (
              <div key={item} className="flex items-start gap-2 text-sm text-gray-300">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Pricing</h2>
          <p className="text-gray-500 text-center text-sm mb-8">Monthly. Cancel anytime. Setup included.</p>
          <div className="grid md:grid-cols-3 gap-5">
            {tiers.map(tier => (
              <div key={tier.name}
                className={`rounded-2xl border p-6 ${tier.highlight
                  ? 'border-emerald-500/50 bg-emerald-500/5 ring-2 ring-emerald-500/20'
                  : 'border-gray-800 bg-gray-900/40'}`}>
                {tier.highlight && (
                  <div className="text-xs font-bold text-emerald-400 mb-3">Most popular</div>
                )}
                <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                <div className="mt-2 mb-1">
                  <span className="text-3xl font-bold text-white">{tier.price}</span>
                  <span className="text-gray-500 text-sm">{tier.period}</span>
                </div>
                <p className="text-xs text-gray-500 mb-5">{tier.desc}</p>
                <ul className="space-y-2 mb-6">
                  {tier.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> {item}
                    </li>
                  ))}
                </ul>
                <a href="#contact"
                  className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition ${
                    tier.highlight
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white'
                  }`}>
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Contact form */}
        <div id="contact" className="max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Get your back office built</h2>
          <p className="text-gray-500 text-center text-sm mb-8">
            Tell me about your business. I'll follow up within 24 hours to schedule a setup call.
          </p>

          {status === 'sent' ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Got it. I'll be in touch within 24 hours.</h3>
              <p className="text-gray-500 text-sm">Check your email for a confirmation.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Your name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    required placeholder="First and last name"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Email *</label>
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    required type="email" placeholder="you@example.com"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Business name or type</label>
                <input value={form.business} onChange={e => setForm(p => ({ ...p, business: e.target.value }))}
                  placeholder="e.g. Apex Pressure Washing, freelance photographer"
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">What's your biggest admin headache right now?</label>
                <textarea value={form.challenge} onChange={e => setForm(p => ({ ...p, challenge: e.target.value }))}
                  placeholder="Lost invoices, no expense tracking, customers not responding, scattered notes..."
                  rows={4}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60 resize-none" />
              </div>
              <button type="submit" disabled={status === 'sending'}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm transition">
                <Send className="w-4 h-4" />
                {status === 'sending' ? 'Sending…' : 'Book a Setup Call'}
              </button>
              {status === 'error' && (
                <p className="text-red-400 text-xs text-center">
                  Something went wrong. Email us directly: <a href="mailto:hello@novanexus-ai.com" className="underline">hello@novanexus-ai.com</a>
                </p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

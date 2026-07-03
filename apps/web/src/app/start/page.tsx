'use client';

/**
 * /start — Nova Situation Intake
 *
 * Anyone. Any situation. No business context required.
 * Three questions → personalized Decision Card → specific first move.
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronLeft } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const HAVE_OPTIONS = [
  { id: 'skill',      label: 'A skill or craft I\'ve developed',     emoji: '🛠️', example: 'welding, graphic design, cooking, coding, repair' },
  { id: 'following',  label: 'Followers, fans, or a community',      emoji: '👥', example: 'Instagram, TikTok, Discord, YouTube, a group chat' },
  { id: 'knowledge',  label: 'Deep knowledge of something specific',  emoji: '🧠', example: 'sneakers, vintage cars, anime, crypto, local real estate' },
  { id: 'idea',       label: 'An idea I haven\'t acted on yet',       emoji: '💡', example: 'a business, product, service, or creative project' },
  { id: 'business',   label: 'A business or side hustle already running', emoji: '🏃', example: 'freelance, retail, service, content creation' },
  { id: 'time',       label: 'Time and willingness to work',          emoji: '⏳', example: 'I just need direction and a starting point' },
  { id: 'product',    label: 'Something I make or have made',         emoji: '📦', example: 'art, food, clothing, jewelry, furniture, music' },
  { id: 'problem',    label: 'A specific situation I need to handle', emoji: '🔧', example: 'unpaid client, partnership issue, job question, money problem' },
];

const WANT_OPTIONS = [
  { id: 'income',     label: 'More income',                   emoji: '💰' },
  { id: 'business',   label: 'Build something of my own',     emoji: '🏗️' },
  { id: 'freedom',    label: 'Work for myself',               emoji: '🕊️' },
  { id: 'recognition',label: 'Be recognized for what I do',   emoji: '⭐' },
  { id: 'community',  label: 'Build or strengthen my community', emoji: '🌐' },
  { id: 'solve',      label: 'Solve a specific problem right now', emoji: '🎯' },
  { id: 'unknown',    label: 'I\'m not sure yet',             emoji: '🧭' },
];

export default function StartPage() {
  const [step, setStep] = useState(0); // 0=have, 1=want, 2=situation, 3=result
  const [haves, setHaves] = useState<string[]>([]);
  const [wants, setWants] = useState<string[]>([]);
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [regime, setRegime] = useState<{ regime: string; rationale: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleHave = (id: string) =>
    setHaves(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleWant = (id: string) =>
    setWants(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setStep(3);

    const haveLabels = haves.map(h => HAVE_OPTIONS.find(o => o.id === h)?.label).filter(Boolean);
    const wantLabels = wants.map(w => WANT_OPTIONS.find(o => o.id === w)?.label).filter(Boolean);

    const context = [
      haveLabels.length > 0 ? `I have: ${haveLabels.join(', ')}.` : '',
      wantLabels.length > 0 ? `I want: ${wantLabels.join(', ')}.` : '',
      situation.trim() ? `My situation: ${situation.trim()}` : '',
    ].filter(Boolean).join(' ');

    try {
      const res = await fetch(`${API}/v1/cards/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, haves: haveLabels, wants: wantLabels }),
      });
      const d = await res.json();
      if (d.success) {
        setCard(d.data?.content || null);
        setRegime(d.data?.regime ? { regime: d.data.regime, rationale: d.data.regimeRationale || '' } : null);
      }
      else { setError('Nova couldn\'t generate your card. Try adding more detail about your specific situation.'); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep(0); setHaves([]); setWants([]); setSituation('');
    setCard(null); setError(null); setRegime(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/50 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova</span>
        </Link>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          {step < 3 && (
            <span>{step + 1} of 3</span>
          )}
          <Link href="/decision-cards" className="hover:text-white transition">Browse all cards</Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">

          {/* Step 0: What do you have? */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <div className="text-xs text-gray-600 uppercase tracking-widest mb-2">Step 1 of 3</div>
                <h1 className="text-3xl font-bold text-white mb-2">What do you have?</h1>
                <p className="text-gray-500 leading-relaxed">
                  Pick everything that applies. You have more than you think.
                </p>
              </div>

              <div className="space-y-2">
                {HAVE_OPTIONS.map(opt => (
                  <button key={opt.id} onClick={() => toggleHave(opt.id)}
                    className={`w-full flex items-start gap-4 rounded-xl border px-4 py-3.5 text-left transition ${
                      haves.includes(opt.id)
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                    }`}>
                    <span className="text-xl shrink-0 mt-0.5">{opt.emoji}</span>
                    <div>
                      <div className="text-sm font-medium text-white">{opt.label}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{opt.example}</div>
                    </div>
                    {haves.includes(opt.id) && (
                      <span className="ml-auto text-emerald-400 text-sm shrink-0">✓</span>
                    )}
                  </button>
                ))}
              </div>

              <button onClick={() => setStep(1)} disabled={haves.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Step 1: What do you want? */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <button onClick={() => setStep(0)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition mb-4">
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>
                <div className="text-xs text-gray-600 uppercase tracking-widest mb-2">Step 2 of 3</div>
                <h1 className="text-3xl font-bold text-white mb-2">What do you want?</h1>
                <p className="text-gray-500">Pick what matters most to you right now. Be honest.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {WANT_OPTIONS.map(opt => (
                  <button key={opt.id} onClick={() => toggleWant(opt.id)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                      wants.includes(opt.id)
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                    }`}>
                    <span className="text-xl shrink-0">{opt.emoji}</span>
                    <span className="text-sm font-medium text-white leading-tight">{opt.label}</span>
                    {wants.includes(opt.id) && <span className="ml-auto text-cyan-400 text-sm shrink-0">✓</span>}
                  </button>
                ))}
              </div>

              <button onClick={() => setStep(2)} disabled={wants.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Step 2: Describe your situation */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition mb-4">
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>
                <div className="text-xs text-gray-600 uppercase tracking-widest mb-2">Step 3 of 3</div>
                <h1 className="text-3xl font-bold text-white mb-2">What&apos;s your specific situation?</h1>
                <p className="text-gray-500 leading-relaxed">
                  One or two sentences. The more specific you are, the more useful your card will be.
                  Nova isn&apos;t going to judge you — just describe it plainly.
                </p>
              </div>

              {/* Summary of what they selected */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                <div className="text-xs text-gray-600">What you told Nova so far:</div>
                {haves.length > 0 && (
                  <div className="text-xs text-gray-400">
                    <span className="text-gray-600">You have:</span> {haves.map(h => HAVE_OPTIONS.find(o => o.id === h)?.emoji).join(' ')} {haves.map(h => HAVE_OPTIONS.find(o => o.id === h)?.label).join(', ')}
                  </div>
                )}
                {wants.length > 0 && (
                  <div className="text-xs text-gray-400">
                    <span className="text-gray-600">You want:</span> {wants.map(w => WANT_OPTIONS.find(o => o.id === w)?.label).join(', ')}
                  </div>
                )}
              </div>

              <div>
                <textarea
                  value={situation}
                  onChange={e => setSituation(e.target.value)}
                  placeholder={`Example: "I repair electronics for friends for free and they keep asking me to fix more things. I want to start charging but don't know how to price it or find paying customers outside my circle."`}
                  rows={5}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none"
                />
                <p className="text-xs text-gray-700 mt-1.5">
                  The more detail you give, the more specific your card will be.
                </p>
              </div>

              <button onClick={generate} disabled={!situation.trim() && haves.length === 0}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-all text-base">
                <Sparkles className="w-5 h-5" />
                Get My Card
              </button>
            </motion.div>
          )}

          {/* Step 3: Result */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {loading ? (
                <div className="text-center py-20 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-xl mx-auto animate-pulse">N</div>
                  <p className="text-white font-semibold">Nova is reading your situation…</p>
                  <p className="text-gray-500 text-sm">Building your specific card</p>
                </div>
              ) : error ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300 text-sm">{error}</div>
                  <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl border border-gray-800 text-gray-400 hover:text-white transition text-sm">
                    ← Add more detail and try again
                  </button>
                </div>
              ) : card ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">N</div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Your Card</span>
                    </div>
                    <p className="text-xs text-gray-600">Generated from your specific situation</p>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
                    {regime && (
                      <div className="mb-4 px-3 py-2 rounded-lg text-xs leading-relaxed"
                        style={regime.regime === 'EXPLOITATION'
                          ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
                          : { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>
                        <strong className="uppercase tracking-wider">{regime.regime === 'EXPLOITATION' ? 'Execution decision' : 'Exploration decision'}</strong>
                        {regime.rationale ? ` — ${regime.rationale}` : ''}
                      </div>
                    )}
                    <div className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">{card}</div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/register"
                      className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
                      Save This Card <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button onClick={reset}
                      className="py-3 rounded-xl border border-gray-800 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition">
                      New Situation
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    <div className="text-xs font-semibold text-gray-400 mb-2">Want more cards like this?</div>
                    <div className="text-xs text-gray-500 mb-3">
                      Free account: 3 generated cards/month.<br />
                      Starter ($9/mo): full card library.<br />
                      Pro ($29/mo): unlimited AI-generated cards with your context.
                    </div>
                    <Link href="/register" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition">
                      Create free account →
                    </Link>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

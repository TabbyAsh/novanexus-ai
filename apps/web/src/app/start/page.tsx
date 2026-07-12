'use client';

/**
 * /start — Nova Situation Intake
 *
 * Anyone. Any situation. No business context required.
 * Three questions → personalized Decision Card → specific first move.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronLeft } from 'lucide-react';
import { getVisitorId, isVisitorIdDurable } from '@/lib/visitor';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const optionalAuth = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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

interface MineCard {
  id: string;
  domain: string;
  regime: string | null;
  outcome: 'worked' | 'partial' | 'failed' | null;
  outcome_at: string | null;
  preview: string;
  created_at: string;
}

interface CardCalibration {
  overall: { resolved: number; worked: number; workedRate: number | null };
  byDomain: Array<{ domain: string; resolved: number; worked: number; workedRate: number }>;
}

export default function StartPage() {
  const [step, setStep] = useState(0); // 0=have, 1=want, 2=situation, 3=result
  const [haves, setHaves] = useState<string[]>([]);
  const [wants, setWants] = useState<string[]>([]);
  const [situation, setSituation] = useState('');
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [regime, setRegime] = useState<{ regime: string; rationale: string } | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [outcomeMarked, setOutcomeMarked] = useState<string | null>(null);
  const [mine, setMine] = useState<MineCard[]>([]);
  const [calibration, setCalibration] = useState<CardCalibration | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [trackingDurable, setTrackingDurable] = useState(true);
  const [outcomePending, setOutcomePending] = useState<string | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const loadHistory = useCallback(async () => {
    const visitorId = getVisitorId();
    if (!visitorId) return;
    setTrackingDurable(isVisitorIdDurable());
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [cardsRes, calibrationRes] = await Promise.all([
        fetch(`${API}/v1/cards/mine?visitor=${encodeURIComponent(visitorId)}`, { headers: optionalAuth() }),
        fetch(`${API}/v1/cards/calibration?visitor=${encodeURIComponent(visitorId)}`, { headers: optionalAuth() }),
      ]);
      const [cardsJson, calibrationJson] = await Promise.all([cardsRes.json(), calibrationRes.json()]);
      if (!cardsRes.ok || !cardsJson?.success || !calibrationRes.ok || !calibrationJson?.success) {
        throw new Error('Track record is unavailable right now.');
      }
      setMine(cardsJson.data?.cards || []);
      setCalibration(calibrationJson.data || null);
    } catch {
      setHistoryError('Track record is unavailable right now. Your intake still works; check back before reporting an outcome.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const markOutcome = async (
    outcome: 'worked' | 'partial' | 'failed',
    targetCardId: string | null = cardId,
    note = '',
    valueText = '',
  ) => {
    if (!targetCardId) return;
    setOutcomePending(targetCardId);
    setOutcomeError(null);
    const parsedValue = valueText.trim() === '' ? null : Number(valueText);
    try {
      const response = await fetch(`${API}/v1/cards/outcome`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...optionalAuth() },
        body: JSON.stringify({
          cardId: targetCardId,
          visitorId: getVisitorId(),
          outcome,
          note,
          value: Number.isFinite(parsedValue) ? parsedValue : null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || 'Outcome was not recorded.');
      if (targetCardId === cardId) setOutcomeMarked(outcome);
      setNotes(prev => ({ ...prev, [targetCardId]: '' }));
      setValues(prev => ({ ...prev, [targetCardId]: '' }));
      await loadHistory();
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : 'Outcome was not recorded. Please try again.');
    } finally {
      setOutcomePending(null);
    }
  };

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
        headers: { 'Content-Type': 'application/json', ...optionalAuth() },
        body: JSON.stringify({ context, haves: haveLabels, wants: wantLabels, visitorId: getVisitorId() }),
      });
      const d = await res.json();
      if (d.success) {
        setCard(d.data?.content || null);
        setRegime(d.data?.regime ? { regime: d.data.regime, rationale: d.data.regimeRationale || '' } : null);
        setProvider(d.data?.provider || '');
        setCardId(d.data?.cardId || null);
        setOutcomeMarked(null);
        await loadHistory();
      }
      else { setError('Nova couldn\'t generate your card. Try adding more detail about your specific situation.'); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep(0); setHaves([]); setWants([]); setSituation('');
    setCard(null); setError(null); setRegime(null); setCardId(null); setOutcomeMarked(null);
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
                    {provider === 'deterministic' && (
                      <div className="mb-4 px-3 py-2 rounded-lg text-xs leading-relaxed"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }}>
                        <strong className="uppercase tracking-wider">Structured template</strong> — Nova&apos;s deep mind is at
                        capacity right now, so this card comes from her rule-based engine. It used the situation you supplied,
                        but no live language model interpreted it; verify the details before you act.
                      </div>
                    )}
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

                  {/* THE OUTCOME LOOP — close it. This is what makes Nova learn. */}
                  {cardId && (
                    <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-4">
                      {!outcomeMarked ? (
                        <>
                          <div className="text-xs font-semibold text-cyan-300 mb-2">When you know how this played out, tell Nova.</div>
                          <div className="text-[11px] text-gray-500 mb-3">Every real outcome builds Nova&apos;s honest track record. Come back and mark what happened.</div>
                          <div className="flex gap-2">
                            <button disabled={outcomePending === cardId} onClick={() => markOutcome('worked')} className="flex-1 py-2 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 text-xs font-medium hover:bg-emerald-600/30 disabled:opacity-50 transition">It worked</button>
                            <button disabled={outcomePending === cardId} onClick={() => markOutcome('partial')} className="flex-1 py-2 rounded-lg bg-amber-600/20 border border-amber-600/40 text-amber-300 text-xs font-medium hover:bg-amber-600/30 disabled:opacity-50 transition">Partly</button>
                            <button disabled={outcomePending === cardId} onClick={() => markOutcome('failed')} className="flex-1 py-2 rounded-lg bg-red-600/15 border border-red-600/40 text-red-300 text-xs font-medium hover:bg-red-600/25 disabled:opacity-50 transition">It didn&apos;t</button>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-cyan-300">Logged — Nova remembers. This is now part of her track record. Thank you; that&apos;s how she gets better.</div>
                      )}
                    </div>
                  )}

                  {!cardId && (
                    <div className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-4 text-xs text-amber-300">
                      Your card was generated, but Nova could not persist it. Keep a copy and try again later if you want the outcome tracked.
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Link href={cardId ? '#track-record' : '/register'}
                      className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
                      {cardId ? 'View Track Record' : 'Create Account'} <ArrowRight className="w-4 h-4" />
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

        {outcomeError && (
          <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{outcomeError}</div>
        )}

        <section id="track-record" className="mt-14 pt-10 border-t border-gray-800/60 scroll-mt-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-xs text-cyan-400 uppercase tracking-widest mb-1">The learning loop</div>
              <h2 className="text-xl font-bold text-white">Your cards remember what happened.</h2>
              <p className="text-sm text-gray-500 mt-1">Return after you act. Outcomes—not engagement—are the evidence Nova needs to become sharper.</p>
            </div>
            {calibration && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-right shrink-0">
                <div className="text-2xl font-bold text-white">{calibration.overall.resolved}</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-600">resolved</div>
                <div className="text-[11px] text-cyan-400 mt-1">
                  {calibration.overall.workedRate === null
                    ? 'track record starts with truth'
                    : `${Math.round(calibration.overall.workedRate * 100)}% worked`}
                </div>
              </div>
            )}
          </div>

          {!trackingDurable && (
            <div className="mb-4 rounded-xl border border-amber-800/40 bg-amber-950/10 p-4 text-xs text-amber-300">
              Browser storage is blocked, so this track record lasts only for the current page session.
            </div>
          )}

          {historyError ? (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/10 p-5 text-sm text-amber-300">{historyError}</div>
          ) : historyLoading ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 text-sm text-gray-600">Loading your cards…</div>
          ) : mine.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 text-sm text-gray-500">Your first card will appear here. Act on it, return, and tell Nova what reality said.</div>
          ) : (
            <div className="space-y-3">
              {mine.map(item => (
                <article key={item.id} className="rounded-xl border border-gray-800 bg-gray-900/35 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                      <span className="text-cyan-400">{item.domain || 'general'}</span>
                      {item.regime && <span className="text-gray-600">{item.regime}</span>}
                    </div>
                    <time className="text-[10px] text-gray-700">{new Date(item.created_at).toLocaleDateString()}</time>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.preview}</p>

                  {item.outcome ? (
                    <div className={`mt-3 text-xs font-medium ${item.outcome === 'worked' ? 'text-emerald-400' : item.outcome === 'partial' ? 'text-amber-400' : 'text-red-400'}`}>
                      Reality logged: {item.outcome === 'worked' ? 'worked' : item.outcome === 'partial' ? 'partly worked' : 'did not work'}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <div className="grid sm:grid-cols-[1fr_130px] gap-2">
                        <input
                          value={notes[item.id] || ''}
                          onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="What happened? (optional)"
                          className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-white placeholder-gray-700 outline-none focus:border-cyan-700"
                        />
                        <input
                          value={values[item.id] || ''}
                          onChange={e => setValues(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="$ value (optional)"
                          inputMode="decimal"
                          className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-white placeholder-gray-700 outline-none focus:border-cyan-700"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button disabled={outcomePending === item.id} onClick={() => markOutcome('worked', item.id, notes[item.id], values[item.id])} className="flex-1 py-2 rounded-lg border border-emerald-700/50 text-emerald-400 text-xs hover:bg-emerald-500/10 disabled:opacity-50">Worked</button>
                        <button disabled={outcomePending === item.id} onClick={() => markOutcome('partial', item.id, notes[item.id], values[item.id])} className="flex-1 py-2 rounded-lg border border-amber-700/50 text-amber-400 text-xs hover:bg-amber-500/10 disabled:opacity-50">Partly</button>
                        <button disabled={outcomePending === item.id} onClick={() => markOutcome('failed', item.id, notes[item.id], values[item.id])} className="flex-1 py-2 rounded-lg border border-red-800/50 text-red-400 text-xs hover:bg-red-500/10 disabled:opacity-50">Failed</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

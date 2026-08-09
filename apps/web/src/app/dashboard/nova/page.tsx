'use client';

/**
 * Nexus — the governed interaction layer among human intention, Nova,
 * connected capabilities, and evidence from reality.
 *
 * Human intent enters here. Nova's reasoning and capabilities return through
 * an inspectable receipt: what ran, what evidence it used, what is missing,
 * what authority it had, what was remembered, and whether the outcome can close.
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Send, Sparkles, ArrowRight, Plus, Database, ShieldCheck, Boxes, AlertTriangle } from 'lucide-react';

const API = '/api/proxy';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

interface Message {
  role: 'user' | 'nova';
  content: string;
  branch?: { intent: string; label: string; href: string; description: string } | null;
  action?: any | null;
  interaction?: NexusInteraction | null;
}

interface NexusInteraction {
  interactionId: string;
  conversationId: string;
  intent: {
    primary: string;
    route: { label: string; href: string; description: string } | null;
  };
  execution: {
    mode: 'reasoning' | 'direct' | 'composed';
    capabilities: string[];
    evidence: Array<{ capabilityId: string; summary: string; source: string }>;
    gaps: string[];
    cost: { aiCalls: number; toolCalls: number };
  };
  authority: {
    mode: 'observe' | 'recommend' | 'assist' | 'automate';
    externalSideEffectsPerformed: boolean;
    humanApprovalRequiredForSideEffects: boolean;
  };
  nova: { reply: string; provider: string };
  memory: { persisted: boolean; artifactId: string | null; outcomeClosable: boolean };
  action: any | null;
}

interface CapabilitySummary {
  total: number;
  available: number;
  gated: number;
  developing: number;
}

const SUGGESTIONS = [
  'A constraint changed. Help me see the choices it creates.',
  'Turn this ambition into one bounded next action.',
  'What is the most valuable unknown to resolve first?',
  'Show me the tradeoffs I am currently hiding from myself.',
  'What evidence would reality need to return before I proceed?',
  'Help me choose the smallest reversible interaction.',
];

export default function NexusPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [restoredConversation, setRestoredConversation] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, 'saving' | 'worked' | 'partial' | 'failed' | 'error'>>({});
  const [capabilitySummary, setCapabilitySummary] = useState<CapabilitySummary | null>(null);
  const [interactionCount, setInteractionCount] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestEpoch = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    fetch(`${API}/v1/nexus/capabilities`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        const capabilities = Array.isArray(d?.data?.capabilities) ? d.data.capabilities : [];
        if (!capabilities.length) return;
        setCapabilitySummary({
          total: capabilities.length,
          available: capabilities.filter((c: any) => c.status === 'available').length,
          gated: capabilities.filter((c: any) => c.status === 'gated').length,
          developing: capabilities.filter((c: any) => c.status === 'degraded' || c.status === 'reserved').length,
        });
      })
      .catch(() => undefined);
    fetch(`${API}/v1/nexus/interactions?limit=100`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => setInteractionCount(Array.isArray(d?.data?.interactions) ? d.data.interactions.length : null))
      .catch(() => undefined);

    // Restore the latest owned conversation after reload. The server enforces
    // ownership; no shared/global memory is sampled into this surface.
    fetch(`${API}/v1/nexus/conversations`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(async d => {
        const latest = Array.isArray(d?.data?.conversations) ? d.data.conversations[0] : null;
        if (!latest?.id || requestEpoch.current !== 0) return;
        const response = await fetch(`${API}/v1/nexus/conversations/${latest.id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const body = await response.json();
        if (requestEpoch.current !== 0 || !body?.success || !Array.isArray(body?.data?.messages)) return;
        setConversationId(latest.id);
        setRestoredConversation(true);
        setMessages(body.data.messages.map((item: any) => ({
          role: item.role === 'user' ? 'user' : 'nova',
          content: String(item.content || ''),
        })));
      })
      .catch(() => undefined);
  }, []);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);
    const epoch = ++requestEpoch.current;

    try {
      const r = await fetch(`${API}/v1/nexus/interact`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const d = await r.json();
      if (epoch !== requestEpoch.current) return;
      if (d.success) {
        const interaction = d.data as NexusInteraction;
        setConversationId(interaction.conversationId);
        setMessages(m => [...m, {
          role: 'nova',
          content: interaction.nova.reply,
          branch: interaction.intent.route ? { intent: interaction.intent.primary, ...interaction.intent.route } : null,
          action: interaction.action,
          interaction,
        }]);
        if (interaction.memory.persisted) setInteractionCount(count => (count ?? 0) + 1);
      } else {
        setMessages(m => [...m, { role: 'nova', content: d?.error?.message || 'Nexus could not complete this interaction. Try again.' }]);
      }
    } catch {
      if (epoch !== requestEpoch.current) return;
      setMessages(m => [...m, { role: 'nova', content: 'Connection issue. Please try again.' }]);
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  };

  const markOutcome = async (interactionId: string, result: 'worked' | 'partial' | 'failed') => {
    if (outcomes[interactionId] && outcomes[interactionId] !== 'error') return;
    setOutcomes(current => ({ ...current, [interactionId]: 'saving' }));
    try {
      const response = await fetch(`${API}/v1/nexus/interactions/${interactionId}/outcome`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body?.error?.code || 'OUTCOME_FAILED');
      setOutcomes(current => ({ ...current, [interactionId]: result }));
    } catch {
      setOutcomes(current => ({ ...current, [interactionId]: 'error' }));
    }
  };

  const newChat = () => {
    requestEpoch.current += 1;
    setMessages([]);
    setConversationId(null);
    setRestoredConversation(false);
    setInput('');
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">

        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-white">N</div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Nexus</h1>
              <p className="text-xs text-gray-600 mt-0.5">The governed interaction layer among you, Nova, capabilities, and reality</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {capabilitySummary && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-500">
                <span className="text-emerald-400">{capabilitySummary.available} available</span>
                <span>·</span>
                <span>{capabilitySummary.gated} gated</span>
                <span>·</span>
                <span>{capabilitySummary.developing} developing</span>
                {interactionCount !== null && <><span>·</span><span>{interactionCount} receipts</span></>}
              </div>
            )}
          {messages.length > 0 && (
            <button onClick={newChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 text-xs text-gray-400 hover:text-white transition">
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          )}
          </div>
        </div>

        {/* Messages / empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-2xl text-white mx-auto mb-5">N</div>
              <h2 className="text-2xl font-bold text-white mb-2">What potential do you want to realize?</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Bring an intention, problem, or ambition. Nova will make the reachable choices legible.
                Nexus will show which capabilities and evidence were used, what authority existed,
                what actually happened, and what is still missing.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 text-left">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-sm text-gray-400 hover:text-white hover:border-emerald-500/30 hover:bg-emerald-500/5 transition text-left">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500/60 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {restoredConversation && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-100/70">
                  Saved chat restored. Earlier messages are account-scoped conversation context, not verified operating memory.
                  Their original Nexus receipts, evidence, and outcome state are not reloaded on this screen.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role === 'nova' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1">N</div>
                  )}
                  <div className={`max-w-[80%] ${m.role === 'user' ? 'order-1' : ''}`}>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-900 border border-gray-800 text-gray-200'
                    }`}>
                      {m.content}
                    </div>
                    {/* Inline flip result — Nova ran a real analysis */}
                    {m.action?.type === 'flip' && m.action.card && (
                      <div className="mt-2 rounded-xl border border-gray-800 bg-gray-950 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{m.action.card.item_title}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            m.action.card.verdict === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            m.action.card.verdict === 'PASS' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}>{m.action.card.verdict}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-900 rounded-lg p-2">
                            <div className="text-[10px] text-gray-600">Resale (mid)</div>
                            <div className="text-sm font-bold text-white">${m.action.card.est_resale_mid}</div>
                          </div>
                          <div className="bg-gray-900 rounded-lg p-2">
                            <div className="text-[10px] text-gray-600">Net profit</div>
                            <div className={`text-sm font-bold ${m.action.card.est_net_profit_mid >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ${m.action.card.est_net_profit_mid}
                            </div>
                          </div>
                          <div className="bg-gray-900 rounded-lg p-2">
                            <div className="text-[10px] text-gray-600">ROI</div>
                            <div className="text-sm font-bold text-white">{m.action.card.roi_percent}%</div>
                          </div>
                        </div>
                        <Link href="/flip" className="block text-center mt-3 text-xs text-emerald-400 hover:text-emerald-300 transition">
                          Open full Flip Card →
                        </Link>
                      </div>
                    )}

                    {/* Inline business status — Nova pulled real pipeline */}
                    {m.action?.type === 'business' && (
                      <Link href="/dashboard/business"
                        className="mt-2 flex items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 hover:bg-cyan-500/10 transition group">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-cyan-400">Open Business OS</div>
                          <div className="text-xs text-gray-500">{m.action.followUps > 0 ? `${m.action.followUps} follow-up${m.action.followUps > 1 ? 's' : ''} due today` : 'Your live pipeline'}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </Link>
                    )}

                    {/* Branch route card */}
                    {m.branch && !m.action && (
                      <Link href={m.branch.href}
                        className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 hover:bg-emerald-500/10 transition group">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-emerald-400">{m.branch.label}</div>
                          <div className="text-xs text-gray-500">{m.branch.description}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </Link>
                    )}

                    {/* Nexus interaction receipt — execution truth, not decorative metadata. */}
                    {m.interaction && (
                      <div className="mt-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider">
                          <span className="flex items-center gap-1 text-violet-300">
                            <Boxes className="w-3 h-3" /> {m.interaction.execution.mode}
                          </span>
                          <span className="text-gray-700">·</span>
                          <span className="flex items-center gap-1 text-cyan-300">
                            <ShieldCheck className="w-3 h-3" /> {m.interaction.authority.mode}
                          </span>
                          <span className="text-gray-700">·</span>
                          <span className={m.interaction.authority.externalSideEffectsPerformed ? 'text-amber-300' : 'text-gray-500'}>
                            {m.interaction.authority.externalSideEffectsPerformed ? 'external effects performed' : 'no external effects'}
                          </span>
                        </div>

                        {m.interaction.execution.capabilities.length > 0 ? (
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Capabilities used</div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.interaction.execution.capabilities.map(capability => (
                                <span key={capability} className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200">
                                  {capability}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-gray-500">Reasoning only — no tool execution was claimed.</div>
                        )}

                        {m.interaction.execution.evidence.length > 0 && (
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Evidence</div>
                            <div className="space-y-1.5">
                              {m.interaction.execution.evidence.slice(0, 4).map((evidence, evidenceIndex) => (
                                <div key={`${evidence.capabilityId}-${evidenceIndex}`} className="rounded-lg bg-black/20 px-2.5 py-2 text-[11px] text-gray-400">
                                  <div className="text-gray-300">{evidence.summary}</div>
                                  <div className="mt-0.5 text-[10px] text-gray-600">Source: {evidence.source}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.interaction.execution.gaps.length > 0 && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300 mb-1">
                              <AlertTriangle className="w-3 h-3" /> Capability gaps
                            </div>
                            {m.interaction.execution.gaps.map((gap, gapIndex) => (
                              <div key={gapIndex} className="text-[11px] text-amber-100/70">{gap}</div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                          <div className={`flex items-center gap-1.5 text-[10px] ${m.interaction.memory.persisted ? 'text-emerald-400' : 'text-amber-400'}`}>
                            <Database className="w-3 h-3" />
                            {m.interaction.memory.persisted ? 'Content-redacted interaction receipt saved' : 'Interaction receipt not saved'}
                          </div>
                          {m.interaction.memory.outcomeClosable && (
                            <div className="flex items-center gap-1.5">
                              {outcomes[m.interaction.interactionId] && outcomes[m.interaction.interactionId] !== 'saving' && outcomes[m.interaction.interactionId] !== 'error' ? (
                                <span className="text-[10px] text-emerald-400">Outcome recorded: {outcomes[m.interaction.interactionId]}</span>
                              ) : (
                                <>
                                  <span className="text-[10px] text-gray-600 mr-1">Did it work?</span>
                                  {(['worked', 'partial', 'failed'] as const).map(result => (
                                    <button
                                      key={result}
                                      onClick={() => markOutcome(m.interaction!.interactionId, result)}
                                      disabled={outcomes[m.interaction!.interactionId] === 'saving'}
                                      className="rounded-md border border-gray-800 px-2 py-1 text-[10px] text-gray-500 hover:border-emerald-500/30 hover:text-emerald-300 disabled:opacity-40 transition"
                                    >
                                      {result}
                                    </button>
                                  ))}
                                  {outcomes[m.interaction.interactionId] === 'error' && (
                                    <span className="text-[10px] text-red-400">Save failed—retry</span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1">N</div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/5 px-6 py-4 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Tell Nexus what you want to realize…"
                rows={1}
                className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none max-h-32"
                style={{ minHeight: '46px' }}
              />
              <button onClick={() => send(input)} disabled={loading || !input.trim()}
                className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex items-center justify-center text-white transition shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] leading-4 text-gray-600">
              Your messages and Nova&apos;s replies are stored with your account. AI-enabled turns may send the current message,
              recent chat context, and relevant tool summaries to one or more configured AI providers, which may retain them
              under their terms. Interaction receipts exclude raw chat. Do not enter secrets or third-party personal information
              you are not authorized to share. <Link href="/privacy" className="text-gray-400 underline underline-offset-2">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

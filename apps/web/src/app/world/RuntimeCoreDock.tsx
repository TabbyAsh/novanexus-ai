'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { hasWorldAuthority } from '../../lib/world-authority';

type ProviderName = 'local' | 'gemini' | 'groq' | 'grok' | 'claude' | 'openai';

interface ProviderHealth {
  name: ProviderName;
  configured: boolean;
  available: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  quotaExhaustedUntil: string | null;
  lastLatencyMs?: number | null;
  emaLatencyMs?: number | null;
  successCount?: number;
  failureCount?: number;
}

interface RuntimeHealth {
  providers: ProviderHealth[];
  capableOfLLM: boolean;
  fallbackOrder: ProviderName[];
  sovereignty: {
    score: number;
    band: string;
    localAvailable: boolean;
    externalConfigured: number;
    rationale: string;
  };
  lastRun?: {
    provider: ProviderName | null;
    at: string | null;
    tier: 'deterministic' | 'small' | 'coding' | 'reasoning' | null;
  };
}

function statusColor(provider: ProviderHealth): string {
  if (!provider.configured) return '#4f6172';
  if (provider.quotaExhaustedUntil && new Date(provider.quotaExhaustedUntil).getTime() > Date.now()) return '#ffce73';
  if (provider.available) return '#67f2bd';
  if (provider.lastFailureAt) return '#ff738f';
  return '#8bdff6';
}

function timeLabel(value: string | null): string {
  if (!value) return 'never';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return value;
  }
}

export default function RuntimeCoreDock() {
  const { scopes, isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [dark, setDark] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const isFounder = isAuthenticated && hasWorldAuthority(scopes);

  const fetchHealth = useCallback(async () => {
    try {
      const token = localStorage.getItem('nova_access_token') || '';
      const response = await fetch('/api/proxy/v1/agents/providers', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await response.json();
      const data = (body?.data || body) as RuntimeHealth;
      if (!response.ok || !Array.isArray(data?.providers)) throw new Error('runtime unavailable');
      setHealth(data);
      setUpdatedAt(new Date().toISOString());
      setDark(false);
    } catch {
      setDark(true);
    }
  }, []);

  useEffect(() => {
    if (!isFounder) return;
    void fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, [fetchHealth, isFounder]);

  const configured = useMemo(() => health?.providers.filter(provider => provider.configured) || [], [health]);
  const active = health?.lastRun?.provider
    ? health.providers.find(provider => provider.name === health.lastRun?.provider) || null
    : configured.find(provider => provider.available) || null;

  if (!isFounder) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-4 z-[85] flex items-center gap-2 rounded-full border border-cyan-200/20 bg-[#040a14]/88 px-4 py-2 text-[10px] uppercase tracking-[.22em] text-cyan-100/70 shadow-2xl backdrop-blur-xl hover:text-white"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dark ? 'bg-rose-400' : health?.capableOfLLM ? 'bg-emerald-300' : 'bg-slate-500'}`} />
        Core {health ? `· ${health.sovereignty.score}%` : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] bg-black/70 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-200/15 bg-[#040a14]/98 text-white shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-white/7 px-5 py-4">
              <div>
                <div className="text-[9px] uppercase tracking-[.32em] text-cyan-100/40">Nova Core · live compute</div>
                <h2 className="mt-2 text-xl font-semibold">Replaceable minds, measured runtime</h2>
                <p className="mt-1 text-xs text-white/35">State and policy remain Nova’s. Models are routed accelerators with health, latency, quota, and privacy boundaries.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void fetchHealth()} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">refresh</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">close</button>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto p-5">
              {!health ? (
                <div className="rounded-2xl border border-rose-300/15 bg-rose-300/5 p-5 text-sm text-rose-100/55">The provider-health source is dark. No runtime values are being invented.</div>
              ) : (
                <div className="space-y-5">
                  <section className="grid gap-3 md:grid-cols-4">
                    <Metric label="Sovereignty" value={`${health.sovereignty.score}%`} sub={health.sovereignty.band} />
                    <Metric label="LLM capacity" value={health.capableOfLLM ? 'AVAILABLE' : 'DARK'} sub={`${configured.length} configured`} />
                    <Metric label="Active mind" value={active?.name || 'NONE'} sub={health.lastRun?.tier || 'no recent tier'} />
                    <Metric label="Last latency" value={active?.lastLatencyMs == null ? 'UNKNOWN' : `${active.lastLatencyMs} ms`} sub={active?.emaLatencyMs == null ? 'no rolling average' : `EMA ${active.emaLatencyMs} ms`} />
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-white/[.02] p-4">
                    <div className="text-[9px] uppercase tracking-[.25em] text-white/30">Sovereignty state</div>
                    <p className="mt-3 text-xs leading-relaxed text-white/48">{health.sovereignty.rationale}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-gradient-to-r from-slate-500 via-cyan-400 to-emerald-300" style={{ width: `${health.sovereignty.score}%` }} />
                    </div>
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-[9px] uppercase tracking-[.25em] text-white/30">Provider lattice</h3>
                      <div className="text-[9px] text-white/25">updated {timeLabel(updatedAt)}</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {health.providers.map(provider => (
                        <article key={provider.name} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: statusColor(provider), boxShadow: `0 0 12px ${statusColor(provider)}` }} />
                              <h4 className="text-sm font-semibold capitalize text-white/75">{provider.name}</h4>
                            </div>
                            <span className="text-[8px] uppercase tracking-wider text-white/28">{provider.name === 'local' ? 'private' : 'external'}</span>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Small label="Configured" value={provider.configured ? 'yes' : 'no'} />
                            <Small label="Available" value={provider.available ? 'yes' : 'no'} />
                            <Small label="Last" value={provider.lastLatencyMs == null ? 'unknown' : `${provider.lastLatencyMs} ms`} />
                            <Small label="EMA" value={provider.emaLatencyMs == null ? 'unknown' : `${provider.emaLatencyMs} ms`} />
                            <Small label="Successes" value={String(provider.successCount ?? 0)} />
                            <Small label="Failures" value={String(provider.failureCount ?? 0)} />
                          </div>
                          {provider.lastFailureReason && <div className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[.025] p-2 text-[9px] leading-relaxed text-rose-100/45">{provider.lastFailureReason}</div>}
                          {provider.quotaExhaustedUntil && new Date(provider.quotaExhaustedUntil).getTime() > Date.now() && <div className="mt-2 text-[9px] text-amber-200/55">cooldown until {timeLabel(provider.quotaExhaustedUntil)}</div>}
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/8 bg-white/[.02] p-4">
                    <div className="text-[9px] uppercase tracking-[.25em] text-white/30">Fallback order</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {health.fallbackOrder.map((provider, index) => (
                        <div key={provider} className="flex items-center gap-2">
                          <span className="rounded-full border border-cyan-200/12 bg-cyan-200/[.025] px-3 py-1.5 text-[10px] text-cyan-100/55">{provider}</span>
                          {index < health.fallbackOrder.length - 1 && <span className="text-white/20">→</span>}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-white/30">Each attempt is time-bounded and the complete chain has a hard deadline. State queries bypass this lattice entirely.</p>
                  </section>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-white/8 bg-white/[.02] p-4"><div className="text-[8px] uppercase tracking-wider text-white/25">{label}</div><div className="mt-2 text-lg font-semibold text-cyan-100/70">{value}</div><div className="mt-1 text-[9px] text-white/28">{sub}</div></div>;
}

function Small({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/6 bg-white/[.018] px-2 py-2"><div className="text-[7px] uppercase tracking-wider text-white/20">{label}</div><div className="mt-1 text-[10px] text-white/50">{value}</div></div>;
}

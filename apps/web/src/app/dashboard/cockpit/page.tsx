'use client';

/**
 * COMMAND CENTER — the founder's cockpit. You at the head of the table;
 * Nova running the company below. Real operational truth: her mind's
 * sovereignty, the live pulse, platform standing, and the doors into every
 * control surface. (Rebuild Phase 0 — the private World, made legible.)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const API = '/api/proxy';

interface Health { capableOfLLM: boolean; sovereignty: { score: number; band: string; rationale: string }; providers: Array<{ name: string; configured: boolean; available: boolean; quotaExhaustedUntil: string | null }>; lastRun: { provider: string | null }; fallbackOrder: string[] }
interface Pulse { standing: { users: number; agentRunsCompleted: number; outcomeValue: number; artifacts?: number } | null; pulse: Array<{ id: string; label: string }> }

function tok() { return typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') : null; }

export default function CommandCenter() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/agents/providers`).then(r => r.json()).then(d => { if (d?.success) setHealth(d.data); }).catch(() => {});
    fetch(`${API}/v1/world/pulse`).then(r => r.json()).then(d => { if (d?.success) setPulse(d.data); }).catch(() => {});
  }, []);

  const CONTROLS = [
    { name: 'Agent Workforce', href: '/dashboard/forge-control', icon: '⚒', desc: 'Builder-agents, evals, proposals' },
    { name: 'Operations', href: '/dashboard/business', icon: '◈', desc: 'Leads → quotes → jobs → paid' },
    { name: 'The World', href: '/world', icon: '✦', desc: 'The living interaction engine' },
    { name: 'Safety & Kill Switch', href: '/dashboard/safety', icon: '🛡️', desc: 'Freeze all agents instantly' },
    { name: 'Analytics', href: '/dashboard/analytics', icon: '📉', desc: 'Platform metrics' },
    { name: 'Outcomes', href: '/dashboard/outcomes', icon: '◉', desc: 'What actually happened' },
  ];

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-[#0a0a0f] text-white px-6 py-8 max-w-6xl mx-auto">
      <div className="text-[11px] tracking-[0.3em] uppercase mb-2 text-amber-400">The World · Command Center</div>
      <h1 className="text-2xl font-bold mb-1">You run Nova. Nova runs the company.</h1>
      <p className="text-gray-400 text-sm mb-8">Every control surface, and the honest state of her mind.</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {/* Sovereignty */}
        <div className="rounded-xl border border-gray-800 bg-[#111117] p-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Sovereignty</div>
          {health ? (
            <>
              <div className="text-3xl font-bold mb-1" style={{ color: health.sovereignty.score >= 75 ? '#34d399' : health.sovereignty.score >= 50 ? '#fbbf24' : '#f87171' }}>{health.sovereignty.score}%</div>
              <div className="text-[11px] text-gray-500">{health.sovereignty.band}</div>
              <div className={`mt-2 text-[11px] ${health.capableOfLLM ? 'text-emerald-400' : 'text-red-400'}`}>{health.capableOfLLM ? '● can run agent jobs' : '○ mind dark — jobs halt honestly'}</div>
            </>
          ) : <div className="text-sm text-gray-600">…</div>}
        </div>
        {/* Standing */}
        <div className="rounded-xl border border-gray-800 bg-[#111117] p-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Standing</div>
          {pulse?.standing ? (
            <div className="space-y-1 text-sm">
              <div className="text-gray-300">{pulse.standing.users} <span className="text-gray-600">operators</span></div>
              <div className="text-gray-300">{pulse.standing.agentRunsCompleted} <span className="text-gray-600">agent runs</span></div>
              <div className="text-gray-300">{pulse.standing.artifacts ?? 0} <span className="text-gray-600">records on the substrate</span></div>
            </div>
          ) : <div className="text-sm text-gray-600">…</div>}
        </div>
        {/* Providers */}
        <div className="rounded-xl border border-gray-800 bg-[#111117] p-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Her mind</div>
          {health ? (
            <div className="space-y-1">
              {health.providers.filter(p => p.configured || p.name === 'local').map(p => (
                <div key={p.name} className="flex justify-between text-[11px]">
                  <span className="text-gray-400">{p.name}</span>
                  <span className={!p.configured ? 'text-gray-600' : p.available ? 'text-emerald-400' : p.quotaExhaustedUntil ? 'text-amber-400' : 'text-red-400'}>
                    {!p.configured ? 'off' : p.available ? 'ready' : p.quotaExhaustedUntil ? 'quota-dark' : 'down'}
                  </span>
                </div>
              ))}
              {health.lastRun.provider && <div className="mt-2 text-[10px] text-gray-600">last run · {health.lastRun.provider}</div>}
            </div>
          ) : <div className="text-sm text-gray-600">…</div>}
        </div>
      </div>

      {/* Control surfaces */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {CONTROLS.map(c => (
          <Link key={c.name} href={c.href} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#111117] p-4 hover:border-gray-700 transition no-underline">
            <span className="text-xl">{c.icon}</span>
            <div><div className="text-sm font-medium text-white">{c.name}</div><div className="text-[11px] text-gray-500">{c.desc}</div></div>
          </Link>
        ))}
      </div>

      {/* Live pulse */}
      <div className="rounded-xl border border-gray-800 bg-[#111117] p-5">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Live pulse — what the swarm is doing</div>
        {pulse?.pulse?.length ? (
          <div className="space-y-1">
            {pulse.pulse.slice(0, 8).map((e, i) => (
              <div key={e.id} className="text-[12px] truncate" style={{ color: '#5d7891', opacity: 1 - i * 0.08 }}>{e.label}</div>
            ))}
          </div>
        ) : <div className="text-sm text-gray-600">Quiet. Every light here will be earned.</div>}
      </div>
    </div>
    </DashboardLayout>
  );
}

'use client';

/**
 * THE FORGE — the only sector that MAKES rather than finds. Ideas and messy
 * situations struck into concrete moves and built things: Decision Cards,
 * launch plans, and the builder-agent workforce. (Rebuild Phase 0.)
 */

import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const TOOLS = [
  { name: 'Forge a Decision', href: '/start', icon: '◇', promise: 'Your situation → a Decision Card: the honest read, your next three moves, the words to say.', accent: '#c69bff' },
  { name: 'Agent Workforce', href: '/dashboard/forge-control', icon: '⚒', promise: 'Deploy builder-agents that write code, test it, repair it, and propose the result. Human-approved.', accent: '#a879ff' },
  { name: 'Nova Studio', href: '/studio', icon: '◈', promise: 'Websites and lead systems, built for businesses.', accent: '#9163e0' },
];

export default function ForgeHub() {
  return (
    <DashboardLayout>
    <div className="min-h-screen bg-[#0a0a0f] text-white px-6 py-8 max-w-5xl mx-auto">
      <div className="text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: '#c69bff' }}>The Forge</div>
      <h1 className="text-2xl font-bold mb-1">Your idea, struck into a first move.</h1>
      <p className="text-gray-400 text-sm mb-8">The only sector that makes rather than finds. Creation under heat.</p>

      <div className="grid md:grid-cols-3 gap-4">
        {TOOLS.map(t => (
          <Link key={t.name} href={t.href} className="block rounded-xl border border-gray-800 bg-[#111117] p-5 hover:border-gray-700 transition no-underline">
            <div className="flex items-center gap-2 mb-2"><span className="text-lg" style={{ color: t.accent }}>{t.icon}</span><span className="font-semibold text-white">{t.name}</span></div>
            <div className="text-xs text-gray-400 leading-relaxed">{t.promise}</div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-[11px] text-gray-600 max-w-lg">Decision support, honestly labeled. The Forge does not flatter weak ideas — that is the point.</p>
    </div>
    </DashboardLayout>
  );
}

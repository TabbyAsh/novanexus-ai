import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Enterprise — Nova Enterprises',
  description: 'Nova Enterprises for organizations: decision intelligence, operational systems, and governed AI for teams at scale.',
};

const ENTERPRISE_FEATURES = [
  { icon: '🏛️', title: 'Organization-wide Decision Cards', desc: 'Standardized decision artifacts across every team and department. Every significant decision documented, tracked, and learned from.' },
  { icon: '👥', title: 'Team workspaces and RBAC', desc: 'Role-based access control, team member management, shared card libraries, and per-user entitlements.' },
  { icon: '📊', title: 'Outcome ledger and audit trail', desc: 'Tamper-evident append-only event log. Every action is auditable. Every recommendation traceable to its data.' },
  { icon: '🔒', title: 'Governance and kill switches', desc: 'RECOMMEND → ASSIST → AUTOMATE tiers with per-department controls, approval queues, and emergency stops.' },
  { icon: '🔌', title: 'API access and integrations', desc: 'REST API for embedding Nova decision intelligence into your existing tools, workflows, and systems.' },
  { icon: '🤖', title: 'Custom AI agents', desc: 'Agents configured for your domain — trained on your data, governed by your rules, logging to your ledger.' },
];

const USE_CASES = [
  { label: 'Operations', desc: 'Standard operating procedures as Decision Cards. Every process documented, versioned, and improved from outcomes.' },
  { label: 'Finance', desc: 'Governed approval workflows, expense policies, budget decisions with audit trails.' },
  { label: 'Sales', desc: 'Deal qualification cards, pricing frameworks, objection scripts — standardized and improving over time.' },
  { label: 'HR', desc: 'Hiring decision frameworks, onboarding checklists, performance review structures as governed cards.' },
  { label: 'Product', desc: 'Feature decision records, market research cards, launch checklists with outcome tracking.' },
  { label: 'Compliance', desc: 'Policy documentation, audit-ready decision records, governance controls for regulated industries.' },
];

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing"   className="text-gray-500 hover:text-white transition">Pricing</Link>
          <Link href="/careers"   className="text-gray-500 hover:text-white transition">Careers</Link>
          <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition">Sign In</Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-20">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mb-6">
            Enterprise · Teams · Organizations
          </div>
          <h1 className="text-5xl font-bold text-white leading-tight mb-5">
            Decision intelligence<br />at organizational scale.
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-8">
            Nova&apos;s governed decision engine for teams: standardized decision artifacts, outcome tracking,
            audit trails, and AI assistance within controlled governance frameworks.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="mailto:hello@novanexus-ai.com?subject=Enterprise Inquiry"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-semibold transition hover:shadow-lg hover:shadow-emerald-900/30">
              Contact Sales
            </a>
            <Link href="/dashboard"
              className="px-8 py-4 rounded-xl border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition font-medium">
              Start with Standard Plan
            </Link>
          </div>
        </div>

        {/* Features */}
        <div>
          <h2 className="text-2xl font-bold text-white text-center mb-10">Built for organizations that need to govern intelligence, not just use it.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {ENTERPRISE_FEATURES.map(f => (
              <div key={f.title} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-bold text-white mb-2">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Use cases */}
        <div>
          <h2 className="text-2xl font-bold text-white text-center mb-3">Works across every department.</h2>
          <p className="text-gray-500 text-center mb-10">One decision kernel. Every domain.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {USE_CASES.map(u => (
              <div key={u.label} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                <div className="text-sm font-semibold text-white mb-1">{u.label}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to talk?</h2>
          <p className="text-gray-400 mb-6 max-w-xl mx-auto">
            Enterprise pricing is custom based on team size, modules, and governance requirements.
            Contact us to discuss your organization&apos;s needs.
          </p>
          <a href="mailto:hello@novanexus-ai.com?subject=Enterprise Inquiry — Nova"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition">
            hello@novanexus-ai.com
          </a>
        </div>
      </main>
    </div>
  );
}

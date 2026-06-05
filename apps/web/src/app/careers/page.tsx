import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Careers — Nova Enterprises',
  description: 'Join Nova Enterprises. We\'re building decision intelligence for ordinary people and the institutions that serve them.',
};

const OPEN_ROLES = [
  {
    title: 'Full-Stack Engineer',
    type: 'Remote',
    level: 'Mid / Senior',
    focus: 'Core platform, API, and dashboard development.',
    skills: ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL', 'React'],
    description: 'Help build and maintain the Nova decision engine, API layer, and user-facing dashboard. You\'ll work across the full stack — from database schema to frontend interactions.',
  },
  {
    title: 'ML / AI Engineer',
    type: 'Remote',
    level: 'Mid / Senior',
    focus: 'AI model integration, decision calibration, and prediction systems.',
    skills: ['Python', 'PyTorch / scikit-learn', 'LLM APIs', 'Data pipelines', 'TypeScript'],
    description: 'Build the intelligence layer. Calibration models, outcome prediction, pattern recognition for market signals, and decision card quality systems.',
  },
  {
    title: 'Product Designer',
    type: 'Remote',
    level: 'Mid',
    focus: 'Dashboard UX, card systems, and product clarity.',
    skills: ['Figma', 'User research', 'Design systems', 'Interaction design'],
    description: 'Every product feature needs to feel clean, honest, and guided. Design the decision card experience, onboarding flows, and dashboard clarity.',
  },
  {
    title: 'Business Development',
    type: 'Remote / Flexible',
    level: 'Any',
    focus: 'Service client acquisition and Back Office OS delivery.',
    skills: ['Client communication', 'Business operations', 'Google Drive / Notion', 'Sales'],
    description: 'Bring in and serve Back Office OS clients. Help small businesses get set up, deliver their admin systems, and build the human side of the enterprise.',
  },
  {
    title: 'Content / Field Manual Writer',
    type: 'Remote / Part-time',
    level: 'Any',
    focus: 'Field Manual articles, Decision Card content, and educational writing.',
    skills: ['Business writing', 'Research', 'Clear communication'],
    description: 'Write Field Manual articles and Decision Card content. Turn business principles, history, and real-world experience into actionable, honest guidance for operators.',
  },
];

const VALUES = [
  { title: 'No fake numbers', desc: 'We don\'t put placeholder data in production. If a number isn\'t real, it says unavailable.' },
  { title: 'Truth over hype', desc: 'We build tools that help people make better decisions — not tools that feel impressive while doing nothing.' },
  { title: 'Governance before autonomy', desc: 'AI does not act without structure. We build the rails before we run the train.' },
  { title: 'Proof, then expansion', desc: 'Features earn their place by working. We don\'t advertise things that don\'t exist.' },
  { title: 'Operators first', desc: 'We build for the person building something real. Not the enterprise buyer. The actual operator.' },
];

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/enterprise" className="text-gray-500 hover:text-white transition">Enterprise</Link>
          <Link href="/about"      className="text-gray-500 hover:text-white transition">About</Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <div>
          <div className="inline-flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 rounded-full mb-6">
            Hiring · Remote · All levels
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Join Nova Enterprises.</h1>
          <p className="text-xl text-gray-400 leading-relaxed max-w-2xl">
            We&apos;re building decision intelligence for ordinary people — the tools that help anyone
            make a better move, regardless of their background, capital, or access.
            If that matters to you, we want to talk.
          </p>
        </div>

        {/* Values */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">How we build.</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {VALUES.map(v => (
              <div key={v.title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="text-sm font-semibold text-emerald-400 mb-1">{v.title}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Open roles */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Open positions.</h2>
          <div className="space-y-4">
            {OPEN_ROLES.map(role => (
              <div key={role.title} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{role.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">{role.type}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{role.level}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-emerald-500/80">{role.focus}</span>
                    </div>
                  </div>
                  <a href={`mailto:hello@novanexus-ai.com?subject=Application: ${role.title}`}
                    className="px-4 py-2 rounded-lg border border-gray-700 hover:border-emerald-500/50 text-xs font-semibold text-gray-400 hover:text-emerald-400 transition shrink-0">
                    Apply
                  </a>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">{role.description}</p>
                <div className="flex flex-wrap gap-2">
                  {role.skills.map(s => (
                    <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Apply */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <h3 className="text-lg font-bold text-white mb-3">Don&apos;t see your role?</h3>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            If you believe in what we&apos;re building and have something to contribute, reach out.
            We hire for value alignment and capability, not just job descriptions.
          </p>
          <a href="mailto:hello@novanexus-ai.com?subject=General Application — Nova"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-sm text-gray-300 hover:text-white transition">
            hello@novanexus-ai.com
          </a>
        </div>
      </main>
    </div>
  );
}

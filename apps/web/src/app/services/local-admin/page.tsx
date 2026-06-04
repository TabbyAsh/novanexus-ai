import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nova Local Admin Service — Clean Up Your Business System',
  description: 'Website cleanup, customer scripts, Google Business Profile support, lead tracking, and paperwork organization for local businesses. From $200/month.',
};

export default function LocalAdminPage() {
  // Reuses same contact flow as Back Office OS
  const tiers = [
    {
      name: 'Cleanup Sprint',
      price: '$250',
      period: ' one-time',
      desc: 'One-time setup. Forms, scripts, and basic online cleanup.',
      items: [
        'Google Business Profile cleanup',
        'Estimate + invoice templates',
        'Customer intake form',
        'Customer message scripts',
        'Review request text',
        'Lead tracking sheet',
      ],
      highlight: false,
    },
    {
      name: 'Monthly Admin',
      price: '$200',
      period: '/month',
      desc: 'Ongoing updates, templates, and tracking.',
      items: [
        'Everything in Cleanup Sprint',
        'Monthly template updates',
        'Customer follow-up scripts',
        'Lead tracking maintenance',
        'Monthly cleanup review',
      ],
      highlight: true,
    },
    {
      name: 'Growth Admin',
      price: '$500',
      period: '/month',
      desc: 'For businesses growing and needing more online presence.',
      items: [
        'Everything in Monthly Admin',
        'Website updates (basic)',
        'Google Business Profile maintenance',
        'Customer follow-up system',
        'Offer + pricing improvement',
        'Monthly reporting',
      ],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </a>
        <a href="/services/back-office-os" className="text-gray-500 text-sm hover:text-white transition">Back Office OS</a>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-4 py-1.5 rounded-full mb-6">
            Local Business · Online Presence + Admin
          </div>
          <h1 className="text-4xl font-bold text-white mb-5">
            I help local businesses look more professional and get paid faster.
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-3">
            Website edits, Google Business Profile cleanup, customer scripts, estimate templates, and monthly operations cleanup — without hiring a full-time admin.
          </p>
          <div className="mt-8">
            <a href="/services/back-office-os#contact"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all">
              Clean Up My Business System →
            </a>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white mb-6 text-center">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {tiers.map(tier => (
              <div key={tier.name}
                className={`rounded-2xl border p-6 ${tier.highlight ? 'border-violet-500/50 bg-violet-500/5' : 'border-gray-800 bg-gray-900/40'}`}>
                <h3 className="text-base font-bold text-white mb-1">{tier.name}</h3>
                <div className="mb-1"><span className="text-2xl font-bold text-white">{tier.price}</span><span className="text-gray-500 text-sm">{tier.period}</span></div>
                <p className="text-xs text-gray-500 mb-4">{tier.desc}</p>
                <ul className="space-y-2 mb-5">
                  {tier.items.map(item => (
                    <li key={item} className="text-xs text-gray-300 flex items-start gap-2">
                      <span className="text-violet-400 shrink-0">✓</span> {item}
                    </li>
                  ))}
                </ul>
                <a href="/services/back-office-os#contact"
                  className={`block text-center py-2 rounded-lg text-sm font-semibold transition ${tier.highlight ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'border border-gray-700 text-gray-400 hover:text-white'}`}>
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

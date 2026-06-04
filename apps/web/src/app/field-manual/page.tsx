import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nova Field Manual — Old Business Rules Rebuilt for Modern Operators',
  description: 'Practical principles from business history rebuilt for contractors, freelancers, entrepreneurs, and operators. Each piece ends in an action card.',
};

const ARTICLES = [
  {
    id: 'why-small-businesses-fail',
    title: 'The 1880s Rule That Still Explains Why Small Businesses Fail',
    subtitle: 'Every business that collapsed without a ledger has collapsed the same way.',
    oldRule: 'No ledger, no business.',
    modernTranslation: 'If you do not track where money comes from and where it goes, you are not running a business. You are running an activity.',
    wherePeopleMessUp: 'Confusing revenue with profit. A contractor who bills $8,000 a month and has nothing left is not making money — they are cycling cash.',
    action: 'Expense Tracker',
    actionHref: '/decision-cards',
    readTime: '4 min',
    category: 'Bookkeeping',
  },
  {
    id: 'contractor-needs-ledger',
    title: 'Why Every Contractor Needs a Ledger Before a Logo',
    subtitle: 'The order of operations that most new businesses get backwards.',
    oldRule: 'Substance before appearance.',
    modernTranslation: 'A professional logo means nothing if you cannot produce a professional invoice. Build the system before the brand.',
    wherePeopleMessUp: 'Spending $500 on a logo and $0 on an invoice template. Clients do not pay logos. They pay invoices.',
    action: 'Invoice Template',
    actionHref: '/decision-cards',
    readTime: '3 min',
    category: 'Operations',
  },
  {
    id: 'gentleman-agreement',
    title: "A Gentleman's Agreement Is How Friends Lose Money",
    subtitle: 'The handshake deal has ruined more friendships than any argument.',
    oldRule: 'Put it in writing. Always.',
    modernTranslation: 'The purpose of a written agreement is not distrust. It is clarity. People who trust each other need agreements the most — because they assume things they should not.',
    wherePeopleMessUp: '"We\'re friends, we don\'t need a contract." Three months later, each person has a different memory of what was agreed.',
    action: 'Friend Business Deal Card',
    actionHref: '/decision-cards',
    readTime: '5 min',
    category: 'Deals',
  },
  {
    id: 'bookkeeping-is-survival',
    title: 'Bookkeeping Is Not Accounting. It Is Survival.',
    subtitle: 'The difference between a business that survives a slow month and one that folds.',
    oldRule: 'Know your numbers every week.',
    modernTranslation: 'Accounting is for taxes. Bookkeeping is for decisions. You need to know: what came in, what went out, and what is left. Every week. Not every year.',
    wherePeopleMessUp: 'Waiting until tax time to find out if the business made money. That is not business management — that is archaeological discovery.',
    action: 'Weekly P&L Sheet',
    actionHref: '/decision-cards',
    readTime: '4 min',
    category: 'Bookkeeping',
  },
  {
    id: 'business-not-real-until-forms',
    title: 'Your Business Is Not Real Until It Has Forms',
    subtitle: 'Why the paperwork is not the boring part. It is the real part.',
    oldRule: 'A business that cannot document itself cannot defend itself.',
    modernTranslation: 'An intake form tells clients you are serious. An estimate protects you from scope creep. An invoice creates the legal record of what you are owed. Forms are not overhead. They are your foundation.',
    wherePeopleMessUp: 'Doing the job on a verbal agreement, then being unable to collect because there is nothing in writing.',
    action: 'New Client Intake Card',
    actionHref: '/decision-cards',
    readTime: '4 min',
    category: 'Operations',
  },
];

export default function FieldManualPage() {
  const categories = ['All', ...Array.from(new Set(ARTICLES.map(a => a.category)))];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova Enterprises</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <Link href="/decision-cards" className="hover:text-white transition">Decision Cards</Link>
          <Link href="/services/back-office-os" className="hover:text-white transition">Services</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-12">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mb-6">
            Free · Always
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Nova Field Manual</h1>
          <p className="text-gray-400 text-lg leading-relaxed max-w-xl mx-auto">
            Old business rules rebuilt for modern operators. Practical principles that turn into action cards.
          </p>
        </div>

        {/* Article format explained */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          {[
            { label: 'Old Rule', desc: 'The original principle' },
            { label: 'Modern Translation', desc: 'What it means now' },
            { label: 'Where People Mess Up', desc: 'The common failure' },
            { label: 'Action Card', desc: 'What to do today' },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="text-sm font-semibold text-amber-400 mb-1">{item.label}</div>
              <div className="text-xs text-gray-600">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Articles */}
        <div className="space-y-5">
          {ARTICLES.map((article) => (
            <article key={article.id} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 hover:border-gray-600 transition-all">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">{article.category}</span>
                <span className="text-xs text-gray-600">{article.readTime} read</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">{article.title}</h2>
              <p className="text-gray-500 text-sm mb-5 italic">{article.subtitle}</p>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Old Rule</div>
                  <p className="text-gray-300 text-sm italic">&ldquo;{article.oldRule}&rdquo;</p>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Modern Translation</div>
                  <p className="text-gray-300 text-sm leading-relaxed">{article.modernTranslation}</p>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Where People Mess Up</div>
                  <p className="text-amber-300/80 text-sm leading-relaxed">{article.wherePeopleMessUp}</p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-gray-800 flex items-center justify-between">
                <div className="text-xs text-gray-600">Action card available:</div>
                <Link href={article.actionHref}
                  className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1">
                  {article.action} →
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <h3 className="text-xl font-bold text-white mb-3">Every article ends in a card. Every card ends in action.</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            The Field Manual feeds the Decision Card library. Read the principle, then open the card and do the work.
          </p>
          <Link href="/decision-cards"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-sm text-gray-300 hover:text-white transition">
            Open the Card Library →
          </Link>
        </div>
      </main>
    </div>
  );
}

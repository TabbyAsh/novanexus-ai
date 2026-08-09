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
  {
    id: 'price-of-your-time',
    title: 'The One Number Every Operator Gets Wrong',
    subtitle: 'You cannot price your services correctly until you know what your time actually costs.',
    oldRule: 'Know your minimum acceptable rate before you quote anyone anything.',
    modernTranslation: 'Your hourly rate must cover: your time, your expenses, your taxes, your downtime between jobs, and your profit margin. Most people price for the job in front of them, not for the business they are trying to run.',
    wherePeopleMessUp: 'Pricing based on what the customer will pay, not what the job actually costs. A $200 job that takes 4 hours, 20 miles of driving, and $30 in supplies nets $86 after expenses — $21.50 per hour before taxes.',
    action: 'Price a Job Card',
    actionHref: '/decision-cards',
    readTime: '5 min',
    category: 'Pricing',
  },
  {
    id: 'collect-before-you-start',
    title: 'The Oldest Business Rule Nobody Follows',
    subtitle: 'Get paid before you do the work. This rule is 4,000 years old. It still works.',
    oldRule: 'A deposit is not a sign of distrust. It is a sign of professionalism.',
    modernTranslation: 'Requiring a deposit before starting work separates serious clients from tire-kickers, protects you if they disappear, and signals that your time has value. Clients who resist paying a deposit are telling you something important about how they will behave as a client.',
    wherePeopleMessUp: 'Doing the full job on the promise of payment, then waiting 60 days, sending three invoices, and eventually writing it off. The deposit system prevents this entirely.',
    action: 'New Client Intake Card',
    actionHref: '/decision-cards',
    readTime: '3 min',
    category: 'Collections',
  },
  {
    id: 'the-follow-up-is-the-job',
    title: 'The Follow-Up Is the Job',
    subtitle: 'Most opportunities die in the silence between the first conversation and the second.',
    oldRule: 'Fortune is in the follow-up.',
    modernTranslation: 'Most clients, employers, partners, and opportunities require 3-5 touchpoints before they move forward. The person who follows up professionally and persistently is not annoying — they are demonstrating the same reliability they will bring to the work.',
    wherePeopleMessUp: 'Sending one message, hearing nothing, and assuming the answer is no. Most unanswered messages are forgotten, not rejected. A single follow-up recovers 30-40% of "lost" opportunities.',
    action: 'Invoice Follow-Up Card',
    actionHref: '/decision-cards',
    readTime: '4 min',
    category: 'Operations',
  },
  {
    id: 'credit-is-leverage',
    title: 'What the Bank Taught You About Money Is Wrong',
    subtitle: 'Credit is not debt. Credit is access. How you use it is what matters.',
    oldRule: 'A man of good credit can move mountains. A man of poor credit cannot move money.',
    modernTranslation: 'Your credit score determines your access to capital, housing, and sometimes employment. A 100-point improvement in your score can mean $200-400/month less in interest payments. This is money already in your life that is being taken from you.',
    wherePeopleMessUp: 'Closing old credit cards (shortens credit history), maxing out cards (hurts utilization), and applying for multiple cards at once (hard inquiries). None of these feel like mistakes in the moment.',
    action: 'Get Your Card',
    actionHref: '/start',
    readTime: '4 min',
    category: 'Money',
  },
  {
    id: 'your-network-is-your-first-market',
    title: 'Your First Clients Are Already in Your Phone',
    subtitle: 'Every business that survives its first year did it on relationships, not advertising.',
    oldRule: 'Never go to strangers when you have not yet gone to friends.',
    modernTranslation: 'The fastest path to your first paying client is a text message to someone who already knows you. They trust you. They have seen your work. They know people. Your first 5-10 clients almost always come from your existing network — not from ads, not from social media, not from SEO.',
    wherePeopleMessUp: 'Spending 3 months building a website and an Instagram presence while never directly telling anyone they are available for hire. The website can come later. The direct message comes first.',
    action: 'Local Service Setup Card',
    actionHref: '/decision-cards',
    readTime: '4 min',
    category: 'Growth',
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
          <Link href="/services/workflow-setup" className="hover:text-white transition">Services</Link>
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

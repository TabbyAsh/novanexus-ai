import Link from 'next/link';

const availableNow = [
  'A private workspace for recording a thesis, next action, and outcome',
  'Paper and sandbox workflows where a connected provider supports them',
  'Explicit source, timestamp, and uncertainty labels on reviewed market data',
];

const notOffered = [
  'No public paid market-intelligence subscription',
  'No promised daily brief, alert schedule, or ticker coverage count',
  'No stock picks, guaranteed setups, or automated profit claims',
  'No brokerage custody or public live-trading execution',
];

export default function IntelligencePage() {
  return (
    <main className="min-h-screen bg-gray-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <nav className="flex items-center justify-between border-b border-gray-800 pb-6">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600">N</span>
            Nova
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/pricing" className="text-gray-400 hover:text-white">Pilot status</Link>
            <Link href="/login" className="text-gray-300 hover:text-white">Sign in</Link>
          </div>
        </nav>

        <section className="py-20 md:py-28">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Markets research preview · not for sale
          </p>
          <h1 className="max-w-4xl text-5xl font-bold leading-tight md:text-7xl">
            Record the thesis. Verify the source. Track what actually happened.
          </h1>
          <p className="mt-7 max-w-3xl text-xl leading-8 text-gray-300">
            Nova Markets is being validated as a research and paper-workflow layer. It is not a brokerage, signal seller, or finished subscription product. Live trading remains outside the public product.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="rounded-xl bg-cyan-600 px-6 py-3 text-center font-semibold hover:bg-cyan-500">
              Create an account
            </Link>
            <Link href="/world" className="rounded-xl border border-white/15 px-6 py-3 text-center font-semibold hover:bg-white/10">
              Open the private workspace
            </Link>
          </div>
        </section>

        <section className="grid gap-6 border-t border-gray-800 py-14 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-7">
            <h2 className="text-xl font-semibold text-emerald-300">Available for controlled validation</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-gray-300">
              {availableNow.map(item => <li key={item}>✓ {item}</li>)}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-7">
            <h2 className="text-xl font-semibold">Not being sold or promised</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-gray-300">
              {notOffered.map(item => <li key={item}>— {item}</li>)}
            </ul>
          </div>
        </section>

        <section className="border-t border-gray-800 py-12">
          <h2 className="text-2xl font-semibold">Risk boundary</h2>
          <p className="mt-4 max-w-3xl leading-7 text-gray-400">
            Market information can be delayed, incomplete, or wrong. Nova provides research tooling only, not investment advice. Any future provider connection must begin in paper or sandbox mode and pass an explicit authorization gate before it can affect real funds.
          </p>
          <Link href="/legal/risk-disclosure" className="mt-5 inline-block text-cyan-300 hover:text-cyan-200">
            Read the risk disclosure →
          </Link>
        </section>
      </div>
    </main>
  );
}

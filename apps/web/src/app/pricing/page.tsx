import Link from 'next/link';

const pilotGates = [
  'A written scope with one measurable outcome',
  'A human operator responsible for delivery and recovery',
  'An operator-issued checkout tied to that scope',
  'A receipt and state change that can be independently verified',
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600">N</span>
            Nova
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-gray-300 hover:text-white">Sign in</Link>
            <Link href="/register" className="rounded-lg border border-white/15 px-4 py-2 hover:bg-white/10">Create account</Link>
          </div>
        </nav>

        <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 md:p-12">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
            Private pilot · not for public sale
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            Nova does not currently offer self-serve subscriptions.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
            Account registration is open. Paid work is accepted only through a private pilot with a defined deliverable, an accountable operator, and a verifiable receipt. No public monthly, yearly, founding, or lifetime price is being advertised.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="rounded-xl bg-white px-6 py-3 text-center font-semibold text-gray-950 hover:bg-gray-200">
              Create a free account
            </Link>
            <Link href="/#services" className="rounded-xl border border-white/20 px-6 py-3 text-center font-semibold hover:bg-white/10">
              View current services
            </Link>
          </div>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-7">
            <h2 className="text-xl font-semibold">What account registration does</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-300">
              <li>✓ Creates a Nova account.</li>
              <li>✓ Does not collect a card.</li>
              <li>✓ Does not start a trial or subscription.</li>
              <li>✓ Does not promise access to unfinished capabilities.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-7">
            <h2 className="text-xl font-semibold">Private-pilot checkout gates</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-300">
              {pilotGates.map(gate => <li key={gate}>• {gate}</li>)}
            </ul>
          </div>
        </section>

        <p className="mt-12 text-sm leading-6 text-gray-500">
          If public plans become available, this page will show the exact price, billing interval, included capabilities, cancellation terms, and recovery path before checkout is enabled.
        </p>
      </div>
    </main>
  );
}

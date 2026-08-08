import Link from 'next/link';

const pilotDetails = [
  'A written scope and measurable outcome before work begins',
  'Human delivery by an accountable operator',
  'A one-time payment, not recurring software billing',
  'A receipt and written delivery record',
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
          </div>
        </nav>

        <section className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-8 md:p-12">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            Human-delivered service pilot
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            Back Office OS Starter Pilot
          </h1>
          <p className="mt-5 text-3xl font-semibold text-white">$150 one-time</p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
            A bounded back-office setup engagement completed by a person. This is not a self-serve software subscription and does not include access to unfinished Nova software.
          </p>
          <div className="mt-8">
            <Link href="/services/back-office-os" className="inline-block rounded-xl bg-white px-6 py-3 text-center font-semibold text-gray-950 hover:bg-gray-200">
              Review the pilot and start intake
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-7">
            <h2 className="text-xl font-semibold">What the pilot means</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-300">
              {pilotDetails.map(detail => <li key={detail}>• {detail}</li>)}
            </ul>
          </div>
        </section>

        <p className="mt-12 text-sm leading-6 text-gray-500">
          Review the complete scope, timing, refund boundary, and intake process before continuing to payment.
        </p>
      </div>
    </main>
  );
}

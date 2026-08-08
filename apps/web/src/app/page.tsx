import Link from 'next/link';

const lifecycle = [
  {
    label: 'Objective',
    value: 'Win and responsibly scope a commercial exterior-cleaning customer.',
  },
  {
    label: 'Trade',
    value: 'Apex Washing → Greencastle Storage and Parking.',
  },
  {
    label: 'Blockers',
    value: 'Verified parcel and building geometry; current, structure-labeled surface-condition evidence.',
  },
  {
    label: 'Action',
    value: 'Create a durable field-measurement task with a checklist for dimensions and photographs.',
  },
  {
    label: 'Next',
    value: 'Complete the checklist and submit evidence before Nova treats the scope or fixed bid as defensible.',
  },
];

const availableCapabilities = [
  {
    name: 'Private Nova OS',
    detail: 'Existing authorized accounts can sign in to the authenticated operator workspace.',
  },
  {
    name: 'Trade state',
    detail: 'A Trade can retain its stage, blockers, next action, action history, and event history.',
  },
  {
    name: 'Evidence-aware control',
    detail: 'Missing evidence stays visible, human work is explicit, and no external execution is implied without a receipt.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f2f0e9] text-[#141713] selection:bg-[#b9ef9a] selection:text-[#141713]">
      <header className="border-b border-[#1d211b]">
        <nav
          aria-label="Primary navigation"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 md:px-8"
        >
          <Link href="/" className="text-sm font-black uppercase tracking-[0.22em]">
            Nova
          </Link>
          <div className="flex items-center gap-5 text-sm md:gap-8">
            <Link href="#markets" className="underline-offset-4 hover:underline">
              Markets
            </Link>
            <Link href="#services" className="underline-offset-4 hover:underline">
              Services
            </Link>
            <Link href="/login" className="underline-offset-4 hover:underline">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[68vh] max-w-6xl content-center gap-10 border-x border-[#1d211b] px-5 py-20 md:px-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-20 lg:py-28">
        <div>
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">
            Economic operations · private pilot
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl md:text-7xl">
            Nova turns a goal into a verified next action—and tracks it until the result is real.
          </h1>
          <Link
            href="/world"
            data-primary-action
            className="mt-10 inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141713]"
          >
            Open Nova <span aria-hidden="true" className="ml-8">→</span>
          </Link>
        </div>
        <aside className="self-end border-t-2 border-[#141713] pt-4 text-sm leading-6 text-[#4d5448]">
          Nova does not report revenue, completion, or execution until the underlying record and receipt exist.
        </aside>
      </section>

      <section
        aria-labelledby="trade-example-title"
        className="border-y border-[#1d211b] bg-[#141713] text-[#f2f0e9]"
      >
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <div className="mb-12 flex flex-col justify-between gap-4 border-b border-[#777d70] pb-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b9ef9a]">Implemented lifecycle</p>
              <h2 id="trade-example-title" className="mt-3 text-3xl font-black tracking-[-0.03em] md:text-4xl">
                Trade #0001
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#b8bdb2]">
              A real system record used to expose what is known, what is missing, and what a person must do next.
            </p>
          </div>

          <dl>
            {lifecycle.map((item, index) => (
              <div
                key={item.label}
                className="grid gap-3 border-b border-[#454a41] py-6 md:grid-cols-[10rem_2rem_minmax(0,1fr)] md:items-start"
              >
                <dt className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9ef9a]">{item.label}</dt>
                <dd aria-hidden="true" className="hidden text-[#777d70] md:block">{index < lifecycle.length - 1 ? '↓' : '·'}</dd>
                <dd className="max-w-3xl text-lg leading-7">{item.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-3xl border-l-2 border-[#b9ef9a] pl-5 text-sm leading-6 text-[#c8ccc3]">
            Creating the field task persists an action and a <code>FIELD_MEASUREMENT_TASK_CREATED</code> event. It explicitly records that no external side effect was performed.
          </p>
        </div>
      </section>

      <section aria-labelledby="capabilities-title" className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-20 md:px-8 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">Product truth</p>
            <h2 id="capabilities-title" className="mt-3 text-3xl font-black tracking-[-0.03em]">
              Available now
            </h2>
          </div>
          <dl className="border-t-2 border-[#141713]">
            {availableCapabilities.map((capability) => (
              <div key={capability.name} className="grid gap-2 border-b border-[#777d70] py-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
                <dt className="font-bold">{capability.name}</dt>
                <dd className="leading-6 text-[#4d5448]">{capability.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-20 grid border-t-2 border-[#141713] md:grid-cols-2">
          <section id="markets" aria-labelledby="markets-title" className="border-b border-[#777d70] py-8 md:border-b-0 md:border-r md:pr-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7a4a00]">Preview · not operational</p>
            <h2 id="markets-title" className="mt-3 text-2xl font-black">Markets</h2>
            <p className="mt-4 max-w-lg leading-7 text-[#4d5448]">
              Research screens exist. Webull account sync, brokerage data, and live or paper order execution are not connected.
            </p>
          </section>
          <section id="services" aria-labelledby="services-title" className="py-8 md:pl-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#356b20]">Pilot · human delivered</p>
            <h2 id="services-title" className="mt-3 text-2xl font-black">Services</h2>
            <p className="mt-4 max-w-lg leading-7 text-[#4d5448]">
              The $150 Back Office OS Starter Pilot has five bounded deliverables. A complete intake returns a durable receipt; scope acceptance, payment, and human delivery remain separate states.
            </p>
            <Link href="/services/back-office-os" className="mt-5 inline-block text-sm font-bold underline underline-offset-4">
              Review the pilot and intake →
            </Link>
          </section>
        </div>
      </section>

      <footer className="border-t border-[#1d211b]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-[#596052] md:px-8">
          <p>© 2026 Nova Enterprises</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
            <Link href="/legal/risk-disclosure" className="underline-offset-4 hover:underline">Risk disclosure</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

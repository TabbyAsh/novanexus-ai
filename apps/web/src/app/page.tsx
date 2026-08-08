import Link from 'next/link';

const novaLoop = [
  {
    number: '01',
    name: 'Notice',
    detail: 'Capture what changed without forcing it into an outdated plan.',
  },
  {
    number: '02',
    name: 'Frame',
    detail: 'Separate the decision, the unknowns, and the constraints that actually matter.',
  },
  {
    number: '03',
    name: 'Commit',
    detail: 'Name one next action, one owner, and the boundary they must not cross.',
  },
  {
    number: '04',
    name: 'Verify',
    detail: 'Require evidence before work, payment, or completion is treated as real.',
  },
  {
    number: '05',
    name: 'Adapt',
    detail: 'Carry the result forward so the next decision starts smarter instead of starting over.',
  },
];

const operatingQuestions = [
  'What changed?',
  'What matters now?',
  'Who owns the next move?',
  'What would prove it worked?',
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
          <div className="flex flex-wrap items-center gap-5 text-sm md:gap-8">
            <Link href="#product" className="underline-offset-4 hover:underline">
              Product
            </Link>
            <Link href="#method" className="underline-offset-4 hover:underline">
              Method
            </Link>
            <Link href="/loop" className="underline-offset-4 hover:underline">
              Try Nova
            </Link>
            <Link href="/services/back-office-os" className="underline-offset-4 hover:underline">
              Guided Pilot
            </Link>
            <Link href="/login" className="underline-offset-4 hover:underline">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[76vh] max-w-6xl content-center gap-12 border-x border-[#1d211b] px-5 py-20 md:px-12 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-20 lg:py-28">
        <div>
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">
            Adaptive operating memory
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl md:text-7xl">
            The world keeps inventing problems. Nova helps you keep solving them.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#4d5448]">
            Nova holds the thread between a changing situation, the decision you make, the action someone owns,
            and the evidence that tells you what to do next.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/loop"
              data-primary-action
              className="inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141713]"
            >
              Start a Nova Loop <span aria-hidden="true" className="ml-8">→</span>
            </Link>
            <Link href="#method" className="text-sm font-bold underline underline-offset-4">
              See how it works ↓
            </Link>
          </div>
        </div>
        <aside className="self-end border-t-2 border-[#141713] pt-5 text-sm leading-6 text-[#4d5448]">
          <p className="font-bold text-[#141713]">One operating rule</p>
          <p className="mt-2">If an action leaves no evidence, Nova does not pretend it happened.</p>
        </aside>
      </section>

      <section id="product" aria-labelledby="product-title" className="border-y border-[#1d211b] bg-[#141713] text-[#f2f0e9]">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b9ef9a]">What Nova is</p>
            <h2 id="product-title" className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Not another place to store work. A memory for why the work exists.
            </h2>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#c8ccc3]">
              Documents remember words. Task lists remember assignments. Nova remembers the reasoning chain: the signal,
              the decision, the commitment, the proof, and what the outcome changed.
            </p>
          </div>
          <dl className="border-t border-[#777d70]">
            {operatingQuestions.map((question, index) => (
              <div key={question} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-[#454a41] py-6">
                <dt className="text-xs font-bold text-[#b9ef9a]">0{index + 1}</dt>
                <dd className="text-xl font-semibold tracking-[-0.02em]">{question}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="method" aria-labelledby="method-title" className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-20 md:px-8 md:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">The method</p>
          <h2 id="method-title" className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
            Every unfamiliar problem becomes a loop Nova can hold.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#4d5448]">
            A solved problem changes the conditions and creates the next problem. Nova preserves the learning between
            loops so a person or team does not reset to zero every time reality moves.
          </p>
        </div>

        <ol className="mt-14 border-t-2 border-[#141713]">
          {novaLoop.map((step) => (
            <li key={step.name} className="grid gap-3 border-b border-[#777d70] py-7 md:grid-cols-[4rem_11rem_minmax(0,1fr)] md:items-start md:gap-8">
              <span className="text-xs font-bold text-[#596052]">{step.number}</span>
              <h3 className="text-xl font-black">{step.name}</h3>
              <p className="max-w-2xl leading-7 text-[#4d5448]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[#1d211b] bg-[#dcefd0]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#356b20]">Available now · guided pilot</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Start with one workflow that keeps breaking.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#3f493a]">
              Bring one recurring handoff, follow-up, or operating bottleneck. The current $150 pilot turns it into a
              client-owned workflow, practical tools, and a visible next-action loop. It is human delivered, one-time,
              and not a software subscription.
            </p>
          </div>
          <div>
            <Link
              href="/services/back-office-os"
              className="inline-flex min-h-12 w-full items-center justify-between border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713]"
            >
              Review the guided pilot <span aria-hidden="true">→</span>
            </Link>
            <Link href="/login" className="mt-5 block text-center text-sm font-bold underline underline-offset-4">
              Existing account sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1d211b]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-[#596052] md:px-8">
          <p>© 2026 Nova Enterprises</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

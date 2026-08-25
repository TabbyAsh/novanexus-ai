import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const novaLoop = [
  {
    number: '01',
    name: 'Notice',
    detail: 'Describe what changed and where the signal came from.',
  },
  {
    number: '02',
    name: 'Frame',
    detail: 'State the decision, important unknowns, and constraints.',
  },
  {
    number: '03',
    name: 'Commit',
    detail: 'Choose one next action, one owner, and the boundary.',
  },
  {
    number: '04',
    name: 'Verify',
    detail: 'Record the evidence you expected and the evidence you observed.',
  },
  {
    number: '05',
    name: 'Adapt',
    detail: 'Capture what was learned and what changes next.',
  },
];

const operatingQuestions = [
  'What changed?',
  'What decision exists now?',
  'Who owns the next action?',
  'What evidence will count?',
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
              How it works
            </Link>
            <Link href="/loop" className="underline-offset-4 hover:underline">
              Try Nova
            </Link>
            <Link href="/services/workflow-setup" className="underline-offset-4 hover:underline">
              Guided setup
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
            Decision support for changing work
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl md:text-7xl">
            The world keeps inventing problems. Nova helps you keep solving them.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#4d5448]">
            Use a five-step loop to frame what changed, choose one bounded next action, define what evidence would
            count, and carry the result into what comes next.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/loop"
              data-primary-action
              className="inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141713]"
            >
              Try the Nova Loop <span aria-hidden="true" className="ml-8">→</span>
            </Link>
            <Link href="/register" className="text-sm font-bold underline underline-offset-4">
              Create a free account →
            </Link>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-[#596052]">
            The public Loop stays in this tab. No account, no AI call, and no submission.
          </p>
        </div>
        <aside className="self-end border-t-2 border-[#141713] pt-5 text-sm leading-6 text-[#4d5448]">
          <p className="font-bold text-[#141713]">One operating rule</p>
          <p className="mt-2">A planned action is not a completed action. You decide what evidence counts and record what actually happened.</p>
        </aside>
      </section>

      <section id="product" aria-labelledby="product-title" className="border-y border-[#1d211b] bg-[#141713] text-[#f2f0e9]">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b9ef9a]">What Nova does</p>
            <h2 id="product-title" className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Keep the reasoning attached to the work.
            </h2>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#c8ccc3]">
              Nova structures the parts that usually scatter across notes, messages, and task lists: what changed,
              what decision now exists, who owns the next move, and what evidence will count.
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
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">The Nova Loop</p>
          <h2 id="method-title" className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
            A changing problem becomes a loop you can carry forward.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[#4d5448]">
            Work through five steps, then copy or download a portable operating record. The public version runs in
            your current browser tab.
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
        <Link
          href="/loop"
          className="mt-10 inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713]"
        >
          Start a Nova Loop <span aria-hidden="true" className="ml-8">→</span>
        </Link>
      </section>

      <section className="border-t border-[#1d211b] bg-[#ece8dc]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">Private by default</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Try it without sending us your problem.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4d5448]">
              The public Nova Loop does not call AI or send your entries to Nova. Your draft stays in the current tab
              and disappears when you reload, close, or reset it. Copy or download the record if you want to keep it.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#596052]">
              Do not enter passwords, payment details, customer personal data, or sensitive health or legal information.
            </p>
          </div>
          <Link href="/login" className="text-sm font-bold underline underline-offset-4 lg:text-right">
            Already have a Nova account? Sign in →
          </Link>
        </div>
      </section>

      <section className="border-t border-[#1d211b] bg-[#dcefd0]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#356b20]">Optional guided setup</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Start with one workflow that keeps breaking.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#3f493a]">
              For $150 one-time, a person maps one accepted admin workflow and delivers a client-owned workspace,
              estimate and invoice templates, intake and follow-up tools, and an expense and open-work tracker.
              No subscription. No software access is sold.
            </p>
          </div>
          <div>
            <Link
              href="/services/workflow-setup"
              className="inline-flex min-h-12 w-full items-center justify-between border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713]"
            >
              Review the workflow setup pilot <span aria-hidden="true">→</span>
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

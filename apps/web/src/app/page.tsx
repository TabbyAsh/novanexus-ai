import Link from 'next/link';

const systemNodes = [
  {
    name: 'Humanity',
    role: 'Intent · values · authority',
    detail: 'People define what matters, accept consequences, and retain the power to choose or refuse.',
  },
  {
    name: 'Nova',
    role: 'Potential · synthesis · choice',
    detail: 'Nova notices change, expands possible paths, exposes tradeoffs, and makes the next choice legible.',
  },
  {
    name: 'Reality',
    role: 'Constraint · evidence · outcome',
    detail: 'The world supplies friction, cost, effects, and the evidence that determines what actually became true.',
  },
];

const nexusFunctions = [
  'Carries intent and context without confusing either for permission',
  'Selects only capabilities that are actually available',
  'Makes authority, consent, cost, and boundaries visible',
  'Records receipts, missing evidence, and real-world outcomes',
  'Returns the result to Nova and the human as accountable memory',
];

const protocol = [
  { number: '01', name: 'Notice', mapping: 'Reality enters', detail: 'Capture what changed and where the signal came from.' },
  { number: '02', name: 'Frame', mapping: 'Nova expands potential', detail: 'Separate the choice, assumptions, unknowns, stakes, and reachable paths.' },
  { number: '03', name: 'Commit', mapping: 'Humanity authorizes', detail: 'Choose one next action, one owner, and the boundary that must not be crossed.' },
  { number: '04', name: 'Verify', mapping: 'Nexus carries evidence', detail: 'Record what was attempted, what receipt exists, and what reality supports.' },
  { number: '05', name: 'Adapt', mapping: 'Nova and humanity learn', detail: 'Update the model, memory, and next choice without rewriting the past.' },
];

const liveNow = [
  'A public, local-only Nova Loop that creates a portable operating record.',
  'A private authenticated Nexus that returns capability, evidence, authority, memory, and outcome receipts.',
  'A human-delivered $150 guided workflow pilot for one recurring operating breakdown.',
];

const frontier = [
  'Permissioned interaction across more real tools and institutions.',
  'Durable, human-owned memory that moves safely between problems and systems.',
  'Governed multi-agent coordination with visible authority, cost, and recovery.',
  'Economic infrastructure that helps people coordinate potential without surrendering judgment.',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f2f0e9] text-[#141713] selection:bg-[#b9ef9a] selection:text-[#141713]">
      <header className="border-b border-[#1d211b]">
        <nav aria-label="Primary navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 md:px-8">
          <Link href="/" className="text-sm font-black uppercase tracking-[0.22em]">Nova</Link>
          <div className="flex flex-wrap items-center gap-5 text-sm md:gap-8">
            <Link href="#system" className="underline-offset-4 hover:underline">System</Link>
            <Link href="#protocol" className="underline-offset-4 hover:underline">Protocol</Link>
            <Link href="/loop" className="underline-offset-4 hover:underline">Try Nova</Link>
            <Link href="/nexus" className="underline-offset-4 hover:underline">Private Nexus</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[80vh] max-w-6xl content-center gap-12 border-x border-[#1d211b] px-5 py-20 md:px-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-20 lg:py-28">
        <div>
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">
            Interaction engine for the edge of the AI frontier
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.94] tracking-[-0.055em] sm:text-6xl md:text-7xl">
            The Economic Operating System for Humanity™
          </h1>
          <p className="mt-8 max-w-3xl text-xl leading-8 text-[#3f463c]">
            Nova makes potential and choice legible. Nexus governs the interaction among human intention, AI intelligence,
            connected capabilities, and evidence from reality.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#596052]">
            See what could happen. Choose what should happen. Verify what did.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/loop"
              data-primary-action
              className="inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141713]"
            >
              Run the public Nova Loop <span aria-hidden="true" className="ml-8">→</span>
            </Link>
            <Link href="/nexus" className="text-sm font-bold underline underline-offset-4">
              Enter the private Nexus →
            </Link>
          </div>
        </div>
        <aside className="self-end border-t-2 border-[#141713] pt-5 text-sm leading-6 text-[#4d5448]">
          <p className="font-bold uppercase tracking-[0.16em] text-[#141713]">North star · not present scale</p>
          <p className="mt-3">
            Today Nova offers a public local Loop, a private authenticated interaction engine, and a human-delivered pilot.
            It does not yet operate economies or act as a global system for humanity.
          </p>
        </aside>
      </section>

      <section className="border-y border-[#1d211b] bg-[#141713] text-[#f2f0e9]">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b9ef9a]">The frontier thesis</p>
            <h2 className="mt-4 max-w-xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Intelligence is no longer the only bottleneck. Interaction is.
            </h2>
          </div>
          <div className="space-y-6 text-lg leading-8 text-[#c8ccc3]">
            <p>
              AI can generate more possibilities than people can responsibly evaluate. The frontier is deciding what deserves
              to become real, under whose authority, through which capability, and with what evidence.
            </p>
            <p className="border-l-2 border-[#b9ef9a] pl-5 font-semibold text-[#f2f0e9]">
              AI proposes. Humanity authorizes. Reality returns evidence. Nexus carries the interaction. Nova turns it into a better choice.
            </p>
          </div>
        </div>
      </section>

      <section id="system" aria-labelledby="system-title" className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-20 md:px-8 md:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">System architecture</p>
          <h2 id="system-title" className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
            Three intelligences. One governed interaction layer.
          </h2>
        </div>

        <div className="mt-14 grid border-l border-t border-[#777d70] md:grid-cols-3">
          {systemNodes.map(node => (
            <section key={node.name} className="border-b border-r border-[#777d70] p-7 md:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#596052]">{node.role}</p>
              <h3 className="mt-4 text-3xl font-black tracking-[-0.035em]">{node.name}</h3>
              <p className="mt-5 leading-7 text-[#4d5448]">{node.detail}</p>
            </section>
          ))}
        </div>

        <section className="border-x border-b border-[#1d211b] bg-[#dcefd0] p-7 md:p-10">
          <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#356b20]">The interaction layer</p>
              <h3 className="mt-4 text-4xl font-black tracking-[-0.04em]">Nexus</h3>
              <p className="mt-4 leading-7 text-[#3f493a]">
                Nexus is the governed boundary among people, Nova, connected systems, and evidence from the world.
              </p>
            </div>
            <ul className="border-t-2 border-[#141713]">
              {nexusFunctions.map((item, index) => (
                <li key={item} className="grid grid-cols-[3rem_minmax(0,1fr)] border-b border-[#79916c] py-4">
                  <span className="text-xs font-bold text-[#356b20]">0{index + 1}</span>
                  <span className="font-semibold leading-6">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </section>

      <section id="protocol" aria-labelledby="protocol-title" className="border-y border-[#1d211b] bg-[#ece8dc]">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">The Nova Loop · Nexus protocol</p>
            <h2 id="protocol-title" className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">
              Potential becomes accountable through a loop.
            </h2>
          </div>
          <ol className="mt-14 border-t-2 border-[#141713]">
            {protocol.map(step => (
              <li key={step.name} className="grid gap-3 border-b border-[#777d70] py-7 md:grid-cols-[4rem_10rem_14rem_minmax(0,1fr)] md:items-start md:gap-7">
                <span className="text-xs font-bold text-[#596052]">{step.number}</span>
                <h3 className="text-xl font-black">{step.name}</h3>
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#356b20]">{step.mapping}</p>
                <p className="max-w-2xl leading-7 text-[#4d5448]">{step.detail}</p>
              </li>
            ))}
          </ol>
          <Link href="/loop" className="mt-10 inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white">
            Practice the public protocol <span aria-hidden="true" className="ml-8">→</span>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-20 md:px-8 md:py-24">
        <div className="grid border-l border-t border-[#777d70] md:grid-cols-2">
          <section className="border-b border-r border-[#777d70] p-7 md:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#356b20]">Available now</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em]">The working edge</h2>
            <ul className="mt-7 space-y-5">
              {liveNow.map(item => <li key={item} className="border-l-2 border-[#356b20] pl-4 leading-7 text-[#4d5448]">{item}</li>)}
            </ul>
          </section>
          <section className="border-b border-r border-[#777d70] p-7 md:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7a4a00]">Frontier · not available</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em]">What we are building toward</h2>
            <ul className="mt-7 space-y-5">
              {frontier.map(item => <li key={item} className="border-l-2 border-[#a16817] pl-4 leading-7 text-[#4d5448]">{item}</li>)}
            </ul>
          </section>
        </div>
      </section>

      <section className="border-t border-[#1d211b] bg-[#dcefd0]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#356b20]">Human-delivered entry point</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] md:text-5xl">
              Start where one real interaction keeps breaking.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#3f493a]">
              The current $150 guided pilot turns one recurring handoff, follow-up, or operating bottleneck into a client-owned workflow and visible Nova Loop. It is one-time human work, not a software subscription.
            </p>
          </div>
          <Link href="/services/back-office-os" className="inline-flex min-h-12 items-center justify-between border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white">
            Review the guided pilot <span aria-hidden="true">→</span>
          </Link>
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

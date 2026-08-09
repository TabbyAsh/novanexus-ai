'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_NOVA_LOOP, formatOperatingRecord, operatingStatus, type NovaLoopDraft } from './nova-loop-record';

const steps = [
  { number: '01', name: 'Notice', prompt: 'What changed?' },
  { number: '02', name: 'Frame', prompt: 'What decision exists now?' },
  { number: '03', name: 'Commit', prompt: 'Who owns the next move?' },
  { number: '04', name: 'Verify', prompt: 'What evidence would count?' },
  { number: '05', name: 'Adapt', prompt: 'What should the result teach?' },
];

const fieldClass = 'mt-2 min-h-12 w-full border border-[#777d70] bg-[#faf9f4] px-4 py-3 text-base text-[#141713] outline-none transition focus:border-[#141713] focus:ring-2 focus:ring-[#b9ef9a]';

export default function NovaLoopClient() {
  const [draft, setDraft] = useState<NovaLoopDraft>(EMPTY_NOVA_LOOP);
  const [step, setStep] = useState(0);
  const [createdAt, setCreatedAt] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  const update = (field: keyof NovaLoopDraft, value: string) => {
    setDraft(current => field === 'observedEvidence' && !value.trim()
      ? { ...current, observedEvidence: value, learning: '' }
      : { ...current, [field]: value });
    setCopyState('idle');
  };

  const stepIsValid = [
    Boolean(draft.changed.trim()),
    Boolean(draft.decision.trim()) && Boolean(draft.unknowns.trim()),
    Boolean(draft.nextAction.trim()) && Boolean(draft.owner.trim()) && Boolean(draft.boundary.trim()),
    Boolean(draft.requiredEvidence.trim()),
    Boolean(draft.reviewAt.trim()),
  ][step] ?? true;

  const record = useMemo(
    () => formatOperatingRecord(draft, createdAt || 'not exported yet'),
    [createdAt, draft],
  );

  const next = () => {
    if (!stepIsValid) return;
    if (step === steps.length - 1) {
      setCreatedAt(new Date().toISOString());
      setStep(steps.length);
      return;
    }
    setStep(current => current + 1);
  };

  const copyRecord = async () => {
    try {
      await navigator.clipboard.writeText(record);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const downloadRecord = () => {
    const blob = new Blob([record], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nova-operating-record-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setDraft(EMPTY_NOVA_LOOP);
    setStep(0);
    setCreatedAt('');
    setCopyState('idle');
    setConfirmReset(false);
  };

  return (
    <main className="min-h-screen bg-[#f2f0e9] text-[#141713] selection:bg-[#b9ef9a] selection:text-[#141713]">
      <header className="border-b border-[#1d211b]">
        <nav aria-label="Primary navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 md:px-8">
          <Link href="/" className="text-sm font-black uppercase tracking-[0.22em]">Nova</Link>
          <div className="flex flex-wrap items-center gap-5 text-sm md:gap-8">
            <Link href="/#method" className="underline-offset-4 hover:underline">How it works</Link>
            <Link href="/services/workflow-setup" className="underline-offset-4 hover:underline">Guided setup</Link>
            <Link href="/login" className="underline-offset-4 hover:underline">Sign in</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#596052]">Nova Loop · local worksheet</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.98] tracking-[-0.045em] md:text-6xl">
              Turn a changing situation into a next move you can verify.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#4d5448]">
              Work through one problem. The worksheet structures the decision, commitment, evidence standard, and review trigger into a portable record.
            </p>
          </div>
          <aside className="border-t-2 border-[#141713] pt-5 text-sm leading-6 text-[#4d5448]">
            <p className="font-bold text-[#141713]">Local worksheet · no AI call</p>
            <p className="mt-2">This worksheet does not call AI or send your entries anywhere. They stay in this tab and disappear when it reloads, closes, or you reset it. Copy and download save outside the worksheet and may be retained by clipboard or device-sync tools. Do not enter passwords, payment details, customer personal data, or sensitive health or legal information.</p>
          </aside>
        </div>
      </section>

      <section className="border-y border-[#1d211b] bg-[#141713] text-[#f2f0e9]">
        <ol aria-label="Nova Loop progress" className="mx-auto grid max-w-6xl grid-cols-2 px-5 md:grid-cols-5 md:px-8">
          {steps.map((item, index) => (
            <li key={item.name} aria-current={index === step ? 'step' : undefined} className={`border-[#454a41] px-3 py-5 md:border-r md:last:border-r-0 ${index === step ? 'bg-[#263024]' : ''}`}>
              <p className={`text-[0.65rem] font-bold ${index <= step ? 'text-[#b9ef9a]' : 'text-[#777d70]'}`}>{item.number}</p>
              <p className="mt-1 text-sm font-bold">{item.name}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl border-x border-[#1d211b] px-5 py-14 md:px-10 md:py-20">
        {step < steps.length ? (
          <form onSubmit={(event) => { event.preventDefault(); next(); }} className="mx-auto max-w-3xl" noValidate>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#596052]">Step {steps[step].number} · {steps[step].name}</p>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-4 text-3xl font-black tracking-[-0.035em] outline-none md:text-4xl">{steps[step].prompt}</h2>

            {step === 0 && (
              <div className="mt-10 space-y-7">
                <label className="block font-bold">
                  Describe the change <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.changed} onChange={event => update('changed', event.target.value)} className={`${fieldClass} min-h-32`} placeholder="What became newly true, uncertain, urgent, or impossible?" />
                  <span className="mt-2 block text-sm font-normal text-[#596052]">Describe the signal, not your entire history.</span>
                </label>
                <label className="block font-bold">
                  Signal or source <span className="font-normal text-[#596052]">· optional</span>
                  <input maxLength={300} value={draft.signalSource} onChange={event => update('signalSource', event.target.value)} className={fieldClass} placeholder="Customer message, observation, metric, deadline, new constraint…" />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="mt-10 space-y-7">
                <label className="block font-bold">
                  Decision that now exists <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.decision} onChange={event => update('decision', event.target.value)} className={`${fieldClass} min-h-28`} placeholder="What choice can no longer be avoided?" />
                </label>
                <label className="block font-bold">
                  Important unknowns <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.unknowns} onChange={event => update('unknowns', event.target.value)} className={`${fieldClass} min-h-28`} placeholder="What would change the decision if learned?" />
                </label>
                <label className="block font-bold">
                  Constraints <span className="font-normal text-[#596052]">· optional</span>
                  <textarea maxLength={2000} value={draft.constraints} onChange={event => update('constraints', event.target.value)} className={`${fieldClass} min-h-24`} placeholder="Time, money, consent, safety, dependencies, reversibility…" />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="mt-10 space-y-7">
                <label className="block font-bold">
                  One next action <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.nextAction} onChange={event => update('nextAction', event.target.value)} className={`${fieldClass} min-h-28`} placeholder="The smallest action that creates useful evidence or moves the decision." />
                </label>
                <label className="block font-bold">
                  Owner <span className="text-[#7a4a00]">· required</span>
                  <input required maxLength={300} value={draft.owner} onChange={event => update('owner', event.target.value)} className={fieldClass} placeholder="A person or accountable role" />
                </label>
                <label className="block font-bold">
                  Boundary <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.boundary} onChange={event => update('boundary', event.target.value)} className={`${fieldClass} min-h-24`} placeholder="What must not be spent, promised, exposed, or changed without another decision?" />
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="mt-10 space-y-7">
                <label className="block font-bold">
                  Evidence required <span className="text-[#7a4a00]">· required</span>
                  <textarea required maxLength={2000} value={draft.requiredEvidence} onChange={event => update('requiredEvidence', event.target.value)} className={`${fieldClass} min-h-28`} placeholder="What receipt, observation, artifact, or state change would show the action really happened?" />
                </label>
                <label className="block font-bold">
                  Evidence observed <span className="font-normal text-[#596052]">· leave blank until it exists</span>
                  <textarea maxLength={2000} value={draft.observedEvidence} onChange={event => update('observedEvidence', event.target.value)} className={`${fieldClass} min-h-28`} placeholder="Record where the evidence can be checked. Do not invent completion." />
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="mt-10 space-y-7">
                <label className="block font-bold">
                  Review date or trigger <span className="text-[#7a4a00]">· required</span>
                  <input required maxLength={300} value={draft.reviewAt} onChange={event => update('reviewAt', event.target.value)} className={fieldClass} placeholder="Example: Friday at 3 PM, or after the customer replies" />
                </label>
                <label className="block font-bold">
                  Learning <span className="font-normal text-[#596052]">· available after an evidence note exists</span>
                  <textarea maxLength={2000} disabled={!draft.observedEvidence.trim()} value={draft.learning} onChange={event => update('learning', event.target.value)} className={`${fieldClass} min-h-28 disabled:cursor-not-allowed disabled:bg-[#deddd7]`} placeholder="What did the result change about your model of the problem?" />
                </label>
                <label className="block font-bold">
                  Next change <span className="font-normal text-[#596052]">· optional</span>
                  <textarea maxLength={2000} value={draft.nextChange} onChange={event => update('nextChange', event.target.value)} className={`${fieldClass} min-h-24`} placeholder="What should the next loop notice or do differently?" />
                </label>
              </div>
            )}

            <p id="loop-requirements" className="mt-8 text-sm leading-6 text-[#596052]">
              Continue becomes available when this step's required answers are specific enough to preserve.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#777d70] pt-6">
              <button type="button" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0} className="min-h-11 px-4 text-sm font-bold underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-35">
                ← Back
              </button>
              <button type="submit" disabled={!stepIsValid} aria-describedby="loop-requirements" className="min-h-12 border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713] disabled:cursor-not-allowed disabled:border-[#9aa095] disabled:bg-[#9aa095] disabled:text-white">
                {step === steps.length - 1 ? 'Build operating record' : `Continue to ${steps[step + 1].name} →`}
              </button>
            </div>
          </form>
        ) : (
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#596052]">Portable operating record</p>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-4 text-4xl font-black tracking-[-0.04em] outline-none">The loop is preserved. The outcome is not assumed.</h2>
            <p className="mt-5 border-l-2 border-[#141713] pl-4 text-sm leading-6 text-[#4d5448]">{operatingStatus(draft)}</p>
            <pre className="mt-8 max-h-[34rem] overflow-auto whitespace-pre-wrap border border-[#777d70] bg-[#faf9f4] p-5 text-sm leading-6">{record}</pre>
            <div className="mt-6 flex flex-wrap gap-4">
              <button type="button" onClick={copyRecord} className="min-h-12 border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white">Copy record</button>
              <button type="button" onClick={downloadRecord} className="min-h-12 border-2 border-[#141713] px-6 py-3 text-sm font-bold">Download Markdown</button>
              <button type="button" onClick={() => setStep(0)} className="min-h-12 px-4 text-sm font-bold underline underline-offset-4">Edit the loop</button>
            </div>
            <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm text-[#4d5448]">
              {copyState === 'copied' && 'Copied to your clipboard.'}
              {copyState === 'failed' && 'Clipboard access was blocked. Use Download Markdown instead.'}
            </p>
          </div>
        )}

        <div className="mx-auto mt-16 max-w-4xl border-t border-[#777d70] pt-6">
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)} className="text-sm font-bold text-[#7a2d20] underline underline-offset-4">Reset the local draft</button>
          ) : (
            <div role="alertdialog" aria-labelledby="reset-loop-title" className="flex flex-wrap items-center gap-4 text-sm">
              <p id="reset-loop-title" className="font-bold">Clear every answer in the current worksheet? Copied or downloaded records are not affected.</p>
              <button type="button" onClick={reset} className="border border-[#7a2d20] px-4 py-2 font-bold text-[#7a2d20]">Yes, reset it</button>
              <button type="button" onClick={() => setConfirmReset(false)} className="px-3 py-2 font-bold underline underline-offset-4">Cancel</button>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-[#1d211b]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-[#596052] md:px-8">
          <p>© 2026 Nova Enterprises</p>
          <div className="flex gap-5">
            <Link href="/login" className="underline-offset-4 hover:underline">Sign in</Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Send } from 'lucide-react';
import {
  buildHostedPaymentUrl,
  isCompletePilotIntake,
  parseFailedPilotReceipt,
  parseSuccessfulPilotReceipt,
  type PilotInquiryReceipt,
  type PilotIntakeForm,
} from './intake-contract';

const deliverables = [
  'A written map of the accepted admin workflow and its handoff points.',
  'A client-owned folder or workspace structure for that workflow.',
  'One estimate template and one invoice template.',
  'One customer-intake form and one follow-up script set.',
  'One combined expense and open-work tracker.',
];

const initialForm: PilotIntakeForm = { name: '', email: '', business: '', challenge: '' };

function deliveryMessage(receipt: PilotInquiryReceipt): string {
  if (receipt.delivery.state === 'PROVIDER_ACCEPTED_BOTH') {
    return 'The inquiry is in the durable queue. The email provider accepted both notification requests; inbox delivery is not guaranteed.';
  }
  if (receipt.delivery.state === 'OPERATOR_PROVIDER_ACCEPTED') {
    return 'The inquiry is in the durable queue. The provider accepted the operator notification, but a confirmation request was not accepted. Inbox delivery is not guaranteed.';
  }
  return 'The inquiry is in the durable queue, but email delivery was not verified. Save the receipt for recovery.';
}

export default function BackOfficeClient() {
  const [form, setForm] = useState<PilotIntakeForm>(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'received' | 'error'>('idle');
  const [receipt, setReceipt] = useState<PilotInquiryReceipt | null>(null);
  const [failureReceipt, setFailureReceipt] = useState<PilotInquiryReceipt | null>(null);
  const complete = isCompletePilotIntake(form);
  const hostedPaymentUrl = receipt
    ? buildHostedPaymentUrl(process.env.NEXT_PUBLIC_BACK_OFFICE_STARTER_PAYMENT_URL || '', receipt.receiptId)
    : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || status === 'submitting') return;
    setStatus('submitting');
    setFailureReceipt(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, service: 'Back Office OS Starter Pilot' }),
      });
      const payload = await response.json().catch(() => null);
      const acceptedReceipt = parseSuccessfulPilotReceipt(payload);
      if (response.ok && acceptedReceipt) {
        setReceipt(acceptedReceipt);
        setStatus('received');
        return;
      }
      setFailureReceipt(parseFailedPilotReceipt(payload));
      setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f0e9] text-[#141713] selection:bg-[#b9ef9a]">
      <header className="border-b border-[#1d211b]">
        <nav aria-label="Primary navigation" className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="text-sm font-black uppercase tracking-[0.22em]">Nova</Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/#method" className="underline-offset-4 hover:underline">How Nova works</Link>
            <Link href="/login" className="underline-offset-4 hover:underline">Sign In</Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl border-x border-[#1d211b]">
        <section className="grid gap-10 border-b border-[#1d211b] px-5 py-16 md:px-10 md:py-20 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#596052]">Human-delivered starter pilot</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.04em] md:text-6xl">
              Back Office OS Starter Pilot
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4d5448]">
              One bounded setup for a small operator who needs a clearer path from customer intake to open work, expenses, and follow-up.
            </p>
            <a href="#intake" className="mt-8 inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white transition hover:bg-transparent hover:text-[#141713]">
              Complete the pilot intake <ArrowRight aria-hidden="true" className="ml-8 h-4 w-4" />
            </a>
          </div>
          <aside className="self-end border-t-2 border-[#141713] pt-5">
            <p className="text-4xl font-black">$150</p>
            <p className="mt-1 text-sm font-bold">one-time</p>
            <p className="mt-4 text-sm leading-6 text-[#596052]">No subscription. No software access is sold. Work is completed by a person inside the accepted scope.</p>
          </aside>
        </section>

        <section className="grid gap-12 border-b border-[#1d211b] px-5 py-14 md:px-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#596052]">Exact scope</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">Five deliverables</h2>
          </div>
          <ol className="border-t-2 border-[#141713]">
            {deliverables.map((deliverable, index) => (
              <li key={deliverable} className="grid gap-3 border-b border-[#777d70] py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
                <span className="font-black text-[#596052]">0{index + 1}</span>
                <span className="leading-7">{deliverable}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 border-b border-[#1d211b] bg-[#141713] px-5 py-14 text-[#f2f0e9] md:grid-cols-3 md:px-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9ef9a]">01 · Scope</p>
            <p className="mt-3 leading-7 text-[#c8ccc3]">The intake starts a review. Both sides must accept the written scope before work begins.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9ef9a]">02 · Access</p>
            <p className="mt-3 leading-7 text-[#c8ccc3]">Required access is limited to the accepted work. Permissions are tested before setup and checked again at handoff.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9ef9a]">03 · Handoff</p>
            <p className="mt-3 leading-7 text-[#c8ccc3]">The delivery target is seven business days after scope acceptance and receipt of required access. Handoff includes a walkthrough and client acceptance check.</p>
          </div>
        </section>

        <section id="intake" className="grid gap-12 px-5 py-16 md:px-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#596052]">Complete intake</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">Request a scope review</h2>
            <p className="mt-4 text-sm leading-6 text-[#596052]">Submitting records an inquiry. It is not scope acceptance, a payment, or the start of work.</p>
          </div>

          {status === 'received' && receipt ? (
            <div aria-live="polite" className="border-2 border-[#141713] bg-white p-6 md:p-8">
              <CheckCircle className="h-9 w-9" aria-hidden="true" />
              <h3 className="mt-5 text-2xl font-black">Inquiry recorded.</h3>
              <p className="mt-3 leading-7 text-[#4d5448]">{deliveryMessage(receipt)}</p>
              <div className="mt-6 border-y border-[#777d70] py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#596052]">Receipt</p>
                <p className="mt-2 break-all font-mono text-sm font-bold">{receipt.receiptId}</p>
              </div>
              <p className="mt-5 text-sm leading-6 text-[#596052]">{receipt.recovery.message}</p>
              {hostedPaymentUrl ? (
                <div className="mt-7 border-t border-[#777d70] pt-6">
                  <p className="mb-4 text-sm leading-6 text-[#596052]">The hosted payment link is available because the complete intake now has a durable receipt. Work still begins only after written scope acceptance.</p>
                  <a href={hostedPaymentUrl} rel="noopener noreferrer" className="inline-flex min-h-12 items-center border-2 border-[#141713] bg-[#141713] px-6 py-3 text-sm font-bold text-white">
                    Continue to hosted payment <ArrowRight aria-hidden="true" className="ml-8 h-4 w-4" />
                  </a>
                  <p className="mt-4 text-xs leading-5 text-[#596052]">
                    By paying, you agree to the <Link className="font-bold underline" href="/terms">Terms</Link> and acknowledge the <Link className="font-bold underline" href="/privacy">Privacy Policy</Link>. The payment is fully refundable on request until work begins.
                  </p>
                </div>
              ) : (
                <p className="mt-6 text-sm font-bold">No payment is requested on this page. Payment instructions are provided only if the scope is accepted.</p>
              )}
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="border-2 border-[#141713] bg-white p-5 md:p-8"
              noValidate
              aria-describedby="pilot-intake-requirements"
            >
              <p id="pilot-intake-requirements" className="mb-5 border-l-4 border-[#777d70] bg-[#f8f7f2] px-4 py-3 text-sm leading-6 text-[#4d5448]">
                All four fields are required. Use at least 2 characters for your name and business, a valid email address, and at least 20 characters for the workflow description. The inquiry button enables when those requirements are met.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Your name
                  <input
                    value={form.name}
                    onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    required
                    className="mt-2 min-h-12 w-full border border-[#777d70] bg-[#f8f7f2] px-3 font-normal outline-none focus:border-[#141713]"
                  />
                </label>
                <label className="text-sm font-bold">
                  Email
                  <input
                    value={form.email}
                    onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))}
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    required
                    className="mt-2 min-h-12 w-full border border-[#777d70] bg-[#f8f7f2] px-3 font-normal outline-none focus:border-[#141713]"
                  />
                </label>
              </div>
              <label className="mt-5 block text-sm font-bold">
                Business name and type
                <input
                  value={form.business}
                  onChange={event => setForm(previous => ({ ...previous, business: event.target.value }))}
                  minLength={2}
                  maxLength={160}
                  required
                  placeholder="Example: local service business with recurring customer follow-up"
                  className="mt-2 min-h-12 w-full border border-[#777d70] bg-[#f8f7f2] px-3 font-normal outline-none focus:border-[#141713]"
                />
              </label>
              <label className="mt-5 block text-sm font-bold">
                Describe the current workflow, the breakdown, and the one result you need
                <textarea
                  value={form.challenge}
                  onChange={event => setForm(previous => ({ ...previous, challenge: event.target.value }))}
                  minLength={20}
                  maxLength={2000}
                  rows={7}
                  required
                  className="mt-2 w-full resize-y border border-[#777d70] bg-[#f8f7f2] px-3 py-3 font-normal leading-6 outline-none focus:border-[#141713]"
                />
                <span className="mt-1 flex justify-between gap-4 text-xs font-normal text-[#596052]">
                  <span>Minimum 20 characters</span>
                  <span>{form.challenge.length}/2000</span>
                </span>
              </label>
              <button
                type="submit"
                disabled={!complete || status === 'submitting'}
                aria-describedby="pilot-intake-requirements"
                className="mt-6 flex min-h-12 w-full items-center justify-center bg-[#141713] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send aria-hidden="true" className="mr-3 h-4 w-4" />
                {status === 'submitting' ? 'Recording inquiry…' : 'Record my pilot inquiry'}
              </button>
              {status === 'error' && (
                <div role="alert" className="mt-5 border-l-4 border-[#9b2c2c] bg-[#fff5f5] p-4 text-sm leading-6">
                  <p className="font-bold">The intake was not fully verified.</p>
                  {failureReceipt ? (
                    <p className="mt-1">A record exists as <span className="font-mono font-bold">{failureReceipt.receiptId}</span>, but its delivery status is uncertain. Email support with that receipt.</p>
                  ) : (
                    <p className="mt-1">Retry once, or email support directly. No payment has been requested.</p>
                  )}
                </div>
              )}
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-[#1d211b]">
        <div className="mx-auto max-w-5xl px-5 py-8 text-sm leading-6 text-[#596052] md:px-8">
          <p>Support: <a className="font-bold underline" href="mailto:hello@novanexus-ai.com">hello@novanexus-ai.com</a>.</p>
          <p className="mt-2">If payment has been made, it is refundable on request until work begins. No broader refund promise is made here.</p>
          <p className="mt-2"><Link className="font-bold underline" href="/terms">Terms</Link> · <Link className="font-bold underline" href="/privacy">Privacy</Link></p>
        </div>
      </footer>
    </div>
  );
}

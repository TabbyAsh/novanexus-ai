'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type ProofCaseDetail,
  type ProofCommand,
  type ProofPulse,
  type ProofQueueItem,
  type ProofState,
} from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { ProofCaseDetailView, ProofPulseView, ProofQueueView } from './ProofDeskView';

const DELIVERABLES = [
  { code: 'WORKFLOW_MAP', label: 'Written workflow map and handoff points' },
  { code: 'CLIENT_WORKSPACE', label: 'Client-owned folder or workspace structure' },
  { code: 'ESTIMATE_INVOICE', label: 'Estimate and invoice templates' },
  { code: 'INTAKE_FOLLOWUP', label: 'Customer intake form and follow-up scripts' },
  { code: 'EXPENSE_OPEN_WORK', label: 'Expense and open-work tracker' },
] as const;

const FILTERS: Array<{ value: ProofState | ''; label: string }> = [
  { value: '', label: 'All cases' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'SCOPE_ACCEPTED', label: 'Scope accepted' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

type DeskSnapshot = {
  pulse: ProofPulse;
  cases: ProofQueueItem[];
  page: { nextCursor: string | null; hasMore: boolean };
  asOf: string;
};

type CommandResult = { kind: 'success' | 'error' | 'info'; message: string } | null;
type CommandRunner = (command: ProofCommand, payload?: Record<string, unknown>) => Promise<void>;
type CheckoutResult = { sessionId: string; url: string; version: number; idempotent: boolean } | null;

const inputClass = 'mt-1 w-full border border-stone-700 bg-[#090b08] px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-700 focus:border-lime-300';
const labelClass = 'block text-[11px] font-medium text-stone-400';
const primaryButton = 'inline-flex items-center justify-center border border-lime-300 bg-lime-300 px-3 py-2 text-xs font-semibold text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-800 disabled:text-stone-600';
const quietButton = 'inline-flex items-center justify-center border border-stone-700 px-3 py-2 text-xs font-medium text-stone-300 transition hover:border-stone-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function tomorrow(): string {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function localTimestampInput(): string {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function lines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function commandKey(receiptId: string, command: ProofCommand): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `proof:${receiptId}:${command.toLowerCase()}:${random}`.slice(0, 160);
}

function checkoutKey(receiptId: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `proof-checkout:${receiptId}:${random}`.slice(0, 160);
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-stone-800 pb-6 last:border-b-0">
      <h3 className="text-sm font-semibold text-stone-100">{title}</h3>
      {note && <p className="mt-1 text-[11px] leading-5 text-stone-600">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CommandPanel({
  detail,
  currentUserId,
  running,
  checkoutRunning,
  checkout,
  result,
  onCommand,
  onCheckout,
}: {
  detail: ProofCaseDetail;
  currentUserId: string;
  running: ProofCommand | null;
  checkoutRunning: boolean;
  checkout: CheckoutResult;
  result: CommandResult;
  onCommand: CommandRunner;
  onCheckout: () => Promise<void>;
}) {
  const item = detail.case;
  const terminal = ['CLOSED', 'CANCELLED'].includes(item.status);
  const [nextAction, setNextAction] = useState(item.next_action || '');
  const [dueAt, setDueAt] = useState(dateInput(item.next_action_due_at) || tomorrow());
  const [targetResult, setTargetResult] = useState('');
  const [details, setDetails] = useState<Record<string, string>>(() => Object.fromEntries(DELIVERABLES.map(entry => [entry.code, entry.label])));
  const [exclusions, setExclusions] = useState('');
  const [requiredAccess, setRequiredAccess] = useState('');
  const [deliveryDays, setDeliveryDays] = useState(7);
  const [acceptanceChannel, setAcceptanceChannel] = useState('EMAIL');
  const [acceptanceReference, setAcceptanceReference] = useState('');
  const [acceptedBy, setAcceptedBy] = useState(item.name || '');
  const [acceptedAt, setAcceptedAt] = useState(localTimestampInput());
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [evidenceRefs, setEvidenceRefs] = useState<Record<string, string>>({});
  const [handoffNote, setHandoffNote] = useState('');
  const [accessReturned, setAccessReturned] = useState(false);
  const [outcomeStatus, setOutcomeStatus] = useState<'VERIFIED' | 'UNVERIFIED'>('UNVERIFIED');
  const [baseline, setBaseline] = useState('');
  const [observation, setObservation] = useState('');
  const [unit, setUnit] = useState('');
  const [period, setPeriod] = useState('');
  const [source, setSource] = useState('');
  const [outcomeEvidence, setOutcomeEvidence] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [unverifiedReason, setUnverifiedReason] = useState('');
  const [valueDollars, setValueDollars] = useState('');
  const [learning, setLearning] = useState(item.learning || '');
  const [cancelReason, setCancelReason] = useState('');
  const [copiedCheckout, setCopiedCheckout] = useState(false);

  const busy = running !== null || checkoutRunning;
  const completed = new Set(detail.deliverables.filter(value => value.status === 'COMPLETE').map(value => value.code));
  const allDeliverablesComplete = detail.deliverables.length === DELIVERABLES.length
    && DELIVERABLES.every(value => completed.has(value.code));

  const submit = (event: React.FormEvent, command: ProofCommand, payload: Record<string, unknown> = {}) => {
    event.preventDefault();
    void onCommand(command, payload);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-lime-300">Operator commands</p>
        <h3 className="mt-2 text-lg font-semibold text-stone-100">Move only what is true.</h3>
        <p className="mt-2 text-xs leading-5 text-stone-500">Every command carries case version {item.version} and a retry-safe key. The server rejects stale or unauthorized changes.</p>
      </div>

      {result && (
        <div aria-live="polite" className={`border p-3 text-xs leading-5 ${
          result.kind === 'success' ? 'border-lime-300/30 bg-lime-300/[0.06] text-lime-100'
            : result.kind === 'info' ? 'border-amber-300/30 bg-amber-300/[0.06] text-amber-100'
              : 'border-rose-400/30 bg-rose-400/[0.06] text-rose-100'
        }`}>{result.message}</div>
      )}

      {terminal ? (
        <Section title="Immutable case" note="Closed and cancelled proofs remain available for audit, not further operation.">
          <p className="text-sm text-stone-400">No commands are available.</p>
        </Section>
      ) : (
        <>
          {item.status === 'RECEIVED' && (
            <Section title="Begin review" note="Claims the inquiry to this organization and assigns it to you.">
              <button type="button" className={primaryButton} disabled={busy} onClick={() => void onCommand('BEGIN_REVIEW')}>
                {running === 'BEGIN_REVIEW' ? 'Committing…' : 'Begin review'}
              </button>
            </Section>
          )}

          {item.status !== 'RECEIVED' && (
            <Section title="Next action" note="One accountable human, one concrete action, one due date.">
              <form onSubmit={event => submit(event, 'SET_NEXT_ACTION', { nextAction, dueAt, assignedUserId: item.assigned_user_id || currentUserId })} className="space-y-3">
                <label className={labelClass}>Action
                  <textarea className={inputClass} rows={3} value={nextAction} onChange={event => setNextAction(event.target.value)} minLength={5} required />
                </label>
                <label className={labelClass}>Due date
                  <input className={inputClass} type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} required />
                </label>
                <button className={quietButton} disabled={busy || nextAction.trim().length < 5 || !dueAt || !(item.assigned_user_id || currentUserId)}>
                  {running === 'SET_NEXT_ACTION' ? 'Committing…' : 'Record next action'}
                </button>
              </form>
            </Section>
          )}

          {item.status === 'IN_REVIEW' && (
            <Section title="Accepted scope" note="Record what the client actually accepted. Price is fixed at $150 for this pilot.">
              <form onSubmit={event => submit(event, 'RECORD_SCOPE_ACCEPTANCE', {
                targetResult,
                deliverables: DELIVERABLES.map(entry => ({ code: entry.code, detail: details[entry.code] })),
                exclusions: lines(exclusions),
                requiredAccess: lines(requiredAccess),
                deliveryTargetBusinessDays: deliveryDays,
                amountCents: 15000,
                currency: 'USD',
                acceptanceChannel,
                acceptanceReference,
                acceptedBy,
                acceptedAt: new Date(acceptedAt).toISOString(),
              })} className="space-y-4">
                <label className={labelClass}>Target result
                  <textarea className={inputClass} rows={4} value={targetResult} onChange={event => setTargetResult(event.target.value)} minLength={20} placeholder="The bounded result both sides agreed to…" required />
                </label>
                <fieldset className="space-y-3">
                  <legend className="text-[11px] font-medium text-stone-400">Five required deliverables</legend>
                  {DELIVERABLES.map(entry => (
                    <label key={entry.code} className={labelClass}>{entry.label}
                      <textarea className={inputClass} rows={2} value={details[entry.code]} onChange={event => setDetails(current => ({ ...current, [entry.code]: event.target.value }))} minLength={5} required />
                    </label>
                  ))}
                </fieldset>
                <label className={labelClass}>Explicit exclusions · one per line
                  <textarea className={inputClass} rows={3} value={exclusions} onChange={event => setExclusions(event.target.value)} />
                </label>
                <label className={labelClass}>Required access · one per line
                  <textarea className={inputClass} rows={3} value={requiredAccess} onChange={event => setRequiredAccess(event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Business days
                    <input className={inputClass} type="number" min={1} max={30} value={deliveryDays} onChange={event => setDeliveryDays(Number(event.target.value))} required />
                  </label>
                  <label className={labelClass}>Acceptance channel
                    <select className={inputClass} value={acceptanceChannel} onChange={event => setAcceptanceChannel(event.target.value)}>
                      <option value="EMAIL">Email</option>
                      <option value="SIGNED_DOCUMENT">Signed document</option>
                      <option value="RECORDED_CALL">Recorded call</option>
                    </select>
                  </label>
                </div>
                <label className={labelClass}>Acceptance reference
                  <input className={inputClass} value={acceptanceReference} onChange={event => setAcceptanceReference(event.target.value)} minLength={3} placeholder="Client-owned email, document, or recording reference" required />
                </label>
                <label className={labelClass}>Accepted by
                  <input className={inputClass} value={acceptedBy} onChange={event => setAcceptedBy(event.target.value)} minLength={2} required />
                </label>
                <label className={labelClass}>Accepted at
                  <input className={inputClass} type="datetime-local" value={acceptedAt} onChange={event => setAcceptedAt(event.target.value)} required />
                </label>
                <button className={primaryButton} disabled={busy || targetResult.trim().length < 20 || acceptanceReference.trim().length < 3 || acceptedBy.trim().length < 2}>
                  {running === 'RECORD_SCOPE_ACCEPTANCE' ? 'Committing…' : 'Record accepted scope'}
                </button>
              </form>
            </Section>
          )}

          {item.status === 'SCOPE_ACCEPTED' && (
            <Section title="Start gate" note="Proof Desk cannot mark payment. Billing must confirm it independently.">
              {item.payment_status !== 'PAID' ? (
                <div className="space-y-4">
                  <div className="border border-amber-300/30 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100">
                    Waiting for verified payment. Do not begin delivery or represent this case as paid.
                  </div>
                  {item.payment_status === 'NOT_STARTED' && (
                    <div className="space-y-3">
                      <p className="text-[11px] leading-5 text-stone-500">Billing will bind a hosted $150 checkout to this receipt, accepted scope hash, and current case version.</p>
                      <button type="button" className={primaryButton} disabled={busy} onClick={() => void onCheckout()}>
                        {checkoutRunning ? 'Issuing link…' : checkout ? 'Refresh hosted link' : 'Get hosted payment link'}
                      </button>
                      {checkout && (
                        <div className="border border-lime-300/30 bg-lime-300/[0.04] p-3">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-lime-200">Hosted checkout ready</p>
                          <p className="mt-2 break-all font-mono text-[10px] leading-4 text-stone-500">{checkout.url}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className={quietButton} onClick={() => window.open(checkout.url, '_blank', 'noopener,noreferrer')}>Open checkout</button>
                            <button type="button" className={quietButton} onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(checkout.url);
                                setCopiedCheckout(true);
                              } catch {
                                setCopiedCheckout(false);
                              }
                            }}>{copiedCheckout ? 'Copied' : 'Copy link'}</button>
                          </div>
                          <p className="mt-3 text-[10px] text-stone-600">Creating a link does not mark payment. Wait for the billing confirmation to change this case to PAID.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="flex items-start gap-3 text-xs leading-5 text-stone-300">
                    <input className="mt-1 accent-lime-300" type="checkbox" checked={accessConfirmed} onChange={event => setAccessConfirmed(event.target.checked)} />
                    I checked that the accepted access is available and limited to this scope.
                  </label>
                  <button type="button" className={primaryButton} disabled={busy || !accessConfirmed || !item.next_action || !item.next_action_due_at || !item.assigned_user_id} onClick={() => void onCommand('START_WORK', { accessConfirmed: true })}>
                    {running === 'START_WORK' ? 'Committing…' : 'Start work'}
                  </button>
                  {(!item.next_action || !item.next_action_due_at || !item.assigned_user_id) && <p className="text-[11px] text-amber-200">Record an owner, next action, and due date first.</p>}
                </div>
              )}
            </Section>
          )}

          {item.status === 'IN_PROGRESS' && (
            <>
              <Section title="Deliverable evidence" note="A deliverable is complete only when its client-owned evidence reference is recorded.">
                <div className="space-y-4">
                  {detail.deliverables.map(deliverable => (
                    <div key={deliverable.code} className="border border-stone-800 p-3">
                      <p className="text-xs font-medium leading-5 text-stone-200">{deliverable.label}</p>
                      <p className="mt-1 font-mono text-[9px] text-stone-700">{deliverable.code}</p>
                      {deliverable.status === 'OPEN' ? (
                        <div className="mt-3 space-y-2">
                          <input className={inputClass} value={evidenceRefs[deliverable.code] || ''} onChange={event => setEvidenceRefs(current => ({ ...current, [deliverable.code]: event.target.value }))} placeholder="Evidence reference" aria-label={`${deliverable.label} evidence reference`} />
                          <button type="button" className={quietButton} disabled={busy || (evidenceRefs[deliverable.code] || '').trim().length < 3} onClick={() => void onCommand('COMPLETE_DELIVERABLE', { code: deliverable.code, label: deliverable.label, evidenceRef: evidenceRefs[deliverable.code] })}>
                            {running === 'COMPLETE_DELIVERABLE' ? 'Committing…' : 'Record evidence'}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <p className="break-all text-[10px] text-lime-200">Complete · {deliverable.evidence_reference}</p>
                          <button type="button" className={`${quietButton} mt-2`} disabled={busy} onClick={() => void onCommand('REOPEN_DELIVERABLE', { code: deliverable.code })}>
                            Reopen
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Client handoff" note="Available after all five deliverables carry evidence.">
                {allDeliverablesComplete ? (
                  <form onSubmit={event => submit(event, 'RECORD_HANDOFF', { handoffNote, accessReturned })} className="space-y-3">
                    <label className={labelClass}>Handoff record
                      <textarea className={inputClass} rows={4} value={handoffNote} onChange={event => setHandoffNote(event.target.value)} minLength={10} placeholder="What was delivered, demonstrated, and accepted…" required />
                    </label>
                    <label className="flex items-start gap-3 text-xs leading-5 text-stone-300">
                      <input className="mt-1 accent-lime-300" type="checkbox" checked={accessReturned} onChange={event => setAccessReturned(event.target.checked)} />
                      Client access has been returned, removed, or explicitly retained under agreement.
                    </label>
                    <button className={primaryButton} disabled={busy || !accessReturned || handoffNote.trim().length < 10}>
                      {running === 'RECORD_HANDOFF' ? 'Committing…' : 'Record handoff'}
                    </button>
                  </form>
                ) : <p className="text-xs leading-5 text-stone-500">Complete and evidence every promised deliverable before handoff.</p>}
              </Section>
            </>
          )}

          {item.status === 'DELIVERED' && (
            <>
              <Section title="Observed outcome" note="Choose verified only when the source and evidence reference support the observation.">
                <form onSubmit={event => submit(event, 'RECORD_OUTCOME', outcomeStatus === 'VERIFIED' ? {
                  status: 'VERIFIED', baseline, observation, unit, period, source, evidenceRef: outcomeEvidence, note: outcomeNote,
                  valueCents: valueDollars.trim() ? Math.round(Number(valueDollars) * 100) : null,
                } : {
                  status: 'UNVERIFIED', reason: unverifiedReason, note: outcomeNote, valueCents: null,
                })} className="space-y-3">
                  <label className={labelClass}>Verification status
                    <select className={inputClass} value={outcomeStatus} onChange={event => setOutcomeStatus(event.target.value as 'VERIFIED' | 'UNVERIFIED')}>
                      <option value="UNVERIFIED">Unverified</option>
                      <option value="VERIFIED">Verified</option>
                    </select>
                  </label>
                  {outcomeStatus === 'VERIFIED' ? (
                    <>
                      <label className={labelClass}>Baseline<input className={inputClass} value={baseline} onChange={event => setBaseline(event.target.value)} minLength={3} required /></label>
                      <label className={labelClass}>Observation<textarea className={inputClass} rows={3} value={observation} onChange={event => setObservation(event.target.value)} minLength={3} required /></label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={labelClass}>Unit<input className={inputClass} value={unit} onChange={event => setUnit(event.target.value)} minLength={3} required /></label>
                        <label className={labelClass}>Period<input className={inputClass} value={period} onChange={event => setPeriod(event.target.value)} minLength={3} required /></label>
                      </div>
                      <label className={labelClass}>Source<input className={inputClass} value={source} onChange={event => setSource(event.target.value)} minLength={3} required /></label>
                      <label className={labelClass}>Evidence reference<input className={inputClass} value={outcomeEvidence} onChange={event => setOutcomeEvidence(event.target.value)} minLength={3} required /></label>
                      <label className={labelClass}>Attributed value · optional dollars<input className={inputClass} type="number" min={0} step="0.01" value={valueDollars} onChange={event => setValueDollars(event.target.value)} /></label>
                    </>
                  ) : (
                    <label className={labelClass}>Why it is unverified<textarea className={inputClass} rows={3} value={unverifiedReason} onChange={event => setUnverifiedReason(event.target.value)} minLength={10} required /></label>
                  )}
                  <label className={labelClass}>Outcome note<textarea className={inputClass} rows={4} value={outcomeNote} onChange={event => setOutcomeNote(event.target.value)} minLength={10} required /></label>
                  <button className={primaryButton} disabled={busy || outcomeNote.trim().length < 10 || (outcomeStatus === 'UNVERIFIED' && unverifiedReason.trim().length < 10) || (outcomeStatus === 'VERIFIED' && [baseline, observation, unit, period, source, outcomeEvidence].some(value => value.trim().length < 3)) || (valueDollars.trim() !== '' && (!Number.isFinite(Number(valueDollars)) || Number(valueDollars) < 0))}>
                    {running === 'RECORD_OUTCOME' ? 'Committing…' : `Record ${outcomeStatus.toLowerCase()} outcome`}
                  </button>
                </form>
              </Section>

              {item.outcome_status !== 'PENDING' && (
                <Section title="Close and adapt" note="Close only after recording what should change next time.">
                  <form onSubmit={event => submit(event, 'CLOSE_CASE', { learning })} className="space-y-3">
                    <label className={labelClass}>Adapt learning
                      <textarea className={inputClass} rows={5} value={learning} onChange={event => setLearning(event.target.value)} minLength={20} required />
                    </label>
                    <button className={primaryButton} disabled={busy || learning.trim().length < 20}>
                      {running === 'CLOSE_CASE' ? 'Committing…' : 'Close proof'}
                    </button>
                  </form>
                </Section>
              )}
            </>
          )}

          {['IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS'].includes(item.status) && (
            <details className="border border-rose-400/20 p-3">
              <summary className="cursor-pointer text-xs font-medium text-rose-200">Cancel case</summary>
              <form onSubmit={event => submit(event, 'CANCEL_CASE', { reason: cancelReason })} className="mt-4 space-y-3">
                {item.payment_status === 'PAID' && <p className="text-[11px] leading-5 text-rose-200">Payment is recorded. Cancellation will raise a refund-required risk flag; this command does not issue a refund.</p>}
                <label className={labelClass}>Reason
                  <textarea className={inputClass} rows={3} value={cancelReason} onChange={event => setCancelReason(event.target.value)} minLength={10} required />
                </label>
                <button className="border border-rose-400 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-400/10 disabled:opacity-40" disabled={busy || cancelReason.trim().length < 10}>
                  {running === 'CANCEL_CASE' ? 'Committing…' : 'Cancel case'}
                </button>
              </form>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export default function ProofDeskClient() {
  const currentUserId = useAuthStore(state => state.user?.id || '');
  const [filter, setFilter] = useState<ProofState | ''>('');
  const [desk, setDesk] = useState<DeskSnapshot | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProofCaseDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [caseLoading, setCaseLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [caseError, setCaseError] = useState('');
  const [running, setRunning] = useState<ProofCommand | null>(null);
  const [checkoutRunning, setCheckoutRunning] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResult>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>(null);
  const retryRef = useRef<{ signature: string; key: string } | null>(null);
  const checkoutRetryRef = useRef<{ signature: string; key: string } | null>(null);

  const loadDesk = useCallback(async (selectedFilter: ProofState | '', quiet = false) => {
    if (!quiet) setListLoading(true);
    setListError('');
    const response = await api.getProofDesk({ status: selectedFilter, limit: 100 });
    if (response.success && response.data) {
      setDesk(response.data as DeskSnapshot);
      setSelectedReceipt(current => {
        if (current && response.data!.cases.some(item => item.receipt_id === current)) return current;
        return response.data!.cases[0]?.receipt_id || null;
      });
    } else {
      setListError(response.error?.message || 'Proof Desk could not be read.');
    }
    setListLoading(false);
  }, []);

  const loadCase = useCallback(async (receiptId: string) => {
    setCaseLoading(true);
    setCaseError('');
    const response = await api.getProofCase(receiptId);
    if (response.success && response.data) setDetail(response.data);
    else {
      setDetail(null);
      setCaseError(response.error?.message || 'This proof case could not be read.');
    }
    setCaseLoading(false);
  }, []);

  useEffect(() => {
    void loadDesk(filter);
  }, [filter, loadDesk]);

  useEffect(() => {
    if (selectedReceipt) void loadCase(selectedReceipt);
    else setDetail(null);
  }, [loadCase, selectedReceipt]);

  useEffect(() => {
    setCheckout(null);
    setCommandResult(null);
    retryRef.current = null;
    checkoutRetryRef.current = null;
  }, [selectedReceipt]);

  const runCommand: CommandRunner = async (command, payload = {}) => {
    if (!detail || running) return;
    const expectedVersion = detail.case.version;
    const signature = JSON.stringify({ receiptId: detail.case.receipt_id, command, expectedVersion, payload });
    const key = retryRef.current?.signature === signature
      ? retryRef.current.key
      : commandKey(detail.case.receipt_id, command);
    retryRef.current = { signature, key };
    setRunning(command);
    setCommandResult(null);

    const response = await api.sendProofCommand({
      receiptId: detail.case.receipt_id,
      command,
      expectedVersion,
      payload,
      idempotencyKey: key,
    });

    if (response.success && response.data) {
      setDetail(response.data);
      setCommandResult({
        kind: 'success',
        message: response.data.command.idempotent
          ? `Command already committed at version ${response.data.command.version}; no duplicate change was made.`
          : `Command committed at version ${response.data.command.version}.`,
      });
      retryRef.current = null;
      await loadDesk(filter, true);
    } else if (response.error?.code === 'STALE_PROOF_VERSION') {
      retryRef.current = null;
      setCommandResult({ kind: 'info', message: 'The case changed elsewhere. The latest version has been loaded; review it before trying again.' });
      await loadCase(detail.case.receipt_id);
      await loadDesk(filter, true);
    } else {
      if (response.error?.code !== 'NETWORK_ERROR') retryRef.current = null;
      setCommandResult({
        kind: 'error',
        message: response.error?.code === 'NETWORK_ERROR'
          ? 'The result is unknown because the connection failed. Retry without changing the form; the same command key will be reused.'
          : response.error?.message || response.error?.code || 'The command was not committed.',
      });
    }
    setRunning(null);
  };

  const runCheckout = async () => {
    if (!detail || checkoutRunning || running || detail.case.status !== 'SCOPE_ACCEPTED' || detail.case.payment_status !== 'NOT_STARTED') return;
    const receiptId = detail.case.receipt_id;
    const expectedVersion = detail.case.version;
    const signature = JSON.stringify({ receiptId, expectedVersion });
    const key = checkoutRetryRef.current?.signature === signature
      ? checkoutRetryRef.current.key
      : checkoutKey(receiptId);
    checkoutRetryRef.current = { signature, key };
    setCheckoutRunning(true);
    setCommandResult(null);

    const response = await api.createProofCheckout({ receiptId, expectedVersion, idempotencyKey: key });
    if (response.success && response.data) {
      setCheckout(response.data);
      setCommandResult({
        kind: 'success',
        message: response.data.idempotent
          ? 'The existing hosted checkout was retrieved. Payment remains unconfirmed until billing records it.'
          : `Hosted checkout committed at version ${response.data.version}. Payment remains unconfirmed until billing records it.`,
      });
      checkoutRetryRef.current = null;
      await loadCase(receiptId);
      await loadDesk(filter, true);
    } else if (response.error?.code === 'STALE_PROOF_VERSION') {
      checkoutRetryRef.current = null;
      setCheckout(null);
      setCommandResult({ kind: 'info', message: 'The case changed elsewhere. The latest version has been loaded; review it before issuing checkout.' });
      await loadCase(receiptId);
      await loadDesk(filter, true);
    } else {
      if (response.error?.code !== 'NETWORK_ERROR') checkoutRetryRef.current = null;
      setCommandResult({
        kind: 'error',
        message: response.error?.code === 'NETWORK_ERROR'
          ? 'The checkout result is unknown because the connection failed. Retry without changing the case; the same checkout key will be reused.'
          : response.error?.message || response.error?.code || 'The hosted checkout was not committed.',
      });
    }
    setCheckoutRunning(false);
  };

  return (
    <main className="min-h-full bg-[#080a08] px-4 py-8 text-stone-200 sm:px-6 xl:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-stone-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="border border-lime-300/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-lime-200">Private · ops.admin</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Nexus / Operations</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-50">Proof Desk</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">Scope before payment. Payment before work. Evidence before delivery. Outcome before claims.</p>
          </div>
          <button type="button" className={quietButton} disabled={listLoading || caseLoading} onClick={() => {
            void loadDesk(filter);
            if (selectedReceipt) void loadCase(selectedReceipt);
          }}>Refresh recorded state</button>
        </header>

        {listError && <div className="mb-6 border border-rose-400/30 bg-rose-400/[0.06] p-4 text-sm text-rose-100" role="alert">{listError}</div>}

        {desk && <ProofPulseView pulse={desk.pulse} asOf={desk.asOf} />}

        <div className="mt-8 grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="lg:sticky lg:top-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-100">Case queue</h2>
                <p className="mt-1 text-xs text-stone-600">{desk?.cases.length || 0} shown</p>
              </div>
              <label className="text-[10px] uppercase tracking-[0.12em] text-stone-600">
                <span className="sr-only">Filter cases by state</span>
                <select className="border border-stone-700 bg-[#10130f] px-2 py-1.5 text-xs normal-case tracking-normal text-stone-300 outline-none focus:border-lime-300" value={filter} onChange={event => setFilter(event.target.value as ProofState | '')}>
                  {FILTERS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            {listLoading && !desk ? (
              <div className="border border-stone-800 p-8 text-center text-sm text-stone-600" role="status">Reading recorded cases…</div>
            ) : (
              <ProofQueueView cases={desk?.cases || []} selectedReceipt={selectedReceipt} onSelect={receipt => {
                setSelectedReceipt(receipt);
                setCommandResult(null);
                setCheckout(null);
                retryRef.current = null;
                checkoutRetryRef.current = null;
              }} />
            )}
            {desk?.page.hasMore && <p className="mt-3 text-[10px] leading-4 text-stone-600">More than 100 cases match. Narrow the state filter to work a smaller queue.</p>}
          </section>

          <section>
            {caseError && <div className="border border-rose-400/30 bg-rose-400/[0.06] p-4 text-sm text-rose-100" role="alert">{caseError}</div>}
            {caseLoading && !detail ? (
              <div className="border border-stone-800 p-12 text-center text-sm text-stone-600" role="status">Reading proof and timeline…</div>
            ) : detail ? (
              <ProofCaseDetailView
                detail={detail}
                commandPanel={
                  <CommandPanel
                    key={detail.case.receipt_id}
                    detail={detail}
                    currentUserId={currentUserId}
                    running={running}
                    checkoutRunning={checkoutRunning}
                    checkout={checkout}
                    result={commandResult}
                    onCommand={runCommand}
                    onCheckout={runCheckout}
                  />
                }
              />
            ) : !caseError ? (
              <div className="border border-dashed border-stone-700 p-12 text-center">
                <p className="text-sm text-stone-400">Select a proof case to inspect its evidence and next action.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

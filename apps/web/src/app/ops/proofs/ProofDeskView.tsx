import type {
  ProofCaseDetail,
  ProofOutcomeState,
  ProofPaymentState,
  ProofPulse,
  ProofQueueItem,
  ProofState,
} from '@/lib/api';

const STATE_LABELS: Record<ProofState, string> = {
  RECEIVED: 'Received',
  IN_REVIEW: 'In review',
  SCOPE_ACCEPTED: 'Scope accepted',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const stateTone: Record<ProofState, string> = {
  RECEIVED: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  IN_REVIEW: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  SCOPE_ACCEPTED: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  IN_PROGRESS: 'border-lime-300/30 bg-lime-300/10 text-lime-100',
  DELIVERED: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  CLOSED: 'border-stone-600 bg-stone-800/60 text-stone-300',
  CANCELLED: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

export function formatProofMoney(cents: number | string): string {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
}

function formatDate(value: string | null, includeTime = false): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', includeTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function shortHash(value: string | null): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : 'Not recorded';
}

function isDue(value: string | null): boolean {
  if (!value) return false;
  const due = new Date(`${value.slice(0, 10)}T23:59:59`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

function StateBadge({ state }: { state: ProofState }) {
  return <span className={`inline-flex border px-2 py-1 text-[11px] font-medium ${stateTone[state]}`}>{STATE_LABELS[state]}</span>;
}

function TruthBadge({ label, value, tone }: { label: string; value: string; tone: 'plain' | 'good' | 'warn' | 'bad' }) {
  const classes = tone === 'good'
    ? 'border-lime-300/30 text-lime-200'
    : tone === 'warn'
      ? 'border-amber-300/30 text-amber-100'
      : tone === 'bad'
        ? 'border-rose-400/30 text-rose-200'
        : 'border-stone-700 text-stone-300';
  return (
    <div className={`border bg-black/20 px-3 py-2 ${classes}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] opacity-65">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

export function ProofPulseView({ pulse, asOf }: { pulse: ProofPulse; asOf: string }) {
  const cells = [
    { label: 'Collected', value: formatProofMoney(pulse.cash_collected_cents), note: 'Confirmed payment only', tone: 'good' },
    { label: 'New', value: pulse.new_inquiries, note: 'Not yet reviewed', tone: pulse.new_inquiries ? 'warn' : 'plain' },
    { label: 'In review', value: pulse.awaiting_review, note: 'Scope not accepted', tone: pulse.awaiting_review ? 'warn' : 'plain' },
    { label: 'Awaiting payment', value: pulse.awaiting_payment, note: 'Accepted scope, unpaid', tone: pulse.awaiting_payment ? 'warn' : 'plain' },
    { label: 'Ready to start', value: pulse.ready_to_start, note: 'Paid and scoped', tone: pulse.ready_to_start ? 'good' : 'plain' },
    { label: 'Active work', value: pulse.active_work, note: 'Delivery underway', tone: pulse.active_work ? 'good' : 'plain' },
    { label: 'Outcome due', value: pulse.awaiting_outcome, note: 'Delivered, not measured', tone: pulse.awaiting_outcome ? 'warn' : 'plain' },
    { label: 'Verified outcomes', value: pulse.verified_outcomes, note: 'Evidence recorded', tone: pulse.verified_outcomes ? 'good' : 'plain' },
    { label: 'Overdue', value: pulse.overdue_actions, note: 'Next action missed', tone: pulse.overdue_actions ? 'bad' : 'plain' },
    { label: 'Risk flags', value: pulse.risk_flags, note: 'Needs operator review', tone: pulse.risk_flags ? 'bad' : 'plain' },
  ] as const;

  return (
    <section aria-labelledby="proof-pulse-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="proof-pulse-title" className="text-sm font-semibold text-stone-100">Evidence-backed pulse</h2>
          <p className="mt-1 text-xs text-stone-500">Counts come from recorded case, payment, delivery, and outcome states.</p>
        </div>
        <p className="text-[11px] text-stone-600">As of {formatDate(asOf, true)}</p>
      </div>
      <div className="grid grid-cols-2 gap-px border border-stone-800 bg-stone-800 sm:grid-cols-3 xl:grid-cols-10">
        {cells.map(cell => (
          <div key={cell.label} className="bg-[#10130f] p-3">
            <div className="text-[10px] uppercase tracking-[0.13em] text-stone-500">{cell.label}</div>
            <div className={`mt-2 text-xl font-semibold tabular-nums ${
              cell.tone === 'good' ? 'text-lime-200' : cell.tone === 'warn' ? 'text-amber-100' : cell.tone === 'bad' ? 'text-rose-200' : 'text-stone-200'
            }`}>{cell.value}</div>
            <div className="mt-1 text-[10px] leading-4 text-stone-600">{cell.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProofQueueView({
  cases,
  selectedReceipt,
  onSelect,
}: {
  cases: ProofQueueItem[];
  selectedReceipt: string | null;
  onSelect: (receipt: string) => void;
}) {
  if (!cases.length) {
    return (
      <div className="border border-dashed border-stone-700 p-8 text-center">
        <p className="text-sm font-medium text-stone-300">No proof cases in this view.</p>
        <p className="mt-2 text-xs leading-5 text-stone-500">Nothing is counted until a real inquiry enters the ledger.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-label="Proof case queue">
      {cases.map(item => {
        const selected = item.receipt_id === selectedReceipt;
        const overdue = isDue(item.next_action_due_at) && !['CLOSED', 'CANCELLED'].includes(item.status);
        return (
          <button
            type="button"
            key={item.receipt_id}
            onClick={() => onSelect(item.receipt_id)}
            aria-pressed={selected}
            className={`w-full border p-4 text-left transition ${selected ? 'border-lime-300/60 bg-lime-300/[0.06]' : 'border-stone-800 bg-[#10130f] hover:border-stone-600'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stone-100">{item.business}</p>
                <p className="mt-1 font-mono text-[10px] text-stone-600">{item.receipt_id} · v{item.version}</p>
              </div>
              <StateBadge state={item.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="text-stone-500">Payment <span className="ml-1 text-stone-300">{item.payment_status.replace('_', ' ')}</span></div>
              <div className="text-stone-500">Outcome <span className="ml-1 text-stone-300">{item.outcome_status}</span></div>
            </div>
            <div className={`mt-3 border-l-2 pl-3 text-xs leading-5 ${overdue ? 'border-rose-400 text-rose-100' : 'border-stone-700 text-stone-400'}`}>
              {item.next_action || 'No next action recorded.'}
              {item.next_action_due_at && <span className="mt-0.5 block text-[10px] opacity-70">Due {formatDate(item.next_action_due_at)}{overdue ? ' · overdue' : ''}</span>}
            </div>
            {item.risk_code && <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-300">Risk: {item.risk_code.replaceAll('_', ' ')}</p>}
          </button>
        );
      })}
    </div>
  );
}

function paymentTone(state: ProofPaymentState): 'plain' | 'good' | 'warn' | 'bad' {
  if (state === 'PAID') return 'good';
  if (state === 'REFUNDED') return 'bad';
  return 'warn';
}

function outcomeTone(state: ProofOutcomeState): 'plain' | 'good' | 'warn' | 'bad' {
  if (state === 'VERIFIED') return 'good';
  if (state === 'UNVERIFIED') return 'warn';
  return 'plain';
}

function readableOutcome(value: ProofCaseDetail['case']['outcome_json']): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function ProofCaseDetailView({ detail, commandPanel }: { detail: ProofCaseDetail; commandPanel?: React.ReactNode }) {
  const item = detail.case;
  const outcome = readableOutcome(item.outcome_json);
  const timelineCountMatches = detail.integrity.eventCount === detail.timeline.length;

  return (
    <article className="border border-stone-800 bg-[#0d100c]" aria-labelledby="proof-case-heading">
      <header className="border-b border-stone-800 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-lime-300">Active proof record</p>
            <h2 id="proof-case-heading" className="mt-2 text-2xl font-semibold text-stone-100">{item.business}</h2>
            <p className="mt-1 text-sm text-stone-500">{item.name} · {item.email}</p>
            <p className="mt-2 font-mono text-[10px] text-stone-600">{item.receipt_id} · aggregate version {item.version}</p>
          </div>
          <StateBadge state={item.status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <TruthBadge label="Scope" value={detail.scope ? `Accepted · v${detail.scope.version}` : 'Not accepted'} tone={detail.scope ? 'good' : 'warn'} />
          <TruthBadge label="Payment" value={item.payment_status.replace('_', ' ')} tone={paymentTone(item.payment_status)} />
          <TruthBadge label="Delivery" value={item.delivered_at ? `Recorded ${formatDate(item.delivered_at)}` : item.status === 'IN_PROGRESS' ? 'In progress' : 'Not delivered'} tone={item.delivered_at ? 'good' : item.status === 'IN_PROGRESS' ? 'warn' : 'plain'} />
          <TruthBadge label="Outcome" value={item.outcome_status} tone={outcomeTone(item.outcome_status)} />
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8 p-5 sm:p-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Next action</h3>
            <div className={`mt-3 border-l-2 p-4 ${isDue(item.next_action_due_at) ? 'border-rose-400 bg-rose-400/[0.06]' : 'border-lime-300 bg-lime-300/[0.04]'}`}>
              <p className="text-sm leading-6 text-stone-200">{item.next_action || 'No next action is recorded.'}</p>
              <p className="mt-2 text-xs text-stone-500">Owner: {item.assigned_user_id || 'Unassigned'} · Due: {formatDate(item.next_action_due_at)}</p>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Original need</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-300">{item.challenge}</p>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Accepted scope</h3>
              {detail.scope && <span className="font-mono text-[10px] text-stone-600">{shortHash(detail.scope.scope_hash)}</span>}
            </div>
            {detail.scope ? (
              <div className="mt-3 border border-stone-800 bg-black/20 p-4">
                <p className="text-sm leading-6 text-stone-200">{detail.scope.target_result}</p>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div><dt className="text-stone-600">Price</dt><dd className="mt-1 text-stone-300">{formatProofMoney(detail.scope.amount_cents)}</dd></div>
                  <div><dt className="text-stone-600">Delivery target</dt><dd className="mt-1 text-stone-300">{detail.scope.delivery_target_business_days} business days</dd></div>
                  <div><dt className="text-stone-600">Accepted</dt><dd className="mt-1 text-stone-300">{formatDate(detail.scope.accepted_at)}</dd></div>
                </dl>
                {(detail.scope.exclusions_json.length > 0 || detail.scope.required_access_json.length > 0) && (
                  <div className="mt-4 grid gap-4 border-t border-stone-800 pt-4 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-stone-400">Excluded</p>
                      <ul className="mt-2 space-y-1 text-stone-500">{detail.scope.exclusions_json.map(value => <li key={value}>— {value}</li>)}</ul>
                    </div>
                    <div>
                      <p className="font-medium text-stone-400">Required access</p>
                      <ul className="mt-2 space-y-1 text-stone-500">{detail.scope.required_access_json.map(value => <li key={value}>— {value}</li>)}</ul>
                    </div>
                  </div>
                )}
              </div>
            ) : <p className="mt-3 text-sm text-stone-600">No immutable scope has been accepted.</p>}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Delivery evidence</h3>
            {detail.deliverables.length ? (
              <div className="mt-3 divide-y divide-stone-800 border border-stone-800">
                {detail.deliverables.map(deliverable => (
                  <div key={deliverable.code} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-stone-200">{deliverable.label}</p>
                        <p className="mt-1 font-mono text-[10px] text-stone-600">{deliverable.code}</p>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.13em] ${deliverable.status === 'COMPLETE' ? 'text-lime-200' : 'text-stone-600'}`}>{deliverable.status}</span>
                    </div>
                    {deliverable.evidence_reference && (
                      <div className="mt-3 text-xs text-stone-500">
                        <p className="break-all">Reference: {deliverable.evidence_reference}</p>
                        <p className="mt-1 font-mono text-[10px]">SHA-256 {deliverable.evidence_hash}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-stone-600">Deliverables appear after scope acceptance.</p>}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Observed outcome</h3>
            {outcome ? (
              <div className="mt-3 border border-stone-800 bg-black/20 p-4 text-sm text-stone-300">
                <p className="font-medium text-stone-100">{String(outcome.status || item.outcome_status)}</p>
                {Object.entries(outcome).filter(([key]) => key !== 'status').map(([key, value]) => (
                  <div key={key} className="mt-2 grid grid-cols-[110px_1fr] gap-3 text-xs">
                    <span className="text-stone-600">{key.replaceAll('_', ' ')}</span>
                    <span className="break-words text-stone-400">{value === null ? 'None attributed' : String(value)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-stone-600">No outcome has been presented as verified.</p>}
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Timeline integrity</h3>
                <p className="mt-1 text-xs text-stone-600">Versioned events and retained SHA-256 references.</p>
              </div>
              <span className={`text-[10px] font-medium uppercase tracking-[0.13em] ${timelineCountMatches ? 'text-lime-200' : 'text-rose-200'}`}>
                {timelineCountMatches ? `${detail.integrity.eventCount} recorded events` : 'Event count mismatch'}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2">
              <div className="border border-stone-800 p-3"><span className="text-stone-600">Event head</span><p className="mt-1 break-all font-mono text-stone-400">{detail.integrity.headHash || 'Not recorded'}</p></div>
              <div className="border border-stone-800 p-3"><span className="text-stone-600">Scope hash</span><p className="mt-1 break-all font-mono text-stone-400">{detail.integrity.scopeHash || 'Not recorded'}</p></div>
            </div>
            <ol className="mt-4 space-y-3">
              {detail.timeline.map(event => (
                <li key={`${event.sequence}-${event.event_hash}`} className="grid grid-cols-[42px_1fr] gap-3">
                  <div className="pt-1 font-mono text-[10px] text-stone-600">#{event.sequence}</div>
                  <div className="border-l border-stone-700 pl-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-stone-300">{event.event_type.replaceAll('_', ' ')}</p>
                      <p className="text-[10px] text-stone-600">v{event.aggregate_version} · {formatDate(event.occurred_at, true)}</p>
                    </div>
                    <p className="mt-1 text-[10px] text-stone-600">{event.from_state || 'Created'} → {event.to_state || event.from_state || 'Recorded'} · {event.actor_type}</p>
                    <p className="mt-1 font-mono text-[9px] text-stone-700">{shortHash(event.event_hash)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="border-t border-stone-800 bg-[#10130f] p-5 sm:p-6 xl:border-l xl:border-t-0">
          {commandPanel || (
            <div className="text-sm text-stone-500">No commands are available.</div>
          )}
        </aside>
      </div>
    </article>
  );
}

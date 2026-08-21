import { createHash } from 'crypto';

export const PROOF_SERVICE_CODE = 'WORKFLOW_SETUP_PILOT' as const;
export const PROOF_PRICE_CENTS = 15_000 as const;
export const PROOF_CURRENCY = 'USD' as const;

export const PROOF_DELIVERABLES = [
  { code: 'WORKFLOW_MAP', label: 'Written workflow map and handoff points' },
  { code: 'CLIENT_WORKSPACE', label: 'Client-owned folder or workspace structure' },
  { code: 'ESTIMATE_INVOICE', label: 'Estimate and invoice templates' },
  { code: 'INTAKE_FOLLOWUP', label: 'Customer intake form and follow-up scripts' },
  { code: 'EXPENSE_OPEN_WORK', label: 'Expense and open-work tracker' },
] as const;

export type ProofDeliverableCode = typeof PROOF_DELIVERABLES[number]['code'];
export const PROOF_STATES = [
  'RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED',
] as const;
export type ProofState = typeof PROOF_STATES[number];
export type ProofPaymentState = 'NOT_STARTED' | 'PAID' | 'REFUNDED';
export type ProofOutcomeState = 'PENDING' | 'VERIFIED' | 'UNVERIFIED';

export const PROOF_COMMANDS = [
  'BEGIN_REVIEW',
  'SET_NEXT_ACTION',
  'RECORD_SCOPE_ACCEPTANCE',
  'GENERATE_PAYMENT_LINK',
  'START_WORK',
  'COMPLETE_DELIVERABLE',
  'REOPEN_DELIVERABLE',
  'RECORD_HANDOFF',
  'RECORD_OUTCOME',
  'CLOSE_CASE',
  'CANCEL_CASE',
] as const;
export type ProofCommandType = typeof PROOF_COMMANDS[number];

export interface ProofSnapshot {
  state: ProofState;
  paymentState: ProofPaymentState;
  outcomeState: ProofOutcomeState;
  version: number;
  assignedUserId: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  activeScopeVersion: number | null;
  accessConfirmedAt: string | null;
  handoffRecordedAt: string | null;
  completedDeliverables: ProofDeliverableCode[];
  learning: string | null;
}

export interface AcceptedScope {
  targetResult: string;
  deliverables: Array<{ code: ProofDeliverableCode; detail: string }>;
  exclusions: string[];
  requiredAccess: string[];
  deliveryTargetBusinessDays: number;
  amountCents: typeof PROOF_PRICE_CENTS;
  currency: typeof PROOF_CURRENCY;
  acceptanceChannel: 'EMAIL' | 'SIGNED_DOCUMENT' | 'RECORDED_CALL';
  acceptanceReference: string;
  acceptedBy: string;
  acceptedAt: string;
}

export interface VerifiedOutcome {
  status: 'VERIFIED';
  baseline: string;
  observation: string;
  unit: string;
  period: string;
  source: string;
  evidenceRef: string;
  note: string;
  valueCents: number | null;
}

export interface UnverifiedOutcome {
  status: 'UNVERIFIED';
  reason: string;
  note: string;
  valueCents: null;
}

export type ProofOutcome = VerifiedOutcome | UnverifiedOutcome;
export type GateResult = { ok: true } | { ok: false; status: 409 | 422; code: string; message: string; unmet?: string[] };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function proofSingleLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControls.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function proofMultiLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n?/g, '\n');
  const withoutControls = Array.from(normalized, (character) => {
    const code = character.charCodeAt(0);
    const disallowed = code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    return disallowed ? '' : character;
  }).join('');
  return withoutControls
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function validProofReceipt(value: unknown): value is string {
  return typeof value === 'string' && /^svc_[A-Za-z0-9_-]{20,36}$/.test(value);
}

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,159}$/.test(value);
}

export function validExpectedVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isoDate(value: unknown): string | null {
  const timestamp = isoTimestamp(value);
  return timestamp ? timestamp.slice(0, 10) : null;
}

function safeReference(value: unknown, max = 500): string {
  const normalized = proofSingleLine(value, max);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
  } catch {
    // Non-URL client-owned labels and document IDs are allowed.
  }
  return normalized;
}

export function normalizeAcceptedScope(input: unknown):
  | { ok: true; value: AcceptedScope; hash: string }
  | { ok: false; errors: Record<string, string> } {
  const body = object(input);
  const targetResult = proofMultiLine(body.targetResult, 2000);
  const acceptanceChannel = proofSingleLine(body.acceptanceChannel, 32).toUpperCase() as AcceptedScope['acceptanceChannel'];
  const acceptanceReference = safeReference(body.acceptanceReference);
  const acceptedBy = proofSingleLine(body.acceptedBy, 160);
  const acceptedAt = isoTimestamp(body.acceptedAt);
  const deliveryTargetBusinessDays = Number(body.deliveryTargetBusinessDays ?? 7);
  const exclusions = Array.isArray(body.exclusions)
    ? body.exclusions.map(value => proofSingleLine(value, 500)).filter(Boolean).slice(0, 20)
    : [];
  const requiredAccess = Array.isArray(body.requiredAccess)
    ? body.requiredAccess.map(value => proofSingleLine(value, 500)).filter(Boolean).slice(0, 20)
    : [];
  const submitted = Array.isArray(body.deliverables) ? body.deliverables.map(object) : [];
  const deliverables = PROOF_DELIVERABLES.map(required => ({
    code: required.code,
    detail: proofMultiLine(submitted.find(item => item.code === required.code)?.detail || required.label, 1000),
  }));
  const submittedCodes = submitted.map(item => proofSingleLine(item.code, 40));
  const errors: Record<string, string> = {};

  if (targetResult.length < 20) errors.targetResult = 'Target result must be at least 20 characters.';
  if (submitted.length !== PROOF_DELIVERABLES.length
    || PROOF_DELIVERABLES.some(required => !submittedCodes.includes(required.code))
    || new Set(submittedCodes).size !== PROOF_DELIVERABLES.length) {
    errors.deliverables = 'The accepted scope must contain each of the five public deliverables exactly once.';
  }
  if (deliverables.some(item => item.detail.length < 5)) errors.deliverables = 'Every deliverable needs a bounded detail.';
  if (!Number.isInteger(deliveryTargetBusinessDays) || deliveryTargetBusinessDays < 1 || deliveryTargetBusinessDays > 30) {
    errors.deliveryTargetBusinessDays = 'Delivery target must be 1-30 business days.';
  }
  if (body.amountCents !== PROOF_PRICE_CENTS) errors.amountCents = 'The pilot price is server-fixed at $150.';
  if (body.currency !== PROOF_CURRENCY) errors.currency = 'The pilot currency is server-fixed at USD.';
  if (!['EMAIL', 'SIGNED_DOCUMENT', 'RECORDED_CALL'].includes(acceptanceChannel)) {
    errors.acceptanceChannel = 'Record the written or recorded acceptance channel.';
  }
  if (acceptanceReference.length < 3) errors.acceptanceReference = 'A safe acceptance reference is required.';
  if (acceptedBy.length < 2) errors.acceptedBy = 'Record who accepted the scope.';
  if (!acceptedAt) errors.acceptedAt = 'Acceptance time must be valid.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const value: AcceptedScope = {
    targetResult,
    deliverables,
    exclusions,
    requiredAccess,
    deliveryTargetBusinessDays,
    amountCents: PROOF_PRICE_CENTS,
    currency: PROOF_CURRENCY,
    acceptanceChannel,
    acceptanceReference,
    acceptedBy,
    acceptedAt: acceptedAt!,
  };
  return { ok: true, value, hash: proofHash(value) };
}

export function normalizeProofOutcome(input: unknown):
  | { ok: true; value: ProofOutcome }
  | { ok: false; errors: Record<string, string> } {
  const body = object(input);
  const status = proofSingleLine(body.status, 16).toUpperCase();
  const note = proofMultiLine(body.note, 4000);
  const errors: Record<string, string> = {};
  if (status === 'UNVERIFIED') {
    const reason = proofMultiLine(body.reason, 1000);
    if (reason.length < 10) errors.reason = 'Explain why the outcome is unverified.';
    if (note.length < 10) errors.note = 'Record the observed outcome without presenting it as verified.';
    if (body.valueCents !== null && body.valueCents !== undefined) errors.valueCents = 'Unverified outcomes cannot carry attributed value.';
    return Object.keys(errors).length
      ? { ok: false, errors }
      : { ok: true, value: { status: 'UNVERIFIED', reason, note, valueCents: null } };
  }
  if (status === 'VERIFIED') {
    const value: VerifiedOutcome = {
      status: 'VERIFIED',
      baseline: proofMultiLine(body.baseline, 1000),
      observation: proofMultiLine(body.observation, 1000),
      unit: proofSingleLine(body.unit, 100),
      period: proofSingleLine(body.period, 200),
      source: proofSingleLine(body.source, 500),
      evidenceRef: safeReference(body.evidenceRef),
      note,
      valueCents: body.valueCents === null || body.valueCents === undefined ? null : Number(body.valueCents),
    };
    for (const field of ['baseline', 'observation', 'unit', 'period', 'source', 'evidenceRef'] as const) {
      if (value[field].length < 3) errors[field] = `${field} is required for a verified outcome.`;
    }
    if (value.note.length < 10) errors.note = 'Outcome note must be at least 10 characters.';
    if (value.valueCents !== null && (!Number.isSafeInteger(value.valueCents) || value.valueCents < 0)) {
      errors.valueCents = 'Attributed value must be a non-negative whole number of cents.';
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
  }
  return { ok: false, errors: { status: 'Outcome must be VERIFIED or explicitly UNVERIFIED.' } };
}

export function evaluateProofCommand(
  snapshot: ProofSnapshot,
  command: ProofCommandType,
  context: { deliverableCode?: ProofDeliverableCode; outcome?: ProofOutcome; learning?: string; accessConfirmed?: boolean } = {},
): GateResult {
  const active = !['CLOSED', 'CANCELLED'].includes(snapshot.state);
  if (!active && command !== 'REOPEN_DELIVERABLE') {
    return { ok: false, status: 409, code: 'CASE_TERMINAL', message: 'Closed and cancelled cases are immutable.' };
  }
  switch (command) {
    case 'BEGIN_REVIEW':
      return snapshot.state === 'RECEIVED'
        ? { ok: true }
        : { ok: false, status: 409, code: 'REVIEW_NOT_AVAILABLE', message: 'Only a received inquiry can begin review.' };
    case 'SET_NEXT_ACTION':
      return active ? { ok: true } : { ok: false, status: 409, code: 'CASE_TERMINAL', message: 'Terminal cases cannot receive actions.' };
    case 'RECORD_SCOPE_ACCEPTANCE':
      return snapshot.state === 'IN_REVIEW'
        ? { ok: true }
        : { ok: false, status: 409, code: 'SCOPE_NOT_AVAILABLE', message: 'Scope acceptance requires an active review.' };
    case 'GENERATE_PAYMENT_LINK':
      if (snapshot.state !== 'SCOPE_ACCEPTED' || !snapshot.activeScopeVersion) {
        return { ok: false, status: 409, code: 'SCOPE_NOT_ACCEPTED', message: 'Checkout is unavailable until an immutable scope is accepted.' };
      }
      if (snapshot.paymentState !== 'NOT_STARTED') {
        return { ok: false, status: 409, code: 'PAYMENT_ALREADY_RECORDED', message: 'A paid or refunded case cannot create a new checkout.' };
      }
      return { ok: true };
    case 'START_WORK': {
      const unmet: string[] = [];
      if (snapshot.state !== 'SCOPE_ACCEPTED') unmet.push('accepted scope');
      if (snapshot.paymentState !== 'PAID') unmet.push('verified payment');
      if (!snapshot.assignedUserId) unmet.push('assigned owner');
      if (!snapshot.nextAction) unmet.push('next action');
      if (!snapshot.nextActionDueAt) unmet.push('next-action due date');
      if (!snapshot.accessConfirmedAt && context.accessConfirmed !== true) unmet.push('access readiness check');
      return unmet.length
        ? { ok: false, status: 409, code: 'START_GATE_FAILED', message: 'Work cannot start yet.', unmet }
        : { ok: true };
    }
    case 'COMPLETE_DELIVERABLE':
      if (snapshot.state !== 'IN_PROGRESS') return { ok: false, status: 409, code: 'WORK_NOT_STARTED', message: 'Deliverables can only complete during active work.' };
      if (!context.deliverableCode || !PROOF_DELIVERABLES.some(item => item.code === context.deliverableCode)) {
        return { ok: false, status: 422, code: 'UNKNOWN_DELIVERABLE', message: 'Use one of the five promised deliverables.' };
      }
      return { ok: true };
    case 'REOPEN_DELIVERABLE':
      return snapshot.state === 'IN_PROGRESS'
        ? { ok: true }
        : { ok: false, status: 409, code: 'REOPEN_NOT_AVAILABLE', message: 'Only active work can reopen a deliverable.' };
    case 'RECORD_HANDOFF': {
      const missing = PROOF_DELIVERABLES.filter(item => !snapshot.completedDeliverables.includes(item.code)).map(item => item.code);
      if (snapshot.state !== 'IN_PROGRESS') return { ok: false, status: 409, code: 'HANDOFF_NOT_AVAILABLE', message: 'Handoff requires active work.' };
      return missing.length
        ? { ok: false, status: 409, code: 'DELIVERABLES_INCOMPLETE', message: 'All five deliverables require evidence before handoff.', unmet: missing }
        : { ok: true };
    }
    case 'RECORD_OUTCOME':
      if (snapshot.state !== 'DELIVERED' || !context.outcome) {
        return { ok: false, status: 409, code: 'OUTCOME_NOT_AVAILABLE', message: 'Record an explicit outcome after evidenced delivery.' };
      }
      if (snapshot.outcomeState !== 'PENDING') {
        return { ok: false, status: 409, code: 'OUTCOME_ALREADY_RECORDED', message: 'Recorded outcome evidence is immutable. Add a correction event instead of replacing it.' };
      }
      return { ok: true };
    case 'CLOSE_CASE': {
      const learning = proofMultiLine(context.learning, 4000);
      const unmet: string[] = [];
      if (snapshot.state !== 'DELIVERED') unmet.push('delivered case');
      if (!snapshot.handoffRecordedAt) unmet.push('handoff record');
      if (snapshot.outcomeState === 'PENDING') unmet.push('verified or explicitly unverified outcome');
      if (learning.length < 20) unmet.push('Adapt learning of at least 20 characters');
      return unmet.length
        ? { ok: false, status: 409, code: 'CLOSE_GATE_FAILED', message: 'The proof is not ready to close.', unmet }
        : { ok: true };
    }
    case 'CANCEL_CASE':
      return ['RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS'].includes(snapshot.state)
        ? { ok: true }
        : { ok: false, status: 409, code: 'CANCEL_NOT_AVAILABLE', message: 'This case can no longer be cancelled through the normal path.' };
    default:
      return { ok: false, status: 422, code: 'UNKNOWN_COMMAND', message: 'Unknown Proof Desk command.' };
  }
}

export function proofHash(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return input;
  };
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function proofEventHash(input: {
  previousHash: string;
  caseId: string;
  sequence: number;
  type: string;
  actorType: string;
  actorId: string;
  occurredAt: string;
  payload: unknown;
}): string {
  return proofHash(input);
}

export function normalizeNextAction(input: unknown):
  | { ok: true; value: { nextAction: string; dueAt: string; assignedUserId: string } }
  | { ok: false; errors: Record<string, string> } {
  const body = object(input);
  const nextAction = proofMultiLine(body.nextAction, 1000);
  const dueAt = isoDate(body.dueAt);
  const assignedUserId = proofSingleLine(body.assignedUserId, 64);
  const errors: Record<string, string> = {};
  if (nextAction.length < 5) errors.nextAction = 'Next action must be at least 5 characters.';
  if (!dueAt) errors.dueAt = 'A valid due date is required.';
  if (!/^[0-9a-f-]{36}$/i.test(assignedUserId)) errors.assignedUserId = 'A valid assigned user is required.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { nextAction, dueAt: dueAt!, assignedUserId } };
}

export function normalizeDeliverableEvidence(input: unknown):
  | { ok: true; value: { code: ProofDeliverableCode; label: string; evidenceRef: string; evidenceHash: string } }
  | { ok: false; errors: Record<string, string> } {
  const body = object(input);
  const code = proofSingleLine(body.code, 40) as ProofDeliverableCode;
  const label = proofMultiLine(body.label, 1000);
  const evidenceRef = safeReference(body.evidenceRef);
  const suppliedHash = proofSingleLine(body.evidenceHash, 64).toLowerCase();
  const evidenceHash = suppliedHash || proofHash({ code, label, evidenceRef });
  const errors: Record<string, string> = {};
  if (!PROOF_DELIVERABLES.some(item => item.code === code)) errors.code = 'Unknown deliverable code.';
  if (label.length < 5) errors.label = 'Evidence label must be at least 5 characters.';
  if (evidenceRef.length < 3) errors.evidenceRef = 'A safe client-owned evidence reference is required.';
  if (!/^[a-f0-9]{64}$/.test(evidenceHash)) errors.evidenceHash = 'Evidence integrity hash must be SHA-256.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { code, label, evidenceRef, evidenceHash } };
}

export function proofCheckoutMatchesAuthority(session: {
  id?: unknown;
  mode?: unknown;
  payment_status?: unknown;
  client_reference_id?: unknown;
  payment_intent?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: Record<string, string> | null;
}, authority: {
  receiptId: string;
  caseId: string;
  scopeHash: string;
  amountCents: number;
  currency: string;
  checkoutSessionId?: string | null;
}): { ok: true; checkoutSessionId: string; paymentIntentId: string } | { ok: false; reason: string } {
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent && typeof session.payment_intent === 'object' && 'id' in session.payment_intent
      ? String((session.payment_intent as { id?: unknown }).id || '')
      : '';
  const expectedMetadata = {
    proofCaseId: authority.caseId,
    receiptId: authority.receiptId,
    scopeHash: authority.scopeHash,
    amountCents: String(authority.amountCents),
    currency: authority.currency.toLowerCase(),
    serviceCode: PROOF_SERVICE_CODE,
  };
  const mismatch = Object.entries(expectedMetadata).find(([key, value]) => session.metadata?.[key] !== value);
  if (session.mode !== 'payment') return { ok: false, reason: 'mode' };
  if (session.payment_status !== 'paid') return { ok: false, reason: 'payment_status' };
  if (typeof session.id !== 'string' || !session.id) return { ok: false, reason: 'session_id' };
  if (authority.checkoutSessionId && session.id !== authority.checkoutSessionId) {
    return { ok: false, reason: 'issued_session' };
  }
  if (session.client_reference_id !== authority.receiptId) return { ok: false, reason: 'receipt' };
  if (Number(session.amount_total) !== authority.amountCents) return { ok: false, reason: 'amount' };
  if (String(session.currency || '').toLowerCase() !== authority.currency.toLowerCase()) return { ok: false, reason: 'currency' };
  if (mismatch) return { ok: false, reason: `metadata:${mismatch[0]}` };
  if (!paymentIntentId) return { ok: false, reason: 'payment_intent' };
  return { ok: true, checkoutSessionId: session.id, paymentIntentId };
}

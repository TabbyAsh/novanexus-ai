import { Router, type NextFunction, type Request, type Response } from 'express';
import { query, transaction } from '@nova/shared';
import {
  PROOF_COMMANDS,
  PROOF_DELIVERABLES,
  evaluateProofCommand,
  normalizeAcceptedScope,
  normalizeDeliverableEvidence,
  normalizeNextAction,
  normalizeProofOutcome,
  proofEventHash,
  proofHash,
  proofMultiLine,
  proofSingleLine,
  validExpectedVersion,
  validIdempotencyKey,
  validProofReceipt,
  type ProofCommandType,
  type ProofDeliverableCode,
  type ProofOutcome,
  type ProofSnapshot,
  type ProofState,
} from '@nova/proof-core';

type ProofRequest = Request & {
  user?: { userId: string; orgId: string; role: string; scopes: string[] };
};

type ProofCaseRow = {
  id: string;
  receipt_id: string;
  service_code: string;
  name: string;
  email: string;
  business: string;
  challenge: string;
  status: ProofState;
  payment_status: 'NOT_STARTED' | 'PAID' | 'REFUNDED';
  org_id: string | null;
  version: number;
  assigned_user_id: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  active_scope_version: number | null;
  access_confirmed_at: string | null;
  work_started_at: string | null;
  handoff_recorded_at: string | null;
  delivered_at: string | null;
  outcome_status: 'PENDING' | 'VERIFIED' | 'UNVERIFIED';
  outcome_json: unknown;
  learning: string | null;
  risk_code: string | null;
  cancel_reason: string | null;
  closed_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  checkout_generated_at: string | null;
  checkout_scope_hash: string | null;
  created_at: string;
  updated_at: string;
};

type ProofScopeRow = {
  id: string;
  version: number;
  target_result: string;
  deliverables_json: unknown;
  exclusions_json: unknown;
  required_access_json: unknown;
  delivery_target_business_days: number;
  amount_cents: number;
  currency: string;
  acceptance_channel: string;
  acceptance_reference: string;
  accepted_by: string;
  accepted_at: string;
  scope_hash: string;
  created_at: string;
};

type ProofDeliverableRow = {
  code: ProofDeliverableCode;
  label: string;
  status: 'OPEN' | 'COMPLETE';
  evidence_reference: string | null;
  evidence_hash: string | null;
  completed_at: string | null;
  updated_at: string;
};

type ProofEventRow = {
  sequence: number;
  aggregate_version: number;
  actor_type: string;
  actor_id: string;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  payload_json: Record<string, unknown> | string;
  event_hash: string;
  occurred_at: string;
};

class ProofDeskError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function requireProofAuthority(req: ProofRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'PROOF_AUTH_REQUIRED', message: 'Authentication required.' } });
  }
  if (!req.user.scopes.includes('ops.admin')) {
    return res.status(403).json({ success: false, error: { code: 'PROOF_AUTHORITY_REQUIRED', message: 'Proof Desk is limited to the configured platform operator.' } });
  }
  next();
}

function parseJson<T>(value: T | string | null): T | null {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function decodeCursor(value: unknown): { createdAt: string; id: string } | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const createdAt = typeof parsed.createdAt === 'string' ? new Date(parsed.createdAt).toISOString() : '';
    const id = typeof parsed.id === 'string' && /^[0-9a-f-]{36}$/i.test(parsed.id) ? parsed.id : '';
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id })).toString('base64url');
}

function toSnapshot(row: ProofCaseRow, deliverables: ProofDeliverableRow[]): ProofSnapshot {
  return {
    state: row.status,
    paymentState: row.payment_status,
    outcomeState: row.outcome_status,
    version: Number(row.version),
    assignedUserId: row.assigned_user_id,
    nextAction: row.next_action,
    nextActionDueAt: row.next_action_due_at,
    activeScopeVersion: row.active_scope_version === null ? null : Number(row.active_scope_version),
    accessConfirmedAt: row.access_confirmed_at,
    handoffRecordedAt: row.handoff_recorded_at,
    completedDeliverables: deliverables.filter(item => item.status === 'COMPLETE').map(item => item.code),
    learning: row.learning,
  };
}

async function loadCase(client: any, receiptId: string, orgId: string, lock = false): Promise<ProofCaseRow | null> {
  const result = await client.query(
    `SELECT * FROM service_inquiries
     WHERE receipt_id = $1 AND (org_id IS NULL OR org_id = $2)
     ${lock ? 'FOR UPDATE' : ''}`,
    [receiptId, orgId],
  );
  return result.rows[0] || null;
}

async function loadDeliverables(client: any, inquiryId: string): Promise<ProofDeliverableRow[]> {
  const result = await client.query(
    `SELECT code, label, status, evidence_reference, evidence_hash, completed_at, updated_at
     FROM service_case_deliverables WHERE inquiry_id = $1 ORDER BY code`,
    [inquiryId],
  );
  return result.rows;
}

async function appendProofEvent(client: any, input: {
  row: ProofCaseRow;
  orgId: string;
  aggregateVersion: number;
  actorType: 'USER' | 'SYSTEM';
  actorId: string;
  eventType: string;
  fromState: ProofState | null;
  toState: ProofState | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string | null;
  occurredAt?: string;
}): Promise<void> {
  const last = await client.query(
    `SELECT sequence, event_hash FROM service_case_events
     WHERE inquiry_id = $1 ORDER BY sequence DESC LIMIT 1`,
    [input.row.id],
  );
  const sequence = Number(last.rows[0]?.sequence || 0) + 1;
  const previousHash = last.rows[0]?.event_hash || '0'.repeat(64);
  const occurredAt = input.occurredAt || new Date().toISOString();
  const eventHash = proofEventHash({
    previousHash,
    caseId: input.row.id,
    sequence,
    type: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    occurredAt,
    payload: input.payload,
  });
  await client.query(
    `INSERT INTO service_case_events (
       inquiry_id, org_id, sequence, aggregate_version, actor_type, actor_id,
       event_type, from_state, to_state, payload_json, idempotency_key,
       request_id, previous_hash, event_hash, occurred_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      input.row.id, input.orgId, sequence, input.aggregateVersion, input.actorType, input.actorId,
      input.eventType, input.fromState, input.toState, JSON.stringify(input.payload), input.idempotencyKey,
      input.requestId, previousHash, eventHash, occurredAt,
    ],
  );
}

async function fullCase(receiptId: string, orgId: string) {
  return transaction(async client => {
    const row = await loadCase(client, receiptId, orgId);
    if (!row) return null;
    const [scopeResult, deliverableResult, eventResult] = await Promise.all([
      client.query(
        `SELECT id, version, target_result, deliverables_json, exclusions_json, required_access_json,
                delivery_target_business_days, amount_cents, currency, acceptance_channel,
                acceptance_reference, accepted_by, accepted_at, scope_hash, created_at
         FROM service_case_scopes WHERE inquiry_id = $1 AND version = $2`,
        [row.id, row.active_scope_version],
      ),
      client.query(
        `SELECT code, label, status, evidence_reference, evidence_hash, completed_at, updated_at
         FROM service_case_deliverables WHERE inquiry_id = $1 ORDER BY code`,
        [row.id],
      ),
      client.query(
        `SELECT sequence, aggregate_version, actor_type, actor_id, event_type, from_state, to_state,
                payload_json, event_hash, occurred_at
         FROM service_case_events WHERE inquiry_id = $1 ORDER BY sequence`,
        [row.id],
      ),
    ]);
    const scope = (scopeResult.rows[0] || null) as ProofScopeRow | null;
    const deliverables = deliverableResult.rows as ProofDeliverableRow[];
    const events = (eventResult.rows as ProofEventRow[]).map(event => ({ ...event, payload_json: parseJson(event.payload_json) || {} }));
    return {
      case: row,
      scope: scope ? {
        ...scope,
        deliverables_json: parseJson(scope.deliverables_json) || [],
        exclusions_json: parseJson(scope.exclusions_json) || [],
        required_access_json: parseJson(scope.required_access_json) || [],
      } : null,
      deliverables,
      timeline: events,
      integrity: {
        eventCount: events.length,
        headHash: events.at(-1)?.event_hash || null,
        scopeHash: scope?.scope_hash || null,
      },
    };
  });
}

async function commandTransaction(input: {
  receiptId: string;
  userId: string;
  orgId: string;
  command: ProofCommandType;
  expectedVersion: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string | null;
}): Promise<{ idempotent: boolean; version: number }> {
  return transaction(async client => {
    const row = await loadCase(client, input.receiptId, input.orgId, true);
    if (!row) throw new ProofDeskError(404, 'PROOF_NOT_FOUND', 'No proof case exists for that receipt.');

    const commandHash = proofHash({ command: input.command, payload: input.payload });
    const prior = await client.query(
      `SELECT payload_json, aggregate_version FROM service_case_events
       WHERE inquiry_id = $1 AND idempotency_key = $2`,
      [row.id, input.idempotencyKey],
    );
    if (prior.rows[0]) {
      const priorPayload = parseJson<Record<string, unknown>>(prior.rows[0].payload_json) || {};
      if (priorPayload.commandHash !== commandHash) {
        throw new ProofDeskError(409, 'IDEMPOTENCY_KEY_REUSED', 'That idempotency key was already used for a different command.');
      }
      return { idempotent: true, version: Number(prior.rows[0].aggregate_version) };
    }

    if (Number(row.version) !== input.expectedVersion) {
      throw new ProofDeskError(409, 'STALE_PROOF_VERSION', 'The case changed. Reload it before issuing another command.', {
        expected: input.expectedVersion,
        current: Number(row.version),
      });
    }
    if (!row.org_id && input.command !== 'BEGIN_REVIEW') {
      throw new ProofDeskError(409, 'REVIEW_NOT_STARTED', 'Begin review before changing an unassigned inquiry.');
    }
    if (row.org_id && row.org_id !== input.orgId) {
      throw new ProofDeskError(404, 'PROOF_NOT_FOUND', 'No proof case exists for that receipt.');
    }

    const deliverables = await loadDeliverables(client, row.id);
    const snapshot = toSnapshot(row, deliverables);
    let context: Parameters<typeof evaluateProofCommand>[2] = {};
    let normalizedOutcome: ProofOutcome | null = null;

    if (input.command === 'COMPLETE_DELIVERABLE' || input.command === 'REOPEN_DELIVERABLE') {
      context.deliverableCode = proofSingleLine(input.payload.code, 40) as ProofDeliverableCode;
    }
    if (input.command === 'START_WORK') context.accessConfirmed = input.payload.accessConfirmed === true;
    if (input.command === 'RECORD_OUTCOME') {
      const normalized = normalizeProofOutcome(input.payload);
      if (normalized.ok === false) throw new ProofDeskError(422, 'INVALID_OUTCOME', 'Outcome evidence is incomplete.', normalized.errors);
      normalizedOutcome = normalized.value;
      context.outcome = normalized.value;
    }
    if (input.command === 'CLOSE_CASE') context.learning = proofMultiLine(input.payload.learning, 4000);

    if (input.command === 'GENERATE_PAYMENT_LINK') {
      throw new ProofDeskError(422, 'CHECKOUT_OWNED_BY_BILLING', 'Use the governed service-checkout endpoint so Stripe can bind amount, scope, and receipt.');
    }
    const gate = evaluateProofCommand(snapshot, input.command, context);
    if (gate.ok === false) throw new ProofDeskError(gate.status, gate.code, gate.message, gate.unmet);

    const fromState = row.status;
    let toState = fromState;
    let eventType = `proof.${input.command.toLowerCase()}`;
    let eventPayload: Record<string, unknown> = { commandHash };
    const nextVersion = Number(row.version) + 1;

    switch (input.command) {
      case 'BEGIN_REVIEW':
        toState = 'IN_REVIEW';
        await client.query(
          `UPDATE service_inquiries
           SET status = 'IN_REVIEW', org_id = $2, assigned_user_id = $3,
               version = version + 1, updated_at = NOW()
           WHERE id = $1`,
          [row.id, input.orgId, input.userId],
        );
        eventPayload = { ...eventPayload, assigned: true };
        break;

      case 'SET_NEXT_ACTION': {
        const normalized = normalizeNextAction(input.payload);
        if (normalized.ok === false) throw new ProofDeskError(422, 'INVALID_NEXT_ACTION', 'Next action is incomplete.', normalized.errors);
        const membership = await client.query(
          `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2 AND role <> 'BOT'`,
          [input.orgId, normalized.value.assignedUserId],
        );
        if (!membership.rows[0]) throw new ProofDeskError(422, 'ASSIGNEE_NOT_AUTHORIZED', 'Assignee must be a human member of this organization.');
        await client.query(
          `UPDATE service_inquiries SET assigned_user_id = $2, next_action = $3,
             next_action_due_at = $4, version = version + 1, updated_at = NOW()
           WHERE id = $1`,
          [row.id, normalized.value.assignedUserId, normalized.value.nextAction, normalized.value.dueAt],
        );
        eventPayload = {
          ...eventPayload,
          assignedUserId: normalized.value.assignedUserId,
          dueAt: normalized.value.dueAt,
          nextActionHash: proofHash(normalized.value.nextAction),
        };
        break;
      }

      case 'RECORD_SCOPE_ACCEPTANCE': {
        const normalized = normalizeAcceptedScope(input.payload);
        if (normalized.ok === false) throw new ProofDeskError(422, 'INVALID_ACCEPTED_SCOPE', 'Accepted scope is incomplete.', normalized.errors);
        const scopeVersion = Number(row.active_scope_version || 0) + 1;
        const inserted = await client.query(
          `INSERT INTO service_case_scopes (
             inquiry_id, version, target_result, deliverables_json, exclusions_json, required_access_json,
             delivery_target_business_days, amount_cents, currency, acceptance_channel,
             acceptance_reference, accepted_by, accepted_at, scope_hash, created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [
            row.id, scopeVersion, normalized.value.targetResult, JSON.stringify(normalized.value.deliverables),
            JSON.stringify(normalized.value.exclusions), JSON.stringify(normalized.value.requiredAccess),
            normalized.value.deliveryTargetBusinessDays, normalized.value.amountCents, normalized.value.currency,
            normalized.value.acceptanceChannel, normalized.value.acceptanceReference, normalized.value.acceptedBy,
            normalized.value.acceptedAt, normalized.hash, input.userId,
          ],
        );
        for (const deliverable of PROOF_DELIVERABLES) {
          const detail = normalized.value.deliverables.find(item => item.code === deliverable.code)?.detail || deliverable.label;
          await client.query(
            `INSERT INTO service_case_deliverables (inquiry_id, scope_id, code, label)
             VALUES ($1,$2,$3,$4)`,
            [row.id, inserted.rows[0].id, deliverable.code, detail],
          );
        }
        toState = 'SCOPE_ACCEPTED';
        await client.query(
          `UPDATE service_inquiries SET status = 'SCOPE_ACCEPTED', active_scope_version = $2,
             version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id, scopeVersion],
        );
        eventPayload = {
          ...eventPayload,
          scopeVersion,
          scopeHash: normalized.hash,
          amountCents: normalized.value.amountCents,
          currency: normalized.value.currency,
        };
        break;
      }

      case 'START_WORK':
        toState = 'IN_PROGRESS';
        await client.query(
          `UPDATE service_inquiries SET status = 'IN_PROGRESS', access_confirmed_at = NOW(),
             work_started_at = NOW(), version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id],
        );
        eventPayload = { ...eventPayload, accessConfirmed: true };
        break;

      case 'COMPLETE_DELIVERABLE': {
        const normalized = normalizeDeliverableEvidence(input.payload);
        if (normalized.ok === false) throw new ProofDeskError(422, 'INVALID_DELIVERABLE_EVIDENCE', 'Deliverable evidence is incomplete.', normalized.errors);
        const completed = await client.query(
          `UPDATE service_case_deliverables
           SET status = 'COMPLETE', evidence_reference = $3, evidence_hash = $4,
               completed_by_user_id = $5, completed_at = NOW(), updated_at = NOW()
           WHERE inquiry_id = $1 AND code = $2 AND status = 'OPEN' RETURNING id`,
          [row.id, normalized.value.code, normalized.value.evidenceRef, normalized.value.evidenceHash, input.userId],
        );
        if (!completed.rows[0]) throw new ProofDeskError(409, 'DELIVERABLE_NOT_OPEN', 'That deliverable is already complete or unavailable.');
        await client.query(`UPDATE service_inquiries SET version = version + 1, updated_at = NOW() WHERE id = $1`, [row.id]);
        eventPayload = {
          ...eventPayload,
          code: normalized.value.code,
          evidenceHash: normalized.value.evidenceHash,
          evidenceReferenceHash: proofHash(normalized.value.evidenceRef),
        };
        break;
      }

      case 'REOPEN_DELIVERABLE': {
        const code = context.deliverableCode!;
        const reopened = await client.query(
          `UPDATE service_case_deliverables
           SET status = 'OPEN', evidence_reference = NULL, evidence_hash = NULL,
               completed_by_user_id = NULL, completed_at = NULL, updated_at = NOW()
           WHERE inquiry_id = $1 AND code = $2 AND status = 'COMPLETE' RETURNING id`,
          [row.id, code],
        );
        if (!reopened.rows[0]) throw new ProofDeskError(409, 'DELIVERABLE_NOT_COMPLETE', 'That deliverable is not complete.');
        await client.query(`UPDATE service_inquiries SET version = version + 1, updated_at = NOW() WHERE id = $1`, [row.id]);
        eventPayload = { ...eventPayload, code };
        break;
      }

      case 'RECORD_HANDOFF': {
        const handoffNote = proofMultiLine(input.payload.handoffNote, 2000);
        if (input.payload.accessReturned !== true || handoffNote.length < 10) {
          throw new ProofDeskError(422, 'INVALID_HANDOFF', 'Confirm access handback and record a handoff note of at least 10 characters.');
        }
        toState = 'DELIVERED';
        await client.query(
          `UPDATE service_inquiries SET status = 'DELIVERED', handoff_recorded_at = NOW(), delivered_at = NOW(),
             next_action = 'Record the observed outcome and verification status',
             next_action_due_at = CURRENT_DATE + 14,
             version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id],
        );
        eventPayload = { ...eventPayload, accessReturned: true, handoffNoteHash: proofHash(handoffNote) };
        break;
      }

      case 'RECORD_OUTCOME':
        await client.query(
          `UPDATE service_inquiries SET outcome_status = $2, outcome_json = $3,
             version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id, normalizedOutcome!.status, JSON.stringify(normalizedOutcome)],
        );
        eventPayload = {
          ...eventPayload,
          outcomeStatus: normalizedOutcome!.status,
          outcomeHash: proofHash(normalizedOutcome),
          attributedValueCents: normalizedOutcome!.valueCents,
        };
        break;

      case 'CLOSE_CASE': {
        const learning = proofMultiLine(input.payload.learning, 4000);
        toState = 'CLOSED';
        await client.query(
          `UPDATE service_inquiries SET status = 'CLOSED', learning = $2, closed_at = NOW(),
             next_action = NULL, next_action_due_at = NULL,
             version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id, learning],
        );
        eventPayload = { ...eventPayload, learningHash: proofHash(learning) };
        break;
      }

      case 'CANCEL_CASE': {
        const reason = proofMultiLine(input.payload.reason, 2000);
        if (reason.length < 10) throw new ProofDeskError(422, 'INVALID_CANCEL_REASON', 'Cancellation reason must be at least 10 characters.');
        toState = 'CANCELLED';
        const riskCode = row.payment_status === 'PAID' ? 'REFUND_REQUIRED' : row.risk_code;
        await client.query(
          `UPDATE service_inquiries SET status = 'CANCELLED', cancel_reason = $2,
             risk_code = $3, closed_at = NOW(), next_action = NULL, next_action_due_at = NULL,
             version = version + 1, updated_at = NOW() WHERE id = $1`,
          [row.id, reason, riskCode],
        );
        eventPayload = { ...eventPayload, reasonHash: proofHash(reason), riskCode };
        break;
      }
    }

    await appendProofEvent(client, {
      row,
      orgId: input.orgId,
      aggregateVersion: nextVersion,
      actorType: 'USER',
      actorId: input.userId,
      eventType,
      fromState,
      toState,
      payload: eventPayload,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
    });
    return { idempotent: false, version: nextVersion };
  });
}

function proofMarkdown(data: NonNullable<Awaited<ReturnType<typeof fullCase>>>): string {
  const item = data.case;
  const scope = data.scope;
  const lines = [
    `# Nova Proof ${item.receipt_id}`,
    '',
    `- Business: ${item.business}`,
    `- State: ${item.status}`,
    `- Payment: ${item.payment_status}`,
    `- Outcome: ${item.outcome_status}`,
    `- Opened: ${item.created_at}`,
    `- Closed: ${item.closed_at || 'Open'}`,
    '',
    '## Original need',
    '',
    item.challenge,
    '',
    '## Accepted scope',
    '',
    scope ? `Scope v${scope.version} · SHA-256 ${scope.scope_hash}` : 'No accepted scope.',
    scope ? scope.target_result : '',
    '',
    '## Deliverables',
    '',
    ...data.deliverables.map(deliverable => `- [${deliverable.status === 'COMPLETE' ? 'x' : ' '}] ${deliverable.label}${deliverable.evidence_hash ? ` · ${deliverable.evidence_hash}` : ''}`),
    '',
    '## Outcome',
    '',
    item.outcome_json ? JSON.stringify(parseJson(item.outcome_json), null, 2) : 'Outcome pending.',
    '',
    '## Adapt learning',
    '',
    item.learning || 'Learning pending.',
    '',
    '## Audit integrity',
    '',
    `- Events: ${data.integrity.eventCount}`,
    `- Event head: ${data.integrity.headHash || 'No events'}`,
    `- Scope hash: ${data.integrity.scopeHash || 'No scope'}`,
    '',
  ];
  return lines.join('\n');
}

export function createProofDeskRouter(): Router {
  const router = Router();
  router.use(requireProofAuthority);

  router.get('/', async (req: ProofRequest, res: Response) => {
    const allowed = new Set(['RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED']);
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (status && !allowed.has(status)) return res.status(400).json({ success: false, error: { code: 'INVALID_PROOF_STATUS' } });
    const limitValue = Number(req.query.limit || 30);
    const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, Math.floor(limitValue))) : 30;
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
    if (req.query.cursor && !cursor) return res.status(400).json({ success: false, error: { code: 'INVALID_CURSOR' } });

    try {
      const [caseResult, pulseResult] = await Promise.all([
        query<ProofCaseRow & { age_days: number }>(
          `SELECT id, receipt_id, service_code, business, status, payment_status, version,
                  next_action, next_action_due_at, risk_code, outcome_status, created_at, updated_at,
                  EXTRACT(DAY FROM NOW() - created_at)::int AS age_days
           FROM service_inquiries
           WHERE (org_id IS NULL OR org_id = $1)
             AND ($2::text = '' OR status = $2)
             AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
           ORDER BY created_at DESC, id DESC LIMIT $5`,
          [req.user!.orgId, status, cursor?.createdAt || null, cursor?.id || null, limit + 1],
        ),
        query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'RECEIVED')::int AS new_inquiries,
             COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::int AS awaiting_review,
             COUNT(*) FILTER (WHERE status = 'SCOPE_ACCEPTED' AND payment_status = 'NOT_STARTED')::int AS awaiting_payment,
             COUNT(*) FILTER (WHERE status = 'SCOPE_ACCEPTED' AND payment_status = 'PAID')::int AS ready_to_start,
             COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS active_work,
             COUNT(*) FILTER (WHERE status = 'DELIVERED' AND outcome_status = 'PENDING')::int AS awaiting_outcome,
             COUNT(*) FILTER (WHERE outcome_status = 'VERIFIED')::int AS verified_outcomes,
             COUNT(*) FILTER (WHERE next_action_due_at < CURRENT_DATE AND status NOT IN ('CLOSED','CANCELLED'))::int AS overdue_actions,
             COUNT(*) FILTER (WHERE risk_code IS NOT NULL)::int AS risk_flags,
             COALESCE(SUM(scope.amount_cents) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS cash_collected_cents
           FROM service_inquiries inquiry
           LEFT JOIN service_case_scopes scope
             ON scope.inquiry_id = inquiry.id AND scope.version = inquiry.active_scope_version
           WHERE (inquiry.org_id IS NULL OR inquiry.org_id = $1)`,
          [req.user!.orgId],
        ),
      ]);
      const hasMore = caseResult.rows.length > limit;
      const cases = hasMore ? caseResult.rows.slice(0, limit) : caseResult.rows;
      return res.json({
        success: true,
        data: {
          pulse: pulseResult.rows[0],
          cases,
          page: { nextCursor: hasMore ? encodeCursor(cases.at(-1)!) : null, hasMore },
          asOf: new Date().toISOString(),
        },
      });
    } catch (error) {
      return res.status(503).json({ success: false, error: { code: 'PROOF_DESK_UNAVAILABLE', message: 'Proof Desk could not be read.' } });
    }
  });

  router.get('/:receipt', async (req: ProofRequest, res: Response) => {
    if (!validProofReceipt(req.params.receipt)) return res.status(404).json({ success: false, error: { code: 'PROOF_NOT_FOUND' } });
    try {
      const data = await fullCase(req.params.receipt, req.user!.orgId);
      return data
        ? res.json({ success: true, data })
        : res.status(404).json({ success: false, error: { code: 'PROOF_NOT_FOUND' } });
    } catch {
      return res.status(503).json({ success: false, error: { code: 'PROOF_DESK_UNAVAILABLE' } });
    }
  });

  router.post('/:receipt/commands', async (req: ProofRequest, res: Response) => {
    const receiptId = req.params.receipt;
    const command = proofSingleLine(req.body?.command, 64).toUpperCase() as ProofCommandType;
    const expectedVersion = Number(req.body?.expectedVersion);
    const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
      ? req.body.payload as Record<string, unknown>
      : {};
    const idempotencyKey = req.get('Idempotency-Key');
    if (!validProofReceipt(receiptId)) return res.status(404).json({ success: false, error: { code: 'PROOF_NOT_FOUND' } });
    if (!PROOF_COMMANDS.includes(command)) return res.status(422).json({ success: false, error: { code: 'UNKNOWN_PROOF_COMMAND' } });
    if (!validExpectedVersion(expectedVersion)) return res.status(422).json({ success: false, error: { code: 'EXPECTED_VERSION_REQUIRED' } });
    if (!validIdempotencyKey(idempotencyKey)) return res.status(422).json({ success: false, error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    try {
      const result = await commandTransaction({
        receiptId,
        userId: req.user!.userId,
        orgId: req.user!.orgId,
        command,
        expectedVersion,
        payload,
        idempotencyKey,
        requestId: req.get('X-Request-ID') || null,
      });
      const data = await fullCase(receiptId, req.user!.orgId);
      return res.json({ success: true, data: { ...data, command: result } });
    } catch (error) {
      if (error instanceof ProofDeskError) {
        return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, details: error.details } });
      }
      return res.status(500).json({ success: false, error: { code: 'PROOF_COMMAND_FAILED', message: 'The command was not committed.' } });
    }
  });

  router.get('/:receipt/export', async (req: ProofRequest, res: Response) => {
    const receiptId = req.params.receipt;
    if (!validProofReceipt(receiptId)) return res.status(404).json({ success: false, error: { code: 'PROOF_NOT_FOUND' } });
    const requestId = req.get('X-Request-ID') || `manual-${Date.now()}`;
    try {
      await transaction(async client => {
        const row = await loadCase(client, receiptId, req.user!.orgId, true);
        if (!row) throw new ProofDeskError(404, 'PROOF_NOT_FOUND', 'No proof case exists for that receipt.');
        const idempotencyKey = `export:${requestId}`.slice(0, 160);
        const existing = await client.query(
          `SELECT id FROM service_case_events WHERE inquiry_id = $1 AND idempotency_key = $2`,
          [row.id, idempotencyKey],
        );
        if (!existing.rows[0]) {
          await appendProofEvent(client, {
            row,
            orgId: req.user!.orgId,
            aggregateVersion: Number(row.version),
            actorType: 'USER',
            actorId: req.user!.userId,
            eventType: 'proof.exported',
            fromState: row.status,
            toState: row.status,
            payload: { format: 'markdown', commandHash: proofHash({ receiptId, format: 'markdown' }) },
            idempotencyKey,
            requestId,
          });
        }
      });
      const data = await fullCase(receiptId, req.user!.orgId);
      if (!data) return res.status(404).json({ success: false, error: { code: 'PROOF_NOT_FOUND' } });
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="nova-proof-${receiptId}.md"`);
      return res.send(proofMarkdown(data));
    } catch (error) {
      if (error instanceof ProofDeskError) return res.status(error.status).json({ success: false, error: { code: error.code } });
      return res.status(500).json({ success: false, error: { code: 'PROOF_EXPORT_FAILED' } });
    }
  });

  return router;
}

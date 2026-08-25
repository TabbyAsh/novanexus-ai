import {
  WORKFLOW_PILOT_PAYMENT_AUTHORITY,
  serviceInquiryPaymentDecision,
  servicePaymentAlertBackoffMs,
  subscriptionStateEventDecision,
  type EntitlementPlan,
  type EntitlementStatus,
  type ServiceInquiryPaymentDecision,
  type ServiceInquiryPaymentRow,
  type ServicePaymentReference,
  type SubscriptionEntitlementCandidate,
  type SubscriptionEventKind,
} from './billing-contract';

export interface SqlResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

export interface SqlClient {
  query<T = any>(text: string, values?: any[]): Promise<SqlResult<T>>;
}

type EntitlementEventRow = {
  user_id: string;
  org_id: string;
  plan: string;
  status: EntitlementStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  features_json: unknown;
  stripe_subscription_event_created: string | number | null;
  stripe_subscription_event_id: string | null;
  stripe_subscription_event_kind: SubscriptionEventKind | null;
  stripe_subscription_event_rank: string | number | null;
  stripe_subscription_terminal: boolean | null;
};

export type ApplySubscriptionEventInput = {
  eventId: string;
  eventCreated: number;
  eventKind: SubscriptionEventKind;
  subscriptionId: string | null;
  customerId: string | null;
  metadataUserId: string | null;
  metadataOrgId: string | null;
  candidate: SubscriptionEntitlementCandidate;
  detectedPlan: EntitlementPlan | null;
  accessFeatures: unknown;
  freeFeatures: unknown;
};

export type ApplySubscriptionEventResult =
  | {
      kind: 'APPLIED' | 'FAIL_CLOSED';
      userId: string;
      status: EntitlementStatus;
      plan: string;
      reason: string;
      terminal: boolean;
    }
  | {
      kind: 'IGNORED';
      userId: string | null;
      reason: string;
    }
  | {
      kind: 'UNRESOLVED';
      userId: string | null;
      reason: string;
    };

const ENTITLEMENT_EVENT_COLUMNS = `
  user_id, org_id, plan, status, stripe_customer_id, stripe_subscription_id,
  current_period_end, features_json, stripe_subscription_event_created,
  stripe_subscription_event_id, stripe_subscription_event_kind,
  stripe_subscription_event_rank, stripe_subscription_terminal`;

async function findEntitlementForEvent(
  client: SqlClient,
  input: ApplySubscriptionEventInput,
): Promise<{ row: EntitlementEventRow | null; resolvedBy: 'SUBSCRIPTION' | 'USER' | null }> {
  if (input.subscriptionId) {
    const bySubscription = await client.query<EntitlementEventRow>(
      `SELECT ${ENTITLEMENT_EVENT_COLUMNS}
       FROM entitlements
       WHERE stripe_subscription_id = $1
       FOR UPDATE`,
      [input.subscriptionId],
    );
    if (bySubscription.rows[0]) return { row: bySubscription.rows[0], resolvedBy: 'SUBSCRIPTION' };
  }

  // Payment-failure events are never allowed to bind by customer or metadata.
  // A one-time invoice can share a customer with an unrelated subscription.
  if (input.eventKind !== 'PAYMENT_FAILED' && input.metadataUserId) {
    const byUser = await client.query<EntitlementEventRow>(
      `SELECT ${ENTITLEMENT_EVENT_COLUMNS}
       FROM entitlements
       WHERE user_id = $1
       FOR UPDATE`,
      [input.metadataUserId],
    );
    if (byUser.rows[0]) return { row: byUser.rows[0], resolvedBy: 'USER' };
  }

  return { row: null, resolvedBy: null };
}

function isAccessCandidate(candidate: SubscriptionEntitlementCandidate): boolean {
  return candidate.status === 'ACTIVE' || candidate.status === 'TRIALING';
}

export async function applySubscriptionEvent(
  client: SqlClient,
  input: ApplySubscriptionEventInput,
): Promise<ApplySubscriptionEventResult> {
  const resolved = await findEntitlementForEvent(client, input);
  const row = resolved.row;
  if (!row) return { kind: 'UNRESOLVED', userId: null, reason: 'ENTITLEMENT_NOT_FOUND' };

  const metadataMatches = input.eventKind === 'PAYMENT_FAILED' || (
    input.metadataUserId === row.user_id
    && input.metadataOrgId === row.org_id
    && Boolean(input.customerId)
    && input.customerId === row.stripe_customer_id
  );
  const effectiveTerminal = row.stripe_subscription_terminal === true || row.status === 'CANCELED';
  const existingSubscriptionDiffers = Boolean(
    row.stripe_subscription_id
    && input.subscriptionId
    && row.stripe_subscription_id !== input.subscriptionId,
  );
  const replacesTerminalSubscription = Boolean(input.subscriptionId)
    && input.eventKind === 'CHECKOUT_COMPLETED'
    && effectiveTerminal
    && metadataMatches
    && isAccessCandidate(input.candidate);

  if (existingSubscriptionDiffers && !replacesTerminalSubscription) {
    return { kind: 'IGNORED', userId: row.user_id, reason: 'SUBSCRIPTION_ID_MISMATCH' };
  }
  if (!row.stripe_subscription_id && !input.subscriptionId) {
    return { kind: 'UNRESOLVED', userId: row.user_id, reason: 'SUBSCRIPTION_ID_MISSING' };
  }
  if (!row.stripe_subscription_id && !metadataMatches) {
    return { kind: 'UNRESOLVED', userId: row.user_id, reason: 'UNTRUSTED_INITIAL_BINDING' };
  }

  const identityFailedClosed = input.eventKind !== 'PAYMENT_FAILED'
    && input.eventKind !== 'SUBSCRIPTION_DELETED'
    && !metadataMatches;
  const candidate: SubscriptionEntitlementCandidate = identityFailedClosed
    ? { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'IDENTITY_MISMATCH' }
    : input.candidate;
  const previousTerminal = replacesTerminalSubscription ? false : effectiveTerminal;
  const decision = subscriptionStateEventDecision(
    { id: input.eventId, created: input.eventCreated, kind: input.eventKind },
    {
      eventId: row.stripe_subscription_event_id,
      eventCreated: row.stripe_subscription_event_created,
      eventRank: row.stripe_subscription_event_rank,
      terminal: previousTerminal,
      status: row.status,
      currentPeriodEnd: row.current_period_end,
    },
    candidate,
  );

  if (decision.kind === 'IGNORE') {
    return { kind: 'IGNORED', userId: row.user_id, reason: decision.reason };
  }

  if (decision.kind === 'FAIL_CLOSED') {
    if (!effectiveTerminal) {
      await client.query(
        `UPDATE entitlements
         SET status = 'PAST_DUE', current_period_end = NULL, updated_at = NOW()
         WHERE user_id = $1`,
        [row.user_id],
      );
    }
    return {
      kind: 'FAIL_CLOSED',
      userId: row.user_id,
      status: effectiveTerminal ? 'CANCELED' : 'PAST_DUE',
      plan: effectiveTerminal ? 'FREE' : row.plan,
      reason: decision.reason,
      terminal: effectiveTerminal,
    };
  }

  const terminal = decision.terminal;
  const nextSubscriptionId = input.subscriptionId || row.stripe_subscription_id;
  const nextPlan = terminal
    ? 'FREE'
    : metadataMatches && isAccessCandidate(candidate) && input.detectedPlan
      ? input.detectedPlan
      : row.plan;
  const nextFeatures = terminal
    ? input.freeFeatures
    : metadataMatches && isAccessCandidate(candidate) && input.detectedPlan
      ? input.accessFeatures
      : row.features_json;

  await client.query(
    `UPDATE entitlements
     SET status = $2,
         current_period_end = $3,
         stripe_subscription_id = $4,
         stripe_subscription_event_created = $5,
         stripe_subscription_event_id = $6,
         stripe_subscription_event_kind = $7,
         stripe_subscription_event_rank = $8,
         stripe_subscription_terminal = $9,
         plan = $10,
         features_json = $11::jsonb,
         updated_at = NOW()
     WHERE user_id = $1`,
    [
      row.user_id,
      decision.status,
      decision.currentPeriodEnd,
      nextSubscriptionId,
      decision.eventCreated,
      decision.eventId,
      decision.eventKind,
      decision.eventRank,
      terminal,
      nextPlan,
      JSON.stringify(nextFeatures),
    ],
  );

  return {
    kind: identityFailedClosed ? 'FAIL_CLOSED' : 'APPLIED',
    userId: row.user_id,
    status: decision.status,
    plan: nextPlan,
    reason: candidate.reason,
    terminal,
  };
}

export async function applyInvoicePaymentFailureEvent(
  client: SqlClient,
  input: Omit<ApplySubscriptionEventInput, 'eventKind'> & {
    eventHash: string;
    auditTimestamp: string;
  },
): Promise<ApplySubscriptionEventResult> {
  if (!input.subscriptionId) {
    return { kind: 'UNRESOLVED', userId: null, reason: 'SUBSCRIPTION_ID_MISSING' };
  }
  const { eventHash, auditTimestamp, ...subscriptionInput } = input;
  const result = await applySubscriptionEvent(client, {
    ...subscriptionInput,
    eventKind: 'PAYMENT_FAILED',
  });
  if (result.kind === 'APPLIED' || result.kind === 'FAIL_CLOSED') {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, resource, details_json, ts)
       VALUES ($1, 'INVOICE_PAYMENT_FAILED', 'billing', $2::jsonb, $3::timestamptz)`,
      [
        result.userId,
        JSON.stringify({
          eventHash,
          outcome: result.kind,
          reason: result.reason,
          status: result.status,
        }),
        auditTimestamp,
      ],
    );
  }
  return result;
}

export type RegisterServicePaymentEventInput = {
  eventHash: string;
  source: 'WEBHOOK' | 'RECONCILIATION';
  eventType: string;
  stripeCreated: number | null;
  receiptHash: string | null;
  checkoutSessionHash: string | null;
  paymentIntentHash: string | null;
};

const RETRYABLE_SERVICE_PAYMENT_REASONS = [
  'UNKNOWN_RECEIPT',
  'INQUIRY_NOT_ELIGIBLE',
  'REFUND_OUT_OF_SEQUENCE',
] as const;

export async function servicePaymentEventMayRetry(
  client: SqlClient,
  eventHash: string,
): Promise<boolean> {
  const result = await client.query<{ retryable: boolean }>(
    `SELECT (
       processing_status = 'EXCEPTION'
       AND reason_code = ANY($2::text[])
       AND processing_attempts < 5
       AND last_attempt_at <= NOW() - INTERVAL '30 seconds'
     ) AS retryable
     FROM service_payment_events
     WHERE event_hash = $1`,
    [eventHash, RETRYABLE_SERVICE_PAYMENT_REASONS],
  );
  return result.rows[0]?.retryable === true;
}

/**
 * Claims a new payment observation, or atomically reclaims a narrowly
 * retryable exception after its operator-correctable database state changed.
 * Provider-mismatch exceptions remain immutable.
 */
export async function registerServicePaymentEvent(
  client: SqlClient,
  input: RegisterServicePaymentEventInput,
): Promise<boolean> {
  const claimed = await client.query(
    `INSERT INTO service_payment_events (
       event_hash, source, event_type, stripe_created, receipt_hash,
       checkout_session_hash, payment_intent_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (event_hash) DO UPDATE
     SET processing_status = 'PROCESSING',
         reason_code = 'PROCESSING',
         processing_attempts = service_payment_events.processing_attempts + 1,
         last_attempt_at = NOW(),
         receipt_hash = COALESCE(EXCLUDED.receipt_hash, service_payment_events.receipt_hash),
         checkout_session_hash = COALESCE(EXCLUDED.checkout_session_hash, service_payment_events.checkout_session_hash),
         payment_intent_hash = COALESCE(EXCLUDED.payment_intent_hash, service_payment_events.payment_intent_hash),
         operator_alert_status = 'PENDING',
         operator_alert_next_attempt_at = NOW(),
         operator_alert_lease_owner = NULL,
         operator_alert_lease_until = NULL,
         processed_at = NULL
     WHERE service_payment_events.processing_status = 'EXCEPTION'
       AND service_payment_events.reason_code = ANY($8::text[])
       AND service_payment_events.processing_attempts < 5
       AND service_payment_events.last_attempt_at <= NOW() - INTERVAL '30 seconds'
     RETURNING event_hash`,
    [
      input.eventHash,
      input.source,
      input.eventType.slice(0, 100),
      input.stripeCreated,
      input.receiptHash,
      input.checkoutSessionHash,
      input.paymentIntentHash,
      RETRYABLE_SERVICE_PAYMENT_REASONS,
    ],
  );
  return Boolean(claimed.rows[0]);
}

export async function finishServicePaymentEvent(
  client: SqlClient,
  eventHash: string,
  status: 'PROCESSED' | 'EXCEPTION' | 'IGNORED',
  reason: string,
): Promise<void> {
  await client.query(
    `UPDATE service_payment_events
     SET processing_status = $2::text,
         reason_code = $3::text,
         operator_alert_status = CASE WHEN $2::text = 'EXCEPTION' THEN operator_alert_status ELSE 'NOT_REQUIRED' END,
         processed_at = NOW()
     WHERE event_hash = $1`,
    [eventHash, status, reason.slice(0, 100)],
  );
}

type ServiceInquiryAuthorityRow = ServiceInquiryPaymentRow & {
  id: string;
  stripe_payment_link_id: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  payment_amount_cents: number | null;
  payment_currency: string | null;
};

export type ApplyServicePaymentResult = ServiceInquiryPaymentDecision & { inquiryId?: string };

async function lockPaymentIdentifiers(client: SqlClient, payment: ServicePaymentReference): Promise<void> {
  const identifiers = [payment.checkoutSessionId, payment.paymentIntentId].sort();
  for (const identifier of identifiers) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identifier]);
  }
}

function authorityIsComplete(row: ServiceInquiryAuthorityRow): boolean {
  return row.stripe_payment_link_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId
    && row.stripe_price_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId
    && row.stripe_product_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId
    && row.payment_amount_cents === WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount
    && row.payment_currency === WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency.toUpperCase();
}

export async function applyServicePayment(
  client: SqlClient,
  payment: ServicePaymentReference,
): Promise<ApplyServicePaymentResult> {
  await lockPaymentIdentifiers(client, payment);
  const conflictingBinding = await client.query<{ id: string }>(
    `SELECT id
     FROM service_inquiries
     WHERE receipt_id <> $1
       AND (stripe_checkout_session_id = $2 OR stripe_payment_intent_id = $3)
     LIMIT 1
     FOR UPDATE`,
    [payment.receiptId, payment.checkoutSessionId, payment.paymentIntentId],
  );
  if (conflictingBinding.rows[0]) {
    return { kind: 'EXCEPTION', reason: 'PAYMENT_ALREADY_BOUND' };
  }

  const inquiryResult = await client.query<ServiceInquiryAuthorityRow>(
    `SELECT id, receipt_id, service_code, status, payment_status,
            stripe_checkout_session_id, stripe_payment_intent_id,
            stripe_payment_link_id, stripe_price_id, stripe_product_id,
            payment_amount_cents, payment_currency
     FROM service_inquiries
     WHERE receipt_id = $1
     FOR UPDATE`,
    [payment.receiptId],
  );
  const inquiry = inquiryResult.rows[0] || null;
  const decision = serviceInquiryPaymentDecision(inquiry, payment);
  if (decision.kind === 'EXCEPTION' || !inquiry) return decision;

  const shouldWrite = decision.kind !== 'DUPLICATE' || !authorityIsComplete(inquiry);
  if (shouldWrite) {
    const paymentStatus = decision.kind === 'RECORD_REFUNDED' ? 'REFUNDED' : inquiry.payment_status === 'REFUNDED' ? 'REFUNDED' : 'PAID';
    await client.query(
      `UPDATE service_inquiries
       SET payment_status = $2::text,
           stripe_checkout_session_id = $3,
           stripe_payment_intent_id = $4,
           stripe_payment_link_id = $5,
           stripe_price_id = $6,
           stripe_product_id = $7,
           payment_amount_cents = $8,
           payment_currency = 'USD',
           paid_at = COALESCE(paid_at, $9::timestamptz),
           refunded_at = CASE WHEN $2::text = 'REFUNDED' THEN COALESCE(refunded_at, $10::timestamptz) ELSE refunded_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [
        inquiry.id,
        paymentStatus,
        payment.checkoutSessionId,
        payment.paymentIntentId,
        WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId,
        WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId,
        WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId,
        WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
        payment.paidAt,
        payment.refundedAt,
      ],
    );
  }
  return { ...decision, inquiryId: inquiry.id };
}

export type ServiceReconciliationLease = {
  owner: string;
  startingAfter: string | null;
};

export async function acquireServiceReconciliationLease(
  client: SqlClient,
  owner: string,
  leaseSeconds = 600,
): Promise<ServiceReconciliationLease | null> {
  await client.query(
    `INSERT INTO service_payment_reconciliation_state (name)
     VALUES ('WORKFLOW_PILOT')
     ON CONFLICT (name) DO NOTHING`,
  );
  const claimed = await client.query<{ starting_after: string | null }>(
    `UPDATE service_payment_reconciliation_state
     SET lease_owner = $1,
         lease_expires_at = NOW() + make_interval(secs => $2),
         last_run_started_at = NOW(),
         updated_at = NOW()
     WHERE name = 'WORKFLOW_PILOT'
       AND (lease_expires_at IS NULL OR lease_expires_at <= NOW() OR lease_owner = $1)
     RETURNING starting_after`,
    [owner, Math.max(30, Math.floor(leaseSeconds))],
  );
  return claimed.rows[0] ? { owner, startingAfter: claimed.rows[0].starting_after } : null;
}

export async function advanceServiceReconciliationCursor(
  client: SqlClient,
  owner: string,
  startingAfter: string | null,
  leaseSeconds = 600,
): Promise<boolean> {
  const updated = await client.query(
    `UPDATE service_payment_reconciliation_state
     SET starting_after = $2,
         lease_expires_at = NOW() + make_interval(secs => $3),
         updated_at = NOW()
     WHERE name = 'WORKFLOW_PILOT' AND lease_owner = $1 AND lease_expires_at > NOW()`,
    [owner, startingAfter, Math.max(30, Math.floor(leaseSeconds))],
  );
  return updated.rowCount === 1;
}

export async function recordServiceReconciliationRecentScan(
  client: SqlClient,
  owner: string,
  sessionsChecked: number,
  leaseSeconds = 600,
): Promise<boolean> {
  const updated = await client.query(
    `UPDATE service_payment_reconciliation_state
     SET last_recent_scan_at = NOW(),
         last_recent_sessions_checked = $2,
         lease_expires_at = NOW() + make_interval(secs => $3),
         updated_at = NOW()
     WHERE name = 'WORKFLOW_PILOT' AND lease_owner = $1 AND lease_expires_at > NOW()`,
    [owner, Math.max(0, Math.floor(sessionsChecked)), Math.max(30, Math.floor(leaseSeconds))],
  );
  return updated.rowCount === 1;
}

export async function releaseServiceReconciliationLease(
  client: SqlClient,
  owner: string,
  completedCycle: boolean,
  errorCode: string | null = null,
): Promise<boolean> {
  const updated = await client.query(
    `UPDATE service_payment_reconciliation_state
     SET starting_after = CASE WHEN $2 THEN NULL ELSE starting_after END,
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_success_at = CASE WHEN $2 THEN NOW() ELSE last_success_at END,
         last_error_code = $3,
         updated_at = NOW()
     WHERE name = 'WORKFLOW_PILOT' AND lease_owner = $1`,
    [owner, completedCycle, errorCode],
  );
  return updated.rowCount === 1;
}

export type ClaimedServicePaymentAlert = {
  event_hash: string;
  reason_code: string;
  source: 'WEBHOOK' | 'RECONCILIATION';
  operator_alert_attempts: number;
};

export async function claimServicePaymentAlerts(
  client: SqlClient,
  owner: string,
  requestedLimit = 20,
  leaseSeconds = 120,
): Promise<ClaimedServicePaymentAlert[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit)));
  const claimed = await client.query<ClaimedServicePaymentAlert>(
    `WITH candidates AS (
       SELECT event_hash
       FROM service_payment_events
       WHERE processing_status = 'EXCEPTION'
         AND operator_alert_status IN ('PENDING', 'FAILED', 'NOT_CONFIGURED')
         AND operator_alert_next_attempt_at <= NOW()
         AND (operator_alert_lease_until IS NULL OR operator_alert_lease_until <= NOW())
       ORDER BY operator_alert_next_attempt_at, created_at, event_hash
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE service_payment_events AS event
     SET operator_alert_lease_owner = $1,
         operator_alert_lease_until = NOW() + make_interval(secs => $3)
     FROM candidates
     WHERE event.event_hash = candidates.event_hash
     RETURNING event.event_hash, event.reason_code, event.source, event.operator_alert_attempts`,
    [owner, limit, Math.max(15, Math.floor(leaseSeconds))],
  );
  return claimed.rows;
}

export async function completeServicePaymentAlert(
  client: SqlClient,
  claim: ClaimedServicePaymentAlert,
  owner: string,
  status: 'PROVIDER_ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED',
): Promise<boolean> {
  const nextAttemptMs = servicePaymentAlertBackoffMs(claim.operator_alert_attempts + 1);
  const updated = await client.query(
    `UPDATE service_payment_events
     SET operator_alert_status = $3::text,
         operator_alert_attempts = operator_alert_attempts + 1,
         operator_alert_next_attempt_at = CASE
           WHEN $3::text = 'PROVIDER_ACCEPTED' THEN NULL
           ELSE NOW() + make_interval(secs => $4)
         END,
         operator_alert_lease_owner = NULL,
         operator_alert_lease_until = NULL,
         alerted_at = NOW()
     WHERE event_hash = $1 AND operator_alert_lease_owner = $2`,
    [claim.event_hash, owner, status, Math.ceil(nextAttemptMs / 1000)],
  );
  return updated.rowCount === 1;
}

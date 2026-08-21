import express, { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, ERROR_CODES, query, queryOne, transaction, verifyToken } from '@nova/shared';
import {
  PROOF_CURRENCY,
  PROOF_PRICE_CENTS,
  PROOF_SERVICE_CODE,
  evaluateProofCommand,
  proofCheckoutMatchesAuthority,
  proofEventHash,
  proofHash,
  validExpectedVersion,
  validIdempotencyKey,
  validProofReceipt,
  type ProofSnapshot,
  type ProofState,
} from '@nova/proof-core';
import {
  checkoutMetadataMatchesAccount,
  entitlementPlanFromPriceId,
  fullyRefundedPaymentIntentFromCharge,
  proofServiceReceiptFromMetadata,
  productionWebhookConfigurationError,
  stripeStatusToEntitlementStatus,
  type CheckoutPriceMap,
} from './billing-contract';

const app = express();
const logger = createLogger('billing-service');
const PORT = process.env.PORT || SERVICE_PORTS.BILLING || 3006;

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:8080';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Nova <hello@novanexus-ai.com>';
const PLATFORM_OWNER_EMAILS = new Set(
  [process.env.PLATFORM_OWNER_EMAILS, process.env.OWNER_EMAIL]
    .filter(Boolean)
    .flatMap(value => String(value).split(','))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean),
);

const webhookConfigurationError = productionWebhookConfigurationError(
  process.env.NODE_ENV,
  STRIPE_WEBHOOK_SECRET,
);
if (process.env.NODE_ENV === 'production' && !STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required in production');
}
if (webhookConfigurationError) {
  throw new Error(webhookConfigurationError);
}

// Initialize Stripe (will be null if no key provided)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

// Stripe IDs never cross the public checkout contract. A logical plan and
// interval are resolved against this explicit server-side allowlist.
const CHECKOUT_PRICES: CheckoutPriceMap = {
  'LITE:monthly': process.env.STRIPE_PRICE_MONTHLY || undefined,
  'LITE:yearly': process.env.STRIPE_PRICE_YEARLY || undefined,
  'FOUNDING:monthly': process.env.STRIPE_PRICE_FOUNDING || undefined,
  'FLIP_PRO:monthly': process.env.STRIPE_PRICE_FLIP_PRO || undefined,
};

// ============================================
// Types
// ============================================

interface Entitlement {
  id: string;
  userId: string;
  orgId: string;
  plan: 'FREE' | 'LITE' | 'PRO' | 'FOUNDING';
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  features: string[];
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  userId: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

type ProofCheckoutRow = {
  id: string;
  receipt_id: string;
  status: ProofState;
  payment_status: 'NOT_STARTED' | 'PAID' | 'REFUNDED';
  outcome_status: 'PENDING' | 'VERIFIED' | 'UNVERIFIED';
  org_id: string;
  version: number;
  assigned_user_id: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  active_scope_version: number;
  access_confirmed_at: string | null;
  work_started_at: string | null;
  handoff_recorded_at: string | null;
  risk_code: string | null;
  checkout_generated_at: string | null;
  checkout_scope_hash: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  scope_id: string;
  scope_hash: string;
  amount_cents: number;
  currency: string;
};

class BillingProofError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

async function proofOperator(req: Request): Promise<{ userId: string; orgId: string } | null> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  const payload = verifyToken(authorization.slice(7));
  if (!payload || payload.type !== 'access' || !payload.scopes.includes('ops.admin')) return null;
  if (payload.userId !== req.headers['x-user-id'] || payload.orgId !== req.headers['x-org-id']) return null;

  if (PLATFORM_OWNER_EMAILS.size === 0) {
    throw new BillingProofError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'PLATFORM_OWNER_NOT_CONFIGURED',
      'Proof checkout is paused until an explicit platform owner is configured.',
    );
  }
  const current = await queryOne<{ email: string; status: string; role: string }>(
    `SELECT users.email, users.status, membership.role
       FROM users
       JOIN org_members AS membership
         ON membership.user_id = users.id AND membership.org_id = $2
      WHERE users.id = $1
      LIMIT 1`,
    [payload.userId, payload.orgId],
  );
  if (
    !current
    || current.status !== 'ACTIVE'
    || current.role === 'BOT'
    || !PLATFORM_OWNER_EMAILS.has(current.email.toLowerCase())
  ) {
    return null;
  }
  return { userId: payload.userId, orgId: payload.orgId };
}

function checkoutSnapshot(row: ProofCheckoutRow): ProofSnapshot {
  return {
    state: row.status,
    paymentState: row.payment_status,
    outcomeState: row.outcome_status,
    version: Number(row.version),
    assignedUserId: row.assigned_user_id,
    nextAction: row.next_action,
    nextActionDueAt: row.next_action_due_at,
    activeScopeVersion: Number(row.active_scope_version),
    accessConfirmedAt: row.access_confirmed_at,
    handoffRecordedAt: row.handoff_recorded_at,
    completedDeliverables: [],
    learning: null,
  };
}

async function appendBillingProofEvent(client: any, input: {
  row: Pick<ProofCheckoutRow, 'id' | 'org_id' | 'status'>;
  aggregateVersion: number;
  actorType: 'USER' | 'SYSTEM';
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string | null;
  occurredAt?: string;
}): Promise<void> {
  const prior = await client.query(
    `SELECT sequence, event_hash FROM service_case_events
     WHERE inquiry_id = $1 ORDER BY sequence DESC LIMIT 1`,
    [input.row.id],
  );
  const sequence = Number(prior.rows[0]?.sequence || 0) + 1;
  const previousHash = prior.rows[0]?.event_hash || '0'.repeat(64);
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
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14)`,
    [
      input.row.id, input.row.org_id, sequence, input.aggregateVersion, input.actorType, input.actorId,
      input.eventType, input.row.status, JSON.stringify(input.payload), input.idempotencyKey,
      input.requestId, previousHash, eventHash, occurredAt,
    ],
  );
}

async function loadProofCheckout(
  client: any,
  receiptId: string,
  orgId: string,
  lock = false,
): Promise<ProofCheckoutRow | null> {
  const result = await client.query(
    `SELECT inquiry.id, inquiry.receipt_id, inquiry.status, inquiry.payment_status,
            inquiry.outcome_status, inquiry.org_id, inquiry.version, inquiry.assigned_user_id,
            inquiry.next_action, inquiry.next_action_due_at, inquiry.active_scope_version,
            inquiry.access_confirmed_at, inquiry.work_started_at, inquiry.handoff_recorded_at,
            inquiry.risk_code, inquiry.checkout_generated_at, inquiry.checkout_scope_hash,
            inquiry.stripe_checkout_session_id, inquiry.stripe_payment_intent_id, inquiry.paid_at,
            scope.id AS scope_id, scope.scope_hash, scope.amount_cents, scope.currency
     FROM service_inquiries AS inquiry
     JOIN service_case_scopes AS scope
       ON scope.inquiry_id = inquiry.id AND scope.version = inquiry.active_scope_version
     WHERE inquiry.receipt_id = $1 AND inquiry.org_id = $2
     ${lock ? 'FOR UPDATE OF inquiry' : ''}`,
    [receiptId, orgId],
  );
  return result.rows[0] || null;
}

function proofCheckoutSessionMatchesIssuance(
  session: Stripe.Checkout.Session,
  row: Pick<ProofCheckoutRow, 'id' | 'receipt_id' | 'scope_hash' | 'amount_cents' | 'currency'>,
  checkoutSessionId: string,
): boolean {
  return session.id === checkoutSessionId
    && session.mode === 'payment'
    && session.client_reference_id === row.receipt_id
    && Number(session.amount_total) === Number(row.amount_cents)
    && String(session.currency || '').toLowerCase() === row.currency.toLowerCase()
    && session.metadata?.proofCaseId === row.id
    && session.metadata?.receiptId === row.receipt_id
    && session.metadata?.scopeHash === row.scope_hash
    && session.metadata?.amountCents === String(Number(row.amount_cents))
    && session.metadata?.currency === row.currency.toLowerCase()
    && session.metadata?.serviceCode === PROOF_SERVICE_CODE;
}

type ProofCheckoutAttemptRow = {
  command_hash: string;
  scope_hash: string;
  stripe_checkout_session_id: string;
  aggregate_version: number;
};

async function loadProofCheckoutAttempt(
  client: any,
  inquiryId: string,
  idempotencyKey: string,
): Promise<ProofCheckoutAttemptRow | null> {
  const result = await client.query(
    `SELECT command_hash, scope_hash, stripe_checkout_session_id, aggregate_version
       FROM service_checkout_attempts
      WHERE inquiry_id = $1 AND idempotency_key = $2`,
    [inquiryId, idempotencyKey],
  );
  return result.rows[0] || null;
}

async function recordProofCheckoutAttempt(client: any, input: {
  inquiryId: string;
  idempotencyKey: string;
  commandHash: string;
  scopeHash: string;
  checkoutSessionId: string;
  aggregateVersion: number;
}): Promise<void> {
  await client.query(
    `INSERT INTO service_checkout_attempts (
       inquiry_id, idempotency_key, command_hash, scope_hash,
       stripe_checkout_session_id, aggregate_version
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.inquiryId,
      input.idempotencyKey,
      input.commandHash,
      input.scopeHash,
      input.checkoutSessionId,
      input.aggregateVersion,
    ],
  );
}

// ============================================
// Middleware
// ============================================

// Raw body parser for Stripe webhooks
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`, { requestId });
  }
  next();
});

// ============================================
// Audit Logging Helper
// ============================================

// ============================================
// Entitlement confirmation email (best-effort, non-blocking)
// ============================================

async function sendEntitlementConfirmationEmail(
  email: string,
  userId: string,
  plan: Entitlement['plan'],
): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn('Entitlement email skipped: RESEND_API_KEY not set', { userId });
    await logOnboardingAction(userId, 'entitlement-confirmation-email', 'skipped', {
      reason: 'RESEND_API_KEY not configured',
    });
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: 'Nova account access updated',
        html: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h1 style="font-size:22px">Account access updated</h1>
          <p>Stripe checkout was recorded for your Nova account, and the current entitlement is <strong>${plan}</strong>.</p>
          <p>Sign in to see the capabilities that are currently available. This message does not promise market alerts, automated income, or investment results.</p>
          <p><a href="${APP_URL}/login">Sign in to Nova</a></p>
        </div>`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend API returned HTTP ${response.status}`);
    }

    logger.info('Entitlement confirmation email sent', { userId });
    await logOnboardingAction(userId, 'entitlement-confirmation-email', 'success');
  } catch (error) {
    logger.error('Entitlement confirmation email failed', error as Error, { userId });
    await logOnboardingAction(userId, 'entitlement-confirmation-email', 'failure', {
      error: (error as Error).message,
    });
  }
}
async function logOnboardingAction(userId: string, actionType: string, result: string, details: Record<string, any> = {}): Promise<void> {
  try {
    await query(
      `INSERT INTO command_actions (actor_id, action_type, target, result, details) VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, 'onboarding', result, JSON.stringify(details)]
    );
  } catch { /* best effort */ }
}

async function auditLog(log: AuditLog): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, resource, details_json, ip, ts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [log.userId, log.action, log.resource, JSON.stringify(log.details), log.ip || null, log.timestamp]
    );
  } catch (error) {
    logger.error('Failed to write audit log', error as Error);
  }
}

// ============================================
// Health Check
// ============================================

app.get('/health', async (_req: Request, res: Response) => {
  const checks = {
    database: false,
    stripe: false,
    stripeSecret: process.env.NODE_ENV !== 'production' || Boolean(STRIPE_SECRET_KEY),
    webhookSignature: process.env.NODE_ENV !== 'production' || Boolean(STRIPE_WEBHOOK_SECRET),
  };

  try {
    await query('SELECT 1');
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed', error as Error);
  }

  // Stripe check (only if configured)
  if (stripe) {
    try {
      await stripe.balance.retrieve();
      checks.stripe = true;
    } catch {
      logger.warn('Stripe connection check failed (may be expected in dev)');
    }
  } else {
    checks.stripe = true; // Not configured = ok for dev
  }

  const healthy = checks.database && checks.stripeSecret && checks.webhookSignature;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    service: 'billing',
    timestamp: new Date().toISOString(),
    checks,
    stripeConfigured: !!stripe,
    webhookSignatureConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
  });
});

// ============================================
// Entitlement Helpers
// ============================================

async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const result = await queryOne<{
    id: string;
    user_id: string;
    org_id: string;
    plan: string;
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    features_json: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT * FROM entitlements WHERE user_id = $1`,
    [userId]
  );

  if (!result) return null;

  // Safely parse features_json — old rows may have corrupt data
  let features: string[];
  try {
    features = result.features_json ? JSON.parse(result.features_json) : getDefaultFeatures(result.plan as Entitlement['plan']);
    if (!Array.isArray(features)) features = getDefaultFeatures(result.plan as Entitlement['plan']);
  } catch {
    features = getDefaultFeatures(result.plan as Entitlement['plan']);
  }

  // Auto-upgrade: ensure all core features are present (handles old entitlements
  // that were created before core features were added to FREE plan)
  const expected = getDefaultFeatures(result.plan as Entitlement['plan']);
  const missing = expected.filter(f => !features.includes(f));
  if (missing.length > 0) {
    features = [...new Set([...features, ...expected])];
    query('UPDATE entitlements SET features_json = $1 WHERE user_id = $2',
      [JSON.stringify(features), userId]).catch(() => {});
  }

  return {
    id: result.id,
    userId: result.user_id,
    orgId: result.org_id,
    plan: result.plan as Entitlement['plan'],
    status: result.status as Entitlement['status'],
    stripeCustomerId: result.stripe_customer_id,
    stripeSubscriptionId: result.stripe_subscription_id,
    currentPeriodEnd: result.current_period_end,
    features,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

async function getOrCreateEntitlement(userId: string, orgId: string): Promise<Entitlement> {
  let entitlement = await getEntitlement(userId);
  
  if (!entitlement) {
    const result = await queryOne<{ id: string; created_at: string }>(
      `INSERT INTO entitlements (user_id, org_id, plan, status, features_json)
       VALUES ($1, $2, 'FREE', 'ACTIVE', $3)
       RETURNING id, created_at`,
      [userId, orgId, JSON.stringify(getDefaultFeatures('FREE'))]
    );
    
    entitlement = {
      id: result!.id,
      userId,
      orgId,
      plan: 'FREE',
      status: 'ACTIVE',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      features: getDefaultFeatures('FREE'),
      createdAt: result!.created_at,
      updatedAt: result!.created_at,
    };
  }
  
  return entitlement;
}

function getDefaultFeatures(plan: Entitlement['plan']): string[] {
  // Core features are available to ALL plans. The quota system in nova-hub
  // limits daily usage (3 decision cards, 1 backtest, 10 paper trades, etc.)
  // so the paywall should never hard-block access to core value loops.
  const CORE_FEATURES = [
    'scanner', 'paper_trading', 'thesis_cards', 'decisions',
    'watchlists', 'alerts', 'basic_scanner', 'watchlist_1',
  ];

  switch (plan) {
    case 'FREE':
      return [...CORE_FEATURES];
    case 'LITE':
      return [...CORE_FEATURES, 'reports', 'csv_export', 'decision_replay'];
    case 'PRO':
      return [...CORE_FEATURES, 'reports', 'csv_export', 'pdf_export', 'api_access', 'priority_support', 'decision_replay'];
    case 'FOUNDING':
      return [...CORE_FEATURES, 'reports', 'csv_export', 'pdf_export', 'api_access', 'priority_support', 'decision_replay',
        'founding_badge', 'concierge_onboarding', 'early_access', 'flip_pipeline', 'deal_cards', 'mode_control', 'advanced_analytics'];
    default:
      return [...CORE_FEATURES];
  }
}

async function updateEntitlement(
  userId: string,
  updates: Partial<Entitlement>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.plan !== undefined) {
    setClauses.push(`plan = $${paramIndex++}`);
    values.push(updates.plan);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.stripeCustomerId !== undefined) {
    setClauses.push(`stripe_customer_id = $${paramIndex++}`);
    values.push(updates.stripeCustomerId);
  }
  if (updates.stripeSubscriptionId !== undefined) {
    setClauses.push(`stripe_subscription_id = $${paramIndex++}`);
    values.push(updates.stripeSubscriptionId);
  }
  if (updates.currentPeriodEnd !== undefined) {
    setClauses.push(`current_period_end = $${paramIndex++}`);
    values.push(updates.currentPeriodEnd);
  }
  if (updates.features !== undefined) {
    setClauses.push(`features_json = $${paramIndex++}`);
    values.push(JSON.stringify(updates.features));
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(userId);

  await query(
    `UPDATE entitlements SET ${setClauses.join(', ')} WHERE user_id = $${paramIndex}`,
    values
  );
}

// ============================================
// Checkout Session Endpoint
// ============================================

// The public intake never creates a payment link. An authorized operator can
// issue exactly one server-priced checkout only after the accepted scope has
// been committed to the Proof Desk ledger.
app.post('/v1/billing/service-checkout', async (req: Request, res: Response) => {
  let operator: { userId: string; orgId: string } | null;
  try {
    operator = await proofOperator(req);
  } catch (error) {
    if (error instanceof BillingProofError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error('Proof checkout authority verification failed', error as Error);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'PROOF_AUTHORITY_UNAVAILABLE', message: 'Proof checkout authority could not be verified.' },
    });
  }
  if (!operator) {
    const authenticated = Boolean(req.headers.authorization);
    return res.status(authenticated ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: 'PROOF_CHECKOUT_AUTHORITY_REQUIRED', message: 'Proof checkout requires operator authority.' },
    });
  }
  if (!stripe) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payment checkout is unavailable.' },
    });
  }

  const receiptId = req.body?.receiptId;
  const expectedVersion = Number(req.body?.expectedVersion);
  const idempotencyKey = req.get('Idempotency-Key');
  const requestId = req.get('X-Request-ID') || null;
  if (!validProofReceipt(receiptId)) {
    return res.status(422).json({ success: false, error: { code: 'INVALID_PROOF_RECEIPT', message: 'A valid proof receipt is required.' } });
  }
  if (!validExpectedVersion(expectedVersion)) {
    return res.status(422).json({ success: false, error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'Reload the proof before issuing checkout.' } });
  }
  if (!validIdempotencyKey(idempotencyKey)) {
    return res.status(422).json({ success: false, error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A durable idempotency key is required.' } });
  }

  try {
    const result = await transaction(async client => {
      const row = await loadProofCheckout(client, receiptId, operator.orgId, true);
      if (!row) throw new BillingProofError(404, 'PROOF_NOT_FOUND', 'No accepted proof scope exists for that receipt.');

      const commandHash = proofHash({ command: 'GENERATE_PAYMENT_LINK', receiptId, expectedVersion });
      const priorAttempt = await loadProofCheckoutAttempt(client, row.id, idempotencyKey);
      if (priorAttempt) {
        if (priorAttempt.command_hash !== commandHash || priorAttempt.scope_hash !== row.scope_hash) {
          throw new BillingProofError(409, 'IDEMPOTENCY_KEY_REUSED', 'That key was already used for a different checkout request.');
        }
        const existing = await stripe.checkout.sessions.retrieve(priorAttempt.stripe_checkout_session_id);
        if (!proofCheckoutSessionMatchesIssuance(existing, row, priorAttempt.stripe_checkout_session_id)) {
          throw new BillingProofError(409, 'CHECKOUT_AUTHORITY_MISMATCH', 'The original checkout no longer matches its accepted scope.');
        }
        if (existing.status === 'expired' || !existing.url) {
          throw new BillingProofError(409, 'CHECKOUT_EXPIRED', 'The original checkout expired. Issue a replacement with a new idempotency key.');
        }
        return { sessionId: existing.id, url: existing.url, version: Number(priorAttempt.aggregate_version), idempotent: true };
      }

      // Events created by an older deployment did not persist the exact Stripe
      // session ID. Never guess by replaying the inquiry's current session.
      const legacyAttempt = await client.query(
        `SELECT 1 FROM service_case_events
          WHERE inquiry_id = $1 AND idempotency_key = $2`,
        [row.id, idempotencyKey],
      );
      if (legacyAttempt.rows[0]) {
        throw new BillingProofError(409, 'CHECKOUT_REPLAY_UNAVAILABLE', 'The original checkout cannot be replayed safely. Issue a replacement with a new key.');
      }

      if (Number(row.version) !== expectedVersion) {
        throw new BillingProofError(409, 'STALE_PROOF_VERSION', 'The proof changed. Reload before issuing checkout.', {
          expected: expectedVersion,
          current: Number(row.version),
        });
      }
      const gate = evaluateProofCommand(checkoutSnapshot(row), 'GENERATE_PAYMENT_LINK');
      if (gate.ok === false) throw new BillingProofError(gate.status, gate.code, gate.message, gate.unmet);

      if (row.checkout_scope_hash === row.scope_hash && row.stripe_checkout_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
        if (existing.status !== 'expired' && existing.url) {
          if (!proofCheckoutSessionMatchesIssuance(existing, row, row.stripe_checkout_session_id)) {
            throw new BillingProofError(409, 'CHECKOUT_AUTHORITY_MISMATCH', 'The committed checkout no longer matches its accepted scope.');
          }
          await recordProofCheckoutAttempt(client, {
            inquiryId: row.id,
            idempotencyKey,
            commandHash,
            scopeHash: row.scope_hash,
            checkoutSessionId: existing.id,
            aggregateVersion: Number(row.version),
          });
          await appendBillingProofEvent(client, {
            row,
            aggregateVersion: Number(row.version),
            actorType: 'USER',
            actorId: operator.userId,
            eventType: 'proof.payment_link_reused',
            payload: {
              commandHash,
              scopeHash: row.scope_hash,
              checkoutSessionHash: proofHash(existing.id),
            },
            idempotencyKey,
            requestId,
          });
          return { sessionId: existing.id, url: existing.url, version: Number(row.version), idempotent: true };
        }
      }

      const metadata = {
        proofCaseId: row.id,
        receiptId: row.receipt_id,
        scopeHash: row.scope_hash,
        amountCents: String(PROOF_PRICE_CENTS),
        currency: PROOF_CURRENCY.toLowerCase(),
        serviceCode: PROOF_SERVICE_CODE,
      };
      const stripeIdempotencyKey = `proof_${proofHash({ caseId: row.id, scopeHash: row.scope_hash, idempotencyKey }).slice(0, 48)}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: row.receipt_id,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: PROOF_CURRENCY.toLowerCase(),
            unit_amount: PROOF_PRICE_CENTS,
            product_data: {
              name: 'Nova Workflow Setup Pilot',
              description: 'One written-scope, human-delivered workflow setup. No subscription or software access.',
            },
          },
        }],
        payment_intent_data: { metadata },
        metadata,
        success_url: `${APP_URL}/services/workflow-setup?payment=processing`,
        cancel_url: `${APP_URL}/services/workflow-setup?payment=cancelled`,
      }, { idempotencyKey: stripeIdempotencyKey });
      if (!session.url) throw new BillingProofError(502, 'CHECKOUT_URL_MISSING', 'Stripe did not return a hosted checkout URL.');

      const nextVersion = Number(row.version) + 1;
      await client.query(
        `UPDATE service_inquiries
         SET stripe_checkout_session_id = $2, checkout_generated_at = NOW(), checkout_scope_hash = $3,
             version = version + 1, updated_at = NOW()
         WHERE id = $1`,
        [row.id, session.id, row.scope_hash],
      );
      await recordProofCheckoutAttempt(client, {
        inquiryId: row.id,
        idempotencyKey,
        commandHash,
        scopeHash: row.scope_hash,
        checkoutSessionId: session.id,
        aggregateVersion: nextVersion,
      });
      await appendBillingProofEvent(client, {
        row,
        aggregateVersion: nextVersion,
        actorType: 'USER',
        actorId: operator.userId,
        eventType: 'proof.payment_link_generated',
        payload: {
          commandHash,
          scopeHash: row.scope_hash,
          amountCents: PROOF_PRICE_CENTS,
          currency: PROOF_CURRENCY,
          checkoutSessionHash: proofHash(session.id),
        },
        idempotencyKey,
        requestId,
      });
      return { sessionId: session.id, url: session.url, version: nextVersion, idempotent: false };
    });

    logger.info('Governed service checkout issued', { requestId, idempotent: result.idempotent });
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof BillingProofError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    logger.error('Governed service checkout failed', error as Error, { requestId });
    return res.status(500).json({ success: false, error: { code: 'PROOF_CHECKOUT_FAILED', message: 'Checkout was not committed.' } });
  }
});

app.post('/v1/billing/checkout-session', (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: {
      code: 'SELF_SERVE_CHECKOUT_DISABLED',
      message: 'Nova subscriptions are not available for self-serve purchase. Private pilots require an accepted written scope.',
    },
  });
});

// A browser return URL is not proof of payment. This authenticated endpoint
// binds the Stripe session to the current Nova user and organization before it
// returns a deliberately small verification result.
app.get('/v1/billing/checkout-session/status', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userId = req.headers['x-user-id'] as string;
  const orgId = req.headers['x-org-id'] as string;
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';

  if (!userId || !orgId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Authentication required' },
    });
  }

  if (!/^cs_[A-Za-z0-9_]{8,255}$/.test(sessionId)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: { code: 'INVALID_CHECKOUT_SESSION', message: 'A valid checkout session is required.' },
    });
  }

  if (!stripe) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Billing verification is unavailable.' },
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== 'subscription') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: 'NOT_SUBSCRIPTION_CHECKOUT', message: 'This is not a subscription checkout.' },
      });
    }

    if (!checkoutMetadataMatchesAccount(session.metadata, userId, orgId)) {
      logger.warn('Checkout verification account mismatch', { requestId, userId });
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: 'CHECKOUT_ACCOUNT_MISMATCH', message: 'Checkout does not belong to this account.' },
      });
    }

    const entitlement = await getEntitlement(userId);
    const entitlementMatchesOrganization = entitlement?.orgId === orgId;

    return res.json({
      success: true,
      data: {
        verified: true,
        checkout: {
          status: session.status === 'complete' ? 'complete' : 'processing',
          payment: session.payment_status === 'paid' ? 'paid' : 'unpaid',
        },
        entitlement: entitlement && entitlementMatchesOrganization
          ? {
              plan: entitlement.plan,
              status: entitlement.status,
              active: entitlement.status === 'ACTIVE' || entitlement.status === 'TRIALING',
            }
          : null,
      },
    });
  } catch (error) {
    logger.error('Checkout verification failed', error as Error, { requestId, userId });
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: { code: 'CHECKOUT_NOT_VERIFIED', message: 'Checkout could not be verified.' },
    });
  }
});

// ============================================
// Customer Portal Endpoint
// ============================================

app.post('/v1/billing/portal', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Authentication required' },
    });
  }

  if (!stripe) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Billing is not configured.' },
    });
  }

  try {
    const entitlement = await getEntitlement(userId);

    if (!entitlement?.stripeCustomerId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found' },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: entitlement.stripeCustomerId,
      return_url: `${APP_URL}/settings/billing`,
    });

    await auditLog({
      userId,
      action: 'PORTAL_SESSION_CREATED',
      resource: 'billing',
      details: { sessionId: session.id },
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    logger.info('Portal session created', { userId, requestId });

    res.json({
      success: true,
      data: { url: session.url },
    });
  } catch (error) {
    logger.error('Failed to create portal session', error as Error, { requestId });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'PORTAL_FAILED', message: 'Failed to create portal session' },
    });
  }
});

// ============================================
// Entitlement Endpoint
// ============================================

app.get('/v1/billing/entitlement', async (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const orgId = req.headers['x-org-id'] as string;

  if (!userId || !orgId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Authentication required' },
    });
  }

  try {
    const entitlement = await getOrCreateEntitlement(userId, orgId);

    res.json({
      success: true,
      data: { entitlement },
    });
  } catch (error) {
    logger.error('Failed to get entitlement', error as Error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'ENTITLEMENT_FAILED', message: 'Failed to get entitlement' },
    });
  }
});

// ============================================
// Webhook Endpoint
// ============================================

type ServiceWebhookDisposition = 'PROCESSED' | 'IGNORED' | 'DUPLICATE';

async function registerServiceWebhook(
  client: any,
  eventId: string,
  eventType: string,
  payload: unknown,
  receiptId: string | null,
): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO service_case_webhook_events (
       stripe_event_id, event_type, payload_hash, receipt_id, processing_status, reason
     ) VALUES ($1,$2,$3,$4,'FAILED','PROCESSING')
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`,
    [eventId, eventType, proofHash(payload), receiptId],
  );
  return Boolean(inserted.rows[0]);
}

async function finishServiceWebhook(
  client: any,
  eventId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  reason: string,
  receiptId?: string | null,
): Promise<void> {
  await client.query(
    `UPDATE service_case_webhook_events
     SET processing_status = $2, reason = $3, receipt_id = COALESCE($4, receipt_id)
     WHERE stripe_event_id = $1`,
    [eventId, status, reason.slice(0, 160), receiptId || null],
  );
}

async function rejectServicePayment(client: any, input: {
  inquiry: any;
  eventId: string;
  session: Stripe.Checkout.Session;
  riskCode: string;
  reason: string;
}): Promise<ServiceWebhookDisposition> {
  const nextVersion = Number(input.inquiry.version) + 1;
  await client.query(
    `UPDATE service_inquiries
     SET risk_code = $2, version = version + 1, updated_at = NOW()
     WHERE id = $1`,
    [input.inquiry.id, input.riskCode],
  );
  if (input.inquiry.org_id) {
    await appendBillingProofEvent(client, {
      row: input.inquiry,
      aggregateVersion: nextVersion,
      actorType: 'SYSTEM',
      actorId: 'stripe-webhook',
      eventType: 'proof.payment_rejected',
      payload: {
        reason: input.reason,
        riskCode: input.riskCode,
        checkoutSessionHash: proofHash(input.session.id),
      },
      idempotencyKey: `stripe:${input.eventId}`.slice(0, 160),
      requestId: input.eventId,
    });
  }
  await finishServiceWebhook(client, input.eventId, 'IGNORED', input.reason, input.inquiry.receipt_id);
  return 'IGNORED';
}

async function markServiceInquiryRefunded(client: any, input: {
  inquiry: any;
  paymentIntentId: string;
  eventId: string;
  beforePaymentConfirmation: boolean;
}): Promise<void> {
  const riskCode = input.inquiry.work_started_at
    ? 'REFUNDED_AFTER_WORK_START'
    : input.beforePaymentConfirmation
      ? 'PAYMENT_REFUNDED_BEFORE_CONFIRMATION'
      : null;
  const nextVersion = Number(input.inquiry.version) + 1;
  await client.query(
    `UPDATE service_inquiries
     SET payment_status = 'REFUNDED', stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
         paid_at = CASE WHEN $3 THEN NULL ELSE paid_at END,
         risk_code = COALESCE($4, risk_code),
         next_action = CASE WHEN status NOT IN ('CLOSED','CANCELLED') THEN 'Resolve the refunded case before any further work' ELSE next_action END,
         next_action_due_at = CASE WHEN status NOT IN ('CLOSED','CANCELLED') THEN CURRENT_DATE ELSE next_action_due_at END,
         version = version + 1, updated_at = NOW()
     WHERE id = $1`,
    [input.inquiry.id, input.paymentIntentId, input.beforePaymentConfirmation, riskCode],
  );
  if (input.inquiry.org_id) {
    await appendBillingProofEvent(client, {
      row: input.inquiry,
      aggregateVersion: nextVersion,
      actorType: 'SYSTEM',
      actorId: 'stripe-webhook',
      eventType: 'proof.payment_refunded',
      payload: {
        paymentIntentHash: proofHash(input.paymentIntentId),
        afterWorkStarted: Boolean(input.inquiry.work_started_at),
        beforePaymentConfirmation: input.beforePaymentConfirmation,
        riskCode,
      },
      idempotencyKey: `stripe:${input.eventId}`.slice(0, 160),
      requestId: input.eventId,
    });
  }
}

async function recordPaidServiceInquiry(
  session: Stripe.Checkout.Session,
  eventId: string,
  eventType: string,
): Promise<ServiceWebhookDisposition> {
  const receiptId = validProofReceipt(session.client_reference_id) ? session.client_reference_id : null;
  return transaction(async client => {
    const registered = await registerServiceWebhook(client, eventId, eventType, session, receiptId);
    if (!registered) return 'DUPLICATE';
    if (!receiptId) {
      await finishServiceWebhook(client, eventId, 'IGNORED', 'INVALID_RECEIPT');
      return 'IGNORED';
    }

    const inquiryResult = await client.query(
      `SELECT id, receipt_id, status, payment_status, outcome_status, org_id, version,
              assigned_user_id, next_action, next_action_due_at, active_scope_version,
              access_confirmed_at, work_started_at, handoff_recorded_at, risk_code,
              checkout_generated_at, checkout_scope_hash, stripe_checkout_session_id,
              stripe_payment_intent_id, paid_at
       FROM service_inquiries WHERE receipt_id = $1 FOR UPDATE`,
      [receiptId],
    );
    const inquiry = inquiryResult.rows[0];
    if (!inquiry) {
      await finishServiceWebhook(client, eventId, 'IGNORED', 'UNKNOWN_RECEIPT');
      return 'IGNORED';
    }
    if (!inquiry.active_scope_version || !inquiry.org_id) {
      return rejectServicePayment(client, {
        inquiry, eventId, session, riskCode: 'PAID_BEFORE_SCOPE', reason: 'NO_ACCEPTED_SCOPE',
      });
    }

    const scopeResult = await client.query(
      `SELECT id AS scope_id, scope_hash, amount_cents, currency
       FROM service_case_scopes WHERE inquiry_id = $1 AND version = $2`,
      [inquiry.id, inquiry.active_scope_version],
    );
    if (!scopeResult.rows[0]) {
      return rejectServicePayment(client, {
        inquiry, eventId, session, riskCode: 'SCOPE_INTEGRITY_FAILURE', reason: 'ACTIVE_SCOPE_MISSING',
      });
    }
    const row = { ...inquiry, ...scopeResult.rows[0] } as ProofCheckoutRow;

    if (!row.stripe_checkout_session_id || row.checkout_scope_hash !== row.scope_hash) {
      return rejectServicePayment(client, {
        inquiry: row, eventId, session, riskCode: 'UNISSUED_PAYMENT', reason: 'CHECKOUT_NOT_ISSUED_FOR_SCOPE',
      });
    }
    const matched = proofCheckoutMatchesAuthority(session, {
      receiptId: row.receipt_id,
      caseId: row.id,
      scopeHash: row.scope_hash,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      checkoutSessionId: row.stripe_checkout_session_id,
    });
    if (matched.ok === false) {
      return rejectServicePayment(client, {
        inquiry: row,
        eventId,
        session,
        riskCode: 'PAYMENT_AUTHORITY_MISMATCH',
        reason: `AUTHORITY_MISMATCH_${matched.reason.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      });
    }

    // Stripe does not guarantee webhook delivery order. A full refund can be
    // durably recorded before checkout completion binds the PaymentIntent to
    // this inquiry; in that case the refund must win over the paid transition.
    const pendingRefundResult = await client.query(
      `SELECT stripe_event_id, receipt_id
         FROM service_case_pending_refunds
        WHERE payment_intent_id = $1 AND resolved_at IS NULL
        FOR UPDATE`,
      [matched.paymentIntentId],
    );
    const pendingRefund = pendingRefundResult.rows[0];
    if (pendingRefund) {
      if (row.payment_status !== 'REFUNDED') {
        await markServiceInquiryRefunded(client, {
          inquiry: row,
          paymentIntentId: matched.paymentIntentId,
          eventId: pendingRefund.stripe_event_id,
          beforePaymentConfirmation: row.payment_status !== 'PAID',
        });
      }
      await client.query(
        `UPDATE service_case_pending_refunds
            SET resolved_inquiry_id = $2, resolution_reason = $3, resolved_at = NOW()
          WHERE payment_intent_id = $1 AND resolved_at IS NULL`,
        [matched.paymentIntentId, row.id, 'REFUND_RECONCILED_ON_CHECKOUT_COMPLETION'],
      );
      await finishServiceWebhook(client, eventId, 'PROCESSED', 'PAYMENT_ALREADY_REFUNDED', receiptId);
      return 'PROCESSED';
    }

    if (row.payment_status === 'PAID') {
      const samePayment = row.stripe_checkout_session_id === matched.checkoutSessionId
        && row.stripe_payment_intent_id === matched.paymentIntentId;
      await finishServiceWebhook(client, eventId, samePayment ? 'PROCESSED' : 'IGNORED', samePayment ? 'ALREADY_PAID' : 'DIFFERENT_PAYMENT', receiptId);
      return samePayment ? 'PROCESSED' : 'IGNORED';
    }
    if (row.payment_status !== 'NOT_STARTED' || row.status !== 'SCOPE_ACCEPTED') {
      return rejectServicePayment(client, {
        inquiry: row, eventId, session, riskCode: 'PAYMENT_OUT_OF_SEQUENCE', reason: 'CASE_NOT_AWAITING_PAYMENT',
      });
    }

    const nextVersion = Number(row.version) + 1;
    await client.query(
      `UPDATE service_inquiries
       SET payment_status = 'PAID', stripe_payment_intent_id = $2, paid_at = NOW(),
           next_action = COALESCE(next_action, 'Confirm access and start the accepted work'),
           next_action_due_at = COALESCE(next_action_due_at, CURRENT_DATE + 1),
           risk_code = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1`,
      [row.id, matched.paymentIntentId],
    );
    await appendBillingProofEvent(client, {
      row,
      aggregateVersion: nextVersion,
      actorType: 'SYSTEM',
      actorId: 'stripe-webhook',
      eventType: 'proof.payment_confirmed',
      payload: {
        scopeHash: row.scope_hash,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
        checkoutSessionHash: proofHash(matched.checkoutSessionId),
        paymentIntentHash: proofHash(matched.paymentIntentId),
      },
      idempotencyKey: `stripe:${eventId}`.slice(0, 160),
      requestId: eventId,
    });
    await finishServiceWebhook(client, eventId, 'PROCESSED', 'PAYMENT_CONFIRMED', receiptId);
    return 'PROCESSED';
  });
}

async function recordRefundedServiceInquiry(
  charge: Stripe.Charge,
  eventId: string,
  eventType: string,
): Promise<ServiceWebhookDisposition> {
  const paymentIntentId = fullyRefundedPaymentIntentFromCharge(charge);
  return transaction(async client => {
    const registered = await registerServiceWebhook(client, eventId, eventType, charge, null);
    if (!registered) return 'DUPLICATE';
    if (!paymentIntentId) {
      await finishServiceWebhook(client, eventId, 'IGNORED', 'NOT_A_FULL_REFUND');
      return 'IGNORED';
    }
    const result = await client.query(
      `SELECT id, receipt_id, status, payment_status, org_id, version, work_started_at
       FROM service_inquiries WHERE stripe_payment_intent_id = $1 FOR UPDATE`,
      [paymentIntentId],
    );
    const row = result.rows[0];
    if (!row) {
      let receiptId = proofServiceReceiptFromMetadata(charge.metadata);
      if (!receiptId && charge.payment_intent && typeof charge.payment_intent === 'object') {
        receiptId = proofServiceReceiptFromMetadata(charge.payment_intent.metadata);
      }
      if (!receiptId) {
        if (!stripe) throw new Error('Stripe is required to identify an unbound service refund');
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        receiptId = proofServiceReceiptFromMetadata(paymentIntent.metadata);
      }
      if (!receiptId) {
        await finishServiceWebhook(client, eventId, 'IGNORED', 'UNKNOWN_PAYMENT_INTENT');
        return 'IGNORED';
      }
      await client.query(
        `INSERT INTO service_case_pending_refunds (
           payment_intent_id, stripe_event_id, receipt_id, payload_hash
         ) VALUES ($1,$2,$3,$4)
         ON CONFLICT (payment_intent_id) DO NOTHING`,
        [paymentIntentId, eventId, receiptId, proofHash(charge)],
      );
      await finishServiceWebhook(client, eventId, 'PROCESSED', 'PENDING_PAYMENT_RECONCILIATION', receiptId);
      return 'PROCESSED';
    }
    if (row.payment_status === 'REFUNDED') {
      await finishServiceWebhook(client, eventId, 'PROCESSED', 'ALREADY_REFUNDED', row.receipt_id);
      return 'PROCESSED';
    }
    await markServiceInquiryRefunded(client, {
      inquiry: row,
      paymentIntentId,
      eventId,
      beforePaymentConfirmation: row.payment_status !== 'PAID',
    });
    await finishServiceWebhook(
      client,
      eventId,
      'PROCESSED',
      row.payment_status === 'PAID' ? 'FULL_REFUND_RECORDED' : 'REFUND_RECORDED_BEFORE_CONFIRMATION',
      row.receipt_id,
    );
    return 'PROCESSED';
  });
}

app.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(400).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new Error('Webhook body must be the original bytes');
    }
    if (STRIPE_WEBHOOK_SECRET) {
      if (!sig) throw new Error('Missing stripe-signature header');
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Development mode - no signature verification
      event = JSON.parse(req.body.toString());
      logger.warn('Webhook signature verification skipped (dev mode)');
    }
  } catch (err) {
    logger.error('Webhook signature verification failed', err as Error);
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  logger.info('Webhook received', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment') {
          const disposition = await recordPaidServiceInquiry(session, event.id, event.type);
          if (disposition === 'IGNORED') {
            logger.warn('Service payment was rejected by proof authority', { eventId: event.id });
          }
          break;
        }

        if (session.mode !== 'subscription') {
          logger.info('Checkout completion ignored for unsupported mode', { mode: session.mode });
          break;
        }

        const userId = session.metadata?.userId;
        const orgId = session.metadata?.orgId;
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

        if (!userId || !orgId || !subscriptionId) {
          throw new Error('Subscription checkout is missing server-owned identity metadata');
        }

        const existingEntitlement = await getEntitlement(userId);
        if (
          !existingEntitlement
          || existingEntitlement.orgId !== orgId
          || !existingEntitlement.stripeCustomerId
          || existingEntitlement.stripeCustomerId !== customerId
        ) {
          throw new Error('Subscription checkout identity does not match the stored entitlement');
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (!checkoutMetadataMatchesAccount(subscription.metadata, userId, orgId)) {
          throw new Error('Subscription identity metadata does not match checkout');
        }

        const subPriceId = subscription.items?.data?.[0]?.price?.id || '';
        const detectedPlan = entitlementPlanFromPriceId(subPriceId, CHECKOUT_PRICES);
        if (!detectedPlan) throw new Error('Subscription price is not in the checkout allowlist');

        const status = stripeStatusToEntitlementStatus(subscription.status);
        await updateEntitlement(userId, {
          plan: detectedPlan,
          status,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          features: getDefaultFeatures(detectedPlan),
        });

        await auditLog({
          userId,
          action: 'SUBSCRIPTION_CREATED',
          resource: 'billing',
          details: { subscriptionId: subscription.id, plan: detectedPlan, status },
          timestamp: new Date().toISOString(),
        });

        try {
          await query(
            `INSERT INTO command_actions (actor_id, action_type, target, result, details) VALUES ($1, $2, $3, $4, $5)`,
            [userId, 'subscriber-onboarded', 'billing', 'success', JSON.stringify({ plan: detectedPlan, subscriptionId: subscription.id })],
          );
        } catch { /* best effort — command_actions table may not exist yet */ }

        logger.info('Subscription checkout processed', { userId, subscriptionId: subscription.id, status });

        if (status === 'ACTIVE' || status === 'TRIALING') {
          const userRow = await queryOne<{ email: string }>(
            `SELECT email FROM users WHERE id = $1`, [userId],
          );
          if (userRow?.email) {
            sendEntitlementConfirmationEmail(userRow.email, userId, detectedPlan).catch(error => {
              logger.error('Entitlement email fire-and-forget failed', error as Error);
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        const orgId = subscription.metadata?.orgId;

        if (userId && orgId) {
          const entitlement = await getEntitlement(userId);
          if (
            !entitlement
            || entitlement.orgId !== orgId
            || (entitlement.stripeSubscriptionId && entitlement.stripeSubscriptionId !== subscription.id)
          ) {
            throw new Error('Updated subscription does not match the stored entitlement');
          }

          const subPriceId = subscription.items?.data?.[0]?.price?.id || '';
          const detectedPlan = entitlementPlanFromPriceId(subPriceId, CHECKOUT_PRICES);
          if (!detectedPlan) {
            await updateEntitlement(userId, { status: 'PAST_DUE' });
            throw new Error('Updated subscription price is not in the checkout allowlist');
          }

          const status = stripeStatusToEntitlementStatus(subscription.status);

          await updateEntitlement(userId, {
            plan: detectedPlan,
            status,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            features: getDefaultFeatures(detectedPlan),
          });

          await auditLog({
            userId,
            action: 'SUBSCRIPTION_UPDATED',
            resource: 'billing',
            details: { subscriptionId: subscription.id, status, plan: detectedPlan },
            timestamp: new Date().toISOString(),
          });

          logger.info('Subscription updated', { userId, status, plan: detectedPlan });
        } else {
          logger.warn('Subscription update ignored: identity metadata is missing', {
            subscriptionId: subscription.id,
          });
        }
        break;
      }

      case 'charge.refunded': {
        const disposition = await recordRefundedServiceInquiry(event.data.object as Stripe.Charge, event.id, event.type);
        if (disposition === 'IGNORED') {
          logger.info('Refund event did not change a paid service receipt', { eventId: event.id });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          await updateEntitlement(userId, {
            plan: 'FREE',
            status: 'CANCELED',
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
            features: getDefaultFeatures('FREE'),
          });

          await auditLog({
            userId,
            action: 'SUBSCRIPTION_CANCELED',
            resource: 'billing',
            details: { subscriptionId: subscription.id },
            timestamp: new Date().toISOString(),
          });

          logger.info('Subscription canceled', { userId });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        
        // Find user by customer ID
        const entitlement = await queryOne<{ user_id: string }>(
          `SELECT user_id FROM entitlements WHERE stripe_customer_id = $1`,
          [customerId]
        );

        if (entitlement) {
          await updateEntitlement(entitlement.user_id, { status: 'PAST_DUE' });
          
          await auditLog({
            userId: entitlement.user_id,
            action: 'PAYMENT_FAILED',
            resource: 'billing',
            details: { invoiceId: invoice.id },
            timestamp: new Date().toISOString(),
          });

          logger.warn('Payment failed', { userId: entitlement.user_id, invoiceId: invoice.id });
        }
        break;
      }

      default:
        logger.info('Unhandled webhook event', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', error as Error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// Pricing Info Endpoint (public)
// ============================================

app.get('/v1/billing/pricing', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      selfServeAvailable: false,
      plans: [],
      privatePilot: {
        status: 'INVITATION_ONLY',
        forSale: false,
        message: 'Nova subscriptions are not available for public self-serve purchase. Private pilots use a written scope and an operator-issued checkout.',
      },
    },
  });
});
// Legacy route retained for old clients without advertising inventory for sale.
app.get('/v1/billing/founding-seats', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      available: false,
      maxSeats: null,
      taken: null,
      remaining: null,
      message: 'Public founding-seat sales are closed.',
    },
  });
});

// ============================================
// Internal: Check Entitlement
// ============================================

app.post('/internal/check-entitlement', async (req: Request, res: Response) => {
  const { userId, feature } = req.body;

  if (!userId) {
    return res.json({ success: false, data: { allowed: false, reason: 'No user ID' } });
  }

  try {
    const entitlement = await getEntitlement(userId);

    if (!entitlement) {
      return res.json({ success: true, data: { allowed: false, reason: 'No entitlement found' } });
    }

    if (entitlement.status !== 'ACTIVE' && entitlement.status !== 'TRIALING') {
      return res.json({ success: true, data: { allowed: false, reason: `Subscription ${entitlement.status}` } });
    }

    if (feature && !entitlement.features.includes(feature)) {
      return res.json({ 
        success: true, 
        data: { 
          allowed: false, 
          reason: `Feature '${feature}' requires upgrade`,
          requiredPlan: feature === 'api_access' ? 'PRO' : 'LITE',
        } 
      });
    }

    res.json({ 
      success: true, 
      data: { 
        allowed: true, 
        plan: entitlement.plan,
        features: entitlement.features,
      } 
    });
  } catch (error) {
    logger.error('Entitlement check failed', error as Error);
    res.json({ success: false, data: { allowed: false, reason: 'Check failed' } });
  }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  logger.info(`Billing service started on port ${PORT}`, {
    stripeConfigured: !!stripe,
    webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
  });
});

export default app;

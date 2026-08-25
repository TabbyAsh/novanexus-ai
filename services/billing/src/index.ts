import express, { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { createHash, randomUUID } from 'crypto';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, ERROR_CODES, query, queryOne, transaction } from '@nova/shared';
import {
  checkoutMetadataMatchesAccount,
  entitlementPlanFromSubscriptionItems,
  failClosedEntitlementProjection,
  fullyRefundedPaymentIntentFromCharge,
  productionWebhookConfigurationError,
  resolveCheckoutSelection,
  serviceReconciliationEventId,
  servicePaymentOperationsReadiness,
  subscriptionEntitlementCandidate,
  validateServicePaymentCheckout,
  WORKFLOW_PILOT_PAYMENT_AUTHORITY,
  type CheckoutPriceMap,
  type ServicePaymentValidation,
} from './billing-contract';
import {
  acquireServiceReconciliationLease,
  advanceServiceReconciliationCursor,
  applyInvoicePaymentFailureEvent,
  applyServicePayment,
  applySubscriptionEvent,
  claimServicePaymentAlerts,
  completeServicePaymentAlert,
  finishServicePaymentEvent,
  recordServiceReconciliationRecentScan,
  registerServicePaymentEvent,
  releaseServiceReconciliationLease,
  servicePaymentEventMayRetry,
} from './revenue-store';
import {
  resolveRedactedPaymentException,
  securePaymentResolverAuthorized,
  type RedactedPaymentException,
} from './operator-resolution';
import { deliverRedactedServicePaymentAlert } from './alert-delivery';
import { runRecentReconciliationPass, runReconciliationPages } from './reconciliation-runner';

const app = express();
const logger = createLogger('billing-service');
const PORT = process.env.PORT || SERVICE_PORTS.BILLING || 3006;

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:8080';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Nova <hello@novanexus-ai.com>';
const SERVICE_PAYMENT_RESOLVER_TOKEN = process.env.SERVICE_PAYMENT_RESOLVER_TOKEN || '';
const SERVICE_INQUIRY_OPERATOR_EMAIL = process.env.SERVICE_INQUIRY_OPERATOR_EMAIL || '';
const paymentOperationsReadiness = servicePaymentOperationsReadiness({
  resendApiKey: RESEND_API_KEY,
  operatorEmail: SERVICE_INQUIRY_OPERATOR_EMAIL,
  resolverToken: SERVICE_PAYMENT_RESOLVER_TOKEN,
});

const webhookConfigurationError = productionWebhookConfigurationError(
  process.env.NODE_ENV,
  STRIPE_WEBHOOK_SECRET,
);
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
  stripeSubscriptionTerminal: boolean;
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

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

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
    servicePaymentAlerts: paymentOperationsReadiness.checks.alertProvider
      && paymentOperationsReadiness.checks.operatorEmail,
    servicePaymentResolver: paymentOperationsReadiness.checks.resolverToken,
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

  const healthy = checks.database;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    service: 'billing',
    timestamp: new Date().toISOString(),
    checks,
    stripeConfigured: !!stripe,
    paymentOperationsReady: paymentOperationsReadiness.ready,
    paymentOperationsReadinessReasons: paymentOperationsReadiness.reasons,
  });
});

// Revenue operations have their own readiness gate so a missing alert/resolver
// configuration is explicit without taking unrelated services out of rotation.
app.get('/ready', async (_req: Request, res: Response) => {
  let database = false;
  try {
    await query('SELECT 1');
    database = true;
  } catch (error) {
    logger.error('Billing readiness database check failed', error as Error);
  }
  const ready = database
    && paymentOperationsReadiness.ready
    && Boolean(stripe)
    && Boolean(STRIPE_WEBHOOK_SECRET);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    service: 'billing',
    checks: {
      database,
      stripe: Boolean(stripe),
      webhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
      ...paymentOperationsReadiness.checks,
    },
    reasons: paymentOperationsReadiness.reasons,
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
    features_json: unknown;
    stripe_subscription_terminal: boolean | null;
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
    features = Array.isArray(result.features_json)
      ? result.features_json.filter((feature): feature is string => typeof feature === 'string')
      : result.features_json
        ? JSON.parse(String(result.features_json))
        : getDefaultFeatures(result.plan as Entitlement['plan']);
    if (!Array.isArray(features)) features = getDefaultFeatures(result.plan as Entitlement['plan']);
  } catch {
    features = getDefaultFeatures(result.plan as Entitlement['plan']);
  }

  const projection = failClosedEntitlementProjection({
    plan: result.plan,
    status: result.status as Entitlement['status'],
    currentPeriodEnd: result.current_period_end,
    features,
    terminal: result.stripe_subscription_terminal,
    freeFeatures: getDefaultFeatures('FREE'),
  });

  // Auto-upgrade: ensure all core features are present (handles old entitlements
  // that were created before core features were added to FREE plan)
  const expected = getDefaultFeatures(projection.plan as Entitlement['plan']);
  const missing = expected.filter(f => !projection.features.includes(f));
  if (missing.length > 0) {
    projection.features = [...new Set([...projection.features, ...expected])];
    query('UPDATE entitlements SET features_json = $1 WHERE user_id = $2',
      [JSON.stringify(projection.features), userId]).catch(() => {});
  }

  return {
    id: result.id,
    userId: result.user_id,
    orgId: result.org_id,
    plan: projection.plan as Entitlement['plan'],
    status: projection.status,
    stripeCustomerId: result.stripe_customer_id,
    stripeSubscriptionId: result.stripe_subscription_id,
    currentPeriodEnd: projection.currentPeriodEnd,
    stripeSubscriptionTerminal: projection.terminal,
    features: projection.features,
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
      stripeSubscriptionTerminal: false,
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

app.post('/v1/billing/checkout-session', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userId = req.headers['x-user-id'] as string;
  const orgId = req.headers['x-org-id'] as string;

  if (!userId || !orgId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Authentication required' },
    });
  }

  if (!stripe) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Billing is not configured. Set STRIPE_SECRET_KEY.' },
    });
  }

  try {
    const selection = resolveCheckoutSelection(req.body, CHECKOUT_PRICES);
    if (selection.ok === false) {
      return res.status(selection.status).json({
        success: false,
        error: { code: selection.code, message: selection.message },
      });
    }

    // Get or create entitlement to get Stripe customer ID
    const entitlement = await getOrCreateEntitlement(userId, orgId);
    
    let customerId = entitlement.stripeCustomerId;
    
    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId, orgId },
      });
      customerId = customer.id;
      await updateEntitlement(userId, { stripeCustomerId: customerId });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: selection.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing/cancel`,
      subscription_data: {
        metadata: {
          userId,
          orgId,
          checkoutPlan: selection.plan,
          checkoutInterval: selection.interval,
        },
      },
      metadata: {
        userId,
        orgId,
        checkoutPlan: selection.plan,
        checkoutInterval: selection.interval,
      },
    });

    await auditLog({
      userId,
      action: 'CHECKOUT_SESSION_CREATED',
      resource: 'billing',
      details: {
        sessionId: session.id,
        plan: selection.plan,
        interval: selection.interval,
      },
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    logger.info('Checkout session created', { sessionId: session.id, userId, requestId });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    logger.error('Failed to create checkout session', error as Error, { requestId });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: 'CHECKOUT_FAILED', message: 'Failed to create checkout session' },
    });
  }
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
// Restricted payment-exception resolution
// ============================================

app.post('/internal/service-payment-exceptions/:eventHash/resolve', asyncRoute(async (req: Request, res: Response) => {
  if (!securePaymentResolverAuthorized(req.headers.authorization, SERVICE_PAYMENT_RESOLVER_TOKEN)) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: { code: 'NOT_FOUND' } });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const candidateId = body.checkoutSessionId;
  if (
    !stripe
    || !/^[a-f0-9]{64}$/.test(req.params.eventHash || '')
    || typeof candidateId !== 'string'
    || !/^cs_[A-Za-z0-9_]{8,255}$/.test(candidateId)
    || Object.keys(body).some(key => key !== 'checkoutSessionId')
  ) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: { code: 'NOT_FOUND' } });
  }

  const exception = await queryOne<RedactedPaymentException>(
    `SELECT event_hash, reason_code, receipt_hash, checkout_session_hash, payment_intent_hash
     FROM service_payment_events
     WHERE event_hash = $1 AND processing_status = 'EXCEPTION'`,
    [req.params.eventHash],
  );
  if (
    !exception
    || (!exception.receipt_hash && !exception.checkout_session_hash && !exception.payment_intent_hash)
  ) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: { code: 'NOT_FOUND' } });
  }

  // Exactly one operator-supplied candidate is retrieved. It can be older or
  // from the wrong Link; only the server-side ledger hashes decide a match.
  const candidate = await stripe.checkout.sessions.retrieve(candidateId);
  const resolution = resolveRedactedPaymentException(exception, [candidate]);
  if (resolution) {
    return res.json({
      success: true,
      data: { eventHash: exception.event_hash, reason: exception.reason_code, resolution },
    });
  }
  return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: { code: 'NOT_FOUND' } });
}));

// ============================================
// Webhook Endpoint
// ============================================

type ServicePaymentSource = 'WEBHOOK' | 'RECONCILIATION';
type ServicePaymentProcessingKind = 'PAYMENT_RECORDED' | 'REFUND_RECORDED' | 'DUPLICATE' | 'EXCEPTION';
type ServicePaymentProcessingResult = {
  kind: ServicePaymentProcessingKind;
  eventHash: string;
  reason: string;
  source: ServicePaymentSource;
};

function identifierHash(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0
    ? createHash('sha256').update(value).digest('hex')
    : null;
}

function requiredEventHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function existingServicePaymentEventBlocksProcessing(eventHash: string): Promise<string | null> {
  const existing = await queryOne<{ reason_code: string }>(
    `SELECT reason_code FROM service_payment_events WHERE event_hash = $1`,
    [eventHash],
  );
  if (!existing) return null;
  const retryable = await transaction(client => servicePaymentEventMayRetry(client, eventHash));
  return retryable ? null : (existing.reason_code || 'EVENT_ALREADY_RECORDED');
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    value
    && typeof value === 'object'
    && 'id' in value
    && typeof (value as { id?: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

async function alertServicePaymentException(result: ServicePaymentProcessingResult): Promise<void> {
  if (result.kind !== 'EXCEPTION') return;

  logger.warn('Service payment exception requires operator review', {
    eventHash: result.eventHash,
    reason: result.reason,
    source: result.source,
  });

  try {
    await retryOutstandingServicePaymentAlerts(1);
  } catch (error) {
    logger.error('Service payment alert queue unavailable', error as Error, {
      eventHash: result.eventHash,
    });
  }
}

async function retryOutstandingServicePaymentAlerts(limit = 20): Promise<void> {
  const owner = `alert-${randomUUID()}`;
  const pending = await transaction(client => claimServicePaymentAlerts(client, owner, limit, 120));
  for (let offset = 0; offset < pending.length; offset += 5) {
    await Promise.all(pending.slice(offset, offset + 5).map(async claim => {
      const status = await deliverRedactedServicePaymentAlert(claim, {
        apiKey: RESEND_API_KEY,
        operatorEmail: SERVICE_INQUIRY_OPERATOR_EMAIL,
        from: EMAIL_FROM,
      });
      try {
        await transaction(client => completeServicePaymentAlert(client, claim, owner, status));
      } catch (error) {
        logger.error('Could not persist service payment alert outcome', error as Error, {
          eventHash: claim.event_hash,
        });
      }
    }));
  }
}

async function persistServiceCheckoutResult(input: {
  eventKey: string;
  eventType: string;
  stripeCreated: unknown;
  source: ServicePaymentSource;
  session: Stripe.Checkout.Session;
  validation: ServicePaymentValidation;
}): Promise<ServicePaymentProcessingResult> {
  const eventHash = requiredEventHash(input.eventKey);
  return transaction(async client => {
    const registered = await registerServicePaymentEvent(client, {
      eventHash,
      source: input.source,
      eventType: input.eventType,
      stripeCreated: Number.isInteger(input.stripeCreated) ? Number(input.stripeCreated) : null,
      receiptHash: identifierHash(input.session.client_reference_id),
      checkoutSessionHash: identifierHash(input.session.id),
      paymentIntentHash: identifierHash(objectId(input.session.payment_intent)),
    });
    if (!registered) {
      return { kind: 'DUPLICATE', eventHash, reason: 'EVENT_ALREADY_RECORDED', source: input.source };
    }

    if (input.validation.ok === false) {
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', input.validation.reason);
      return { kind: 'EXCEPTION', eventHash, reason: input.validation.reason, source: input.source };
    }

    const payment = input.validation.payment;
    const decision = await applyServicePayment(client, payment);

    if (decision.kind === 'EXCEPTION') {
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', decision.reason);
      return { kind: 'EXCEPTION', eventHash, reason: decision.reason, source: input.source };
    }
    if (decision.kind === 'DUPLICATE') {
      await finishServicePaymentEvent(client, eventHash, 'PROCESSED', 'PAYMENT_ALREADY_RECORDED');
      return { kind: 'DUPLICATE', eventHash, reason: 'PAYMENT_ALREADY_RECORDED', source: input.source };
    }

    const reason = decision.kind === 'RECORD_REFUNDED' ? 'FULL_REFUND_RECONCILED' : 'PAYMENT_RECORDED';
    await finishServicePaymentEvent(client, eventHash, 'PROCESSED', reason);
    return {
      kind: decision.kind === 'RECORD_REFUNDED' ? 'REFUND_RECORDED' : 'PAYMENT_RECORDED',
      eventHash,
      reason,
      source: input.source,
    };
  });
}

async function recordPaidServiceInquiry(input: {
  session: Stripe.Checkout.Session;
  eventKey?: string;
  eventType: string;
  stripeCreated: unknown;
  source: ServicePaymentSource;
}): Promise<ServicePaymentProcessingResult> {
  if (!stripe) throw new Error('Stripe is required to verify a service payment');

  if (input.eventKey) {
    const eventHash = requiredEventHash(input.eventKey);
    const blockingReason = await existingServicePaymentEventBlocksProcessing(eventHash);
    if (blockingReason) {
      return {
        kind: 'DUPLICATE',
        eventHash,
        reason: blockingReason,
        source: input.source,
      };
    }
  }

  const paymentIntentId = objectId(input.session.payment_intent);
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
    : {};
  const charge = paymentIntent && typeof paymentIntent === 'object'
    ? (paymentIntent as any).latest_charge
    : null;
  const amountRefunded = charge && typeof charge === 'object' && Number.isInteger(charge.amount_refunded)
    ? Number(charge.amount_refunded)
    : -1;
  const observationKey = input.eventKey || serviceReconciliationEventId(
    input.session.id,
    paymentIntentId,
    (paymentIntent as any).status,
    amountRefunded,
  ) || `reconcile:v2-invalid:${requiredEventHash(JSON.stringify({
    session: input.session.id || null,
    intent: paymentIntentId,
    status: (paymentIntent as any).status || null,
    amountRefunded,
  }))}`;
  const observationHash = requiredEventHash(observationKey);
  if (!input.eventKey) {
    const blockingReason = await existingServicePaymentEventBlocksProcessing(observationHash);
    if (blockingReason) {
      return {
        kind: 'DUPLICATE',
        eventHash: observationHash,
        reason: blockingReason,
        source: input.source,
      };
    }
  }

  const boundAuthority = paymentIntentId && input.session.id
    ? await queryOne<{
        receipt_id: string;
        stripe_payment_link_id: string | null;
        stripe_price_id: string | null;
        stripe_product_id: string | null;
        payment_amount_cents: number | null;
        payment_currency: string | null;
      }>(
        `SELECT receipt_id, stripe_payment_link_id, stripe_price_id, stripe_product_id,
                payment_amount_cents, payment_currency
         FROM service_inquiries
         WHERE stripe_checkout_session_id = $1 AND stripe_payment_intent_id = $2`,
        [input.session.id, paymentIntentId],
      )
    : null;
  const authorityPreviouslyVerified = Boolean(
    boundAuthority
    && boundAuthority.receipt_id === input.session.client_reference_id
    && boundAuthority.stripe_payment_link_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId
    && boundAuthority.stripe_price_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId
    && boundAuthority.stripe_product_id === WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId
    && boundAuthority.payment_amount_cents === WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount
    && boundAuthority.payment_currency === 'USD',
  );
  const lineItems = authorityPreviouslyVerified
    ? { data: [{
        quantity: 1,
        amount_total: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
        currency: WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency,
        price: {
          id: WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId,
          unit_amount: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
          currency: WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency,
          metadata: { service_code: WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode },
          product: {
            id: WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId,
            metadata: { service_code: WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode },
          },
        },
      }] }
    : typeof input.session.id === 'string' && input.session.id
      ? await stripe.checkout.sessions.listLineItems(input.session.id, {
          limit: 2,
          expand: ['data.price.product'],
        })
      : { data: [] };
  const validation = validateServicePaymentCheckout(
    input.session as any,
    lineItems.data as any,
    paymentIntent as any,
  );
  const result = await persistServiceCheckoutResult({
    ...input,
    eventKey: observationKey,
    validation,
  });
  await alertServicePaymentException(result);
  return result;
}

async function recordRefundedServiceInquiry(input: {
  charge: Stripe.Charge;
  eventKey: string;
  eventType: string;
  stripeCreated: unknown;
}): Promise<ServicePaymentProcessingResult> {
  const eventHash = requiredEventHash(input.eventKey);
  const paymentIntentId = fullyRefundedPaymentIntentFromCharge(input.charge);
  const result = await transaction(async client => {
    const registered = await registerServicePaymentEvent(client, {
      eventHash,
      source: 'WEBHOOK',
      eventType: input.eventType,
      stripeCreated: Number.isInteger(input.stripeCreated) ? Number(input.stripeCreated) : null,
      receiptHash: null,
      checkoutSessionHash: null,
      paymentIntentHash: identifierHash(objectId(input.charge.payment_intent)),
    });
    if (!registered) {
      return { kind: 'DUPLICATE', eventHash, reason: 'EVENT_ALREADY_RECORDED', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
    }
    if (!paymentIntentId) {
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', 'NOT_A_FULL_REFUND');
      return { kind: 'EXCEPTION', eventHash, reason: 'NOT_A_FULL_REFUND', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [paymentIntentId]);
    const inquiryResult = await client.query(
      `SELECT id, payment_status
       FROM service_inquiries
       WHERE stripe_payment_intent_id = $1
       FOR UPDATE`,
      [paymentIntentId],
    );
    const inquiry = inquiryResult.rows[0];
    if (!inquiry) {
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', 'UNKNOWN_PAYMENT_INTENT');
      return { kind: 'EXCEPTION', eventHash, reason: 'UNKNOWN_PAYMENT_INTENT', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
    }
    if (inquiry.payment_status === 'REFUNDED') {
      await finishServicePaymentEvent(client, eventHash, 'PROCESSED', 'REFUND_ALREADY_RECORDED');
      return { kind: 'DUPLICATE', eventHash, reason: 'REFUND_ALREADY_RECORDED', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
    }
    if (inquiry.payment_status !== 'PAID') {
      await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', 'REFUND_OUT_OF_SEQUENCE');
      return { kind: 'EXCEPTION', eventHash, reason: 'REFUND_OUT_OF_SEQUENCE', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
    }

    await client.query(
      `UPDATE service_inquiries
       SET payment_status = 'REFUNDED',
           refunded_at = COALESCE(refunded_at, to_timestamp($2)),
           updated_at = NOW()
       WHERE id = $1`,
      [inquiry.id, Number.isInteger(input.stripeCreated) ? Number(input.stripeCreated) : null],
    );
    await finishServicePaymentEvent(client, eventHash, 'PROCESSED', 'FULL_REFUND_RECORDED');
    return { kind: 'REFUND_RECORDED', eventHash, reason: 'FULL_REFUND_RECORDED', source: 'WEBHOOK' } as ServicePaymentProcessingResult;
  });
  await alertServicePaymentException(result);
  return result;
}

function subscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  return objectId(subscription.customer);
}

async function processSubscriptionEvent(
  event: Stripe.Event,
  eventKind: 'CHECKOUT_COMPLETED' | 'SUBSCRIPTION_UPDATED' | 'SUBSCRIPTION_DELETED',
  subscription: Stripe.Subscription,
) {
  const detectedPlan = entitlementPlanFromSubscriptionItems(subscription.items as any, CHECKOUT_PRICES);
  const candidate = eventKind === 'SUBSCRIPTION_DELETED'
    ? { status: 'CANCELED' as const, currentPeriodEnd: null, reason: 'CANCELED' as const }
    : subscriptionEntitlementCandidate(subscription as any, Boolean(detectedPlan));
  const result = await transaction(client => applySubscriptionEvent(client, {
    eventId: event.id,
    eventCreated: event.created,
    eventKind,
    subscriptionId: subscription.id || null,
    customerId: subscriptionCustomerId(subscription),
    metadataUserId: subscription.metadata?.userId || null,
    metadataOrgId: subscription.metadata?.orgId || null,
    candidate,
    detectedPlan,
    accessFeatures: detectedPlan ? getDefaultFeatures(detectedPlan) : [],
    freeFeatures: getDefaultFeatures('FREE'),
  }));

  if (result.kind === 'UNRESOLVED' || result.kind === 'IGNORED') {
    logger.warn('Subscription event did not change entitlement', {
      eventHash: requiredEventHash(event.id),
      eventKind,
      outcome: result.kind,
      reason: result.reason,
    });
    return result;
  }

  await auditLog({
    userId: result.userId,
    action: result.kind === 'FAIL_CLOSED' ? 'SUBSCRIPTION_EVENT_FAILED_CLOSED' : 'SUBSCRIPTION_EVENT_APPLIED',
    resource: 'billing',
    details: {
      eventKind,
      status: result.status,
      plan: result.plan,
      reason: result.reason,
      terminal: result.terminal,
    },
    timestamp: new Date().toISOString(),
  });
  logger.info('Subscription event processed', {
    userId: result.userId,
    eventKind,
    status: result.status,
    plan: result.plan,
    outcome: result.kind,
    terminal: result.terminal,
  });
  return result;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return objectId((invoice as any).subscription)
    || objectId((invoice as any).parent?.subscription_details?.subscription);
}

async function processInvoicePaymentFailure(event: Stripe.Event, invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    const result = { kind: 'UNRESOLVED' as const, userId: null, reason: 'SUBSCRIPTION_ID_MISSING' };
    logger.warn('Subscription-less invoice payment failure ignored', {
      eventHash: requiredEventHash(event.id),
      outcome: result.kind,
      reason: result.reason,
    });
    return result;
  }

  const result = await transaction(client => applyInvoicePaymentFailureEvent(client, {
      eventId: event.id,
      eventCreated: event.created,
      subscriptionId,
      customerId: objectId(invoice.customer),
      metadataUserId: null,
      metadataOrgId: null,
      candidate: { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS' },
      detectedPlan: null,
      accessFeatures: [],
      freeFeatures: getDefaultFeatures('FREE'),
      eventHash: requiredEventHash(event.id),
      auditTimestamp: new Date(event.created * 1000).toISOString(),
    }));
  logger.warn('Invoice payment failure processed', {
    eventHash: requiredEventHash(event.id),
    outcome: result.kind,
    reason: result.reason,
  });
  return result;
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

  logger.info('Webhook received', { type: event.type, eventHash: requiredEventHash(event.id) });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment') {
          const result = await recordPaidServiceInquiry({
            session,
            eventKey: event.id,
            eventType: event.type,
            stripeCreated: event.created,
            source: 'WEBHOOK',
          });
          logger.info('Service checkout webhook processed', {
            eventHash: result.eventHash,
            outcome: result.kind,
            reason: result.reason,
          });
          break;
        }

        if (session.mode !== 'subscription') {
          logger.info('Checkout completion ignored for unsupported mode', { mode: session.mode });
          break;
        }

        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
        if (!subscriptionId) throw new Error('Subscription checkout is missing its subscription identity');

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionResult = await processSubscriptionEvent(event, 'CHECKOUT_COMPLETED', subscription);
        if (subscriptionResult.kind === 'UNRESOLVED') {
          throw new Error(`Subscription checkout could not resolve its entitlement: ${subscriptionResult.reason}`);
        }

        if (subscriptionResult.kind === 'APPLIED') {
          try {
            await query(
              `INSERT INTO command_actions (actor_id, action_type, target, result, details) VALUES ($1, $2, $3, $4, $5)`,
              [subscriptionResult.userId, 'subscriber-onboarded', 'billing', 'success', JSON.stringify({ plan: subscriptionResult.plan })],
            );
          } catch { /* best effort — command_actions table may not exist yet */ }
        }

        if (
          (subscriptionResult.kind === 'APPLIED' || subscriptionResult.kind === 'FAIL_CLOSED')
          && (subscriptionResult.status === 'ACTIVE' || subscriptionResult.status === 'TRIALING')
        ) {
          const userRow = await queryOne<{ email: string }>(
            `SELECT email FROM users WHERE id = $1`, [subscriptionResult.userId],
          );
          if (userRow?.email) {
            sendEntitlementConfirmationEmail(
              userRow.email,
              subscriptionResult.userId,
              subscriptionResult.plan as Entitlement['plan'],
            ).catch(error => {
              logger.error('Entitlement email fire-and-forget failed', error as Error);
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        // Deliberately disabled until the production tombstone migration and
        // old-writer rollback window have been independently verified.
        logger.warn('Subscription update webhook remains disabled', {
          eventHash: requiredEventHash(event.id),
        });
        break;
      }

      case 'charge.refunded': {
        const result = await recordRefundedServiceInquiry({
          charge: event.data.object as Stripe.Charge,
          eventKey: event.id,
          eventType: event.type,
          stripeCreated: event.created,
        });
        logger.info('Service refund webhook processed', {
          eventHash: result.eventHash,
          outcome: result.kind,
          reason: result.reason,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await processSubscriptionEvent(event, 'SUBSCRIPTION_DELETED', subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await processInvoicePaymentFailure(event, invoice);
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

    if (
      entitlement.stripeSubscriptionTerminal
      || (entitlement.status !== 'ACTIVE' && entitlement.status !== 'TRIALING')
    ) {
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

let servicePaymentReconciliationRunning = false;

async function queueReconciliationFailure(runId: string): Promise<void> {
  const eventHash = requiredEventHash(`reconciliation-run-failed:${runId}`);
  const result = await transaction(async client => {
    const registered = await registerServicePaymentEvent(client, {
      eventHash,
      source: 'RECONCILIATION',
      eventType: 'service.payment.reconciliation.failed',
      stripeCreated: null,
      receiptHash: null,
      checkoutSessionHash: null,
      paymentIntentHash: null,
    });
    if (!registered) {
      return { kind: 'DUPLICATE', eventHash, reason: 'EVENT_ALREADY_RECORDED', source: 'RECONCILIATION' } as ServicePaymentProcessingResult;
    }
    await finishServicePaymentEvent(client, eventHash, 'EXCEPTION', 'RECONCILIATION_FAILED');
    return { kind: 'EXCEPTION', eventHash, reason: 'RECONCILIATION_FAILED', source: 'RECONCILIATION' } as ServicePaymentProcessingResult;
  });
  await alertServicePaymentException(result);
}

async function reconcileServicePayments(): Promise<void> {
  if (!stripe || servicePaymentReconciliationRunning) return;
  servicePaymentReconciliationRunning = true;

  const leaseOwner = `reconcile-${randomUUID()}`;
  let lease;
  let run: { id: string } | null;
  try {
    lease = await transaction(client => acquireServiceReconciliationLease(client, leaseOwner, 600));
    if (!lease) return;
    run = await queryOne<{ id: string }>(
      `INSERT INTO service_payment_reconciliation_runs DEFAULT VALUES RETURNING id`,
    );
  } catch (error) {
    if (lease) {
      await transaction(client => releaseServiceReconciliationLease(
        client,
        leaseOwner,
        false,
        'RECONCILIATION_START_FAILED',
      )).catch(() => false);
    }
    servicePaymentReconciliationRunning = false;
    throw error;
  } finally {
    if (!lease) servicePaymentReconciliationRunning = false;
  }
  if (!run) {
    servicePaymentReconciliationRunning = false;
    throw new Error('Could not start the service payment reconciliation ledger');
  }

  const counts = {
    sessionsChecked: 0,
    recentSessionsChecked: 0,
    paymentsRecorded: 0,
    refundsRecorded: 0,
    exceptionsRecorded: 0,
    duplicatesSeen: 0,
  };

  let completedCycle = false;
  try {
    const recentSessionIds = new Set<string>();
    const processSession = async (session: Stripe.Checkout.Session): Promise<void> => {
      counts.sessionsChecked += 1;
      if (session.payment_status !== 'paid') return;
      const result = await recordPaidServiceInquiry({
        session,
        eventType: 'checkout.session.reconciliation',
        stripeCreated: session.created,
        source: 'RECONCILIATION',
      });
      if (result.kind === 'PAYMENT_RECORDED') counts.paymentsRecorded += 1;
      if (result.kind === 'REFUND_RECORDED') counts.refundsRecorded += 1;
      if (result.kind === 'EXCEPTION') counts.exceptionsRecorded += 1;
      if (result.kind === 'DUPLICATE') counts.duplicatesSeen += 1;
    };

    counts.recentSessionsChecked = await runRecentReconciliationPass<Stripe.Checkout.Session>({
      listRecent: async () => {
        const page = await stripe.checkout.sessions.list({
          payment_link: WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId,
          status: 'complete',
          limit: 25,
        } as any);
        page.data.forEach(session => recentSessionIds.add(session.id));
        return { data: page.data };
      },
      processSession,
    });
    const recentRecorded = await transaction(client => recordServiceReconciliationRecentScan(
      client,
      leaseOwner,
      counts.recentSessionsChecked,
      600,
    ));
    if (!recentRecorded) throw new Error('SERVICE_RECONCILIATION_LEASE_LOST');

    const pageRun = await runReconciliationPages<Stripe.Checkout.Session>({
      startingAfter: lease.startingAfter,
      maxPages: 10,
      heartbeatEvery: 10,
      listPage: async startingAfter => {
        const page = await stripe.checkout.sessions.list({
          payment_link: WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId,
          status: 'complete',
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        } as any);
        return { data: page.data, has_more: page.has_more };
      },
      processSession: async session => {
        if (!recentSessionIds.has(session.id)) await processSession(session);
      },
      checkpoint: startingAfter => transaction(client => advanceServiceReconciliationCursor(
        client,
        leaseOwner,
        startingAfter,
        600,
      )),
    });
    completedCycle = pageRun.completedCycle;

    const released = await transaction(client => releaseServiceReconciliationLease(
      client,
      leaseOwner,
      completedCycle,
    ));
    if (!released) throw new Error('SERVICE_RECONCILIATION_LEASE_LOST');

    await query(
      `UPDATE service_payment_reconciliation_runs
       SET status = 'SUCCEEDED', sessions_checked = $2, payments_recorded = $3,
           refunds_recorded = $4, exceptions_recorded = $5, duplicates_seen = $6,
           recent_sessions_checked = $7,
           finished_at = NOW()
       WHERE id = $1`,
      [
        run.id,
        counts.sessionsChecked,
        counts.paymentsRecorded,
        counts.refundsRecorded,
        counts.exceptionsRecorded,
        counts.duplicatesSeen,
        counts.recentSessionsChecked,
      ],
    );
    logger.info('Service payment reconciliation completed', { ...counts, completedCycle });
  } catch (error) {
    await transaction(client => releaseServiceReconciliationLease(
      client,
      leaseOwner,
      false,
      'RECONCILIATION_FAILED',
    )).catch(() => false);
    await query(
      `UPDATE service_payment_reconciliation_runs
       SET status = 'FAILED', error_code = 'RECONCILIATION_FAILED',
           sessions_checked = $2, payments_recorded = $3, refunds_recorded = $4,
           exceptions_recorded = $5, duplicates_seen = $6,
           recent_sessions_checked = $7, finished_at = NOW()
       WHERE id = $1`,
      [
        run.id,
        counts.sessionsChecked,
        counts.paymentsRecorded,
        counts.refundsRecorded,
        counts.exceptionsRecorded,
        counts.duplicatesSeen,
        counts.recentSessionsChecked,
      ],
    ).catch(() => undefined);
    await queueReconciliationFailure(run.id).catch(alertError => {
      logger.error('Could not queue reconciliation failure alert', alertError as Error);
    });
    logger.error('Service payment reconciliation failed', error as Error);
  } finally {
    servicePaymentReconciliationRunning = false;
  }
}

function scheduleServicePaymentReconciliation(): void {
  if (
    process.env.NODE_ENV !== 'production'
    || !stripe
    || process.env.SERVICE_PAYMENT_RECONCILIATION_DISABLED === 'true'
  ) {
    return;
  }

  const firstRun = setTimeout(() => {
    reconcileServicePayments().catch(error => {
      logger.error('Initial service payment reconciliation failed', error as Error);
    });
  }, 30_000);
  firstRun.unref();

  const interval = setInterval(() => {
    reconcileServicePayments().catch(error => {
      logger.error('Scheduled service payment reconciliation failed', error as Error);
    });
  }, 15 * 60 * 1000);
  interval.unref();
}

let servicePaymentAlertRetryRunning = false;

async function runServicePaymentAlertRetryWorker(): Promise<void> {
  if (servicePaymentAlertRetryRunning) return;
  servicePaymentAlertRetryRunning = true;
  try {
    await retryOutstandingServicePaymentAlerts(20);
  } finally {
    servicePaymentAlertRetryRunning = false;
  }
}

function scheduleServicePaymentAlertRetries(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const firstRun = setTimeout(() => {
    runServicePaymentAlertRetryWorker().catch(error => {
      logger.error('Initial service payment alert retry failed', error as Error);
    });
  }, 20_000);
  firstRun.unref();

  const interval = setInterval(() => {
    runServicePaymentAlertRetryWorker().catch(error => {
      logger.error('Scheduled service payment alert retry failed', error as Error);
    });
  }, 5 * 60 * 1000);
  interval.unref();
}

// Express 4 does not automatically route rejected async handlers here. The
// resolver uses asyncRoute above so provider/database failures are contained
// and never disclose the operator candidate or upstream response.
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const eventHash = /^[a-f0-9]{64}$/.test(req.params?.eventHash || '')
    ? req.params.eventHash
    : null;
  logger.error('Billing internal request failed', new Error('Internal dependency failure'), {
    requestId: req.headers['x-request-id'],
    eventHash,
  });
  if (res.headersSent) return;
  res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  logger.info(`Billing service started on port ${PORT}`, {
    stripeConfigured: !!stripe,
    webhookSecretConfigured: !!STRIPE_WEBHOOK_SECRET,
    paymentOperationsReady: paymentOperationsReadiness.ready,
    paymentOperationsReadinessReasons: paymentOperationsReadiness.reasons,
  });
  scheduleServicePaymentAlertRetries();
  scheduleServicePaymentReconciliation();
});

export default app;

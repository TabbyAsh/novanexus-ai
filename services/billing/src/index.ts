import express, { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, ERROR_CODES, query, queryOne } from '@nova/shared';
import {
  checkoutMetadataMatchesAccount,
  entitlementPlanFromPriceId,
  fullyRefundedPaymentIntentFromCharge,
  productionWebhookConfigurationError,
  resolveCheckoutSelection,
  servicePaymentReferenceFromCheckout,
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
    } catch (error) {
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
// Webhook Endpoint
// ============================================

async function recordPaidServiceInquiry(session: Stripe.Checkout.Session): Promise<boolean> {
  const payment = servicePaymentReferenceFromCheckout(session);
  if (!payment) return false;

  const updated = await queryOne<{ receipt_id: string }>(
    `UPDATE service_inquiries
     SET payment_status = 'PAID',
         stripe_checkout_session_id = $1,
         stripe_payment_intent_id = $2,
         paid_at = NOW()
     WHERE receipt_id = $3
       AND payment_status = 'NOT_STARTED'
     RETURNING receipt_id`,
    [payment.checkoutSessionId, payment.paymentIntentId, payment.receiptId],
  );

  logger.info('Service payment receipt processed', {
    checkoutSessionId: payment.checkoutSessionId,
    updated: !!updated,
  });
  return !!updated;
}

async function recordRefundedServiceInquiry(charge: Stripe.Charge): Promise<boolean> {
  const paymentIntentId = fullyRefundedPaymentIntentFromCharge(charge);
  if (!paymentIntentId) return false;

  const updated = await queryOne<{ receipt_id: string }>(
    `UPDATE service_inquiries
     SET payment_status = 'REFUNDED'
     WHERE stripe_payment_intent_id = $1
       AND payment_status = 'PAID'
       AND NOT EXISTS (
         SELECT 1
         FROM service_inquiries AS duplicate
         WHERE duplicate.stripe_payment_intent_id = $1
           AND duplicate.payment_status = 'PAID'
           AND duplicate.id <> service_inquiries.id
       )
     RETURNING receipt_id`,
    [paymentIntentId],
  );

  logger.info('Service refund receipt processed', {
    paymentIntentId,
    updated: !!updated,
  });
  return !!updated;
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
          const paymentRecorded = await recordPaidServiceInquiry(session);
          if (!paymentRecorded) {
            logger.warn('Paid service checkout did not match a pending receipt', {
              checkoutSessionId: session.id,
            });
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
        const refundRecorded = await recordRefundedServiceInquiry(event.data.object as Stripe.Charge);
        if (!refundRecorded) {
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

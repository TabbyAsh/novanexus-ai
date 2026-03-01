import express, { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { createLogger } from '@nova/telemetry';
import { SERVICE_PORTS, HTTP_STATUS, ERROR_CODES, query, queryOne } from '@nova/shared';

const app = express();
const logger = createLogger('billing-service');
const PORT = process.env.PORT || SERVICE_PORTS.BILLING || 3006;

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:8080';

// Initialize Stripe (will be null if no key provided)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

// Price IDs (configure in Stripe Dashboard)
const PRICE_IDS = {
  NOVA_HUB_LITE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_nova_lite_monthly',
  NOVA_HUB_LITE_YEARLY: process.env.STRIPE_PRICE_YEARLY || 'price_nova_lite_yearly',
};

// ============================================
// Types
// ============================================

interface Entitlement {
  id: string;
  userId: string;
  orgId: string;
  plan: 'FREE' | 'LITE' | 'PRO';
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
    logger.warn('Corrupt features_json, using defaults', { userId, plan: result.plan });
    features = getDefaultFeatures(result.plan as Entitlement['plan']);
    // Auto-repair: update the row with valid JSON
    query('UPDATE entitlements SET features_json = $1 WHERE user_id = $2', [JSON.stringify(features), userId]).catch(() => {});
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
    const { priceId, interval = 'monthly' } = req.body;
    const selectedPriceId = priceId || (interval === 'yearly' ? PRICE_IDS.NOVA_HUB_LITE_YEARLY : PRICE_IDS.NOVA_HUB_LITE_MONTHLY);

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
      line_items: [{ price: selectedPriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing/cancel`,
      subscription_data: {
        metadata: { userId, orgId },
      },
      metadata: { userId, orgId },
    });

    await auditLog({
      userId,
      action: 'CHECKOUT_SESSION_CREATED',
      resource: 'billing',
      details: { sessionId: session.id, priceId: selectedPriceId },
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

app.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(400).send('Stripe not configured');
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
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
        const userId = session.metadata?.userId;
        
        if (userId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          await updateEntitlement(userId, {
            plan: 'LITE',
            status: 'ACTIVE',
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            features: getDefaultFeatures('LITE'),
          });

          await auditLog({
            userId,
            action: 'SUBSCRIPTION_CREATED',
            resource: 'billing',
            details: { subscriptionId: subscription.id, plan: 'LITE' },
            timestamp: new Date().toISOString(),
          });

          logger.info('Subscription activated', { userId, subscriptionId: subscription.id });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          const status = subscription.status === 'active' ? 'ACTIVE' 
            : subscription.status === 'past_due' ? 'PAST_DUE'
            : subscription.status === 'canceled' ? 'CANCELED'
            : subscription.status === 'trialing' ? 'TRIALING'
            : 'ACTIVE';

          await updateEntitlement(userId, {
            status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          });

          await auditLog({
            userId,
            action: 'SUBSCRIPTION_UPDATED',
            resource: 'billing',
            details: { subscriptionId: subscription.id, status },
            timestamp: new Date().toISOString(),
          });

          logger.info('Subscription updated', { userId, status });
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
      plans: [
        {
          id: 'FREE',
          name: 'Free',
          price: 0,
          interval: null,
          features: ['Basic scanner', '1 watchlist', 'Limited history'],
        },
        {
          id: 'LITE',
          name: 'Nova Hub Lite',
          priceMonthly: 29,
          priceYearly: 290,
          interval: 'month',
          features: [
            'Full scanner with RSI/MACD/Momentum',
            'Unlimited watchlists',
            'Thesis card generator',
            'Paper trading simulator',
            'Email alerts',
            'Weekly PDF reports',
            'CSV export',
          ],
        },
        {
          id: 'PRO',
          name: 'Nova Hub Pro',
          priceMonthly: 99,
          priceYearly: 990,
          interval: 'month',
          comingSoon: true,
          features: [
            'Everything in Lite',
            'API access',
            'Real-time alerts',
            'Custom indicators',
            'Priority support',
          ],
        },
      ],
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

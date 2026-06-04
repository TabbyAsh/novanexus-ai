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
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Nova Trader Intelligence <brief@novanexus-ai.com>';

// Initialize Stripe (will be null if no key provided)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

// Price IDs (configure in Stripe Dashboard)
const PRICE_IDS = {
  NOVA_HUB_LITE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_nova_lite_monthly',
  NOVA_HUB_LITE_YEARLY: process.env.STRIPE_PRICE_YEARLY || 'price_nova_lite_yearly',
  FOUNDING_MONTHLY: process.env.STRIPE_PRICE_FOUNDING || 'price_nova_founding_monthly',
  FLIP_CARD_PRO: process.env.STRIPE_PRICE_FLIP_PRO || 'price_1TG1jXIRGET1dbqS9zFdeE5b',
};

// Map Stripe price IDs to plan names
function planFromPriceId(priceId: string): Entitlement['plan'] {
  if (priceId === PRICE_IDS.FOUNDING_MONTHLY) return 'FOUNDING';
  if (priceId === PRICE_IDS.FLIP_CARD_PRO) return 'LITE';
  if (priceId === PRICE_IDS.NOVA_HUB_LITE_MONTHLY || priceId === PRICE_IDS.NOVA_HUB_LITE_YEARLY) return 'LITE';
  return 'LITE'; // default fallback
}

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
// Welcome Email (best-effort, non-blocking)
// ============================================

async function sendWelcomeEmail(email: string, userId: string): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn('Welcome email skipped: RESEND_API_KEY not set', { userId });
    await logOnboardingAction(userId, 'welcome-email', 'skipped', { reason: 'RESEND_API_KEY not configured' });
    return;
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const templatePath = path.resolve(__dirname, '..', '..', '..', 'templates', 'welcome-email.html');
    let html = '';
    try {
      html = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      // Fallback: simple text if template not found
      html = '<h1>Welcome to Nova</h1><p>Your Trader Intelligence subscription is active. Daily Briefs are sent weekdays before 9 AM ET.</p><p>Log in at novanexus-ai.com/dashboard</p>';
      logger.warn('Welcome email template not found, using fallback', { templatePath });
    }

    const https = await import('https');
    const body = JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: 'Welcome to Nova Trader Intelligence',
      html,
    });

    await new Promise<void>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Resend API ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    logger.info('Welcome email sent', { userId, email });
    await logOnboardingAction(userId, 'welcome-email', 'success', { email });
  } catch (err) {
    logger.error('Welcome email failed', err as Error, { userId });
    await logOnboardingAction(userId, 'welcome-email', 'failure', { error: (err as Error).message, email });
  }
}

async function sendFoundingMemberConciergeEmail(email: string, userId: string): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn('Concierge email skipped: RESEND_API_KEY not set', { userId });
    return;
  }
  const html = `<div style="font-family:system-ui,sans-serif;background:#0a0a0f;color:#fff;padding:32px;max-width:600px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div style="width:40px;height:40px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:20px">N</div>
      <div>
        <div style="font-size:18px;font-weight:700">You're a Founding Member</div>
        <div style="font-size:12px;color:#f59e0b">⭐ ${email}</div>
      </div>
    </div>

    <p style="color:#9ca3af;font-size:15px;line-height:1.6">
      Welcome. Your founding membership is active. Here's how to start making money with Nova today.
    </p>

    <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin:20px 0">
      <div style="font-size:13px;font-weight:600;color:#f59e0b;margin-bottom:16px">Your 3-step onboarding</div>

      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
        <div style="width:24px;height:24px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;flex-shrink:0">1</div>
        <div>
          <div style="font-weight:600;font-size:14px;color:#fff">Run the Flip Finder</div>
          <div style="color:#9ca3af;font-size:13px;margin-top:2px">Scan your local Craigslist for free items worth flipping. Nova evaluates each one against real eBay pricing and gives you a buy/pass verdict with a negotiation script.</div>
          <a href="https://novanexus-ai.com/dashboard/scanner" style="color:#10b981;font-size:12px;text-decoration:none">→ novanexus-ai.com/dashboard/scanner</a>
        </div>
      </div>

      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
        <div style="width:24px;height:24px;background:#8b5cf6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;flex-shrink:0">2</div>
        <div>
          <div style="font-weight:600;font-size:14px;color:#fff">Check this morning's stock setups</div>
          <div style="color:#9ca3af;font-size:13px;margin-top:2px">The screener runs momentum patterns across 500+ tickers. Use it to find setups for paper trading. Daily email alerts start tomorrow morning.</div>
          <a href="https://novanexus-ai.com/dashboard/screener" style="color:#8b5cf6;font-size:12px;text-decoration:none">→ novanexus-ai.com/dashboard/screener</a>
        </div>
      </div>

      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="width:24px;height:24px;background:#f59e0b;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;flex-shrink:0">3</div>
        <div>
          <div style="font-weight:600;font-size:14px;color:#fff">Log your first outcome</div>
          <div style="color:#9ca3af;font-size:13px;margin-top:2px">When you buy an item or place a trade — log the result. Nova learns from every outcome and adjusts future recommendations specifically for your market.</div>
          <a href="https://novanexus-ai.com/dashboard/outcomes" style="color:#f59e0b;font-size:12px;text-decoration:none">→ novanexus-ai.com/dashboard/outcomes</a>
        </div>
      </div>
    </div>

    <p style="color:#6b7280;font-size:13px;line-height:1.5">
      You're one of 50 founding members. Your subscription directly funds the AI infrastructure that makes these tools work. Expect improvements weekly. Reply to this email if you need anything — I read every one.
    </p>

    <a href="https://novanexus-ai.com/dashboard" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-top:16px">
      Open Nova Dashboard →
    </a>

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #1f2937;font-size:11px;color:#374151">
      Powered by Nova · <a href="https://novanexus-ai.com" style="color:#6b7280">novanexus-ai.com</a>
    </div>
  </div>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Nova <hello@novanexus-ai.com>',
        to: [email],
        subject: '⭐ You\'re a Nova Founding Member — here\'s how to start',
        html,
      }),
    });
    logger.info('Founding member concierge email sent', { userId, email });
    await logOnboardingAction(userId, 'concierge-email', 'success', { email });
  } catch (err) {
    logger.error('Concierge email failed', err as Error, { userId });
    await logOnboardingAction(userId, 'concierge-email', 'failure', { error: (err as Error).message });
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
    const { priceId, interval = 'monthly', plan } = req.body;
    let selectedPriceId = priceId;
    if (!selectedPriceId) {
      if (plan === 'FOUNDING' || plan === 'founding') {
        selectedPriceId = PRICE_IDS.FOUNDING_MONTHLY;
      } else if (plan === 'FLIP_PRO' || plan === 'LITE') {
        selectedPriceId = PRICE_IDS.FLIP_CARD_PRO;
      } else if (interval === 'yearly') {
        selectedPriceId = PRICE_IDS.NOVA_HUB_LITE_YEARLY;
      } else {
        selectedPriceId = PRICE_IDS.FLIP_CARD_PRO;
      }
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
          
          // Detect plan from the price ID on the subscription
          const subPriceId = subscription.items?.data?.[0]?.price?.id || '';
          const detectedPlan = planFromPriceId(subPriceId);

          await updateEntitlement(userId, {
            plan: detectedPlan,
            status: 'ACTIVE',
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            features: getDefaultFeatures(detectedPlan),
          });

          await auditLog({
            userId,
            action: 'SUBSCRIPTION_CREATED',
            resource: 'billing',
            details: { subscriptionId: subscription.id, plan: 'LITE' },
            timestamp: new Date().toISOString(),
          });

          // Log onboarding event for command layer visibility
          try {
            await query(
              `INSERT INTO command_actions (actor_id, action_type, target, result, details) VALUES ($1, $2, $3, $4, $5)`,
              [userId, 'subscriber-onboarded', 'billing', 'success', JSON.stringify({ plan: 'LITE', subscriptionId: subscription.id })]
            );
          } catch { /* best effort — command_actions table may not exist yet */ }

          logger.info('Subscription activated', { userId, subscriptionId: subscription.id });

          // Send welcome email (best-effort, non-blocking)
          const userRow = await queryOne<{ email: string }>(
            `SELECT email FROM users WHERE id = $1`, [userId]
          );
          if (userRow?.email) {
            const emailFn = detectedPlan === 'FOUNDING'
              ? sendFoundingMemberConciergeEmail(userRow.email, userId)
              : sendWelcomeEmail(userRow.email, userId);
            emailFn.catch(err => {
              logger.error('Welcome/concierge email fire-and-forget failed', err as Error);
            });
          }
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
          features: ['3 Flip Card analyses per day', 'Real eBay sold comps', 'Full cost breakdown', 'Buy/negotiate/pass verdict'],
        },
        {
          id: 'LITE',
          name: 'Flip Card Pro',
          priceMonthly: 9,
          priceYearly: 90,
          interval: 'month',
          features: [
            'Unlimited Flip Card analyses',
            'Saved analysis history',
            'Daily Flip Alert emails',
            'Priority comp data',
            'All trading tools included',
          ],
        },
        {
          id: 'FOUNDING',
          name: 'Founding Member',
          priceMonthly: 99,
          priceYearly: 990,
          interval: 'month',
          founding: true,
          features: [
            'Everything in Lite — unlimited',
            'Founding Member badge',
            'Concierge onboarding (ASSIST mode)',
            'Flip pipeline + deal cards',
            'Weekly improvement reports',
            'Priority support + early access',
            'API access',
            'Advanced analytics',
            'Limited to 50 seats',
          ],
        },
        {
          id: 'PRO',
          name: 'Nova Hub Pro',
          priceMonthly: 149,
          priceYearly: 1490,
          interval: 'month',
          comingSoon: true,
          features: [
            'Everything in Founding',
            'Full automation gates',
            'Custom indicators',
            'Real-time alerts',
            'Team collaboration',
          ],
        },
      ],
    },
  });
});

// Founding Member seat count (public)
app.get('/v1/billing/founding-seats', async (_req: Request, res: Response) => {
  try {
    const seatConfig = await queryOne<{ max_seats: number }>('SELECT max_seats FROM founding_seats LIMIT 1');
    const taken = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM entitlements WHERE plan = 'FOUNDING' AND status = 'ACTIVE'`
    );
    const maxSeats = seatConfig?.max_seats || 50;
    const takenCount = parseInt(taken?.count || '0', 10);
    res.json({
      success: true,
      data: { maxSeats, taken: takenCount, remaining: Math.max(0, maxSeats - takenCount) },
    });
  } catch (error) {
    res.json({ success: true, data: { maxSeats: 50, taken: 0, remaining: 50 } });
  }
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

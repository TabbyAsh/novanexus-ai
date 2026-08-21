import {
  checkoutMetadataMatchesAccount,
  entitlementPlanFromPriceId,
  fullyRefundedPaymentIntentFromCharge,
  proofServiceReceiptFromMetadata,
  productionWebhookConfigurationError,
  resolveCheckoutSelection,
  stripeStatusToEntitlementStatus,
  type CheckoutPriceMap,
} from '../billing-contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const prices: CheckoutPriceMap = {
  'LITE:monthly': 'price_lite_monthly',
  'LITE:yearly': 'price_lite_yearly',
  'FOUNDING:monthly': 'price_founding_monthly',
  'FLIP_PRO:monthly': 'price_flip_monthly',
};

describe('checkout selection contract', () => {
  it('selects an allowlisted server-side price from logical plan and interval', () => {
    expect(resolveCheckoutSelection({ plan: 'LITE', interval: 'yearly' }, prices)).toEqual({
      ok: true,
      plan: 'LITE',
      interval: 'yearly',
      priceId: 'price_lite_yearly',
      entitlementPlan: 'LITE',
    });
  });

  it('never accepts a client-supplied Stripe price ID', () => {
    expect(resolveCheckoutSelection({
      plan: 'LITE',
      interval: 'monthly',
      priceId: 'price_attacker_selected',
    }, prices)).toMatchObject({ ok: false, code: 'CLIENT_PRICE_ID_NOT_ALLOWED', status: 400 });
  });

  it('does not silently turn an unavailable yearly plan into monthly checkout', () => {
    const monthlyOnly: CheckoutPriceMap = { 'LITE:monthly': 'price_lite_monthly' };
    expect(resolveCheckoutSelection({ plan: 'LITE', interval: 'yearly' }, monthlyOnly))
      .toMatchObject({ ok: false, code: 'PLAN_NOT_AVAILABLE', status: 503 });
  });

  it('rejects non-allowlisted plan and interval combinations', () => {
    expect(resolveCheckoutSelection({ plan: 'FOUNDING', interval: 'yearly' }, prices))
      .toMatchObject({ ok: false, code: 'INVALID_CHECKOUT_REQUEST', status: 400 });
    expect(resolveCheckoutSelection({ plan: 'PRO', interval: 'monthly' }, prices))
      .toMatchObject({ ok: false, code: 'INVALID_CHECKOUT_REQUEST', status: 400 });
  });

  it('maps only configured, unambiguous Stripe prices to entitlements', () => {
    expect(entitlementPlanFromPriceId('price_founding_monthly', prices)).toBe('FOUNDING');
    expect(entitlementPlanFromPriceId('price_flip_monthly', prices)).toBe('LITE');
    expect(entitlementPlanFromPriceId('price_unknown', prices)).toBeNull();
  });
});

describe('webhook safety contract', () => {
  it('requires the signing secret in production', () => {
    expect(productionWebhookConfigurationError('production', '')).toBe(
      'STRIPE_WEBHOOK_SECRET is required in production',
    );
    expect(productionWebhookConfigurationError('production', 'whsec_test')).toBeNull();
    expect(productionWebhookConfigurationError('development', '')).toBeNull();
  });

  it('fails non-access subscription states closed', () => {
    expect(stripeStatusToEntitlementStatus('active')).toBe('ACTIVE');
    expect(stripeStatusToEntitlementStatus('trialing')).toBe('TRIALING');
    expect(stripeStatusToEntitlementStatus('canceled')).toBe('CANCELED');
    expect(stripeStatusToEntitlementStatus('unpaid')).toBe('PAST_DUE');
    expect(stripeStatusToEntitlementStatus('future_stripe_state')).toBe('PAST_DUE');
  });

  it('binds checkout verification to both the authenticated user and organization', () => {
    const metadata = { userId: 'user-1', orgId: 'org-1' };
    expect(checkoutMetadataMatchesAccount(metadata, 'user-1', 'org-1')).toBe(true);
    expect(checkoutMetadataMatchesAccount(metadata, 'user-2', 'org-1')).toBe(false);
    expect(checkoutMetadataMatchesAccount(metadata, 'user-1', 'org-2')).toBe(false);
    expect(checkoutMetadataMatchesAccount(undefined, 'user-1', 'org-1')).toBe(false);
  });

  it('retrieves the Stripe session before returning bounded verification state', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const endpointStart = billingSource.indexOf("app.get('/v1/billing/checkout-session/status'");
    const endpointEnd = billingSource.indexOf('// Customer Portal Endpoint', endpointStart);
    const endpoint = billingSource.slice(endpointStart, endpointEnd);

    expect(endpointStart).toBeGreaterThan(-1);
    expect(endpoint).toContain('stripe.checkout.sessions.retrieve(sessionId)');
    expect(endpoint).toContain('checkoutMetadataMatchesAccount(session.metadata, userId, orgId)');
    expect(endpoint).toContain("session.status === 'complete' ? 'complete' : 'processing'");
    expect(endpoint).toContain("session.payment_status === 'paid' ? 'paid' : 'unpaid'");
    expect(endpoint).not.toContain('session.url');
    expect(endpoint).not.toContain('session.id');
  });

  it('recognizes only a full refund tied to a payment intent', () => {
    expect(fullyRefundedPaymentIntentFromCharge({
      refunded: true,
      payment_intent: 'pi_service_payment',
    })).toBe('pi_service_payment');
    expect(fullyRefundedPaymentIntentFromCharge({
      refunded: false,
      payment_intent: 'pi_partial_refund',
    })).toBeNull();
    expect(fullyRefundedPaymentIntentFromCharge({ refunded: true })).toBeNull();
  });

  it('recognizes an unbound refund only from governed service metadata', () => {
    const receiptId = `svc_${'A'.repeat(24)}`;
    expect(proofServiceReceiptFromMetadata({
      receiptId,
      serviceCode: 'WORKFLOW_SETUP_PILOT',
    })).toBe(receiptId);
    expect(proofServiceReceiptFromMetadata({ receiptId, serviceCode: 'SUBSCRIPTION' })).toBeNull();
    expect(proofServiceReceiptFromMetadata({
      receiptId: 'svc_invalid',
      serviceCode: 'WORKFLOW_SETUP_PILOT',
    })).toBeNull();
  });

  it('issues pilot checkout only from server-owned scope and price authority', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const endpointStart = billingSource.indexOf("app.post('/v1/billing/service-checkout'");
    const endpointEnd = billingSource.indexOf("app.post('/v1/billing/checkout-session'", endpointStart);
    const endpoint = billingSource.slice(endpointStart, endpointEnd);

    expect(endpointStart).toBeGreaterThan(-1);
    expect(endpoint).toContain("evaluateProofCommand(checkoutSnapshot(row), 'GENERATE_PAYMENT_LINK')");
    expect(endpoint).toContain('unit_amount: PROOF_PRICE_CENTS');
    expect(endpoint).toContain('currency: PROOF_CURRENCY.toLowerCase()');
    expect(endpoint).toContain('scopeHash: row.scope_hash');
    expect(endpoint).toContain('payment_intent_data: { metadata }');
    expect(endpoint).not.toContain('req.body?.amount');
    expect(endpoint).not.toContain('req.body?.currency');
    expect(endpoint).not.toContain('req.body?.price');
  });

  it('deduplicates and authority-checks pilot payment webhooks before marking paid', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const webhookStart = billingSource.indexOf('async function registerServiceWebhook');
    const webhookEnd = billingSource.indexOf("app.post('/webhook'", webhookStart);
    const webhook = billingSource.slice(webhookStart, webhookEnd);

    expect(webhook).toContain('service_case_webhook_events');
    expect(webhook).toContain('ON CONFLICT (stripe_event_id) DO NOTHING');
    expect(webhook).toContain('proofCheckoutMatchesAuthority(session');
    expect(webhook).toContain('checkoutSessionId: row.stripe_checkout_session_id');
    expect(webhook).toContain("eventType: 'proof.payment_confirmed'");
    expect(webhook).toContain("riskCode: 'PAYMENT_AUTHORITY_MISMATCH'");
  });

  it('persists an early full refund and reconciles it before any paid transition', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const webhookStart = billingSource.indexOf('async function recordPaidServiceInquiry');
    const webhookEnd = billingSource.indexOf("app.post('/webhook'", webhookStart);
    const webhook = billingSource.slice(webhookStart, webhookEnd);
    const pendingLookup = webhook.indexOf('FROM service_case_pending_refunds');
    const paidTransition = webhook.indexOf("SET payment_status = 'PAID'");

    expect(pendingLookup).toBeGreaterThan(-1);
    expect(paidTransition).toBeGreaterThan(pendingLookup);
    expect(webhook).toContain('INSERT INTO service_case_pending_refunds');
    expect(webhook).toContain("'PENDING_PAYMENT_RECONCILIATION'");
    expect(billingSource).toContain("eventType: 'proof.payment_refunded'");
    expect(billingSource).toContain("'PAYMENT_REFUNDED_BEFORE_CONFIRMATION'");
    expect(webhook).toContain('resolved_at = NOW()');

    const migration = readFileSync(
      resolve(__dirname, '..', '..', '..', '..', 'infra', 'migrations', '038_billing_payment_reconciliation.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS service_case_pending_refunds');
    expect(migration).toContain('payment_intent_id VARCHAR(255) PRIMARY KEY');
    expect(migration).toContain('WHERE resolved_at IS NULL');
    expect(migration).toContain('service_case_pending_refunds_terminal');
  });

  it('replays a checkout key from its exact durable Stripe session binding', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const endpointStart = billingSource.indexOf("app.post('/v1/billing/service-checkout'");
    const endpointEnd = billingSource.indexOf("app.post('/v1/billing/checkout-session'", endpointStart);
    const endpoint = billingSource.slice(endpointStart, endpointEnd);
    const replayStart = endpoint.indexOf('if (priorAttempt)');
    const replayEnd = endpoint.indexOf('// Events created by an older deployment', replayStart);
    const replay = endpoint.slice(replayStart, replayEnd);

    expect(billingSource).toContain('FROM service_checkout_attempts');
    expect(billingSource).toContain('STRIPE_SECRET_KEY is required in production');
    expect(replay).toContain('stripe.checkout.sessions.retrieve(priorAttempt.stripe_checkout_session_id)');
    expect(replay).toContain('version: Number(priorAttempt.aggregate_version)');
    expect(replay).not.toContain('row.stripe_checkout_session_id');
    expect(endpoint).toContain('recordProofCheckoutAttempt(client');
  });

  it('keeps self-service subscription checkout disabled', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const endpointStart = billingSource.indexOf("app.post('/v1/billing/checkout-session'");
    const endpointEnd = billingSource.indexOf("app.get('/v1/billing/checkout-session/status'", endpointStart);
    const endpoint = billingSource.slice(endpointStart, endpointEnd);

    expect(endpoint).toContain('res.status(410)');
    expect(endpoint).toContain('SELF_SERVE_CHECKOUT_DISABLED');
    expect(endpoint).not.toContain('stripe.checkout.sessions.create');
  });

  it('stages and builds proof-core in the standalone billing image', () => {
    const dockerfile = readFileSync(resolve(__dirname, '..', '..', 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY libs/proof-core/package.json ./libs/proof-core/');
    expect(dockerfile).toContain('--filter=@nova/proof-core');
    expect(dockerfile).not.toContain('|| true');
  });

  it('rechecks current configured-owner membership inside billing authority', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const operatorStart = billingSource.indexOf('async function proofOperator');
    const operatorEnd = billingSource.indexOf('function checkoutSnapshot', operatorStart);
    const operator = billingSource.slice(operatorStart, operatorEnd);

    expect(operator).toContain("payload.scopes.includes('ops.admin')");
    expect(operator).toContain('JOIN org_members AS membership');
    expect(operator).toContain("current.status !== 'ACTIVE'");
    expect(operator).toContain("current.role === 'BOT'");
    expect(operator).toContain('PLATFORM_OWNER_EMAILS.has(current.email.toLowerCase())');
  });

  it('reports both production Stripe authority gates in billing readiness', () => {
    const billingSource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const healthStart = billingSource.indexOf("app.get('/health'");
    const healthEnd = billingSource.indexOf('// Entitlement Helpers', healthStart);
    const health = billingSource.slice(healthStart, healthEnd);
    const validateEnv = readFileSync(
      resolve(__dirname, '..', '..', '..', '..', 'scripts', 'validate-env.js'),
      'utf8',
    );

    expect(health).toContain("process.env.NODE_ENV !== 'production' || Boolean(STRIPE_SECRET_KEY)");
    expect(health).toContain("process.env.NODE_ENV !== 'production' || Boolean(STRIPE_WEBHOOK_SECRET)");
    expect(health).toContain('checks.database && checks.stripeSecret && checks.webhookSignature');
    expect(validateEnv).toContain("'STRIPE_SECRET_KEY'");
    expect(validateEnv).toContain("'STRIPE_WEBHOOK_SECRET'");
  });
});

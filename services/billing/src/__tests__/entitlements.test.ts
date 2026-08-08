import {
  checkoutMetadataMatchesAccount,
  entitlementPlanFromPriceId,
  fullyRefundedPaymentIntentFromCharge,
  productionWebhookConfigurationError,
  resolveCheckoutSelection,
  servicePaymentReferenceFromCheckout,
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

  it('recognizes only a paid one-time session with an opaque service receipt', () => {
    const reference = servicePaymentReferenceFromCheckout({
      id: 'cs_service_payment',
      mode: 'payment',
      payment_status: 'paid',
      client_reference_id: `svc_${'A'.repeat(24)}`,
      payment_intent: 'pi_service_payment',
    });

    expect(reference).toEqual({
      receiptId: `svc_${'A'.repeat(24)}`,
      checkoutSessionId: 'cs_service_payment',
      paymentIntentId: 'pi_service_payment',
    });
    expect(servicePaymentReferenceFromCheckout({
      id: 'cs_subscription',
      mode: 'subscription',
      payment_status: 'paid',
      client_reference_id: `svc_${'A'.repeat(24)}`,
    })).toBeNull();
    expect(servicePaymentReferenceFromCheckout({
      id: 'cs_unpaid',
      mode: 'payment',
      payment_status: 'unpaid',
      client_reference_id: `svc_${'A'.repeat(24)}`,
    })).toBeNull();
    expect(servicePaymentReferenceFromCheckout({
      id: 'cs_without_payment_intent',
      mode: 'payment',
      payment_status: 'paid',
      client_reference_id: `svc_${'A'.repeat(24)}`,
    })).toBeNull();
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
});

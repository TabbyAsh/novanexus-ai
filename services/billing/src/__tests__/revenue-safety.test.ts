import {
  WORKFLOW_PILOT_PAYMENT_AUTHORITY,
  entitlementPlanFromSubscriptionItems,
  failClosedEntitlementProjection,
  serviceInquiryPaymentDecision,
  servicePaymentAlertBackoffMs,
  servicePaymentOperationsReadiness,
  serviceReconciliationEventId,
  subscriptionBillingPeriodEnd,
  subscriptionEntitlementCandidate,
  subscriptionStateEventDecision,
  subscriptionUpdateDecision,
  validateServicePaymentCheckout,
  type CheckoutPriceMap,
  type ServiceInquiryPaymentRow,
} from '../billing-contract';
import {
  resolveRedactedPaymentException,
  securePaymentResolverAuthorized,
} from '../operator-resolution';
import { deliverRedactedServicePaymentAlert } from '../alert-delivery';
import { runRecentReconciliationPass, runReconciliationPages } from '../reconciliation-runner';

const prices: CheckoutPriceMap = {
  'LITE:monthly': 'price_lite_monthly',
  'LITE:yearly': 'price_lite_yearly',
  'FOUNDING:monthly': 'price_founding_monthly',
};

const CLOVER_PERIOD = 1_800_000_000;
const EARLIER_PERIOD = 1_790_000_000;
const LEGACY_PERIOD = 1_810_000_000;

describe('Stripe Clover subscription periods', () => {
  it('uses the Clover item period and preserves the legacy top-level fallback', () => {
    expect(subscriptionBillingPeriodEnd({
      items: { data: [{ current_period_end: CLOVER_PERIOD }] },
    })).toBe(CLOVER_PERIOD);
    expect(subscriptionBillingPeriodEnd({ current_period_end: LEGACY_PERIOD })).toBe(LEGACY_PERIOD);
    expect(subscriptionBillingPeriodEnd({
      current_period_end: LEGACY_PERIOD,
      items: { data: [{}] },
    })).toBe(LEGACY_PERIOD);
  });

  it('uses the earliest usable period deterministically for multiple items', () => {
    expect(subscriptionBillingPeriodEnd({
      current_period_end: LEGACY_PERIOD,
      items: {
        data: [
          { current_period_end: CLOVER_PERIOD },
          { current_period_end: EARLIER_PERIOD },
        ],
      },
    })).toBe(EARLIER_PERIOD);
  });

  it('fails closed when any Clover item period is missing or malformed', () => {
    expect(subscriptionBillingPeriodEnd({
      current_period_end: LEGACY_PERIOD,
      items: {
        data: [
          { current_period_end: CLOVER_PERIOD },
          {},
        ],
      },
    })).toBeNull();
    expect(subscriptionBillingPeriodEnd({
      current_period_end: LEGACY_PERIOD,
      items: {
        data: [
          { current_period_end: CLOVER_PERIOD },
          { current_period_end: 'not-a-timestamp' },
        ],
      },
    })).toBeNull();
  });

  it('fails closed when Stripe says the embedded item list is truncated', () => {
    const truncated = {
      current_period_end: LEGACY_PERIOD,
      items: { has_more: true, data: [{ current_period_end: CLOVER_PERIOD }] },
    };
    expect(subscriptionBillingPeriodEnd(truncated)).toBeNull();
    expect(entitlementPlanFromSubscriptionItems({
      has_more: true,
      data: [{ price: { id: 'price_lite_monthly' } }],
    }, prices)).toBeNull();
    expect(subscriptionEntitlementCandidate({ status: 'active', ...truncated }, true)).toEqual({
      status: 'PAST_DUE', currentPeriodEnd: null, reason: 'TRUNCATED_ITEMS',
    });
  });

  it('fails closed for missing periods, unpaid states, canceled states, and unknown prices', () => {
    expect(subscriptionEntitlementCandidate({ status: 'active', items: { data: [] } }, true)).toEqual({
      status: 'PAST_DUE', currentPeriodEnd: null, reason: 'MISSING_PERIOD',
    });
    expect(subscriptionEntitlementCandidate({ status: 'unpaid', items: { data: [] } }, true)).toEqual({
      status: 'PAST_DUE', currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS',
    });
    expect(subscriptionEntitlementCandidate({
      status: 'canceled', items: { data: [{ current_period_end: CLOVER_PERIOD }] },
    }, true)).toEqual({ status: 'CANCELED', currentPeriodEnd: null, reason: 'CANCELED' });
    expect(subscriptionEntitlementCandidate({
      status: 'active', items: { data: [{ current_period_end: CLOVER_PERIOD }] },
    }, false)).toEqual({ status: 'PAST_DUE', currentPeriodEnd: null, reason: 'PRICE_NOT_ALLOWED' });
  });

  it('requires every subscription item to map to one allowlisted entitlement plan', () => {
    expect(entitlementPlanFromSubscriptionItems({
      data: [
        { price: { id: 'price_lite_monthly' } },
        { price: { id: 'price_lite_yearly' } },
      ],
    }, prices)).toBe('LITE');
    expect(entitlementPlanFromSubscriptionItems({
      data: [
        { price: { id: 'price_lite_monthly' } },
        { price: { id: 'price_unknown' } },
      ],
    }, prices)).toBeNull();
  });

  it('is idempotent and ignores stale or same-second access-extending updates', () => {
    const subscription = {
      status: 'active',
      items: { data: [{ current_period_end: CLOVER_PERIOD }] },
    };
    const prior = {
      eventId: 'evt_newer',
      eventCreated: 1_700_000_100,
      status: 'ACTIVE' as const,
      currentPeriodEnd: new Date(EARLIER_PERIOD * 1000).toISOString(),
    };

    expect(subscriptionUpdateDecision({
      id: 'evt_newer', created: 1_700_000_100, subscription,
    }, prior, true)).toEqual({ kind: 'IGNORE', reason: 'DUPLICATE_EVENT' });
    expect(subscriptionUpdateDecision({
      id: 'evt_older', created: 1_700_000_099, subscription,
    }, prior, true)).toEqual({ kind: 'IGNORE', reason: 'STALE_EVENT' });
    expect(subscriptionUpdateDecision({
      id: 'evt_same_second', created: 1_700_000_100, subscription,
    }, prior, true)).toEqual({ kind: 'IGNORE', reason: 'SAME_SECOND_WOULD_EXTEND' });
  });

  it('allows a same-second canceled event to win and malformed cursors to fail closed', () => {
    const prior = {
      eventId: 'evt_active',
      eventCreated: 1_700_000_100,
      status: 'ACTIVE' as const,
      currentPeriodEnd: new Date(CLOVER_PERIOD * 1000).toISOString(),
    };
    expect(subscriptionUpdateDecision({
      id: 'evt_canceled',
      created: 1_700_000_100,
      subscription: { status: 'canceled' },
    }, prior, true)).toMatchObject({ kind: 'APPLY', status: 'CANCELED', currentPeriodEnd: null });
    expect(subscriptionUpdateDecision({
      id: '',
      created: 'bad',
      subscription: { status: 'active', items: { data: [{ current_period_end: CLOVER_PERIOD }] } },
    }, prior, true)).toEqual({
      kind: 'FAIL_CLOSED', status: 'PAST_DUE', currentPeriodEnd: null, reason: 'INVALID_EVENT_CURSOR',
    });
  });

  it('retains a deletion tombstone against delayed active update or checkout events', () => {
    const deleted = {
      eventId: 'evt_delete',
      eventCreated: 200,
      eventRank: 40,
      terminal: true,
      status: 'CANCELED' as const,
      currentPeriodEnd: null,
    };
    const active = {
      status: 'ACTIVE' as const,
      currentPeriodEnd: new Date(CLOVER_PERIOD * 1000).toISOString(),
      reason: 'ACCESS' as const,
    };
    expect(subscriptionStateEventDecision(
      { id: 'evt_delayed_update', created: 150, kind: 'SUBSCRIPTION_UPDATED' },
      deleted,
      active,
    )).toEqual({ kind: 'IGNORE', reason: 'STALE_EVENT' });
    expect(subscriptionStateEventDecision(
      { id: 'evt_delayed_checkout', created: 175, kind: 'CHECKOUT_COMPLETED' },
      deleted,
      active,
    )).toEqual({ kind: 'IGNORE', reason: 'STALE_EVENT' });
    expect(subscriptionStateEventDecision(
      { id: 'evt_same_second_checkout', created: 200, kind: 'CHECKOUT_COMPLETED' },
      deleted,
      active,
    )).toEqual({ kind: 'IGNORE', reason: 'SAME_SECOND_WOULD_EXTEND' });
    expect(subscriptionStateEventDecision(
      { id: 'evt_late_payment_failure', created: 250, kind: 'PAYMENT_FAILED' },
      deleted,
      { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS' },
    )).toEqual({ kind: 'IGNORE', reason: 'TERMINAL_TOMBSTONE' });
  });
});

const receiptId = `svc_${'A'.repeat(24)}`;
const checkoutSessionId = 'cs_workflow_payment_12345678';
const paymentIntentId = 'pi_workflow_payment';

function validCheckout() {
  return {
    id: checkoutSessionId,
    created: 1_700_000_000,
    status: 'complete',
    mode: 'payment',
    payment_status: 'paid',
    client_reference_id: receiptId,
    payment_intent: paymentIntentId,
    payment_link: WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId,
    amount_total: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
    currency: WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency,
    metadata: { service_code: WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode },
  };
}

function validLineItems() {
  return [{
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
  }];
}

function validPaymentIntent(amountRefunded = 0) {
  return {
    id: paymentIntentId,
    status: 'succeeded',
    amount: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
    amount_received: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
    currency: WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency,
    latest_charge: {
      id: 'ch_workflow_payment',
      amount: WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
      amount_refunded: amountRefunded,
      refunded: amountRefunded === WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount,
      refunds: {
        data: amountRefunded > 0 ? [{ created: 1_700_000_500 }] : [],
      },
    },
  };
}

function eligibleInquiry(overrides: Partial<ServiceInquiryPaymentRow> = {}): ServiceInquiryPaymentRow {
  return {
    receipt_id: receiptId,
    service_code: WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode,
    status: 'RECEIVED',
    payment_status: 'NOT_STARTED',
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    ...overrides,
  };
}

describe('Workflow Setup Pilot payment authority', () => {
  it('accepts only the exact paid Link, Price, Product, amount, currency, metadata, and PaymentIntent', () => {
    expect(validateServicePaymentCheckout(validCheckout(), validLineItems(), validPaymentIntent())).toEqual({
      ok: true,
      payment: {
        receiptId,
        checkoutSessionId,
        paymentIntentId,
        fullyRefunded: false,
        paidAt: new Date(1_700_000_000 * 1000).toISOString(),
        refundedAt: null,
      },
    });
  });

  it.each([
    ['wrong amount', { amount_total: 14999 }, 'WRONG_AMOUNT'],
    ['wrong currency', { currency: 'eur' }, 'WRONG_CURRENCY'],
    ['wrong link', { payment_link: 'plink_other' }, 'WRONG_PAYMENT_LINK'],
    ['wrong service metadata', { metadata: { service_code: 'OTHER_SERVICE' } }, 'WRONG_SERVICE_METADATA'],
    ['missing receipt', { client_reference_id: null }, 'INVALID_RECEIPT'],
  ])('rejects %s', (_label, override, reason) => {
    expect(validateServicePaymentCheckout(
      { ...validCheckout(), ...override },
      validLineItems(),
      validPaymentIntent(),
    )).toEqual({ ok: false, reason });
  });

  it('rejects the wrong Price or Product even when the session total is correct', () => {
    const wrongPrice: any = validLineItems();
    wrongPrice[0].price.id = 'price_other';
    expect(validateServicePaymentCheckout(validCheckout(), wrongPrice, validPaymentIntent()))
      .toEqual({ ok: false, reason: 'WRONG_PRICE' });

    const wrongProduct: any = validLineItems();
    wrongProduct[0].price.product.id = 'prod_other';
    expect(validateServicePaymentCheckout(validCheckout(), wrongProduct, validPaymentIntent()))
      .toEqual({ ok: false, reason: 'WRONG_PRODUCT' });
  });

  it('records a partial refund as an exception observation until it becomes full', () => {
    expect(validateServicePaymentCheckout(
      validCheckout(),
      validLineItems(),
      validPaymentIntent(5000),
    )).toEqual({ ok: false, reason: 'PAYMENT_INTENT_PARTIALLY_REFUNDED' });
  });

  it('records a valid eligible inquiry, rejects an unknown receipt, and is idempotent', () => {
    const validation = validateServicePaymentCheckout(validCheckout(), validLineItems(), validPaymentIntent());
    expect(validation.ok).toBe(true);
    if (validation.ok === false) throw new Error('fixture must be valid');

    expect(serviceInquiryPaymentDecision(eligibleInquiry(), validation.payment)).toEqual({ kind: 'RECORD_PAID' });
    expect(serviceInquiryPaymentDecision(null, validation.payment)).toEqual({
      kind: 'EXCEPTION', reason: 'UNKNOWN_RECEIPT',
    });
    expect(serviceInquiryPaymentDecision(eligibleInquiry({
      status: 'IN_PROGRESS',
      payment_status: 'PAID',
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntentId,
    }), validation.payment)).toEqual({ kind: 'DUPLICATE' });
    expect(serviceInquiryPaymentDecision(eligibleInquiry({ status: 'CANCELLED' }), validation.payment)).toEqual({
      kind: 'EXCEPTION', reason: 'INQUIRY_NOT_ELIGIBLE',
    });
  });

  it('reconciles a full refund without allowing the paid state to win later', () => {
    const validation = validateServicePaymentCheckout(
      validCheckout(),
      validLineItems(),
      validPaymentIntent(WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount),
    );
    expect(validation.ok).toBe(true);
    if (validation.ok === false) throw new Error('fixture must be valid');
    expect(validation.payment.fullyRefunded).toBe(true);
    expect(validation.payment.refundedAt).toBe(new Date(1_700_000_500 * 1000).toISOString());
    expect(serviceInquiryPaymentDecision(eligibleInquiry(), validation.payment)).toEqual({ kind: 'RECORD_REFUNDED' });
    expect(serviceInquiryPaymentDecision(eligibleInquiry({
      payment_status: 'REFUNDED',
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntentId,
    }), validation.payment)).toEqual({ kind: 'DUPLICATE' });
  });

  it('versions reconciliation observations so later refunds are reprocessed', () => {
    const paid = serviceReconciliationEventId(checkoutSessionId, paymentIntentId, 'succeeded', 0);
    const partial = serviceReconciliationEventId(checkoutSessionId, paymentIntentId, 'succeeded', 5000);
    const fullyRefunded = serviceReconciliationEventId(checkoutSessionId, paymentIntentId, 'succeeded', 15000);
    expect(paid).toBe(serviceReconciliationEventId(checkoutSessionId, paymentIntentId, 'succeeded', 0));
    expect(new Set([paid, partial, fullyRefunded]).size).toBe(3);
    expect(serviceReconciliationEventId('not-a-session', paymentIntentId, 'succeeded', 0)).toBeNull();
  });

  it('continues after 1,000 sessions without restarting page one', async () => {
    const sessions = Array.from({ length: 1001 }, (_value, index) => ({
      id: `cs_${String(index + 1).padStart(8, '0')}`,
    }));
    const visited: string[] = [];
    const pageStarts: Array<string | null> = [];
    const listPage = async (startingAfter: string | null) => {
      pageStarts.push(startingAfter);
      const start = startingAfter
        ? sessions.findIndex(session => session.id === startingAfter) + 1
        : 0;
      const data = sessions.slice(start, start + 100);
      return { data, has_more: start + data.length < sessions.length };
    };
    const first = await runReconciliationPages({
      startingAfter: null,
      maxPages: 10,
      heartbeatEvery: 10,
      listPage,
      processSession: async session => { visited.push(session.id); },
      checkpoint: async () => true,
    });
    expect(first).toMatchObject({ completedCycle: false, endingCursor: sessions[999].id, sessionsVisited: 1000 });
    const second = await runReconciliationPages({
      startingAfter: first.endingCursor,
      maxPages: 10,
      heartbeatEvery: 10,
      listPage,
      processSession: async session => { visited.push(session.id); },
      checkpoint: async () => true,
    });
    expect(second).toMatchObject({ completedCycle: true, sessionsVisited: 1 });
    expect(pageStarts[10]).toBe(sessions[999].id);
    expect(visited).toEqual(sessions.map(session => session.id));
  });

  it('checks recent payments independently while a historical cursor is in progress', async () => {
    const processed: string[] = [];
    expect(await runRecentReconciliationPass({
      listRecent: async () => ({ data: [{ id: 'cs_newest_payment' }] }),
      processSession: async session => { processed.push(session.id); },
    })).toBe(1);
    expect(processed).toEqual(['cs_newest_payment']);
  });

  it('uses bounded exponential alert backoff', () => {
    expect(servicePaymentAlertBackoffMs(0)).toBe(60_000);
    expect(servicePaymentAlertBackoffMs(1)).toBe(120_000);
    expect(servicePaymentAlertBackoffMs(100)).toBe(24 * 60 * 60 * 1000);
  });

  it('times out alert delivery and never includes raw payment identifiers', async () => {
    const claim = {
      event_hash: 'a'.repeat(64),
      reason_code: 'INVALID_RECEIPT',
      source: 'WEBHOOK' as const,
      operator_alert_attempts: 0,
    };
    const timedOut = await deliverRedactedServicePaymentAlert(
      claim,
      { apiKey: 're_test', operatorEmail: 'operator@example.test', from: 'Nova <test@example.test>' },
      ((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })) as any,
      5,
    );
    expect(timedOut).toBe('FAILED');

    let deliveredBody = '';
    expect(await deliverRedactedServicePaymentAlert(
      claim,
      { apiKey: 're_test', operatorEmail: 'operator@example.test', from: 'Nova <test@example.test>' },
      (async (_url: string, init: { body: string }) => {
        deliveredBody = init.body;
        return { ok: true };
      }) as any,
      50,
    )).toBe('PROVIDER_ACCEPTED');
    expect(deliveredBody).toContain(claim.event_hash);
    expect(deliveredBody).not.toContain(checkoutSessionId);
    expect(deliveredBody).not.toContain(paymentIntentId);
    expect(deliveredBody).not.toContain(receiptId);
  });

  it('keeps exception alerts redacted while allowing token-gated operator resolution', () => {
    const token = 'resolver-token-strong_2026_NovaNexus_01';
    expect(securePaymentResolverAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(securePaymentResolverAuthorized('Bearer wrong', token)).toBe(false);
    expect(securePaymentResolverAuthorized(`Bearer ${'r'.repeat(32)}`, 'r'.repeat(32))).toBe(false);
    const hash = (value: string) => require('crypto').createHash('sha256').update(value).digest('hex');
    const exception = {
      event_hash: hash('evt_provider'),
      reason_code: 'INVALID_RECEIPT',
      receipt_hash: null,
      checkout_session_hash: hash(checkoutSessionId),
      payment_intent_hash: hash(paymentIntentId),
    };
    expect(JSON.stringify(exception)).not.toContain(checkoutSessionId);
    expect(resolveRedactedPaymentException(exception, [{
      id: checkoutSessionId,
      client_reference_id: null,
      payment_intent: paymentIntentId,
    }])).toEqual({ checkoutSessionId, paymentIntentId, receiptId: null });
    expect(resolveRedactedPaymentException(exception, [{
      id: 'cs_wrong_link_candidate_12345678',
      client_reference_id: null,
      payment_intent: paymentIntentId,
    }])).toBeNull();
    // The operator can supply an older candidate directly; Link pagination is
    // irrelevant because identity is checked only against stored hashes.
    expect(resolveRedactedPaymentException(exception, [{
      id: checkoutSessionId,
      client_reference_id: null,
      payment_intent: paymentIntentId,
      payment_link: 'plink_historical_wrong_link',
    } as any])).toEqual({ checkoutSessionId, paymentIntentId, receiptId: null });
  });

  it('fails terminal entitlement reads closed and reports revenue readiness precisely', () => {
    expect(failClosedEntitlementProjection({
      plan: 'LITE',
      status: 'ACTIVE',
      currentPeriodEnd: '2027-01-01T00:00:00.000Z',
      features: ['paid'],
      terminal: true,
      freeFeatures: ['free'],
    })).toEqual({
      plan: 'FREE', status: 'CANCELED', currentPeriodEnd: null,
      features: ['free'], terminal: true,
    });
    expect(servicePaymentOperationsReadiness({
      resendApiKey: 're_valid_key',
      operatorEmail: 'operator@example.test',
      resolverToken: 'resolver-token-strong_2026_NovaNexus_01',
    })).toMatchObject({ ready: true });
    expect(servicePaymentOperationsReadiness({
      resendApiKey: 'wrong',
      operatorEmail: 'not-an-email',
      resolverToken: 'short',
    })).toEqual({
      ready: false,
      checks: { alertProvider: false, operatorEmail: false, resolverToken: false },
      reasons: [
        'INVALID_RESEND_API_KEY',
        'INVALID_SERVICE_INQUIRY_OPERATOR_EMAIL',
        'INVALID_SERVICE_PAYMENT_RESOLVER_TOKEN',
      ],
    });
  });
});

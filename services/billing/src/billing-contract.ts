export type CheckoutPlan = 'LITE' | 'FOUNDING' | 'FLIP_PRO';
export type CheckoutInterval = 'monthly' | 'yearly';
export type CheckoutKey = `${CheckoutPlan}:${CheckoutInterval}`;
export type EntitlementPlan = 'LITE' | 'FOUNDING';
export type EntitlementStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';

export type CheckoutPriceMap = Partial<Record<CheckoutKey, string>>;

const ALLOWED_CHECKOUTS = new Set<CheckoutKey>([
  'LITE:monthly',
  'LITE:yearly',
  'FOUNDING:monthly',
  'FLIP_PRO:monthly',
]);

export type CheckoutSelectionResult =
  | {
      ok: true;
      plan: CheckoutPlan;
      interval: CheckoutInterval;
      priceId: string;
      entitlementPlan: EntitlementPlan;
    }
  | {
      ok: false;
      code: 'CLIENT_PRICE_ID_NOT_ALLOWED' | 'INVALID_CHECKOUT_REQUEST' | 'PLAN_NOT_AVAILABLE';
      message: string;
      status: 400 | 503;
    };

export function resolveCheckoutSelection(
  input: unknown,
  prices: CheckoutPriceMap,
): CheckoutSelectionResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      code: 'INVALID_CHECKOUT_REQUEST',
      message: 'A plan and billing interval are required.',
      status: 400,
    };
  }

  const body = input as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(body, 'priceId')) {
    return {
      ok: false,
      code: 'CLIENT_PRICE_ID_NOT_ALLOWED',
      message: 'Checkout prices are selected by the server.',
      status: 400,
    };
  }

  const unexpectedKeys = Object.keys(body).filter(key => key !== 'plan' && key !== 'interval');
  if (unexpectedKeys.length > 0 || typeof body.plan !== 'string' || typeof body.interval !== 'string') {
    return {
      ok: false,
      code: 'INVALID_CHECKOUT_REQUEST',
      message: 'Only a plan and billing interval may be supplied.',
      status: 400,
    };
  }

  const key = `${body.plan}:${body.interval}` as CheckoutKey;
  if (!ALLOWED_CHECKOUTS.has(key)) {
    return {
      ok: false,
      code: 'INVALID_CHECKOUT_REQUEST',
      message: 'That plan and billing interval are not available.',
      status: 400,
    };
  }

  const priceId = prices[key];
  if (!priceId) {
    return {
      ok: false,
      code: 'PLAN_NOT_AVAILABLE',
      message: 'That plan is not configured for checkout.',
      status: 503,
    };
  }

  const [plan, interval] = key.split(':') as [CheckoutPlan, CheckoutInterval];
  return {
    ok: true,
    plan,
    interval,
    priceId,
    entitlementPlan: plan === 'FOUNDING' ? 'FOUNDING' : 'LITE',
  };
}

export function entitlementPlanFromPriceId(
  priceId: string,
  prices: CheckoutPriceMap,
): EntitlementPlan | null {
  const matchingPlans = new Set<EntitlementPlan>();

  for (const [key, configuredPriceId] of Object.entries(prices)) {
    if (configuredPriceId !== priceId) continue;
    matchingPlans.add(key.startsWith('FOUNDING:') ? 'FOUNDING' : 'LITE');
  }

  return matchingPlans.size === 1 ? [...matchingPlans][0] : null;
}

export function stripeStatusToEntitlementStatus(status: string): EntitlementStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'canceled':
      return 'CANCELED';
    default:
      // incomplete, incomplete_expired, unpaid, paused, and unknown future
      // states must never inherit active access.
      return 'PAST_DUE';
  }
}

export function productionWebhookConfigurationError(
  nodeEnv: string | undefined,
  webhookSecret: string | undefined,
): string | null {
  if (nodeEnv === 'production' && !webhookSecret?.trim()) {
    return 'STRIPE_WEBHOOK_SECRET is required in production';
  }
  return null;
}

export function checkoutMetadataMatchesAccount(
  metadata: Record<string, string> | null | undefined,
  userId: string,
  orgId: string,
): boolean {
  return metadata?.userId === userId && metadata?.orgId === orgId;
}

const SERVICE_RECEIPT_PATTERN = /^svc_[A-Za-z0-9_-]{24}$/;

export type ServicePaymentReference = {
  receiptId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
};

export function servicePaymentReferenceFromCheckout(session: {
  id?: unknown;
  mode?: unknown;
  payment_status?: unknown;
  client_reference_id?: unknown;
  payment_intent?: unknown;
}): ServicePaymentReference | null {
  if (
    session.mode !== 'payment'
    || session.payment_status !== 'paid'
    || typeof session.id !== 'string'
    || typeof session.client_reference_id !== 'string'
    || !SERVICE_RECEIPT_PATTERN.test(session.client_reference_id)
  ) {
    return null;
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent
      && typeof session.payment_intent === 'object'
      && 'id' in session.payment_intent
      && typeof (session.payment_intent as { id?: unknown }).id === 'string'
        ? (session.payment_intent as { id: string }).id
        : null;

  if (!paymentIntentId) return null;

  return {
    receiptId: session.client_reference_id,
    checkoutSessionId: session.id,
    paymentIntentId,
  };
}

export function fullyRefundedPaymentIntentFromCharge(charge: {
  refunded?: unknown;
  payment_intent?: unknown;
}): string | null {
  if (charge.refunded !== true) return null;
  if (typeof charge.payment_intent === 'string') return charge.payment_intent;
  if (
    charge.payment_intent
    && typeof charge.payment_intent === 'object'
    && 'id' in charge.payment_intent
    && typeof (charge.payment_intent as { id?: unknown }).id === 'string'
  ) {
    return (charge.payment_intent as { id: string }).id;
  }
  return null;
}

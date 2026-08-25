import { isStrictServiceToken } from '../../../libs/shared/runtime/service-token';

export type CheckoutPlan = 'LITE' | 'FOUNDING' | 'FLIP_PRO';
export type CheckoutInterval = 'monthly' | 'yearly';
export type CheckoutKey = `${CheckoutPlan}:${CheckoutInterval}`;
export type EntitlementPlan = 'LITE' | 'FOUNDING';
export type EntitlementStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';

export function failClosedEntitlementProjection(input: {
  plan: string;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
  features: string[];
  terminal: boolean | null | undefined;
  freeFeatures: string[];
}): {
  plan: string;
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
  features: string[];
  terminal: boolean;
} {
  const terminal = input.terminal === true || input.status === 'CANCELED';
  return terminal
    ? {
        plan: 'FREE',
        status: 'CANCELED',
        currentPeriodEnd: null,
        features: [...input.freeFeatures],
        terminal: true,
      }
    : {
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
        features: [...input.features],
        terminal: false,
      };
}

export type ServicePaymentReadiness = {
  ready: boolean;
  checks: {
    alertProvider: boolean;
    operatorEmail: boolean;
    resolverToken: boolean;
  };
  reasons: string[];
};

export function servicePaymentOperationsReadiness(env: {
  resendApiKey?: string;
  operatorEmail?: string;
  resolverToken?: string;
}): ServicePaymentReadiness {
  const checks = {
    alertProvider: typeof env.resendApiKey === 'string' && /^re_[A-Za-z0-9_-]{3,}$/.test(env.resendApiKey),
    operatorEmail: typeof env.operatorEmail === 'string'
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.operatorEmail),
    resolverToken: isStrictServiceToken(env.resolverToken),
  };
  const reasons = [
    ...(!checks.alertProvider ? ['INVALID_RESEND_API_KEY'] : []),
    ...(!checks.operatorEmail ? ['INVALID_SERVICE_INQUIRY_OPERATOR_EMAIL'] : []),
    ...(!checks.resolverToken ? ['INVALID_SERVICE_PAYMENT_RESOLVER_TOKEN'] : []),
  ];
  return { ready: reasons.length === 0, checks, reasons };
}

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

const MAX_STRIPE_EPOCH_SECONDS = 253402300799;

function stripeEpochSeconds(value: unknown): number | null {
  return Number.isInteger(value)
    && Number(value) > 0
    && Number(value) <= MAX_STRIPE_EPOCH_SECONDS
    ? Number(value)
    : null;
}

function stripeId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    value
    && typeof value === 'object'
    && 'id' in value
    && typeof (value as { id?: unknown }).id === 'string'
    && (value as { id: string }).id.length > 0
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

export function subscriptionBillingPeriodEnd(subscription: {
  current_period_end?: unknown;
  items?: { data?: Array<{ current_period_end?: unknown }>; has_more?: unknown } | null;
}): number | null {
  // The embedded list can be truncated. An unseen item may expire earlier, so
  // the webhook must not grant access until the complete list is available.
  if (subscription.items?.has_more === true) return null;

  const items = Array.isArray(subscription.items?.data) ? subscription.items.data : [];
  const hasCloverPeriod = items.some(item => (
    item !== null
    && typeof item === 'object'
    && Object.prototype.hasOwnProperty.call(item, 'current_period_end')
  ));

  if (hasCloverPeriod) {
    const itemEnds = items.map(item => stripeEpochSeconds(item?.current_period_end));

    // Once any Clover item period is present, every item must provide a usable
    // one. Ignoring a malformed or missing item could extend access past it.
    if (itemEnds.some(value => value === null)) return null;

    // A multi-item subscription is entitled only through the earliest paid
    // item. This is deterministic and cannot outlive any item period.
    return Math.min(...(itemEnds as number[]));
  }

  // Stripe SDK retrievals pinned to older API versions still expose the legacy
  // top-level field while their items do not carry the Clover field.
  return stripeEpochSeconds(subscription.current_period_end);
}

export function entitlementPlanFromSubscriptionItems(
  items: { data?: Array<{ price?: { id?: unknown } | null }>; has_more?: unknown } | null | undefined,
  prices: CheckoutPriceMap,
): EntitlementPlan | null {
  if (items?.has_more === true) return null;
  if (!Array.isArray(items?.data) || items.data.length === 0) return null;

  const plans = items.data.map(item => {
    const priceId = item?.price?.id;
    return typeof priceId === 'string' ? entitlementPlanFromPriceId(priceId, prices) : null;
  });
  if (plans.some(plan => plan === null)) return null;

  const unique = new Set(plans as EntitlementPlan[]);
  return unique.size === 1 ? [...unique][0] : null;
}

export type SubscriptionEntitlementCandidate = {
  status: EntitlementStatus;
  currentPeriodEnd: string | null;
  reason:
    | 'ACCESS'
    | 'CANCELED'
    | 'NON_ACCESS_STATUS'
    | 'PRICE_NOT_ALLOWED'
    | 'MISSING_PERIOD'
    | 'TRUNCATED_ITEMS'
    | 'IDENTITY_MISMATCH';
};

export function subscriptionEntitlementCandidate(
  subscription: {
    status?: unknown;
    current_period_end?: unknown;
    items?: { data?: Array<{ current_period_end?: unknown }>; has_more?: unknown } | null;
  },
  priceAllowed: boolean,
): SubscriptionEntitlementCandidate {
  if (subscription.status === 'canceled') {
    return { status: 'CANCELED', currentPeriodEnd: null, reason: 'CANCELED' };
  }

  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'NON_ACCESS_STATUS' };
  }

  if (subscription.items?.has_more === true) {
    return { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'TRUNCATED_ITEMS' };
  }

  if (!priceAllowed) {
    return { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'PRICE_NOT_ALLOWED' };
  }

  const periodEnd = subscriptionBillingPeriodEnd(subscription);
  if (periodEnd === null) {
    return { status: 'PAST_DUE', currentPeriodEnd: null, reason: 'MISSING_PERIOD' };
  }

  return {
    status: subscription.status === 'active' ? 'ACTIVE' : 'TRIALING',
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    reason: 'ACCESS',
  };
}

export type SubscriptionEventKind =
  | 'CHECKOUT_COMPLETED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_DELETED'
  | 'PAYMENT_FAILED';

export type SubscriptionUpdateDecision =
  | ({
      kind: 'APPLY';
      eventId: string;
      eventCreated: number;
      eventKind: SubscriptionEventKind;
      eventRank: number;
      terminal: boolean;
    } & SubscriptionEntitlementCandidate)
  | { kind: 'FAIL_CLOSED'; status: 'PAST_DUE'; currentPeriodEnd: null; reason: 'INVALID_EVENT_CURSOR' }
  | {
      kind: 'IGNORE';
      reason: 'DUPLICATE_EVENT' | 'STALE_EVENT' | 'SAME_SECOND_WOULD_EXTEND' | 'TERMINAL_TOMBSTONE';
    };

export function subscriptionEventRank(
  candidate: SubscriptionEntitlementCandidate,
  eventKind: SubscriptionEventKind,
): number {
  if (eventKind === 'SUBSCRIPTION_DELETED' || candidate.status === 'CANCELED') return 40;
  if (candidate.status === 'PAST_DUE') return 30;
  return 10;
}

export function subscriptionStateEventDecision(
  event: { id?: unknown; created?: unknown; kind: SubscriptionEventKind },
  previous: {
    eventId?: string | null;
    eventCreated?: number | string | null;
    eventRank?: number | string | null;
    terminal?: boolean | null;
    status: EntitlementStatus;
    currentPeriodEnd?: string | null;
  },
  candidate: SubscriptionEntitlementCandidate,
): SubscriptionUpdateDecision {
  const eventId = typeof event.id === 'string' && event.id.length > 0 ? event.id : null;
  const eventCreated = stripeEpochSeconds(event.created);
  if (!eventId || eventCreated === null) {
    return { kind: 'FAIL_CLOSED', status: 'PAST_DUE', currentPeriodEnd: null, reason: 'INVALID_EVENT_CURSOR' };
  }

  if (previous.eventId === eventId) return { kind: 'IGNORE', reason: 'DUPLICATE_EVENT' };

  const eventRank = subscriptionEventRank(candidate, event.kind);
  const previousCreated = previous.eventCreated === null || previous.eventCreated === undefined
    ? null
    : Number(previous.eventCreated);
  const inferredPreviousRank = previous.terminal || previous.status === 'CANCELED'
    ? 40
    : previous.status === 'PAST_DUE'
      ? 30
      : 10;
  const parsedPreviousRank = previous.eventRank === null || previous.eventRank === undefined
    ? inferredPreviousRank
    : Number(previous.eventRank);
  const previousRank = Number.isFinite(parsedPreviousRank) ? parsedPreviousRank : inferredPreviousRank;

  if (previousCreated !== null && Number.isFinite(previousCreated)) {
    if (eventCreated < previousCreated) return { kind: 'IGNORE', reason: 'STALE_EVENT' };

    if (eventCreated === previousCreated) {
      if (eventRank < previousRank) return { kind: 'IGNORE', reason: 'SAME_SECOND_WOULD_EXTEND' };
      if (eventRank === previousRank) {
        const candidateHasAccess = candidate.status === 'ACTIVE' || candidate.status === 'TRIALING';
        const previousHasAccess = previous.status === 'ACTIVE' || previous.status === 'TRIALING';
        if (!candidateHasAccess || !previousHasAccess) {
          return { kind: 'IGNORE', reason: 'SAME_SECOND_WOULD_EXTEND' };
        }
        const candidateEnd = candidate.currentPeriodEnd ? Date.parse(candidate.currentPeriodEnd) : Number.NaN;
        const previousEnd = previous.currentPeriodEnd ? Date.parse(previous.currentPeriodEnd) : Number.NaN;
        if (!Number.isFinite(candidateEnd) || !Number.isFinite(previousEnd) || candidateEnd >= previousEnd) {
          return { kind: 'IGNORE', reason: 'SAME_SECOND_WOULD_EXTEND' };
        }
      }
    }
  }

  // A terminal tombstone is monotonic for every non-terminal observation,
  // including payment failures. The store explicitly clears `terminal` only
  // for an exact identity-matched checkout replacement.
  if (previous.terminal && eventRank < 40) {
    return { kind: 'IGNORE', reason: 'TERMINAL_TOMBSTONE' };
  }

  return {
    kind: 'APPLY',
    eventId,
    eventCreated,
    eventKind: event.kind,
    eventRank,
    terminal: eventRank === 40,
    ...candidate,
  };
}

export function subscriptionUpdateDecision(
  event: {
    id?: unknown;
    created?: unknown;
    subscription: {
      status?: unknown;
      current_period_end?: unknown;
      items?: { data?: Array<{ current_period_end?: unknown }>; has_more?: unknown } | null;
    };
  },
  previous: {
    eventId?: string | null;
    eventCreated?: number | string | null;
    eventRank?: number | string | null;
    terminal?: boolean | null;
    status: EntitlementStatus;
    currentPeriodEnd?: string | null;
  },
  priceAllowed: boolean,
): SubscriptionUpdateDecision {
  const candidate = subscriptionEntitlementCandidate(event.subscription, priceAllowed);
  return subscriptionStateEventDecision(
    { id: event.id, created: event.created, kind: 'SUBSCRIPTION_UPDATED' },
    previous,
    candidate,
  );
}

export const WORKFLOW_PILOT_PAYMENT_AUTHORITY = Object.freeze({
  paymentLinkId: 'plink_1U2B44IRGET1dbqSigapZksV',
  priceId: 'price_1U2B3oIRGET1dbqSTkV7QdAu',
  productId: 'prod_V2FYOPIbc7KlKQ',
  amount: 15000,
  currency: 'usd',
  serviceCode: 'BACK_OFFICE_OS_STARTER',
});

export type ServicePaymentMismatchReason =
  | 'INVALID_SESSION'
  | 'INVALID_RECEIPT'
  | 'NOT_A_COMPLETED_PAID_SESSION'
  | 'WRONG_PAYMENT_LINK'
  | 'WRONG_AMOUNT'
  | 'WRONG_CURRENCY'
  | 'WRONG_SERVICE_METADATA'
  | 'WRONG_LINE_ITEMS'
  | 'WRONG_PRICE'
  | 'WRONG_PRODUCT'
  | 'MISSING_PAYMENT_INTENT'
  | 'PAYMENT_INTENT_NOT_SUCCEEDED'
  | 'PAYMENT_INTENT_MISMATCH'
  | 'PAYMENT_CHARGE_UNAVAILABLE'
  | 'PAYMENT_INTENT_PARTIALLY_REFUNDED';

export type ServicePaymentReference = {
  receiptId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  fullyRefunded: boolean;
  paidAt: string | null;
  refundedAt: string | null;
};

export type ServicePaymentValidation =
  | { ok: true; payment: ServicePaymentReference }
  | { ok: false; reason: ServicePaymentMismatchReason };

export function validateServicePaymentCheckout(session: {
  id?: unknown;
  created?: unknown;
  status?: unknown;
  mode?: unknown;
  payment_status?: unknown;
  client_reference_id?: unknown;
  payment_intent?: unknown;
  payment_link?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: Record<string, string> | null;
}, lineItems: Array<{
  amount_total?: unknown;
  currency?: unknown;
  quantity?: unknown;
  price?: {
    id?: unknown;
    unit_amount?: unknown;
    currency?: unknown;
    metadata?: Record<string, string> | null;
    product?: unknown;
  } | null;
}>, paymentIntent: {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  amount_received?: unknown;
  currency?: unknown;
  latest_charge?: unknown;
}): ServicePaymentValidation {
  if (typeof session.id !== 'string' || session.id.length === 0 || session.mode !== 'payment') {
    return { ok: false, reason: 'INVALID_SESSION' };
  }
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    return { ok: false, reason: 'NOT_A_COMPLETED_PAID_SESSION' };
  }
  if (typeof session.client_reference_id !== 'string' || !SERVICE_RECEIPT_PATTERN.test(session.client_reference_id)) {
    return { ok: false, reason: 'INVALID_RECEIPT' };
  }

  const paymentLinkId = stripeId(session.payment_link);
  if (paymentLinkId !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.paymentLinkId) {
    return { ok: false, reason: 'WRONG_PAYMENT_LINK' };
  }
  if (session.amount_total !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount) {
    return { ok: false, reason: 'WRONG_AMOUNT' };
  }
  if (String(session.currency || '').toLowerCase() !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency) {
    return { ok: false, reason: 'WRONG_CURRENCY' };
  }
  if (session.metadata?.service_code !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode) {
    return { ok: false, reason: 'WRONG_SERVICE_METADATA' };
  }

  if (lineItems.length !== 1 || lineItems[0].quantity !== 1 || lineItems[0].amount_total !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount) {
    return { ok: false, reason: 'WRONG_LINE_ITEMS' };
  }
  const lineItem = lineItems[0];
  if (String(lineItem.currency || '').toLowerCase() !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency) {
    return { ok: false, reason: 'WRONG_CURRENCY' };
  }
  if (
    lineItem.price?.id !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.priceId
    || lineItem.price.unit_amount !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount
    || String(lineItem.price.currency || '').toLowerCase() !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency
  ) {
    return { ok: false, reason: 'WRONG_PRICE' };
  }
  if (stripeId(lineItem.price.product) !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.productId) {
    return { ok: false, reason: 'WRONG_PRODUCT' };
  }
  const product = lineItem.price.product;
  const productMetadata = product && typeof product === 'object' && 'metadata' in product
    ? (product as { metadata?: Record<string, string> | null }).metadata
    : null;
  if (
    lineItem.price.metadata?.service_code !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode
    || productMetadata?.service_code !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode
  ) {
    return { ok: false, reason: 'WRONG_SERVICE_METADATA' };
  }

  const paymentIntentId = stripeId(session.payment_intent);
  if (!paymentIntentId) return { ok: false, reason: 'MISSING_PAYMENT_INTENT' };
  if (stripeId(paymentIntent) !== paymentIntentId) return { ok: false, reason: 'PAYMENT_INTENT_MISMATCH' };
  if (paymentIntent.status !== 'succeeded') return { ok: false, reason: 'PAYMENT_INTENT_NOT_SUCCEEDED' };
  if (paymentIntent.amount !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount || paymentIntent.amount_received !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount) {
    return { ok: false, reason: 'WRONG_AMOUNT' };
  }
  if (String(paymentIntent.currency || '').toLowerCase() !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.currency) {
    return { ok: false, reason: 'WRONG_CURRENCY' };
  }

  const charge = paymentIntent.latest_charge;
  if (!charge || typeof charge !== 'object') return { ok: false, reason: 'PAYMENT_CHARGE_UNAVAILABLE' };
  const amount = (charge as { amount?: unknown }).amount;
  const amountRefunded = (charge as { amount_refunded?: unknown }).amount_refunded;
  if (amount !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.amount || !Number.isInteger(amountRefunded) || Number(amountRefunded) < 0) {
    return { ok: false, reason: 'PAYMENT_INTENT_MISMATCH' };
  }
  if (Number(amountRefunded) > 0 && Number(amountRefunded) < Number(amount)) {
    return { ok: false, reason: 'PAYMENT_INTENT_PARTIALLY_REFUNDED' };
  }
  const fullyRefunded = (charge as { refunded?: unknown }).refunded === true
    || Number(amountRefunded) === Number(amount);
  const refunds = (charge as {
    refunds?: { data?: Array<{ created?: unknown }> } | null;
  }).refunds?.data;
  const refundTimes = Array.isArray(refunds)
    ? refunds
      .map(refund => stripeEpochSeconds(refund.created))
      .filter((value): value is number => value !== null)
    : [];
  const paidAtEpoch = stripeEpochSeconds(session.created);
  const refundedAtEpoch = fullyRefunded && refundTimes.length > 0 ? Math.max(...refundTimes) : null;

  return { ok: true, payment: {
    receiptId: session.client_reference_id,
    checkoutSessionId: session.id,
    paymentIntentId,
    fullyRefunded,
    paidAt: paidAtEpoch === null ? null : new Date(paidAtEpoch * 1000).toISOString(),
    refundedAt: refundedAtEpoch === null ? null : new Date(refundedAtEpoch * 1000).toISOString(),
  } };
}

export type ServiceInquiryPaymentRow = {
  receipt_id: string;
  service_code: string;
  status: string;
  payment_status: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

export type ServiceInquiryPaymentDecision =
  | { kind: 'RECORD_PAID' }
  | { kind: 'RECORD_REFUNDED' }
  | { kind: 'DUPLICATE' }
  | {
      kind: 'EXCEPTION';
      reason: 'UNKNOWN_RECEIPT' | 'WRONG_INQUIRY_SERVICE' | 'INQUIRY_NOT_ELIGIBLE' | 'PAYMENT_ALREADY_BOUND' | 'REFUNDED_PAYMENT_REPLAY';
    };

export function serviceInquiryPaymentDecision(
  inquiry: ServiceInquiryPaymentRow | null,
  payment: ServicePaymentReference,
): ServiceInquiryPaymentDecision {
  if (!inquiry || inquiry.receipt_id !== payment.receiptId) {
    return { kind: 'EXCEPTION', reason: 'UNKNOWN_RECEIPT' };
  }
  if (inquiry.service_code !== WORKFLOW_PILOT_PAYMENT_AUTHORITY.serviceCode) {
    return { kind: 'EXCEPTION', reason: 'WRONG_INQUIRY_SERVICE' };
  }

  const samePayment = inquiry.stripe_checkout_session_id === payment.checkoutSessionId
    && inquiry.stripe_payment_intent_id === payment.paymentIntentId;
  if (inquiry.payment_status === 'PAID' && samePayment) {
    return { kind: payment.fullyRefunded ? 'RECORD_REFUNDED' : 'DUPLICATE' };
  }
  if (inquiry.payment_status === 'REFUNDED' && samePayment && payment.fullyRefunded) {
    return { kind: 'DUPLICATE' };
  }
  if (!['RECEIVED', 'IN_REVIEW', 'SCOPE_ACCEPTED'].includes(inquiry.status)) {
    return { kind: 'EXCEPTION', reason: 'INQUIRY_NOT_ELIGIBLE' };
  }
  if (inquiry.payment_status === 'NOT_STARTED') {
    return { kind: payment.fullyRefunded ? 'RECORD_REFUNDED' : 'RECORD_PAID' };
  }
  return {
    kind: 'EXCEPTION',
    reason: inquiry.payment_status === 'REFUNDED' ? 'REFUNDED_PAYMENT_REPLAY' : 'PAYMENT_ALREADY_BOUND',
  };
}

export function serviceReconciliationEventId(
  checkoutSessionId: unknown,
  paymentIntentId: unknown,
  paymentIntentStatus: unknown,
  amountRefunded: unknown,
): string | null {
  if (typeof checkoutSessionId !== 'string' || !/^cs_[A-Za-z0-9_]{8,255}$/.test(checkoutSessionId)) return null;
  if (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9_]{3,255}$/.test(paymentIntentId)) return null;
  if (typeof paymentIntentStatus !== 'string' || !/^[a-z_]{2,40}$/.test(paymentIntentStatus)) return null;
  if (!Number.isInteger(amountRefunded) || Number(amountRefunded) < 0) return null;
  // This is an observation key, not a one-time delivery key. A later refund
  // produces a new ledger entry while an unchanged observation stays idempotent.
  return `reconcile:v2:${checkoutSessionId}:${paymentIntentId}:${paymentIntentStatus}:${Number(amountRefunded)}`;
}

export function servicePaymentAlertBackoffMs(completedAttempts: number): number {
  const attempts = Number.isInteger(completedAttempts) && completedAttempts >= 0 ? completedAttempts : 0;
  return Math.min(24 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts, 20)));
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

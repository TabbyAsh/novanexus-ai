import { createHash, timingSafeEqual } from 'crypto';
import { isStrictServiceToken } from '../../../libs/shared/runtime/service-token';

export type RedactedPaymentException = {
  event_hash: string;
  reason_code: string;
  receipt_hash: string | null;
  checkout_session_hash: string | null;
  payment_intent_hash: string | null;
};

export type PaymentResolutionCandidate = {
  id?: unknown;
  client_reference_id?: unknown;
  payment_intent?: unknown;
};

function hashIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0
    ? createHash('sha256').update(value).digest('hex')
    : null;
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'id' in value && typeof (value as any).id === 'string') {
    return (value as any).id;
  }
  return null;
}

export function securePaymentResolverAuthorized(
  authorizationHeader: unknown,
  configuredToken: string | undefined,
): boolean {
  if (typeof authorizationHeader !== 'string' || !isStrictServiceToken(configuredToken)) return false;
  const expected = Buffer.from(`Bearer ${configuredToken}`);
  const provided = Buffer.from(authorizationHeader);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function resolveRedactedPaymentException(
  exception: RedactedPaymentException,
  candidates: PaymentResolutionCandidate[],
): {
  checkoutSessionId: string;
  paymentIntentId: string | null;
  receiptId: string | null;
} | null {
  for (const candidate of candidates) {
    const checkoutSessionId = objectId(candidate.id);
    const paymentIntentId = objectId(candidate.payment_intent);
    const receiptId = typeof candidate.client_reference_id === 'string'
      ? candidate.client_reference_id
      : null;
    if (!checkoutSessionId) continue;

    const sessionMatches = exception.checkout_session_hash === null
      || hashIdentifier(checkoutSessionId) === exception.checkout_session_hash;
    const intentMatches = exception.payment_intent_hash === null
      || hashIdentifier(paymentIntentId) === exception.payment_intent_hash;
    const receiptMatches = exception.receipt_hash === null
      || hashIdentifier(receiptId) === exception.receipt_hash;
    if (sessionMatches && intentMatches && receiptMatches) {
      return { checkoutSessionId, paymentIntentId, receiptId };
    }
  }
  return null;
}

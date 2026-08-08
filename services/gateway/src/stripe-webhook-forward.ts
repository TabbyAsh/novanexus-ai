export class StripeWebhookForwardingError extends Error {}

export type StripeWebhookForward = {
  body: Buffer;
  headers: Record<string, string>;
};

export function buildStripeWebhookForward(
  body: unknown,
  stripeSignature: unknown,
  contentType: unknown,
  requestId?: unknown,
  forwardedFor?: string,
): StripeWebhookForward {
  if (!Buffer.isBuffer(body)) {
    throw new StripeWebhookForwardingError('Stripe webhook body is not raw bytes');
  }
  if (typeof stripeSignature !== 'string' || !stripeSignature) {
    throw new StripeWebhookForwardingError('Missing stripe-signature header');
  }
  if (typeof contentType !== 'string' || !contentType) {
    throw new StripeWebhookForwardingError('Missing webhook content-type header');
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Stripe-Signature': stripeSignature,
  };
  if (typeof requestId === 'string' && requestId) headers['X-Request-ID'] = requestId;
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;

  // Return the same Buffer instance. Re-encoding or JSON serialization would
  // change the bytes Stripe signed and invalidate signature verification.
  return { body, headers };
}

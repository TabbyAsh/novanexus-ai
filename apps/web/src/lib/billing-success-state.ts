export type CheckoutVerificationAttempt =
  | { phase: 'verifying' }
  | { phase: 'response'; payload: unknown }
  | { phase: 'error'; status?: number; message?: string };

export type BillingSuccessView = {
  kind: 'verifying' | 'verified' | 'processing' | 'unable';
  title: string;
  message: string;
  canRetry: boolean;
  requiresSignIn: boolean;
};

export function deriveBillingSuccessView(attempt: CheckoutVerificationAttempt): BillingSuccessView {
  if (attempt.phase === 'verifying') {
    return {
      kind: 'verifying',
      title: 'Verifying checkout',
      message: 'Nova is confirming this checkout with Stripe and your signed-in account.',
      canRetry: false,
      requiresSignIn: false,
    };
  }

  if (attempt.phase === 'error') {
    return {
      kind: 'unable',
      title: 'Unable to verify checkout',
      message: attempt.status === 401
        ? 'Sign in to the Nova account that started checkout, then try again.'
        : attempt.message || 'Nova could not verify this checkout. No access change is being claimed.',
      canRetry: true,
      requiresSignIn: attempt.status === 401,
    };
  }

  const payload = attempt.payload as {
    success?: unknown;
    data?: {
      verified?: unknown;
      checkout?: { status?: unknown; payment?: unknown };
      entitlement?: { active?: unknown } | null;
    };
  } | null;

  if (!payload || payload.success !== true || payload.data?.verified !== true) {
    return {
      kind: 'unable',
      title: 'Unable to verify checkout',
      message: 'The verification response did not prove this checkout belongs to the current account.',
      canRetry: true,
      requiresSignIn: false,
    };
  }

  const checkoutComplete = payload.data.checkout?.status === 'complete';
  const paymentConfirmed = payload.data.checkout?.payment === 'paid';
  const entitlementActive = payload.data.entitlement?.active === true;

  if (checkoutComplete && paymentConfirmed && entitlementActive) {
    return {
      kind: 'verified',
      title: 'Checkout verified',
      message: 'Stripe confirmed payment for this account, and Nova confirmed the current entitlement is active.',
      canRetry: false,
      requiresSignIn: false,
    };
  }

  return {
    kind: 'processing',
    title: 'Checkout processing',
    message: 'The checkout belongs to this account, but payment and active access are not both confirmed yet.',
    canRetry: true,
    requiresSignIn: false,
  };
}

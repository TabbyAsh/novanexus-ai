import { deriveBillingSuccessView } from '../billing-success-state';

describe('billing success truth contract', () => {
  it('declares checkout verified only after account, payment, completion, and entitlement are proven', () => {
    expect(deriveBillingSuccessView({
      phase: 'response',
      payload: {
        success: true,
        data: {
          verified: true,
          checkout: { status: 'complete', payment: 'paid' },
          entitlement: { active: true },
        },
      },
    }).kind).toBe('verified');
  });

  it.each([
    { status: 'processing', payment: 'paid', active: true },
    { status: 'complete', payment: 'unpaid', active: true },
    { status: 'complete', payment: 'paid', active: false },
  ])('keeps incomplete proof in processing state: %o', ({ status, payment, active }) => {
    expect(deriveBillingSuccessView({
      phase: 'response',
      payload: {
        success: true,
        data: {
          verified: true,
          checkout: { status, payment },
          entitlement: { active },
        },
      },
    }).kind).toBe('processing');
  });

  it('does not trust a nominal success response without server verification', () => {
    const view = deriveBillingSuccessView({
      phase: 'response',
      payload: { success: true, data: { verified: false } },
    });
    expect(view.kind).toBe('unable');
    expect(view.message).toContain('did not prove');
  });

  it('requires sign-in recovery after an authenticated verification failure', () => {
    const view = deriveBillingSuccessView({ phase: 'error', status: 401 });
    expect(view.kind).toBe('unable');
    expect(view.requiresSignIn).toBe(true);
    expect(view.canRetry).toBe(true);
  });
});

import {
  buildHostedPaymentUrl,
  isCompletePilotIntake,
  parseFailedPilotReceipt,
  parseSuccessfulPilotReceipt,
  validatePilotIntake,
} from '../intake-contract';

const receiptId = 'svc_abcdefghijklmnopqrstuvwx';
const receiptData = {
  received: true,
  receiptId,
  inquiryStatus: 'RECEIVED',
  delivery: {
    operatorEmail: 'FAILED',
    confirmationEmail: 'NOT_CONFIGURED',
    state: 'RECORDED_ONLY',
  },
  recovery: {
    supportEmail: 'hello@novanexus-ai.com',
    message: 'Save the receipt and contact support if needed.',
  },
};

describe('pilot intake response contract', () => {
  it('requires explicit received state and an opaque receipt instead of inferring success from HTTP', () => {
    expect(parseSuccessfulPilotReceipt({ success: true, data: {} })).toBeNull();
    expect(parseSuccessfulPilotReceipt({ success: true, data: { received: true } })).toBeNull();
    expect(parseSuccessfulPilotReceipt({ success: true, data: receiptData })).toEqual({
      receiptId,
      inquiryStatus: 'RECEIVED',
      delivery: receiptData.delivery,
      recovery: receiptData.recovery,
    });
  });

  it('retains a durable receipt for recovery without treating a failed response as accepted', () => {
    expect(parseSuccessfulPilotReceipt({ success: false, data: receiptData })).toBeNull();
    expect(parseFailedPilotReceipt({ success: false, data: receiptData })).toMatchObject({ receiptId });
  });

  it('gates submission on every bounded intake field', () => {
    const complete = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      business: 'Analytical Engines LLC',
      challenge: 'We need one reliable workflow for open customer requests.',
    };
    expect(isCompletePilotIntake(complete)).toBe(true);
    expect(isCompletePilotIntake({ ...complete, business: '' })).toBe(false);
    expect(isCompletePilotIntake({ ...complete, challenge: 'Too short' })).toBe(false);
    expect(validatePilotIntake({ ...complete, name: '', email: 'invalid', business: '', challenge: '' }))
      .toEqual({
        name: 'Enter your name using 2 to 100 characters.',
        email: 'Enter a valid email address.',
        business: 'Describe your business using 2 to 160 characters.',
        challenge: 'Describe the workflow using 20 to 2,000 characters.',
      });
  });

  it('correlates an HTTPS hosted payment link using only the opaque receipt', () => {
    const url = buildHostedPaymentUrl('https://buy.stripe.com/test?prefilled_promo_code=SAVE', receiptId);
    expect(url).toContain(`client_reference_id=${receiptId}`);
    expect(url).toContain('prefilled_promo_code=SAVE');
    expect(url).not.toContain('ada%40example.com');
    expect(buildHostedPaymentUrl('javascript:alert(1)', receiptId)).toBeNull();
  });
});

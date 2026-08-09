import {
  buildOperatorInquiryEmail,
  canReadServiceInquiryQueue,
  normalizeServiceInquiry,
  receiveServiceInquiry,
  type NormalizedServiceInquiry,
  type ServiceInquiryDependencies,
} from '../service-inquiries';

const validInput = {
  name: '  Ada   Lovelace  ',
  email: ' ADA@Example.COM ',
  business: '  Analytical   Engines LLC ',
  challenge: 'We currently track every open customer request in scattered notes.',
  service: 'Workflow Setup Pilot',
};

function dependencies(overrides: Partial<ServiceInquiryDependencies> = {}): ServiceInquiryDependencies {
  return {
    createReceiptId: () => 'svc_opaque_test_receipt',
    persistInquiry: jest.fn(async () => undefined),
    deliverOperator: jest.fn(async () => ({ status: 'PROVIDER_ACCEPTED' as const, providerId: 'operator-email-id' })),
    deliverConfirmation: jest.fn(async () => ({ status: 'PROVIDER_ACCEPTED' as const, providerId: 'confirmation-email-id' })),
    persistDelivery: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('service inquiry intake', () => {
  it('does not let an ordinary tenant OWNER read the operator queue', () => {
    expect(canReadServiceInquiryQueue(['org.read', 'org.write'])).toBe(false);
    expect(canReadServiceInquiryQueue(['org.read', 'ops.admin'])).toBe(true);
  });

  it('normalizes complete bounded input and rejects incomplete or oversized fields', () => {
    expect(normalizeServiceInquiry(validInput)).toEqual({
      ok: true,
      value: {
        serviceCode: 'BACK_OFFICE_OS_STARTER',
        serviceName: 'Workflow Setup Pilot',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        business: 'Analytical Engines LLC',
        challenge: validInput.challenge,
      },
    });

    const invalid = normalizeServiceInquiry({
      name: 'A',
      email: 'not-an-email',
      business: '',
      challenge: 'too short',
      service: 'Unbounded consulting',
    });
    expect(invalid.ok).toBe(false);
    if ('errors' in invalid) {
      expect(Object.keys(invalid.errors).sort()).toEqual(['business', 'challenge', 'email', 'name', 'service']);
    }

    const oversized = normalizeServiceInquiry({ ...validInput, challenge: 'x'.repeat(2001) });
    expect(oversized.ok).toBe(false);

    expect(normalizeServiceInquiry({ ...validInput, service: 'Back Office OS Starter Pilot' })).toMatchObject({
      ok: true,
      value: { serviceName: 'Workflow Setup Pilot' },
    });
  });

  it('escapes every user field before building operator HTML', () => {
    const validation = normalizeServiceInquiry({
      ...validInput,
      name: '<img src=x onerror=alert(1)>',
      business: 'R&D "Partners"',
      challenge: "Need <script>alert('x')</script> safely tracked in our current workflow.",
    });
    expect(validation.ok).toBe(true);
    const html = buildOperatorInquiryEmail(
      (validation as { ok: true; value: NormalizedServiceInquiry }).value,
      'svc_<opaque>',
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('svc_<opaque>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('svc_&lt;opaque&gt;');
    expect(html).toContain('R&amp;D &quot;Partners&quot;');
  });

  it('fails closed and never attempts delivery when the durable insert fails', async () => {
    const deps = dependencies({
      persistInquiry: jest.fn(async () => { throw new Error('database unavailable'); }),
    });

    await expect(receiveServiceInquiry(validInput, deps)).resolves.toEqual({ kind: 'persistence_failed' });
    expect(deps.deliverOperator).not.toHaveBeenCalled();
    expect(deps.deliverConfirmation).not.toHaveBeenCalled();
    expect(deps.persistDelivery).not.toHaveBeenCalled();
  });

  it('keeps a durable receipt and reports recorded-only when the provider is unavailable', async () => {
    const persistDelivery = jest.fn(async () => undefined);
    const deps = dependencies({
      deliverOperator: jest.fn(async () => { throw new Error('provider down'); }),
      deliverConfirmation: jest.fn(async () => ({ status: 'NOT_CONFIGURED' as const })),
      persistDelivery,
    });

    const result = await receiveServiceInquiry(validInput, deps);
    expect(result).toMatchObject({
      kind: 'received',
      received: true,
      receiptId: 'svc_opaque_test_receipt',
      inquiryStatus: 'RECEIVED',
      delivery: {
        operatorEmail: 'FAILED',
        confirmationEmail: 'NOT_CONFIGURED',
        state: 'RECORDED_ONLY',
      },
    });
    expect(persistDelivery).toHaveBeenCalledWith(
      'svc_opaque_test_receipt',
      { status: 'FAILED' },
      { status: 'NOT_CONFIGURED', providerId: undefined },
    );
  });

  it('returns a failure with the durable receipt when delivery outcomes cannot be recorded', async () => {
    const deps = dependencies({
      persistDelivery: jest.fn(async () => { throw new Error('write failed'); }),
    });

    await expect(receiveServiceInquiry(validInput, deps)).resolves.toMatchObject({
      kind: 'delivery_persistence_failed',
      received: true,
      receiptId: 'svc_opaque_test_receipt',
    });
  });
});

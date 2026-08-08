export const SERVICE_INQUIRY_CODE = 'BACK_OFFICE_OS_STARTER' as const;
export const SERVICE_INQUIRY_NAME = 'Back Office OS Starter Pilot' as const;
export const SERVICE_INQUIRY_SUPPORT_EMAIL = 'hello@novanexus-ai.com' as const;

export const SERVICE_INQUIRY_LIMITS = {
  name: { min: 2, max: 100 },
  email: { min: 3, max: 254 },
  business: { min: 2, max: 160 },
  challenge: { min: 20, max: 2000 },
} as const;

export function canReadServiceInquiryQueue(scopes: readonly string[]): boolean {
  return scopes.includes('ops.admin');
}

export interface NormalizedServiceInquiry {
  serviceCode: typeof SERVICE_INQUIRY_CODE;
  serviceName: typeof SERVICE_INQUIRY_NAME;
  name: string;
  email: string;
  business: string;
  challenge: string;
}

export type ServiceInquiryValidation =
  | { ok: true; value: NormalizedServiceInquiry }
  | { ok: false; errors: Record<string, string> };

function singleLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function multiLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function validEmail(email: string): boolean {
  if (email.length < SERVICE_INQUIRY_LIMITS.email.min || email.length > SERVICE_INQUIRY_LIMITS.email.max) {
    return false;
  }
  if (email.includes('..')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeServiceInquiry(input: unknown): ServiceInquiryValidation {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const name = singleLine(body.name);
  const email = singleLine(body.email).toLowerCase();
  const business = singleLine(body.business);
  const challenge = multiLine(body.challenge);
  const requestedService = singleLine(body.service);
  const errors: Record<string, string> = {};

  if (name.length < SERVICE_INQUIRY_LIMITS.name.min || name.length > SERVICE_INQUIRY_LIMITS.name.max) {
    errors.name = `Name must be ${SERVICE_INQUIRY_LIMITS.name.min}-${SERVICE_INQUIRY_LIMITS.name.max} characters.`;
  }
  if (!validEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (business.length < SERVICE_INQUIRY_LIMITS.business.min || business.length > SERVICE_INQUIRY_LIMITS.business.max) {
    errors.business = `Business must be ${SERVICE_INQUIRY_LIMITS.business.min}-${SERVICE_INQUIRY_LIMITS.business.max} characters.`;
  }
  if (challenge.length < SERVICE_INQUIRY_LIMITS.challenge.min || challenge.length > SERVICE_INQUIRY_LIMITS.challenge.max) {
    errors.challenge = `Current workflow must be ${SERVICE_INQUIRY_LIMITS.challenge.min}-${SERVICE_INQUIRY_LIMITS.challenge.max} characters.`;
  }
  if (requestedService && ![SERVICE_INQUIRY_NAME, 'Back Office OS'].includes(requestedService)) {
    errors.service = 'This inquiry endpoint currently accepts only the Back Office OS Starter Pilot.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      serviceCode: SERVICE_INQUIRY_CODE,
      serviceName: SERVICE_INQUIRY_NAME,
      name,
      email,
      business,
      challenge,
    },
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function htmlText(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function buildOperatorInquiryEmail(inquiry: NormalizedServiceInquiry, receiptId: string): string {
  return `<div style="font-family:system-ui;color:#111827;max-width:620px">
    <h2>New ${escapeHtml(inquiry.serviceName)} inquiry</h2>
    <p><strong>Receipt:</strong> ${escapeHtml(receiptId)}</p>
    <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
    <p><strong>Business:</strong> ${escapeHtml(inquiry.business)}</p>
    <p><strong>Current workflow and need:</strong><br>${htmlText(inquiry.challenge)}</p>
    <p>This record is an inquiry only. Confirm scope before requesting payment or beginning work.</p>
  </div>`;
}

export function buildConfirmationInquiryEmail(inquiry: NormalizedServiceInquiry, receiptId: string): string {
  const firstName = inquiry.name.split(' ')[0] || inquiry.name;
  return `<div style="font-family:system-ui;color:#111827;max-width:620px">
    <h2>We recorded your pilot inquiry.</h2>
    <p>Thanks, ${escapeHtml(firstName)}. Your receipt is <strong>${escapeHtml(receiptId)}</strong>.</p>
    <p>This is not scope acceptance and no work or payment has started. We will review the intake and contact you about fit and scope.</p>
    <p>If you need help, email <a href="mailto:${SERVICE_INQUIRY_SUPPORT_EMAIL}">${SERVICE_INQUIRY_SUPPORT_EMAIL}</a> and include your receipt.</p>
  </div>`;
}

export type EmailDeliveryStatus = 'PROVIDER_ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';

export interface EmailDeliveryOutcome {
  status: EmailDeliveryStatus;
  providerId?: string;
}

export interface InquiryDelivery {
  operatorEmail: EmailDeliveryStatus;
  confirmationEmail: EmailDeliveryStatus;
  state: 'PROVIDER_ACCEPTED_BOTH' | 'OPERATOR_PROVIDER_ACCEPTED' | 'RECORDED_ONLY';
}

export interface ServiceInquiryDependencies {
  createReceiptId(): string;
  persistInquiry(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<void>;
  deliverOperator(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<EmailDeliveryOutcome>;
  deliverConfirmation(inquiry: NormalizedServiceInquiry, receiptId: string): Promise<EmailDeliveryOutcome>;
  persistDelivery(receiptId: string, operator: EmailDeliveryOutcome, confirmation: EmailDeliveryOutcome): Promise<void>;
}

export type ReceiveServiceInquiryResult =
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'persistence_failed' }
  | {
      kind: 'delivery_persistence_failed';
      receiptId: string;
      received: true;
      delivery: InquiryDelivery;
    }
  | {
      kind: 'received';
      receiptId: string;
      received: true;
      inquiryStatus: 'RECEIVED';
      delivery: InquiryDelivery;
      recovery: { supportEmail: string; message: string };
    };

function deliveryState(operator: EmailDeliveryOutcome, confirmation: EmailDeliveryOutcome): InquiryDelivery {
  const state = operator.status === 'PROVIDER_ACCEPTED'
    ? confirmation.status === 'PROVIDER_ACCEPTED' ? 'PROVIDER_ACCEPTED_BOTH' : 'OPERATOR_PROVIDER_ACCEPTED'
    : 'RECORDED_ONLY';
  return {
    operatorEmail: operator.status,
    confirmationEmail: confirmation.status,
    state,
  };
}

async function safelyDeliver(
  deliver: () => Promise<EmailDeliveryOutcome>,
): Promise<EmailDeliveryOutcome> {
  try {
    const outcome = await deliver();
    if (!['PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED', 'SKIPPED'].includes(outcome.status)) {
      return { status: 'FAILED' };
    }
    return {
      status: outcome.status,
      providerId: typeof outcome.providerId === 'string' ? outcome.providerId.slice(0, 255) : undefined,
    };
  } catch {
    return { status: 'FAILED' };
  }
}

export async function receiveServiceInquiry(
  input: unknown,
  dependencies: ServiceInquiryDependencies,
): Promise<ReceiveServiceInquiryResult> {
  const validation = normalizeServiceInquiry(input);
  if ('errors' in validation) return { kind: 'invalid', errors: validation.errors };

  const receiptId = dependencies.createReceiptId();
  try {
    await dependencies.persistInquiry(validation.value, receiptId);
  } catch {
    return { kind: 'persistence_failed' };
  }

  const operator = await safelyDeliver(() => dependencies.deliverOperator(validation.value, receiptId));
  const confirmation = await safelyDeliver(() => dependencies.deliverConfirmation(validation.value, receiptId));
  const delivery = deliveryState(operator, confirmation);

  try {
    await dependencies.persistDelivery(receiptId, operator, confirmation);
  } catch {
    return { kind: 'delivery_persistence_failed', receiptId, received: true, delivery };
  }

  return {
    kind: 'received',
    receiptId,
    received: true,
    inquiryStatus: 'RECEIVED',
    delivery,
    recovery: {
      supportEmail: SERVICE_INQUIRY_SUPPORT_EMAIL,
      message: `Save this receipt. If you do not hear from us, email ${SERVICE_INQUIRY_SUPPORT_EMAIL} and include the receipt.`,
    },
  };
}

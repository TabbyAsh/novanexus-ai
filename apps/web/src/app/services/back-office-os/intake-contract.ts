export interface PilotIntakeForm {
  name: string;
  email: string;
  business: string;
  challenge: string;
}
export type EmailDeliveryStatus = 'PROVIDER_ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';

export interface PilotInquiryReceipt {
  receiptId: string;
  inquiryStatus: 'RECEIVED';
  delivery: {
    operatorEmail: EmailDeliveryStatus;
    confirmationEmail: EmailDeliveryStatus;
    state: 'PROVIDER_ACCEPTED_BOTH' | 'OPERATOR_PROVIDER_ACCEPTED' | 'RECORDED_ONLY';
  };
  recovery: {
    supportEmail: string;
    message: string;
  };
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function validReceiptId(value: unknown): value is string {
  return typeof value === 'string' && /^svc_[A-Za-z0-9_-]{20,36}$/.test(value);
}

function parseReceiptData(value: unknown): PilotInquiryReceipt | null {
  const data = object(value);
  const delivery = object(data?.delivery);
  const recovery = object(data?.recovery);
  const emailStatuses = ['PROVIDER_ACCEPTED', 'FAILED', 'NOT_CONFIGURED', 'SKIPPED'];
  const deliveryStates = ['PROVIDER_ACCEPTED_BOTH', 'OPERATOR_PROVIDER_ACCEPTED', 'RECORDED_ONLY'];
  if (
    data?.received !== true
    || !validReceiptId(data.receiptId)
    || data.inquiryStatus !== 'RECEIVED'
    || !delivery
    || !emailStatuses.includes(String(delivery.operatorEmail))
    || !emailStatuses.includes(String(delivery.confirmationEmail))
    || !deliveryStates.includes(String(delivery.state))
    || !recovery
    || typeof recovery.supportEmail !== 'string'
    || typeof recovery.message !== 'string'
  ) {
    return null;
  }

  return {
    receiptId: data.receiptId,
    inquiryStatus: 'RECEIVED',
    delivery: {
      operatorEmail: delivery.operatorEmail as EmailDeliveryStatus,
      confirmationEmail: delivery.confirmationEmail as EmailDeliveryStatus,
      state: delivery.state as PilotInquiryReceipt['delivery']['state'],
    },
    recovery: {
      supportEmail: recovery.supportEmail,
      message: recovery.message,
    },
  };
}

export function parseSuccessfulPilotReceipt(payload: unknown): PilotInquiryReceipt | null {
  const response = object(payload);
  if (response?.success !== true) return null;
  return parseReceiptData(response.data);
}

export function parseFailedPilotReceipt(payload: unknown): PilotInquiryReceipt | null {
  const response = object(payload);
  if (response?.success !== false) return null;
  return parseReceiptData(response.data);
}

export function isCompletePilotIntake(form: PilotIntakeForm): boolean {
  const name = form.name.trim();
  const email = form.email.trim();
  const business = form.business.trim();
  const challenge = form.challenge.trim();
  return name.length >= 2
    && name.length <= 100
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && business.length >= 2
    && business.length <= 160
    && challenge.length >= 20
    && challenge.length <= 2000;
}

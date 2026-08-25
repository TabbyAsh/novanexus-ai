import type { ClaimedServicePaymentAlert } from './revenue-store';

export type AlertDeliveryStatus = 'PROVIDER_ACCEPTED' | 'FAILED' | 'NOT_CONFIGURED';

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean }>;

function safeAlertText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

export async function deliverRedactedServicePaymentAlert(
  claim: ClaimedServicePaymentAlert,
  config: { apiKey: string; operatorEmail: string; from: string },
  fetchImpl: FetchLike = fetch as FetchLike,
  timeoutMs = 10_000,
): Promise<AlertDeliveryStatus> {
  if (!config.apiKey.startsWith('re_') || !config.operatorEmail) return 'NOT_CONFIGURED';
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [config.operatorEmail],
        subject: 'Nova payment exception requires review',
        html: `<p>A Workflow Setup Pilot payment exception was recorded.</p>
          <p>Reason: <strong>${safeAlertText(claim.reason_code)}</strong></p>
          <p>Redacted event receipt: <code>${claim.event_hash}</code></p>
          <p>No customer or payment identifiers are included in this alert.</p>`,
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
    return response.ok ? 'PROVIDER_ACCEPTED' : 'FAILED';
  } catch {
    return 'FAILED';
  }
}

export const BILLING_READINESS_TIMEOUT_MS = 2_000;

export interface BillingReadiness {
  healthy: boolean;
  statusCode: number | null;
  reason?: 'UNHEALTHY_RESPONSE' | 'UNAVAILABLE';
}

type ReadinessFetch = (
  input: string,
  init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export async function checkBillingReadiness(
  billingUrl: string,
  fetchImpl: ReadinessFetch = fetch,
  timeoutMs = BILLING_READINESS_TIMEOUT_MS,
): Promise<BillingReadiness> {
  const endpoint = `${billingUrl.replace(/\/$/, '')}/health`;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null) as { status?: unknown } | null;
    const healthy = response.ok && body?.status === 'healthy';

    return healthy
      ? { healthy: true, statusCode: response.status }
      : { healthy: false, statusCode: response.status, reason: 'UNHEALTHY_RESPONSE' };
  } catch {
    return { healthy: false, statusCode: null, reason: 'UNAVAILABLE' };
  }
}

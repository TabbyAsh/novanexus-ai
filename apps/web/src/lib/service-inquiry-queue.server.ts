import 'server-only';
import { resolveBackendUrl } from './backend-url';
import { verifyWorldToken } from './world/access';

export type OwnerInquiry = {
  receipt_id: string;
  service_code: string;
  name: string;
  email: string;
  business: string;
  challenge: string;
  status: string;
  operator_email_status: string;
  confirmation_email_status: string;
  payment_status: string;
  created_at: string;
  details?: Record<string, string>;
};

type QueueResult = { ok: true; inquiries: OwnerInquiry[] } | { ok: false; status: 401 | 403 | 503 };

function inquiry(value: unknown): value is OwnerInquiry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return /^svc_[A-Za-z0-9_-]{20,36}$/.test(String(row.receipt_id))
    && (row.details === undefined || row.details === null || (typeof row.details === 'object'
      && !Array.isArray(row.details) && Object.values(row.details).every(value => typeof value === 'string')))
    && ['service_code', 'name', 'email', 'business', 'challenge', 'status', 'created_at',
      'operator_email_status', 'confirmation_email_status', 'payment_status']
      .every(key => typeof row[key] === 'string');
}

/** The owner's existing user session is checked upstream before records are fetched. */
export async function readServiceInquiryQueue(
  token: string | undefined,
  backendUrl = resolveBackendUrl(),
  request = fetch,
): Promise<QueueResult> {
  const access = await verifyWorldToken(token, backendUrl, request);
  if (!access.ok) return access;
  if (!backendUrl) return { ok: false, status: 503 };
  try {
    const url = new URL('/v1/admin/service-inquiries', backendUrl);
    url.searchParams.set('limit', '50');
    const response = await request(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, status: response.status === 401 ? 401 : response.status === 403 ? 403 : 503 };
    const body = await response.json();
    if (body?.success !== true || !Array.isArray(body.data?.inquiries)
      || body.data.inquiries.length > 50 || !body.data.inquiries.every(inquiry)) {
      return { ok: false, status: 503 };
    }
    return { ok: true, inquiries: body.data.inquiries };
  } catch { return { ok: false, status: 503 }; }
}

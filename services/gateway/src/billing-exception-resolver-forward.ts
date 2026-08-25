import { isStrictServiceToken } from '../../../libs/shared/runtime/service-token';

const EVENT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9]{8,255}$/;
const MAX_UPSTREAM_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_RESOLVER_TIMEOUT_MS = 5_000;

export type BillingResolverForwardingErrorCode =
  | 'INVALID_EVENT_HASH'
  | 'INVALID_CHECKOUT_SESSION_ID'
  | 'RESOLVER_NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_UPSTREAM_RESPONSE';

export class BillingResolverForwardingError extends Error {
  constructor(public readonly code: BillingResolverForwardingErrorCode) {
    super(code);
    this.name = 'BillingResolverForwardingError';
  }
}

export type BillingResolverForward = {
  path: string;
  init: RequestInit;
};

export type BillingResolverProxyResponse = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

type ForwardInput = {
  billingUrl: string;
  eventHash: unknown;
  requestBody: unknown;
  resolverToken: string | undefined;
  requestId?: unknown;
  forwardedFor?: string;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function safeHeader(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    && !/[\r\n]/.test(value)
    ? value
    : null;
}

function optionalIdentifier(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 && value.length <= 255
    ? value
    : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildBillingExceptionResolverForward(input: Omit<ForwardInput, 'billingUrl'>): BillingResolverForward {
  if (typeof input.eventHash !== 'string' || !EVENT_HASH_PATTERN.test(input.eventHash)) {
    throw new BillingResolverForwardingError('INVALID_EVENT_HASH');
  }

  const body = asObject(input.requestBody);
  const checkoutSessionId = body?.checkoutSessionId;
  if (typeof checkoutSessionId !== 'string' || !CHECKOUT_SESSION_ID_PATTERN.test(checkoutSessionId)) {
    throw new BillingResolverForwardingError('INVALID_CHECKOUT_SESSION_ID');
  }
  if (!isStrictServiceToken(input.resolverToken)) {
    throw new BillingResolverForwardingError('RESOLVER_NOT_CONFIGURED');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.resolverToken}`,
  };
  const requestId = safeHeader(input.requestId, 255);
  const forwardedFor = safeHeader(input.forwardedFor, 45);
  if (requestId) headers['X-Request-ID'] = requestId;
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;

  return {
    path: `/internal/service-payment-exceptions/${input.eventHash}/resolve`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({ checkoutSessionId }),
    },
  };
}

function sanitizeSuccessfulResponse(
  value: unknown,
  eventHash: string,
  checkoutSessionId: string,
): Record<string, unknown> {
  const payload = asObject(value);
  const data = asObject(payload?.data);
  const resolution = asObject(data?.resolution);
  const paymentIntentId = optionalIdentifier(resolution?.paymentIntentId);
  const receiptId = optionalIdentifier(resolution?.receiptId);
  if (
    payload?.success !== true
    || data?.eventHash !== eventHash
    || typeof data.reason !== 'string'
    || data.reason.length === 0
    || data.reason.length > 128
    || resolution?.checkoutSessionId !== checkoutSessionId
    || paymentIntentId === undefined
    || receiptId === undefined
  ) {
    throw new BillingResolverForwardingError('INVALID_UPSTREAM_RESPONSE');
  }

  return {
    success: true,
    data: {
      eventHash,
      reason: data.reason,
      resolution: { checkoutSessionId, paymentIntentId, receiptId },
    },
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new BillingResolverForwardingError('INVALID_UPSTREAM_RESPONSE');
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BillingResolverForwardingError('INVALID_UPSTREAM_RESPONSE');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new BillingResolverForwardingError('INVALID_UPSTREAM_RESPONSE');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BillingResolverForwardingError('INVALID_UPSTREAM_RESPONSE');
  }
}

export async function forwardBillingExceptionResolution(
  input: ForwardInput,
  fetchImpl: FetchLike = fetch,
  timeoutMs = DEFAULT_RESOLVER_TIMEOUT_MS,
): Promise<BillingResolverProxyResponse> {
  const forwarded = buildBillingExceptionResolverForward(input);
  const controller = new AbortController();
  const boundedTimeoutMs = Math.max(1, Math.min(10_000, Math.floor(timeoutMs)));
  const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
  try {
    const response = await fetchImpl(`${input.billingUrl.replace(/\/$/, '')}${forwarded.path}`, {
      ...forwarded.init,
      signal: controller.signal,
    });
    if (response.status === 404) {
      // Do not relay arbitrary internal error details. A miss is intentionally
      // indistinguishable from an unknown exception or a non-matching candidate.
      return {
        status: 404,
        body: { success: false, error: { code: 'NOT_FOUND', message: 'Resolution candidate not found' } },
        headers: { 'Cache-Control': 'private, no-store' },
      };
    }
    if (response.status !== 200) {
      throw new BillingResolverForwardingError('UPSTREAM_UNAVAILABLE');
    }

    const checkoutSessionId = JSON.parse(String(forwarded.init.body)).checkoutSessionId as string;
    const value = await readBoundedJson(response);
    return {
      status: 200,
      body: sanitizeSuccessfulResponse(value, input.eventHash as string, checkoutSessionId),
      headers: { 'Cache-Control': 'private, no-store' },
    };
  } catch (error) {
    if (error instanceof BillingResolverForwardingError) throw error;
    throw new BillingResolverForwardingError('UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeBillingResolverForwardingError(error: unknown): BillingResolverProxyResponse {
  const forwardingError = error instanceof BillingResolverForwardingError ? error : null;
  const invalidRequest = forwardingError?.code === 'INVALID_EVENT_HASH'
    || forwardingError?.code === 'INVALID_CHECKOUT_SESSION_ID';
  return {
    status: invalidRequest ? 400 : 503,
    body: {
      success: false,
      error: invalidRequest
        ? { code: 'INVALID_RESOLUTION_REQUEST', message: 'A valid event hash and checkout session ID are required' }
        : { code: 'BILLING_RESOLVER_UNAVAILABLE', message: 'Billing resolution service unavailable' },
    },
    headers: { 'Cache-Control': 'private, no-store' },
  };
}

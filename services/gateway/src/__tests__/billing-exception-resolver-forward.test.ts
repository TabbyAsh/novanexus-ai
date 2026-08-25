import fs from 'node:fs';
import path from 'node:path';
import {
  BillingResolverForwardingError,
  buildBillingExceptionResolverForward,
  forwardBillingExceptionResolution,
  normalizeBillingResolverForwardingError,
} from '../billing-exception-resolver-forward';
import { requiredScopesForRoute } from '../route-authority';

const EVENT_HASH = 'a'.repeat(64);
const CHECKOUT_SESSION_ID = `cs_test_${'B'.repeat(32)}`;
const RESOLVER_TOKEN = 'resolver-token-'.padEnd(48, 'x');

describe('billing payment-exception resolver forwarding', () => {
  it('uses only the internal resolver credential and forwards a minimal body', () => {
    const forwarded = buildBillingExceptionResolverForward({
      eventHash: EVENT_HASH,
      requestBody: {
        checkoutSessionId: CHECKOUT_SESSION_ID,
        authorization: 'Bearer operator-access-token',
        unexpected: { secret: 'must-not-cross-the-boundary' },
      },
      resolverToken: RESOLVER_TOKEN,
      requestId: 'request-123',
      forwardedFor: '127.0.0.1',
    });

    expect(forwarded.path).toBe(`/internal/service-payment-exceptions/${EVENT_HASH}/resolve`);
    expect(forwarded.init.method).toBe('POST');
    expect(forwarded.init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESOLVER_TOKEN}`,
      'X-Request-ID': 'request-123',
      'X-Forwarded-For': '127.0.0.1',
    });
    expect(JSON.parse(forwarded.init.body as string)).toEqual({
      checkoutSessionId: CHECKOUT_SESSION_ID,
    });
    expect(String(forwarded.init.body)).not.toContain('operator-access-token');
    expect(String(forwarded.init.body)).not.toContain('must-not-cross-the-boundary');
  });

  it('fails closed for malformed identities or an unconfigured resolver credential', () => {
    expect(() => buildBillingExceptionResolverForward({
      eventHash: 'not-a-hash',
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: RESOLVER_TOKEN,
    })).toThrow(expect.objectContaining({ code: 'INVALID_EVENT_HASH' }));

    expect(() => buildBillingExceptionResolverForward({
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: 'cs_test_bad' },
      resolverToken: RESOLVER_TOKEN,
    })).toThrow(expect.objectContaining({ code: 'INVALID_CHECKOUT_SESSION_ID' }));

    expect(() => buildBillingExceptionResolverForward({
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: 'too-short',
    })).toThrow(expect.objectContaining({ code: 'RESOLVER_NOT_CONFIGURED' }));
    expect(() => buildBillingExceptionResolverForward({
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: 'x'.repeat(48),
    })).toThrow(expect.objectContaining({ code: 'RESOLVER_NOT_CONFIGURED' }));
  });

  it('returns only the bounded, identity-matched resolution contract', async () => {
    const upstreamPayload = {
      success: true,
      data: {
        eventHash: EVENT_HASH,
        reason: 'UNKNOWN_RECEIPT',
        resolution: {
          checkoutSessionId: CHECKOUT_SESSION_ID,
          paymentIntentId: 'pi_123456789',
          receiptId: 'receipt-123',
          internalNote: 'do-not-relay',
        },
        databaseRow: { should: 'not-relay' },
      },
    };
    const fetchMock = jest.fn(async () => new Response(JSON.stringify(upstreamPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await forwardBillingExceptionResolution({
      billingUrl: 'http://billing.internal/',
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: RESOLVER_TOKEN,
      requestId: 'request-456',
      forwardedFor: '10.0.0.2',
    }, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://billing.internal/internal/service-payment-exceptions/${EVENT_HASH}/resolve`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({
      status: 200,
      body: {
        success: true,
        data: {
          eventHash: EVENT_HASH,
          reason: 'UNKNOWN_RECEIPT',
          resolution: {
            checkoutSessionId: CHECKOUT_SESSION_ID,
            paymentIntentId: 'pi_123456789',
            receiptId: 'receipt-123',
          },
        },
      },
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });

  it('aborts a stalled resolver forward and normalizes it to a bounded 503', async () => {
    const fetchMock = jest.fn((_url: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })
    ));
    let timeoutError: unknown;
    try {
      await forwardBillingExceptionResolution({
        billingUrl: 'http://billing.internal',
        eventHash: EVENT_HASH,
        requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
        resolverToken: RESOLVER_TOKEN,
      }, fetchMock, 5);
    } catch (error) {
      timeoutError = error;
    }
    expect(timeoutError).toEqual(expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }));
    expect(timeoutError).toBeInstanceOf(BillingResolverForwardingError);
    expect(normalizeBillingResolverForwardingError(timeoutError)).toEqual({
      status: 503,
      body: {
        success: false,
        error: { code: 'BILLING_RESOLVER_UNAVAILABLE', message: 'Billing resolution service unavailable' },
      },
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });

  it('does not relay unmatched, oversized, or otherwise unsafe upstream payloads', async () => {
    const mismatched = jest.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        eventHash: EVENT_HASH,
        reason: 'UNKNOWN_RECEIPT',
        resolution: {
          checkoutSessionId: `cs_test_${'C'.repeat(32)}`,
          paymentIntentId: null,
          receiptId: null,
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(forwardBillingExceptionResolution({
      billingUrl: 'http://billing.internal',
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: RESOLVER_TOKEN,
    }, mismatched)).rejects.toEqual(expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }));

    const oversized = jest.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Length': '65536' },
    }));
    await expect(forwardBillingExceptionResolution({
      billingUrl: 'http://billing.internal',
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: RESOLVER_TOKEN,
    }, oversized)).rejects.toEqual(expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }));
  });

  it('normalizes internal misses without relaying the upstream response body', async () => {
    const fetchMock = jest.fn(async () => new Response('sensitive internal detail', { status: 404 }));
    const result = await forwardBillingExceptionResolution({
      billingUrl: 'http://billing.internal',
      eventHash: EVENT_HASH,
      requestBody: { checkoutSessionId: CHECKOUT_SESSION_ID },
      resolverToken: RESOLVER_TOKEN,
    }, fetchMock);

    expect(result).toEqual({
      status: 404,
      body: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resolution candidate not found' },
      },
      headers: { 'Cache-Control': 'private, no-store' },
    });
    expect(JSON.stringify(result)).not.toContain('sensitive internal detail');
  });

  it('registers a non-public, ops.admin-only POST before the broad admin proxy', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const publicRoutes = gatewaySource.match(/const PUBLIC_ROUTES = \[([\s\S]*?)\n\];/)?.[1] ?? '';
    const specificRoute = gatewaySource.indexOf(
      "'/v1/admin/billing/payment-exceptions/:eventHash/resolve'",
    );
    const broadAdminRoute = gatewaySource.indexOf("app.all('/v1/admin/*'");
    const resolverProxy = gatewaySource.slice(
      gatewaySource.indexOf('async function proxyBillingExceptionResolution'),
      gatewaySource.indexOf('async function proxyRequest(', gatewaySource.indexOf('async function proxyBillingExceptionResolution')),
    );

    expect(publicRoutes).not.toContain('/v1/admin/billing/payment-exceptions');
    expect(requiredScopesForRoute(
      'POST',
      `/v1/admin/billing/payment-exceptions/${EVENT_HASH}/resolve`,
    )).toEqual(['ops.admin']);
    expect(specificRoute).toBeGreaterThan(-1);
    expect(specificRoute).toBeLessThan(broadAdminRoute);
    expect(gatewaySource.slice(specificRoute, specificRoute + 180))
      .toContain("requireScopes(['ops.admin'])");
    expect(resolverProxy).not.toContain('req.headers.authorization');
    expect(resolverProxy).toContain('resolverToken: SERVICE_PAYMENT_RESOLVER_TOKEN');
    expect(resolverProxy).toContain('Object.entries(result.headers)');
  });
});

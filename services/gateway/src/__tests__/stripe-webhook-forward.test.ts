import {
  buildStripeWebhookForward,
  StripeWebhookForwardingError,
} from '../stripe-webhook-forward';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Stripe webhook forwarding', () => {
  it('preserves the exact signed bytes, signature, and content type', () => {
    const original = Buffer.from('{\n  "type": "checkout.session.completed",\n  "snowman": "☃"\n}\n', 'utf8');
    const forwarded = buildStripeWebhookForward(
      original,
      't=1700000000,v1=signed-digest',
      'application/json; charset=utf-8',
      'request-123',
      '127.0.0.1',
    );

    expect(forwarded.body).toBe(original);
    expect(Buffer.compare(forwarded.body, original)).toBe(0);
    expect(forwarded.headers).toMatchObject({
      'Content-Type': 'application/json; charset=utf-8',
      'Stripe-Signature': 't=1700000000,v1=signed-digest',
      'X-Request-ID': 'request-123',
      'X-Forwarded-For': '127.0.0.1',
    });
  });

  it('refuses parsed JSON and missing signature metadata', () => {
    expect(() => buildStripeWebhookForward({}, 'sig', 'application/json'))
      .toThrow(StripeWebhookForwardingError);
    expect(() => buildStripeWebhookForward(Buffer.from('{}'), undefined, 'application/json'))
      .toThrow('Missing stripe-signature header');
    expect(() => buildStripeWebhookForward(Buffer.from('{}'), 'sig', undefined))
      .toThrow('Missing webhook content-type header');
  });

  it('captures webhook bytes before the gateway JSON parser and uses the raw proxy', () => {
    const gatewaySource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const rawParser = gatewaySource.indexOf("app.use('/billing/webhook', express.raw");
    const jsonParser = gatewaySource.indexOf('app.use(express.json');

    expect(rawParser).toBeGreaterThan(-1);
    expect(jsonParser).toBeGreaterThan(rawParser);
    expect(gatewaySource).toContain("app.post('/billing/webhook'");
    expect(gatewaySource).toContain('proxyStripeWebhook(req, res)');
    expect(gatewaySource).toContain("app.disable('x-powered-by')");
  });

  it('keeps checkout verification authenticated and proxies the bearer context', () => {
    const gatewaySource = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');
    const publicRoutes = gatewaySource.slice(
      gatewaySource.indexOf('const PUBLIC_ROUTES'),
      gatewaySource.indexOf('const PREMIUM_FEATURES'),
    );

    expect(publicRoutes).not.toContain('/v1/billing/checkout-session/status');
    expect(gatewaySource).toContain("app.get('/v1/billing/checkout-session/status'");
    expect(gatewaySource).toContain("headers['Authorization'] = req.headers.authorization");
    expect(gatewaySource).toContain("headers['X-User-ID'] = req.auth.userId");
    expect(gatewaySource).toContain("headers['X-Org-ID'] = req.auth.orgId");
  });
});

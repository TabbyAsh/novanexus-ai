import { checkBillingReadiness } from '../billing-readiness';
import fs from 'node:fs';
import path from 'node:path';

describe('billing readiness', () => {
  it('reports healthy only for a successful healthy Billing response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' }),
    });

    await expect(checkBillingReadiness('http://billing.internal/', fetchImpl)).resolves.toEqual({
      healthy: true,
      statusCode: 200,
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://billing.internal/health', expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    { ok: false, status: 503, body: { status: 'unhealthy' } },
    { ok: true, status: 200, body: { status: 'starting' } },
  ])('fails closed for an unhealthy Billing response', async ({ ok, status, body }) => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    });

    await expect(checkBillingReadiness('http://billing.internal', fetchImpl)).resolves.toEqual({
      healthy: false,
      statusCode: status,
      reason: 'UNHEALTHY_RESPONSE',
    });
  });

  it('bounds an unavailable Billing check with a timeout', async () => {
    const fetchImpl = jest.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));

    await expect(checkBillingReadiness('http://billing.internal', fetchImpl as never, 5)).resolves.toEqual({
      healthy: false,
      statusCode: null,
      reason: 'UNAVAILABLE',
    });
  });

  it('makes the Gateway health route fail closed on Billing readiness', () => {
    const gatewaySource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    const healthRouteStart = gatewaySource.indexOf("app.get('/health'");
    const metricsStart = gatewaySource.indexOf('// Basic metrics endpoint', healthRouteStart);
    const healthRouteSource = gatewaySource.slice(healthRouteStart, metricsStart);

    expect(healthRouteStart).toBeGreaterThan(-1);
    expect(metricsStart).toBeGreaterThan(healthRouteStart);
    expect(healthRouteSource).toContain('await checkBillingReadiness(SERVICE_URLS.billing)');
    expect(healthRouteSource).toContain('HTTP_STATUS.SERVICE_UNAVAILABLE');
  });
});

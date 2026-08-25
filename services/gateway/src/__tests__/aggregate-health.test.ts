import { checkRequiredServices } from '../aggregate-health';

describe('gateway aggregate health', () => {
  const services = {
    orchestrator: 'http://orchestrator.test',
    tradebot: 'http://tradebot.test',
    storebot: 'http://storebot.test',
    socialbot: 'http://socialbot.test',
  };

  test('is healthy only when every required service reports healthy', async () => {
    const fetchImpl = jest.fn(async () => Response.json({ status: 'healthy' }));
    const checks = await checkRequiredServices(services, fetchImpl as typeof fetch, 50);

    expect(Object.values(checks).every(check => check.ok)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test('fails closed when a bot is absent or reports a non-healthy status', async () => {
    const fetchImpl = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('storebot')) throw new Error('connection refused');
      if (url.includes('tradebot')) {
        return Response.json({ status: 'degraded' }, { status: 503 });
      }
      return Response.json({ status: 'healthy' });
    });
    const checks = await checkRequiredServices(services, fetchImpl as typeof fetch, 50);

    expect(checks.orchestrator.ok).toBe(true);
    expect(checks.tradebot.ok).toBe(false);
    expect(checks.storebot).toMatchObject({ ok: false, status: null, error: 'connection refused' });
  });

  test('bounds a hung dependency check', async () => {
    const fetchImpl = jest.fn(async (_input: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));
    const startedAt = Date.now();
    const checks = await checkRequiredServices({ orchestrator: services.orchestrator }, fetchImpl as typeof fetch, 20);

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(checks.orchestrator.ok).toBe(false);
  });
});

import http, { Server } from 'node:http';
import type { Express } from 'express';

jest.setTimeout(30_000);

interface HttpResult {
  statusCode: number;
  body: Record<string, any>;
}

function listen(app: Express): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

async function unusedPort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  await close(probe);
  return address.port;
}

function getJson(server: Server, path: string): Promise<HttpResult> {
  const address = server.address();
  if (!address || typeof address === 'string') {
    return Promise.reject(new Error('Expected a TCP server address'));
  }

  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: address.port, path }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('error', reject);
  });
}

function orchestratorFetch(nativeFetch: typeof global.fetch, registerStatus = 200) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!url.startsWith('http://orchestrator.test')) {
      return nativeFetch(input, init);
    }

    if (url.endsWith('/v1/bots/register')) {
      if (registerStatus !== 200) {
        return new Response('orchestrator unavailable', { status: registerStatus });
      }
      return Response.json({
        success: true,
        data: {
          bot: {
            id: 'socialbot-test-id',
            botType: 'socialbot',
            instanceId: 'socialbot-test-instance',
            status: 'ONLINE',
            capabilities: [],
            permissions: [],
            registeredAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
          },
        },
      }, { status: 201 });
    }

    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    return Response.json([]);
  });
}

describe('SocialBot lifecycle', () => {
  const nativeFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.ORCHESTRATOR_URL = 'http://orchestrator.test';
    delete process.env.OPENAI_API_KEY;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the PM2 startup and kill budgets aligned with the bounded lifecycle', () => {
    const ecosystem = require('../../../../ecosystem.config.js') as {
      apps: Array<{ name: string; wait_ready?: boolean; listen_timeout?: number; kill_timeout?: number }>;
    };
    for (const name of ['socialbot', 'storebot', 'tradebot']) {
      expect(ecosystem.apps.find(entry => entry.name === name)).toMatchObject({
        wait_ready: true,
        listen_timeout: 10_000,
        kill_timeout: 10_000,
      });
    }
  });

  it('moves /health and /ready out of STOPPED only after orchestrator registration', async () => {
    const fetchMock = orchestratorFetch(nativeFetch);
    const socialbot = await import('../index');

    const stoppedServer = await listen(socialbot.default);
    try {
      const stoppedHealth = await getJson(stoppedServer, '/health');
      const stoppedReady = await getJson(stoppedServer, '/ready');
      expect(stoppedHealth.statusCode).toBe(503);
      expect(stoppedHealth.body.checks.orchestrator).toMatchObject({ status: 'fail', message: 'Not registered' });
      expect(stoppedReady).toMatchObject({
        statusCode: 503,
        body: { ready: false, reason: 'Bot status is STOPPED' },
      });
    } finally {
      await close(stoppedServer);
    }

    const server = await socialbot.startSocialBot(0);
    try {
      const health = await getJson(server, '/health');
      const ready = await getJson(server, '/ready');

      expect(health.statusCode).toBe(200);
      expect(health.body).toMatchObject({
        status: 'healthy',
        checks: {
          orchestrator: { status: 'pass', message: 'Connected' },
          heartbeat: { status: 'pass', message: expect.stringContaining('Last succeeded at') },
        },
      });
      expect(ready).toMatchObject({ statusCode: 200, body: { ready: true } });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://orchestrator.test/v1/bots/register',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      await socialbot.stopSocialBot();
    }

    expect(server.listening).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://orchestrator.test/v1/bots/socialbot-test-id',
      expect.objectContaining({ method: 'DELETE' }),
    );

    const stoppedAgainServer = await listen(socialbot.default);
    try {
      const stoppedAgain = await getJson(stoppedAgainServer, '/ready');
      expect(stoppedAgain).toMatchObject({
        statusCode: 503,
        body: { ready: false, reason: 'Bot status is STOPPED' },
      });
    } finally {
      await close(stoppedAgainServer);
    }
  });

  it('fails startup cleanly when registration fails', async () => {
    orchestratorFetch(nativeFetch, 503);
    const socialbot = await import('../index');

    await expect(socialbot.startSocialBot(0)).rejects.toThrow(
      'Orchestrator request failed: 503 orchestrator unavailable',
    );

    const server = await listen(socialbot.default);
    try {
      const ready = await getJson(server, '/ready');
      expect(ready).toMatchObject({
        statusCode: 503,
        body: { ready: false, reason: 'Bot status is STOPPED' },
      });
    } finally {
      await close(server);
    }
  });

  it('serializes concurrent lifecycle calls and cannot expose a listener after stop cancels startup', async () => {
    let releaseRegistration: (() => void) | undefined;
    let heartbeatCalls = 0;
    let deregistrationCalls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      if (!url.startsWith('http://orchestrator.test')) return nativeFetch(input, init);
      if (url.endsWith('/v1/bots/register')) {
        await new Promise<void>(resolve => { releaseRegistration = resolve; });
        return Response.json({ success: true, data: { bot: {
          id: 'socialbot-test-id',
          botType: 'socialbot',
          instanceId: 'socialbot-test-instance',
          status: 'ONLINE',
          capabilities: [],
          permissions: [],
          registeredAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
        } } }, { status: 201 });
      }
      if (url.endsWith('/heartbeat')) {
        heartbeatCalls += 1;
        return Response.json({ success: true });
      }
      if (init?.method === 'DELETE') {
        deregistrationCalls += 1;
        return new Response(null, { status: 204 });
      }
      return Response.json([]);
    });

    const socialbot = await import('../index');
    const port = await unusedPort();
    const firstStart = socialbot.startSocialBot(port);
    const secondStart = socialbot.startSocialBot(port);
    expect(secondStart).toBe(firstStart);
    while (!releaseRegistration) await new Promise(resolve => setTimeout(resolve, 5));

    const firstStop = socialbot.stopSocialBot();
    const secondStop = socialbot.stopSocialBot();
    expect(secondStop).toBe(firstStop);
    releaseRegistration();

    await expect(firstStart).rejects.toThrow('Bot startup cancelled');
    await firstStop;
    expect(heartbeatCalls).toBe(0);
    expect(deregistrationCalls).toBe(1);

    const portProbe = http.createServer();
    await new Promise<void>((resolve, reject) => {
      portProbe.once('error', reject);
      portProbe.listen(port, '127.0.0.1', resolve);
    });
    await close(portProbe);
  });
});

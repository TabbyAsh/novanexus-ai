import { BotClient, BotRegistration, createBotConfig } from '../index';

const registration: BotRegistration = {
  id: 'registered-bot-id',
  botType: 'socialbot',
  instanceId: 'registered-instance-id',
  status: 'ONLINE',
  capabilities: [],
  permissions: [],
  registeredAt: new Date().toISOString(),
  lastHeartbeat: new Date().toISOString(),
};

function createClient(): BotClient {
  return new BotClient(createBotConfig('socialbot', [], {
    orchestratorUrl: 'http://orchestrator.test',
    heartbeatIntervalMs: 60_000,
    taskPollIntervalMs: 60_000,
  }));
}

describe('BotClient registration contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('unwraps the canonical orchestrator response and uses its bot id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ success: true, data: { bot: registration } }, { status: 201 });
    });
    const client = createClient();

    try {
      await client.start();

      expect(client.getBotId()).toBe(registration.id);
      expect(client.getHealthStatus()).toMatchObject({
        status: 'healthy',
        checks: { orchestrator: { status: 'pass', message: 'Connected' } },
      });
    } finally {
      await client.stop();
    }

    expect(fetchMock).toHaveBeenCalledWith(
      `http://orchestrator.test/v1/bots/${registration.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('keeps accepting the legacy direct registration response', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json(registration, { status: 201 });
    });
    const client = createClient();

    try {
      await client.start();
      expect(client.getBotId()).toBe(registration.id);
    } finally {
      await client.stop();
    }
  });

  it('rejects a successful response that does not contain a bot id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({ success: true, data: { bot: {} } }, { status: 201 }),
    );
    const client = createClient();

    await expect(client.start()).rejects.toThrow('Orchestrator registration response missing bot id');
    expect(client.getBotId()).toBeNull();
    expect(client.getStatus()).toBe('ERROR');

    await client.stop();
    expect(client.getStatus()).toBe('STOPPED');
  });
});

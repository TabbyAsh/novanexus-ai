import { api } from '../api';

describe('Proof Desk web API client', () => {
  const originalBackend = process.env.BACKEND_URL;

  beforeEach(() => {
    process.env.BACKEND_URL = 'https://api.example.test';
    api.setTokens('operator-token', 'refresh-token');
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: true,
        data: {
          case: { receipt_id: 'svc_12345678901234567890', version: 8 },
          scope: null,
          deliverables: [],
          timeline: [],
          integrity: { eventCount: 0, headHash: null, scopeHash: null },
          command: { idempotent: false, version: 8 },
        },
      }),
    }) as jest.Mock;
  });

  afterEach(() => {
    api.clearTokens();
    jest.restoreAllMocks();
    if (originalBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = originalBackend;
  });

  it('reads the private list and selected case through the governed endpoints', async () => {
    await api.getProofDesk({ status: 'IN_PROGRESS', limit: 25 });
    await api.getProofCase('svc_12345678901234567890');

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe('https://api.example.test/v1/ops/proofs?status=IN_PROGRESS&limit=25');
    expect(calls[1][0]).toBe('https://api.example.test/v1/ops/proofs/svc_12345678901234567890');
    expect(calls[0][1].headers.Authorization).toBe('Bearer operator-token');
  });

  it('sends optimistic version and Idempotency-Key on every command', async () => {
    await api.sendProofCommand({
      receiptId: 'svc_12345678901234567890',
      command: 'SET_NEXT_ACTION',
      expectedVersion: 7,
      payload: {
        nextAction: 'Confirm access with the client',
        dueAt: '2026-08-25',
        assignedUserId: '8fcf291e-fb12-4317-9a31-2ac81cb6a087',
      },
      idempotencyKey: 'proof:test:set-next-action:1234567890',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/ops/proofs/svc_12345678901234567890/commands');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('proof:test:set-next-action:1234567890');
    expect(JSON.parse(init.body)).toMatchObject({
      command: 'SET_NEXT_ACTION',
      expectedVersion: 7,
    });
  });

  it('issues governed service checkout through billing, never the Proof Desk command route', async () => {
    await api.createProofCheckout({
      receiptId: 'svc_12345678901234567890',
      expectedVersion: 11,
      idempotencyKey: 'proof-checkout:test:1234567890',
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/billing/service-checkout');
    expect(url).not.toContain('/v1/ops/proofs/');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toBe('proof-checkout:test:1234567890');
    expect(JSON.parse(init.body)).toEqual({
      receiptId: 'svc_12345678901234567890',
      expectedVersion: 11,
    });
  });
});

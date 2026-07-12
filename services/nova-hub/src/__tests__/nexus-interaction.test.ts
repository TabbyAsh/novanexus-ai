jest.mock('@nova/shared', () => ({
  generateId: jest.fn(() => 'interaction-1'),
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../nova-core', () => ({
  novaChat: jest.fn(),
}));

jest.mock('../executor', () => ({
  listExecutorCapabilities: jest.fn(() => [{
    id: 'executor.market_quote',
    name: 'Market Quote',
    sector: 'market',
    description: 'Quote',
    status: 'available',
    authority: 'observe',
    entrypoint: '/v1/executor/run',
    sideEffects: [],
    requires: [],
  }]),
}));

jest.mock('../substrate', () => ({
  writeArtifact: jest.fn(),
}));

import { query, transaction } from '@nova/shared';
import { novaChat } from '../nova-core';
import { writeArtifact } from '../substrate';
import {
  listNexusCapabilities,
  listNexusInteractions,
  nexusInteract,
  recordNexusInteractionOutcome,
} from '../nexus-interaction';

const queryMock = query as jest.Mock;
const transactionMock = transaction as jest.Mock;
const clientQueryMock = jest.fn();
const novaChatMock = novaChat as jest.Mock;
const writeArtifactMock = writeArtifact as jest.Mock;

describe('Nexus Interaction Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    transactionMock.mockImplementation(async (fn: any) => fn({ query: clientQueryMock }));
    writeArtifactMock.mockResolvedValue('artifact-1');
    novaChatMock.mockResolvedValue({
      conversationId: 'conversation-1',
      reply: 'TSLA is $250.',
      branch: { intent: 'market', label: 'Market', href: '/dashboard/screener', description: 'Open market tools' },
      provider: 'gemini',
      action: { type: 'quote', symbol: 'TSLA', price: 250 },
      execution: {
        mode: 'direct',
        capabilities: ['market.quote'],
        evidence: [{ capabilityId: 'market.quote', summary: 'TSLA: $250', source: 'marketdata:quote/TSLA' }],
        gaps: [],
        cost: { aiCalls: 1, toolCalls: 1 },
      },
    });
  });

  it('returns an inspectable envelope and persists a content-redacted receipt', async () => {
    const result = await nexusInteract('user-1', null, 'What is TSLA trading at?');

    expect(result).toMatchObject({
      interactionId: 'interaction-1',
      conversationId: 'conversation-1',
      intent: { primary: 'market' },
      execution: { mode: 'direct', capabilities: ['market.quote'] },
      authority: { mode: 'observe', externalSideEffectsPerformed: false },
      memory: { persisted: true, artifactId: 'artifact-1', outcomeClosable: true },
    });
    expect(writeArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'mission_report',
      authorId: 'nexus-interaction',
      payload: expect.objectContaining({
        interactionId: 'interaction-1',
        contentRedacted: true,
        findings: ['market.quote used'],
      }),
    }));
    const payload = writeArtifactMock.mock.calls[0][0].payload;
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('request');
    expect(payload).not.toHaveProperty('nova');
    expect(payload.ownerRef).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.conversationRef).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.conversationRef).not.toContain('conversation-1');
  });

  it('does not claim closable memory when the receipt write fails', async () => {
    writeArtifactMock.mockResolvedValueOnce(null);
    const result = await nexusInteract('user-1', null, 'Help me think.');
    expect(result.memory).toEqual({ persisted: false, artifactId: null, outcomeClosable: false });
  });

  it('lists real, gated, reserved, and privacy-degraded capabilities honestly', () => {
    const capabilities = listNexusCapabilities();
    expect(capabilities.find(item => item.id === 'nova.reasoning')?.status).toBe('available');
    expect(capabilities.find(item => item.id === 'forge.capability_proposal')?.status).toBe('gated');
    expect(capabilities.find(item => item.id === 'research.sourced_synthesis')?.status).toBe('reserved');
    expect(capabilities.find(item => item.id === 'world.presence')?.status).toBe('degraded');
  });

  it('lists only receipts selected through the caller ownership hash', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      id: 'artifact-1',
      created_at: '2026-07-11T00:00:00.000Z',
      resolved: false,
      payload: {
        interactionId: 'interaction-1', intent: 'market', execution: { mode: 'direct' },
        authority: { mode: 'observe' }, provider: 'gemini',
      },
    }] });

    const interactions = await listNexusInteractions('user-1');
    expect(interactions).toEqual([expect.objectContaining({
      interactionId: 'interaction-1', artifactId: 'artifact-1', intent: 'market', resolved: false,
    })]);
    const params = queryMock.mock.calls[0][1];
    expect(params[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(params[0]).not.toContain('user-1');
  });

  it('closes a user-owned interaction once inside the receipt lock', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'artifact-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'outcome-1' }] });

    const result = await recordNexusInteractionOutcome('user-1', 'interaction-1', { result: 'worked' });

    expect(result).toEqual({ ok: true, artifactId: 'artifact-1', outcomeArtifactId: 'outcome-1', detailsPersisted: true });
    expect(clientQueryMock.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQueryMock.mock.calls[2][0]).toContain('INSERT INTO artifacts');
    const insertedPayload = JSON.parse(clientQueryMock.mock.calls[2][1][2]);
    expect(insertedPayload.result).toEqual(expect.objectContaining({
      status: 'worked', interactionId: 'interaction-1', detailsRedacted: true,
    }));
    expect(queryMock.mock.calls.some(call => String(call[0]).includes('INSERT INTO outcome_events'))).toBe(false);
  });

  it('does not allow an outcome for a receipt outside the caller ownership hash', async () => {
    clientQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(recordNexusInteractionOutcome('other-user', 'interaction-1', { result: 'worked' }))
      .resolves.toEqual({ ok: false, notFound: true });
    expect(clientQueryMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the first outcome immutable', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'artifact-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'outcome-existing' }] });
    await expect(recordNexusInteractionOutcome('user-1', 'interaction-1', { result: 'failed' }))
      .resolves.toEqual({ ok: false, conflict: true, artifactId: 'artifact-1' });
    expect(clientQueryMock).toHaveBeenCalledTimes(2);
  });
});

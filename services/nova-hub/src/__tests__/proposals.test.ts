jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('@nova/shared', () => ({
  transaction: jest.fn(),
}));

jest.mock('../substrate', () => ({
  readArtifacts: jest.fn(),
}));

import { transaction } from '@nova/shared';
import { decideProposal } from '../proposals';

const transactionMock = transaction as jest.Mock;
const clientQueryMock = jest.fn();

describe('Forge proposal decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionMock.mockImplementation(async (fn: any) => fn({ query: clientQueryMock }));
  });

  it('writes accepted decisions with the outcome result required by the substrate', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'proposal-1', author_id: 'the-smith', payload: { claim: 'Improve X' } }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'decision-1' }] });

    await expect(decideProposal('proposal-1', 'accept', 'The evidence is strong.', 'user-1'))
      .resolves.toEqual({ ok: true });
    expect(clientQueryMock.mock.calls[0][0]).toContain('FOR UPDATE');
    const insert = clientQueryMock.mock.calls[2];
    expect(insert[1][0]).toBe('outcome');
    expect(insert[1][2]).toEqual(['proposal-1']);
    expect(JSON.parse(insert[1][3])).toEqual(expect.objectContaining({
      kind: 'proposal_decision', result: 'accept', decision: 'accept', reason: 'The evidence is strong.',
    }));
  });

  it('refuses a second contradictory decision', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'proposal-1', author_id: 'the-smith', payload: { claim: 'Improve X' } }] })
      .mockResolvedValueOnce({ rows: [{ id: 'decision-1' }] });

    await expect(decideProposal('proposal-1', 'reject', 'Changed my mind.', 'user-1'))
      .resolves.toEqual({ ok: false, conflict: true });
    expect(clientQueryMock).toHaveBeenCalledTimes(2);
  });
});

jest.mock('@nova/shared', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../substrate', () => ({
  writeArtifact: jest.fn().mockResolvedValue(null),
}));

import { query, queryOne } from '@nova/shared';
import { writeArtifact } from '../substrate';
import { calibration, domainOf, listCards, markOutcome } from '../card-outcomes';

const queryMock = query as jest.Mock;
const queryOneMock = queryOne as jest.Mock;
const writeArtifactMock = writeArtifact as jest.Mock;

describe('Decision Card outcome loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('classifies common situations into stable learning domains', () => {
    expect(domainOf('A client owes an unpaid invoice')).toBe('collections');
    expect(domainOf('How much should I charge for this job?')).toBe('pricing');
    expect(domainOf('I have a Discord community')).toBe('community');
    expect(domainOf('Something entirely new')).toBe('general');
  });

  it('does not let one anonymous visitor rewrite another visitor’s outcome', async () => {
    queryOneMock.mockResolvedValueOnce({
      domain: 'pricing',
      regime: 'EXPLOITATION',
      user_id: null,
      visitor_id: 'v_owner',
      context: 'Price this job',
      haves: [],
      wants: [],
      provider: 'deterministic',
      content: 'A decision',
    });
    const result = await markOutcome('card-1', 'worked', '', null, { visitorId: 'v_other' });

    expect(result).toEqual({ ok: false, forbidden: true });
    expect(queryMock).not.toHaveBeenCalled();
    expect(writeArtifactMock).not.toHaveBeenCalled();
  });

  it('records a matching visitor outcome in immutable memory without writing an ownerless value event', async () => {
    queryOneMock.mockResolvedValueOnce({
      domain: 'pricing',
      regime: 'EXPLOITATION',
      user_id: null,
      visitor_id: 'v_owner',
      context: 'Price this job',
      haves: [],
      wants: [],
      provider: 'deterministic',
      content: 'A decision',
    });
    queryOneMock.mockResolvedValueOnce({ id: 'decision-artifact-1' });

    const result = await markOutcome(
      'card-1',
      'worked',
      'The quote was accepted.',
      250,
      { visitorId: 'v_owner' },
    );

    expect(result).toEqual({ ok: true, domain: 'pricing' });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(writeArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'outcome',
      authorId: expect.stringMatching(/^intake-owner:[a-f0-9]{64}$/),
      refs: ['decision-artifact-1'],
      payload: expect.objectContaining({ cardId: 'card-1', result: 'worked', detailsRedacted: true }),
    }));
  });

  it('records an authenticated valued outcome with the required ledger domain', async () => {
    queryOneMock.mockResolvedValueOnce({
      domain: 'pricing',
      regime: 'EXPLOITATION',
      user_id: 'user-1',
      visitor_id: null,
      context: 'Price this job',
      haves: [],
      wants: [],
      provider: 'deterministic',
      content: 'A decision',
    });
    queryOneMock.mockResolvedValueOnce({ id: 'decision-artifact-1' });

    const result = await markOutcome(
      'card-1', 'worked', 'The quote was accepted.', 250, { userId: 'user-1' },
    );

    expect(result).toEqual({ ok: true, domain: 'pricing' });
    const ledgerCall = queryMock.mock.calls.find(call => String(call[0]).includes('INSERT INTO outcome_events'));
    expect(ledgerCall).toBeDefined();
    expect(ledgerCall![1][0]).toBe('user-1');
    expect(ledgerCall![1][1]).toBe('pricing');
  });

  it('never claims the outcome was learned when the durable write fails', async () => {
    queryOneMock.mockResolvedValue({
      domain: 'pricing',
      regime: 'EXPLOITATION',
      user_id: null,
      visitor_id: 'v_owner',
    });
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(markOutcome('card-1', 'worked', '', null, { visitorId: 'v_owner' }))
      .rejects.toThrow('database unavailable');
    expect(writeArtifactMock).not.toHaveBeenCalled();
  });

  it('keeps the first resolved outcome immutable', async () => {
    queryOneMock.mockResolvedValue({
      domain: 'pricing',
      regime: 'EXPLOITATION',
      user_id: null,
      visitor_id: 'v_owner',
      outcome: 'worked',
    });

    const result = await markOutcome('card-1', 'failed', '', null, { visitorId: 'v_owner' });

    expect(result).toEqual({ ok: false, conflict: true, domain: 'pricing' });
    expect(queryMock).not.toHaveBeenCalled();
    expect(writeArtifactMock).not.toHaveBeenCalled();
  });

  it('does not turn a database outage into a false not-found response', async () => {
    queryOneMock.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(markOutcome('card-1', 'worked', '', null, { visitorId: 'v_owner' }))
      .rejects.toThrow('database unavailable');
  });

  it('does not turn a history outage into an honest-looking empty record', async () => {
    queryMock.mockRejectedValue(new Error('database unavailable'));

    await expect(calibration({ visitorId: 'v_owner' })).rejects.toThrow('database unavailable');
    await expect(listCards({ visitorId: 'v_owner' })).rejects.toThrow('database unavailable');
  });
});

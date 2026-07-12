jest.mock('@nova/shared', () => ({ queryOne: jest.fn() }));
jest.mock('@nova/telemetry', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

import { queryOne } from '@nova/shared';
import { automationAllowed } from '../automation-authority';

const queryOneMock = queryOne as jest.Mock;

describe('autonomous worker authority', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stops workers when the kill switch is enabled', async () => {
    queryOneMock.mockResolvedValueOnce({ value_json: { enabled: true } });
    await expect(automationAllowed()).resolves.toBe(false);
  });

  it('allows workers only from an explicit readable disabled state', async () => {
    queryOneMock.mockResolvedValueOnce({ value_json: JSON.stringify({ enabled: false }) });
    await expect(automationAllowed()).resolves.toBe(true);
  });

  it.each([null, new Error('database unavailable')])('fails closed for missing or unreadable state', async value => {
    if (value instanceof Error) queryOneMock.mockRejectedValueOnce(value);
    else queryOneMock.mockResolvedValueOnce(value);
    await expect(automationAllowed()).resolves.toBe(false);
  });
});
